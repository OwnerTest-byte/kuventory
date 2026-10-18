-- ==============================================================================
-- KUVENTORY MASTER SECURITY, AUTHORIZATION, AND REALTIME HARDENING
-- Migration: 20261018150000_master_security_and_realtime_hardening.sql
-- ==============================================================================

-- 1. SECURE & AUDIT REMOVE_INVENTORY_ITEM
-- Enforce auth.uid(), active account, admin check, preserve financial audit trail (stock_movements)
CREATE OR REPLACE FUNCTION public.remove_inventory_item(p_item_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_name TEXT;
  v_actor_id UUID := auth.uid();
BEGIN
  -- Strict server-side authentication check
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Strict server-side administrator verification
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrative privileges required to permanently delete inventory items.';
  END IF;

  -- Verify target item exists
  SELECT name INTO v_item_name
  FROM public.inventory_items
  WHERE id = p_item_id;

  IF v_item_name IS NULL THEN
    RAISE EXCEPTION 'Item % does not exist.', p_item_id;
  END IF;

  -- Clean up worksheet items and notifications
  DELETE FROM public.daily_inventory_items WHERE item_id = p_item_id;
  DELETE FROM public.notifications WHERE item_id = p_item_id;

  -- Mark active stock batches as depleted rather than destroying history
  UPDATE public.stock_batches
  SET quantity = 0
  WHERE item_id = p_item_id;

  -- CRITICAL: stock_movements are NOT deleted to preserve immutable financial audit records.
  -- Instead, record the final removal movement:
  INSERT INTO public.stock_movements (
    item_id,
    type,
    quantity_before,
    quantity_change,
    quantity_after,
    user_id,
    reason
  ) VALUES (
    p_item_id,
    'REMOVE',
    0,
    0,
    0,
    v_actor_id,
    'Item deleted by administrator'
  );

  -- Soft delete / hard delete item row
  DELETE FROM public.inventory_items WHERE id = p_item_id;

  -- Record audit log
  INSERT INTO public.audit_logs (
    actor_id,
    action,
    target_table,
    target_id,
    new_data
  ) VALUES (
    v_actor_id,
    'ITEM_REMOVED',
    'inventory_items',
    p_item_id,
    jsonb_build_object('item_id', p_item_id, 'name', v_item_name, 'deleted_at', now())
  );

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remove_inventory_item(UUID) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_inventory_item(UUID) TO authenticated;


-- 2. SECURE ADJUST_STOCK_TO_TARGET WITH AUTH.UID() AND IS_ADMIN()
CREATE OR REPLACE FUNCTION public.adjust_stock_to_target(
  p_item_id UUID,
  p_target_quantity NUMERIC,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_total NUMERIC;
  v_diff NUMERIC;
  v_effective_user UUID := auth.uid();
  v_safe_target NUMERIC;
  v_batch_id UUID;
BEGIN
  -- Strict authentication check
  IF v_effective_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Strict administrator check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrative privileges required to adjust stock counts.';
  END IF;

  IF p_target_quantity IS NULL OR p_target_quantity < 0 THEN
    RAISE EXCEPTION 'Target quantity must be a non-negative number.';
  END IF;

  v_safe_target := p_target_quantity;

  -- 1. Lock the inventory item row
  PERFORM 1 FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % does not exist.', p_item_id;
  END IF;

  -- 2. Compute exact live stock within transaction
  SELECT COALESCE(SUM(quantity), 0) INTO v_current_total
  FROM public.stock_batches
  WHERE item_id = p_item_id;

  v_diff := v_safe_target - v_current_total;

  IF v_diff = 0 THEN
    RETURN 0;
  END IF;

  IF v_diff > 0 THEN
    -- Stock count is higher: create adjustment batch
    INSERT INTO public.stock_batches (
      item_id,
      quantity,
      initial_quantity,
      expiry_date,
      received_date
    ) VALUES (
      p_item_id,
      v_diff,
      v_diff,
      CURRENT_DATE + INTERVAL '30 days',
      CURRENT_DATE
    ) RETURNING id INTO v_batch_id;

    INSERT INTO public.stock_movements (
      item_id,
      batch_id,
      type,
      quantity_before,
      quantity_change,
      quantity_after,
      user_id,
      reason
    ) VALUES (
      p_item_id,
      v_batch_id,
      'ADJUST',
      v_current_total,
      v_diff,
      v_safe_target,
      v_effective_user,
      COALESCE(p_reason, 'Physical Count Adjustment (Up)')
    );
  ELSE
    -- Stock count is lower: consume difference via FEFO
    PERFORM public.consume_stock(
      p_item_id,
      ABS(v_diff),
      v_effective_user,
      COALESCE(p_reason, 'Physical Count Adjustment (Down)')
    );

    -- Log movement adjustment record
    INSERT INTO public.stock_movements (
      item_id,
      type,
      quantity_before,
      quantity_change,
      quantity_after,
      user_id,
      reason
    ) VALUES (
      p_item_id,
      'ADJUST',
      v_current_total,
      v_diff,
      v_safe_target,
      v_effective_user,
      COALESCE(p_reason, 'Physical Count Adjustment (Down)')
    );
  END IF;

  RETURN v_diff;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adjust_stock_to_target(UUID, NUMERIC, TEXT, UUID) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_stock_to_target(UUID, NUMERIC, TEXT, UUID) TO authenticated;


-- 3. SECURE RECEIVE_DAILY_INVENTORY_STOCK
CREATE OR REPLACE FUNCTION public.receive_daily_inventory_stock(
  p_daily_inventory_item_id UUID,
  p_quantity NUMERIC,
  p_expiry_date DATE,
  p_user_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT 'Daily Inventory Receiving'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_id UUID;
  v_daily_id UUID;
  v_state TEXT;
  v_current_total NUMERIC;
  v_batch_id UUID;
  v_effective_user UUID := auth.uid();
BEGIN
  -- Strict authentication check
  IF v_effective_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity received must be greater than zero.';
  END IF;

  -- 1. Fetch and lock daily_inventory_item and parent daily_inventory
  SELECT dii.item_id, dii.daily_inventory_id, di.state
  INTO v_item_id, v_daily_id, v_state
  FROM public.daily_inventory_items dii
  JOIN public.daily_inventory di ON dii.daily_inventory_id = di.id
  WHERE dii.id = p_daily_inventory_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily inventory item not found.';
  END IF;

  IF v_state != 'DRAFT' THEN
    RAISE EXCEPTION 'Cannot receive stock on a finalized inventory worksheet.';
  END IF;

  -- 2. Calculate current total physical stock for audit trail
  SELECT COALESCE(SUM(quantity), 0) INTO v_current_total
  FROM public.stock_batches
  WHERE item_id = v_item_id;

  -- 3. Create physical batch
  INSERT INTO public.stock_batches (
    item_id,
    quantity,
    initial_quantity,
    expiry_date,
    received_date
  ) VALUES (
    v_item_id,
    p_quantity,
    p_quantity,
    p_expiry_date,
    CURRENT_DATE
  ) RETURNING id INTO v_batch_id;

  -- 4. Record stock movement audit entry
  INSERT INTO public.stock_movements (
    item_id,
    batch_id,
    type,
    quantity_before,
    quantity_change,
    quantity_after,
    user_id,
    reason
  ) VALUES (
    v_item_id,
    v_batch_id,
    'ADD',
    v_current_total,
    p_quantity,
    v_current_total + p_quantity,
    v_effective_user,
    COALESCE(p_reason, 'Daily Inventory Receiving')
  );

  -- 5. Atomically increment worksheet ADD column and recompute total/ending
  UPDATE public.daily_inventory_items
  SET add = add + p_quantity,
      total = beg + (add + p_quantity),
      ending = GREATEST(0, (beg + (add + p_quantity)) - am - pm)
  WHERE id = p_daily_inventory_item_id;

  RETURN v_batch_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.receive_daily_inventory_stock(UUID, NUMERIC, DATE, UUID, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_daily_inventory_stock(UUID, NUMERIC, DATE, UUID, TEXT) TO authenticated;


-- 4. ADD INITIAL_QUANTITY TO STOCK_BATCHES IF NOT PRESENT
ALTER TABLE public.stock_batches ADD COLUMN IF NOT EXISTS initial_quantity NUMERIC(10, 2);
UPDATE public.stock_batches SET initial_quantity = quantity WHERE initial_quantity IS NULL;


-- 5. COMPLETE SUPABASE_REALTIME PUBLICATION MEMBERSHIP
DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'inventory_items',
    'stock_batches',
    'stock_movements',
    'notifications',
    'daily_inventory',
    'daily_inventory_items',
    'categories',
    'profiles',
    'system_settings',
    'user_session_leases',
    'active_user_sessions',
    'recovery_points',
    'audit_logs',
    'visitor_logs',
    'daily_inventory_revisions',
    'password_reset_requests',
    'system_automations',
    'system_deployments',
    'system_incidents'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_table
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END;
      -- Ensure REPLICA IDENTITY FULL for conflict-safe payload diffs
      BEGIN
        EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', v_table);
      EXCEPTION
        WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;
END;
$$;


-- 6. RESET FABRICATED PRODUCTION DEFAULT AUTOMATION / INCIDENT TIMESTAMPS
-- Ensure system_automations reflects truthful idle state until genuine runs execute
UPDATE public.system_automations
SET last_run_at = NULL,
    last_status = 'Idle',
    last_duration_ms = 0,
    last_error = NULL
WHERE last_status = 'Success' AND last_duration_ms IN (65, 98, 145, 240, 312);

-- Remove fake seeded incident if it matches the fabricated default text
DELETE FROM public.system_incidents
WHERE title = 'Scheduled Daily Worksheet Sync Completed'
  AND description = 'Automated nightly sync reconciled 0 item discrepancies.'
  AND resolved_by = 'Auto-Healer';
