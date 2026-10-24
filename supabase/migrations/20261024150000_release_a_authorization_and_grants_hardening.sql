-- ============================================================================
-- MIGRATION: 20261024150000_release_a_authorization_and_grants_hardening.sql
-- Description:
--   Release A — Stop Dangerous Paths and Database Authorization Hardening:
--   1. Revoke EXECUTE from anon and PUBLIC across all sensitive stock mutation,
--      worksheet finalization, item creation, and finalized correction RPCs.
--   2. Remove all insecure actor fallbacks (SELECT id FROM profiles LIMIT 1).
--   3. Enforce strict auth.uid() presence and database-level role verification.
--   4. Eliminate silent exception swallowing in finalization and correction routines.
--   5. Pin search_path = public, auth, pg_temp on all SECURITY DEFINER functions.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. REVOKE DANGEROUS GRANTS FROM anon AND PUBLIC
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN REVOKE EXECUTE ON FUNCTION public.consume_stock(UUID, NUMERIC, TEXT) FROM anon, PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.consume_stock(UUID, NUMERIC, UUID, TEXT) FROM anon, PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.add_stock(UUID, NUMERIC, DATE, DATE, TEXT) FROM anon, PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.adjust_stock_to_target(UUID, NUMERIC, TEXT, UUID, DATE) FROM anon, PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.receive_daily_inventory_stock(UUID, NUMERIC, DATE, UUID, TEXT) FROM anon, PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.create_daily_inventory_draft(DATE) FROM anon, PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.finalize_daily_inventory(UUID) FROM anon, PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.create_inventory_item_with_initial_stock(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, DATE, TEXT) FROM anon, PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.correct_finalized_daily_inventory(UUID, JSONB, TEXT) FROM anon, PUBLIC; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;

