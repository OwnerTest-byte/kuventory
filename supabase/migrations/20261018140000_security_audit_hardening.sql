-- ==============================================================================
-- KUVENTORY Comprehensive Security Audit Hardening & Data Integrity Fix
-- Migration Date: 2026-10-18 14:00:00
-- 
-- Addresses:
-- C1 / SEC-01: Admin role elevation prevention & admin_update_user_role RPC
-- C2 / SEC-03: Revocation of anon execution on destructive inventory RPCs
-- C3 / SEC-02: User creation trigger strictly defaults to USER, rejecting forged metadata
-- H1 / SEC-04: Drop overlapping broad policies; lock finalized sheets and movement history
-- H3 / DATA-02: Atomic stock receipt RPC (receive_daily_inventory_stock)
-- P2: Atomic concurrent stock count adjustment RPC (adjust_stock_to_target)
-- ==============================================================================

-- 1. SEC-01 / C1: SECURE USER ROLE UPDATE RPC
CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  p_user_id UUID,
  p_role TEXT
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_is_admin BOOLEAN := public.is_admin();
  v_current_role TEXT;
  v_admin_count INT;
BEGIN
  -- 1. Verify caller authorization
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Access denied. Administrative privileges required to manage roles.';
  END IF;

  -- 2. Validate role against strict allowlist
  IF p_role NOT IN ('USER', 'ADMIN') THEN
    RAISE EXCEPTION 'Invalid role: % - only USER or ADMIN can be assigned.', p_role;
  END IF;

  -- 3. Retrieve target user's current role
  SELECT role INTO v_current_role
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  -- 4. Guard against demoting the sole remaining administrator
  IF v_current_role = 'ADMIN' AND p_role = 'USER' THEN
    SELECT count(*) INTO v_admin_count FROM public.profiles WHERE role = 'ADMIN';
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the sole remaining system administrator.';
    END IF;
  END IF;

  -- 5. Guard admin quota (maximum 3 administrators)
  IF p_role = 'ADMIN' AND v_current_role != 'ADMIN' THEN
    SELECT count(*) INTO v_admin_count FROM public.profiles WHERE role = 'ADMIN';
    IF v_admin_count >= 3 THEN
      RAISE EXCEPTION 'Administrator quota full: maximum 3 administrators permitted.';
    END IF;
  END IF;

  -- 6. Apply role update
  UPDATE public.profiles
  SET role = p_role,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- 7. Audit log the security role change
  INSERT INTO public.audit_logs (
    actor_id,
    action,
    target_table,
    target_id,
    new_data
  ) VALUES (
    auth.uid(),
    'ROLE_UPDATE',
    'profiles',
    p_user_id,
    jsonb_build_object('previous_role', v_current_role, 'new_role', p_role)
  );

  RETURN true;
END;
$$;

-- Explicitly revoke from anon & PUBLIC, grant strictly to authenticated
REVOKE EXECUTE ON FUNCTION public.admin_update_user_role(UUID, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role(UUID, TEXT) TO authenticated;

-- Hardened Trigger: Completely block self-service or unauthorized role changes on profiles table
CREATE OR REPLACE FUNCTION public.prevent_profile_role_tampering()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_admin() AND COALESCE(auth.role(), '') != 'service_role' THEN
      RAISE EXCEPTION 'Unauthorized: Users cannot modify their own security role.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_role_tampering();


-- ==============================================================================
-- 2. SEC-03 / C2: HARDEN DESTRUCTIVE SECURITY DEFINER RPCs AGAINST ANON
-- ==============================================================================

-- Revoke all routines execution from anon
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;

-- Explicitly revoke execution on remove and archive item from anon and PUBLIC
REVOKE EXECUTE ON FUNCTION public.remove_inventory_item(UUID) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.archive_inventory_item(UUID, BOOLEAN) FROM anon, PUBLIC;

-- Harden archive_inventory_item with caller authentication & role verification
CREATE OR REPLACE FUNCTION public.archive_inventory_item(
  p_item_id UUID,
  p_archived BOOLEAN
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Strict authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Require Admin or verified staff role
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrative privileges required to archive inventory items.';
  END IF;

  UPDATE public.inventory_items
  SET is_archived = p_archived,
      is_active = NOT p_archived,
      updated_at = NOW()
  WHERE id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found.';
  END IF;

  -- Audit log the archival state change
  INSERT INTO public.audit_logs (
    actor_id,
    action,
    target_table,
    target_id,
    new_data
  ) VALUES (
    auth.uid(),
    CASE WHEN p_archived THEN 'ITEM_ARCHIVED' ELSE 'ITEM_RESTORED' END,
    'inventory_items',
    p_item_id,
    jsonb_build_object('is_archived', p_archived)
  );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_inventory_item(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_inventory_item(UUID) TO authenticated;


-- ==============================================================================
-- 3. SEC-02 / C3: HARDEN HANDLE_NEW_USER TRIGGER (FAIL-CLOSED ROLE)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_first_name TEXT := new.raw_user_meta_data->>'first_name';
  v_last_name TEXT := new.raw_user_meta_data->>'last_name';
  v_role TEXT := 'USER'; -- Unconditionally default to USER; ignore client metadata
  v_display_name TEXT;
BEGIN
  v_display_name := TRIM(COALESCE(v_first_name, '') || ' ' || COALESCE(v_last_name, ''));
  IF v_display_name = '' THEN
    v_display_name := split_part(new.email, '@', 1);
  END IF;

  -- First account created during fresh initial bootstrap becomes initial ADMIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) THEN
    v_role := 'ADMIN';
  END IF;

  INSERT INTO public.profiles (id, role, display_name, first_name, last_name, updated_at)
  VALUES (new.id, v_role, v_display_name, v_first_name, v_last_name, NOW())
  ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      updated_at = NOW();

  RETURN new;
END;
$$;


-- ==============================================================================
-- 4. DATA-02 / H3: ATOMIC STOCK RECEIPT RPC
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.receive_daily_inventory_stock(
  p_daily_inventory_item_id UUID,
  p_quantity NUMERIC,
  p_expiry_date DATE,
  p_user_id UUID,
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
  v_effective_user UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.';
  END IF;

  IF p_expiry_date IS NULL THEN
    RAISE EXCEPTION 'Expiration date is required for FEFO tracking.';
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

  -- 2. Calculate current total physical stock for audit trail
  SELECT COALESCE(SUM(quantity), 0) INTO v_current_total
  FROM public.stock_batches
  WHERE item_id = v_item_id;

  -- 3. Create physical batch
  INSERT INTO public.stock_batches (
    item_id,
    quantity,
    expiry_date,
    received_date
  ) VALUES (
    v_item_id,
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


-- ==============================================================================
-- 5. P2: ATOMIC STOCK ADJUSTMENT RPC (CONCURRENCY-SAFE)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.adjust_stock_to_target(
  p_item_id UUID,
  p_target_quantity NUMERIC,
  p_reason TEXT,
  p_user_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_total NUMERIC;
  v_diff NUMERIC;
  v_effective_user UUID := COALESCE(p_user_id, auth.uid());
  v_safe_target NUMERIC := GREATEST(0, p_target_quantity);
  v_batch_id UUID;
BEGIN
  -- 1. Lock the inventory item row
  PERFORM 1 FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;

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
      expiry_date,
      received_date
    ) VALUES (
      p_item_id,
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


-- ==============================================================================
-- 6. H1 / SEC-04: PURGE OVERLAPPING BROAD RLS POLICIES & ENFORCE DRAFT MUTATIONS
-- ==============================================================================

-- Drop broad DELETE policies on audit tables
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.stock_batches;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.stock_movements;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.daily_inventory;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.daily_inventory_items;

-- Ensure stock_movements is append-only for users
DROP POLICY IF EXISTS "Users can delete stock_movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Users can update stock_movements" ON public.stock_movements;

-- Ensure daily_inventory can only be updated when DRAFT
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.daily_inventory;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.daily_inventory_items;

-- Re-confirm restrictive DRAFT policies on daily_inventory
DROP POLICY IF EXISTS "Users can update daily_inventory if DRAFT" ON public.daily_inventory;
CREATE POLICY "Users can update daily_inventory if DRAFT"
  ON public.daily_inventory FOR UPDATE
  TO authenticated
  USING (state = 'DRAFT')
  WITH CHECK (state = 'DRAFT');

DROP POLICY IF EXISTS "Users can update daily_inventory_items if parent is DRAFT" ON public.daily_inventory_items;
CREATE POLICY "Users can update daily_inventory_items if parent is DRAFT"
  ON public.daily_inventory_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.daily_inventory di
      WHERE di.id = daily_inventory_items.daily_inventory_id
        AND di.state = 'DRAFT'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.daily_inventory di
      WHERE di.id = daily_inventory_items.daily_inventory_id
        AND di.state = 'DRAFT'
    )
  );

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