-- ----------------------------------------------------------------------------
-- 2. HARDEN consume_stock (3-arg and 4-arg overloads)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_stock(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_reason TEXT DEFAULT 'Standard Consumption'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_remaining NUMERIC := p_quantity;
  v_batch RECORD;
  v_deduct NUMERIC;
  v_item RECORD;
  v_current_total NUMERIC;
BEGIN
  -- Strict authentication check: no fallback to arbitrary admin profiles
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to consume stock.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only administrators can consume inventory stock.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN;
  END IF;

  -- 1. Row-Level Lock on target inventory item
  SELECT id, min_quantity, version INTO v_item 
  FROM public.inventory_items 
  WHERE id = p_item_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % does not exist.', p_item_id;
  END IF;

  -- 2. Calculate current total before consumption
  SELECT COALESCE(SUM(quantity), 0) INTO v_current_total
  FROM public.stock_batches
  WHERE item_id = p_item_id;

  IF v_current_total < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock for item %. Available: %, requested: %.', p_item_id, v_current_total, p_quantity;
  END IF;

  -- 3. Row-Level Lock on active non-expired stock batches (FEFO order)
  FOR v_batch IN
    SELECT * FROM public.stock_batches
    WHERE item_id = p_item_id
      AND quantity > 0
      AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
    ORDER BY expiry_date ASC NULLS LAST, received_date ASC, id ASC
    FOR UPDATE
  LOOP
    IF v_remaining <= 0 THEN
      EXIT;
    END IF;

    IF v_batch.quantity >= v_remaining THEN
      v_deduct := v_remaining;
    ELSE
      v_deduct := v_batch.quantity;
    END IF;

    UPDATE public.stock_batches
    SET quantity = quantity - v_deduct,
        updated_at = now()
    WHERE id = v_batch.id;

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
      v_batch.id,
      'CONSUME',
      v_batch.quantity,
      -v_deduct,
      v_batch.quantity - v_deduct,
      v_caller_id,
      COALESCE(p_reason, 'Standard Consumption')
    );

    v_remaining := v_remaining - v_deduct;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient non-expired batches for item %. Remaining unallocated: %.', p_item_id, v_remaining;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.consume_stock(UUID, NUMERIC, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.consume_stock(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_batch_id UUID,
  p_reason TEXT DEFAULT 'Targeted Batch Consumption'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_batch RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to consume stock.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only administrators can consume inventory stock.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN;
  END IF;

  PERFORM 1 FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;

  SELECT * INTO v_batch 
  FROM public.stock_batches 
  WHERE id = p_batch_id AND item_id = p_item_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target batch % not found for item %.', p_batch_id, p_item_id;
  END IF;

  IF v_batch.quantity < p_quantity THEN
    RAISE EXCEPTION 'Insufficient quantity in batch %. Available: %, requested: %.', p_batch_id, v_batch.quantity, p_quantity;
  END IF;

  UPDATE public.stock_batches
  SET quantity = quantity - p_quantity,
      updated_at = now()
  WHERE id = p_batch_id;

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
    p_batch_id,
    'CONSUME',
    v_batch.quantity,
    -p_quantity,
    v_batch.quantity - p_quantity,
    v_caller_id,
    COALESCE(p_reason, 'Targeted Batch Consumption')
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. HARDEN receive_daily_inventory_stock
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.receive_daily_inventory_stock(UUID, NUMERIC, DATE, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.receive_daily_inventory_stock(
  p_daily_inventory_item_id UUID,
  p_quantity NUMERIC,
  p_expiry_date DATE,
  p_user_id UUID DEFAULT NULL::uuid,
  p_reason TEXT DEFAULT 'Daily Inventory Receiving'::text
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_item_id UUID;
  v_daily_id UUID;
  v_state TEXT;
  v_current_total NUMERIC;
  v_batch_id UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to receive inventory stock.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('USER', 'ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: invalid role for receiving inventory.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity received must be greater than zero.';
  END IF;

  IF p_expiry_date IS NULL THEN
    RAISE EXCEPTION 'Expiration date is mandatory for receiving delivery.';
  END IF;

  IF p_expiry_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Expiration date cannot be in the past.';
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

  -- 2. Calculate current total physical stock
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

  -- 4. Record stock movement using authenticated caller identity
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
    v_caller_id,
    COALESCE(p_reason, 'Daily Inventory Receiving')
  );

  -- 5. Atomically increment worksheet add column (total and ending are computed by PostgreSQL)
  UPDATE public.daily_inventory_items
  SET add = add + p_quantity
  WHERE id = p_daily_inventory_item_id;

  RETURN v_batch_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. HARDEN create_daily_inventory_draft
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_daily_inventory_draft(p_target_date DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_daily_id UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to create daily inventory draft.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('USER', 'ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: invalid role for creating inventory drafts.';
  END IF;

  SELECT id INTO v_daily_id FROM public.daily_inventory 
  WHERE inventory_date = p_target_date;

  IF NOT FOUND THEN
    INSERT INTO public.daily_inventory (inventory_date, state, created_by)
    VALUES (p_target_date, 'DRAFT', v_caller_id)
    RETURNING id INTO v_daily_id;
  END IF;

  INSERT INTO public.daily_inventory_items (daily_inventory_id, item_id, beg)
  SELECT v_daily_id, i.id, COALESCE(s.total_quantity, 0)
  FROM public.inventory_items i
  LEFT JOIN (
    SELECT item_id, COALESCE(SUM(quantity), 0) as total_quantity
    FROM public.stock_batches
    GROUP BY item_id
  ) s ON i.id = s.item_id
  WHERE i.is_active = true
  ON CONFLICT (daily_inventory_id, item_id) DO NOTHING;

  RETURN v_daily_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. HARDEN finalize_daily_inventory
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_daily_inventory(p_daily_inventory_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_inventory_record public.daily_inventory%ROWTYPE;
  v_report_id UUID;
  v_item RECORD;
  v_consumption NUMERIC;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to finalize daily inventory.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only administrators can finalize daily inventory.';
  END IF;

  SELECT * INTO v_inventory_record 
  FROM public.daily_inventory 
  WHERE id = p_daily_inventory_id 
  FOR UPDATE;

  IF NOT FOUND THEN 
    RAISE EXCEPTION 'Daily inventory record % not found.', p_daily_inventory_id; 
  END IF;

  IF v_inventory_record.state = 'FINALIZED' THEN
    RAISE EXCEPTION 'Daily inventory for % is already finalized.', v_inventory_record.inventory_date;
  END IF;

  -- Clean up prior reports if any
  DELETE FROM public.report_items 
  WHERE report_id IN (SELECT id FROM public.reports WHERE daily_inventory_id = p_daily_inventory_id);

  DELETE FROM public.reports 
  WHERE daily_inventory_id = p_daily_inventory_id;

  -- Transition state to FINALIZED with caller as author
  UPDATE public.daily_inventory 
  SET state = 'FINALIZED', finalized_by = v_caller_id, finalized_at = NOW() 
  WHERE id = p_daily_inventory_id;

  -- Create fresh authoritative report snapshot
  INSERT INTO public.reports (daily_inventory_id, report_date, generated_by, version) 
  VALUES (p_daily_inventory_id, v_inventory_record.inventory_date, v_caller_id, 1) 
  RETURNING id INTO v_report_id;

  FOR v_item IN 
    SELECT dii.*, ii.name AS item_name, c.name AS category_name, ii.description, ii.unit, ii.unit_cost, ii.supplier_a, ii.supplier_b
    FROM public.daily_inventory_items dii
    JOIN public.inventory_items ii ON dii.item_id = ii.id
    LEFT JOIN public.categories c ON ii.category_id = c.id
    WHERE dii.daily_inventory_id = p_daily_inventory_id
  LOOP
    INSERT INTO public.report_items (
      report_id, item_name, category_name, description, unit, unit_cost, supplier_a, supplier_b, beg, add, total, am, pm, ending
    ) VALUES (
      v_report_id, v_item.item_name, COALESCE(v_item.category_name, 'Uncategorized'),
      v_item.description, v_item.unit, v_item.unit_cost, v_item.supplier_a, v_item.supplier_b,
      COALESCE(v_item.beg, 0), COALESCE(v_item.add, 0), 
      COALESCE(v_item.total, (COALESCE(v_item.beg, 0) + COALESCE(v_item.add, 0))), 
      COALESCE(v_item.am, 0), COALESCE(v_item.pm, 0), 
      COALESCE(v_item.ending, (COALESCE(v_item.beg, 0) + COALESCE(v_item.add, 0) - COALESCE(v_item.am, 0) - COALESCE(v_item.pm, 0)))
    );

    v_consumption := COALESCE(v_item.am, 0) + COALESCE(v_item.pm, 0);

    -- Stock consumption must NOT be silently swallowed.
    -- If consumption fails, entire finalization aborts cleanly.
    IF v_consumption > 0 THEN
      PERFORM public.consume_stock(v_item.item_id, v_consumption, 'Daily Inventory Finalization');
    END IF;
  END LOOP;

  -- Mandatory audit logging
  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
  VALUES (
    v_caller_id,
    'FINALIZE_DAILY_INVENTORY',
    'daily_inventory',
    p_daily_inventory_id,
    jsonb_build_object('report_id', v_report_id, 'inventory_date', v_inventory_record.inventory_date)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. HARDEN add_stock
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_stock(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_expiry_date DATE,
  p_received_date DATE,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_batch_id UUID;
  v_item RECORD;
  v_current_total NUMERIC;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to add stock.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only administrators can add inventory stock.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.';
  END IF;

  IF p_expiry_date IS NULL THEN
    RAISE EXCEPTION 'Expiration date is mandatory for adding stock.';
  END IF;

  IF p_expiry_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Expiration date cannot be in the past.';
  END IF;

  SELECT id INTO v_item 
  FROM public.inventory_items 
  WHERE id = p_item_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % does not exist.', p_item_id;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_current_total
  FROM public.stock_batches
  WHERE item_id = p_item_id;

  INSERT INTO public.stock_batches (
    item_id, quantity, initial_quantity, expiry_date, received_date
  ) VALUES (
    p_item_id, p_quantity, p_quantity, p_expiry_date, COALESCE(p_received_date, CURRENT_DATE)
  ) RETURNING id INTO v_batch_id;

  INSERT INTO public.stock_movements (
    item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
  ) VALUES (
    p_item_id, v_batch_id, 'ADD', v_current_total, p_quantity, v_current_total + p_quantity, v_caller_id, COALESCE(p_reason, 'Manual Stock Addition')
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. HARDEN create_inventory_item_with_initial_stock
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_inventory_item_with_initial_stock(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, DATE, TEXT);
CREATE OR REPLACE FUNCTION public.create_inventory_item_with_initial_stock(
  p_category_id UUID,
  p_item_code TEXT,
  p_name TEXT,
  p_description TEXT,
  p_unit_cost NUMERIC,
  p_min_quantity NUMERIC,
  p_supplier_a TEXT,
  p_supplier_b TEXT,
  p_unit TEXT,
  p_initial_quantity NUMERIC,
  p_expiry_date DATE,
  p_image_path TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_item_id UUID;
  v_batch_id UUID;
  v_movement_id UUID;
  v_clean_code TEXT;
  v_trimmed_name TEXT;
  v_unit TEXT;
  v_result JSONB;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to create inventory items.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only administrators can create inventory items.';
  END IF;

  v_trimmed_name := TRIM(COALESCE(p_name, ''));
  IF v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Item name is required and cannot be blank.';
  END IF;

  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'Category is required.';
  END IF;

  PERFORM 1 FROM public.categories WHERE id = p_category_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Category % does not exist.', p_category_id;
  END IF;

  v_unit := TRIM(COALESCE(p_unit, 'pcs'));
  IF v_unit = '' THEN v_unit := 'pcs'; END IF;

  IF p_initial_quantity IS NULL OR p_initial_quantity <= 0 THEN
    RAISE EXCEPTION 'Initial stock quantity must be greater than zero.';
  END IF;

  IF p_expiry_date IS NULL THEN
    RAISE EXCEPTION 'Expiration date is mandatory for new stocked items.';
  END IF;

  IF p_expiry_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Expiration date (%) cannot be in the past.', p_expiry_date;
  END IF;

  IF p_item_code IS NOT NULL AND TRIM(p_item_code) <> '' THEN
    v_clean_code := UPPER(TRIM(p_item_code));
    IF EXISTS (
      SELECT 1 FROM public.inventory_items 
      WHERE TRIM(UPPER(item_code)) = v_clean_code AND is_archived = false
    ) THEN
      RAISE EXCEPTION 'Item code "%" is already in use by another item.', v_clean_code;
    END IF;
  ELSE
    v_clean_code := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8));
  END IF;

  INSERT INTO public.inventory_items (
    category_id, item_code, name, description, unit, unit_cost, min_quantity,
    supplier_a, supplier_b, image_path, is_active, is_archived
  ) VALUES (
    p_category_id, v_clean_code, v_trimmed_name, COALESCE(p_description, ''),
    v_unit, GREATEST(0, COALESCE(p_unit_cost, 0)), GREATEST(0, COALESCE(p_min_quantity, 0)),
    COALESCE(p_supplier_a, ''), COALESCE(p_supplier_b, ''), p_image_path, true, false
  ) RETURNING id INTO v_item_id;

  INSERT INTO public.stock_batches (
    item_id, quantity, initial_quantity, expiry_date, received_date
  ) VALUES (
    v_item_id, p_initial_quantity, p_initial_quantity, p_expiry_date, CURRENT_DATE
  ) RETURNING id INTO v_batch_id;

  INSERT INTO public.stock_movements (
    item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
  ) VALUES (
    v_item_id, v_batch_id, 'ADD', 0, p_initial_quantity, p_initial_quantity, v_caller_id, 'Initial Opening Stock Balance'
  ) RETURNING id INTO v_movement_id;

  v_result := jsonb_build_object(
    'id', v_item_id,
    'item_code', v_clean_code,
    'item_name', v_trimmed_name,
    'category_id', p_category_id,
    'unit', v_unit,
    'unit_cost', GREATEST(0, COALESCE(p_unit_cost, 0)),
    'min_qty', GREATEST(0, COALESCE(p_min_quantity, 0)),
    'current_qty', p_initial_quantity,
    'batch_id', v_batch_id,
    'expiry_date', p_expiry_date,
    'movement_id', v_movement_id
  );

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. HARDEN correct_finalized_daily_inventory (Fail-closed)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.correct_finalized_daily_inventory(UUID, JSONB, TEXT);
CREATE OR REPLACE FUNCTION public.correct_finalized_daily_inventory(
  p_daily_inventory_id UUID,
  p_items JSONB,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_user_name TEXT;
  v_sheet RECORD;
  v_rev_count INT;
  v_item RECORD;
  v_existing_item RECORD;
  v_delta_consumption NUMERIC;
  v_delta_add NUMERIC;
  v_stock_deltas JSONB := '[]'::jsonb;
  v_old_items_snapshot JSONB;
  v_report_id UUID;
  v_item_id UUID;
  v_new_beg NUMERIC;
  v_new_add NUMERIC;
  v_new_am NUMERIC;
  v_new_pm NUMERIC;
  v_new_ending NUMERIC;
BEGIN
  -- Strict Super Admin role verification
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to correct finalized inventory.';
  END IF;

  SELECT role, COALESCE(display_name, 'Super Administrator')
  INTO v_caller_role, v_user_name
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('SUPER_ADMIN', 'MASTER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only Super Administrators can apply direct corrections to finalized inventory.';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'A valid correction reason is strictly mandatory.';
  END IF;

  SELECT * INTO v_sheet 
  FROM public.daily_inventory 
  WHERE id = p_daily_inventory_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily inventory worksheet % does not exist.', p_daily_inventory_id;
  END IF;

  IF v_sheet.state != 'FINALIZED' THEN
    RAISE EXCEPTION 'Cannot apply finalized revision: worksheet is currently in % state.', v_sheet.state;
  END IF;

  SELECT id INTO v_report_id 
  FROM public.reports 
  WHERE daily_inventory_id = p_daily_inventory_id;

  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_rev_count 
  FROM public.daily_inventory_revisions 
  WHERE daily_inventory_id = p_daily_inventory_id;

  SELECT jsonb_agg(row_to_json(dii.*)) INTO v_old_items_snapshot
  FROM public.daily_inventory_items dii
  WHERE dii.daily_inventory_id = p_daily_inventory_id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    item_id UUID, beg NUMERIC, add NUMERIC, am NUMERIC, pm NUMERIC, ending NUMERIC
  )
  LOOP
    v_item_id := v_item.item_id;
    v_new_beg := GREATEST(0, COALESCE(v_item.beg, 0));
    v_new_add := GREATEST(0, COALESCE(v_item.add, 0));
    v_new_am := GREATEST(0, COALESCE(v_item.am, 0));
    v_new_pm := GREATEST(0, COALESCE(v_item.pm, 0));
    v_new_ending := GREATEST(0, (v_new_beg + v_new_add - v_new_am - v_new_pm));

    SELECT * INTO v_existing_item
    FROM public.daily_inventory_items
    WHERE daily_inventory_id = p_daily_inventory_id AND item_id = v_item_id
    FOR UPDATE;

    IF FOUND THEN
      v_delta_consumption := (v_new_am + v_new_pm) - (COALESCE(v_existing_item.am, 0) + COALESCE(v_existing_item.pm, 0));
      v_delta_add := v_new_add - COALESCE(v_existing_item.add, 0);

      -- Transactional stock reconciliation: NOT swallowed!
      IF v_delta_consumption > 0 THEN
        PERFORM public.consume_stock(
          v_item_id, 
          v_delta_consumption, 
          format('Finalized Sheet Correction (Rev %s): Deducted %s additional consumption', v_rev_count, v_delta_consumption)
        );
      ELSIF v_delta_consumption < 0 THEN
        PERFORM public.add_stock(
          v_item_id, 
          abs(v_delta_consumption), 
          (CURRENT_DATE + interval '90 days')::DATE, 
          CURRENT_DATE, 
          format('Finalized Sheet Correction (Rev %s): Returned %s overestimated sales', v_rev_count, abs(v_delta_consumption))
        );
      END IF;

      IF v_delta_add > 0 THEN
        PERFORM public.add_stock(
          v_item_id, 
          v_delta_add, 
          (CURRENT_DATE + interval '90 days')::DATE, 
          CURRENT_DATE, 
          format('Finalized Sheet Correction (Rev %s): +%s receipts adjustment', v_rev_count, v_delta_add)
        );
      ELSIF v_delta_add < 0 THEN
        PERFORM public.consume_stock(
          v_item_id, 
          abs(v_delta_add), 
          format('Finalized Sheet Correction (Rev %s): -%s receipts reduction', v_rev_count, abs(v_delta_add))
        );
      END IF;

      UPDATE public.daily_inventory_items
      SET beg = v_new_beg,
          add = v_new_add,
          am = v_new_am,
          pm = v_new_pm
      WHERE id = v_existing_item.id;

      IF v_delta_consumption != 0 OR v_delta_add != 0 THEN
        v_stock_deltas := v_stock_deltas || jsonb_build_object(
          'item_id', v_item_id,
          'delta_consumption', v_delta_consumption,
          'delta_add', v_delta_add
        );
      END IF;

      IF v_report_id IS NOT NULL THEN
        UPDATE public.report_items
        SET beg = v_new_beg,
            add = v_new_add,
            total = (v_new_beg + v_new_add),
            am = v_new_am,
            pm = v_new_pm,
            ending = v_new_ending
        WHERE report_id = v_report_id 
          AND item_name = (SELECT name FROM public.inventory_items WHERE id = v_item_id);
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.daily_inventory_revisions (
    daily_inventory_id,
    revision_number,
    inventory_date,
    reason,
    corrected_by,
    corrected_by_name,
    old_values,
    new_values,
    stock_adjustments,
    created_at
  ) VALUES (
    p_daily_inventory_id,
    v_rev_count,
    v_sheet.inventory_date,
    TRIM(p_reason),
    v_caller_id,
    v_user_name,
    COALESCE(v_old_items_snapshot, '[]'::jsonb),
    p_items,
    v_stock_deltas,
    now()
  );

  INSERT INTO public.audit_logs (
    actor_id, action, target_table, target_id, new_data
  ) VALUES (
    v_caller_id,
    'CORRECT_FINALIZED_INVENTORY',
    'daily_inventory',
    p_daily_inventory_id,
    jsonb_build_object(
      'revision', v_rev_count,
      'reason', p_reason,
      'deltas', v_stock_deltas
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'revision_number', v_rev_count,
    'inventory_date', v_sheet.inventory_date,
    'stock_deltas', v_stock_deltas,
    'message', format('Successfully applied Revision #%s to finalized inventory sheet.', v_rev_count)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. GRANT EXECUTE STRICTLY TO AUTHENTICATED
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.consume_stock(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_stock(UUID, NUMERIC, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_stock(UUID, NUMERIC, DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock_to_target(UUID, NUMERIC, TEXT, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_daily_inventory_stock(UUID, NUMERIC, DATE, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_daily_inventory_draft(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_daily_inventory(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_inventory_item_with_initial_stock(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_finalized_daily_inventory(UUID, JSONB, TEXT) TO authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
