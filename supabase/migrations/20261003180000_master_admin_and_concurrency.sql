-- 20261003180000_master_admin_and_concurrency.sql
-- Phase 3: Master Admin RBAC, Database Concurrency, Transaction Safety, and Dashboard Queries

-- ============================================================================
-- 1. MASTER_ADMIN ROLE & PERMISSIONS
-- ============================================================================

-- A. Update role verification functions
CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN UPPER(TRIM(COALESCE(v_role, ''))) = 'MASTER_ADMIN';
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN UPPER(TRIM(COALESCE(v_role, ''))) IN ('ADMIN', 'MASTER_ADMIN');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'ANON';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN UPPER(TRIM(COALESCE(v_role, 'USER')));
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_master_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

-- B. Update protect_profile_role trigger function to allow MASTER_ADMIN
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT (
      COALESCE(auth.role(), '') = 'service_role' OR
      public.is_admin()
    ) THEN
      RAISE EXCEPTION 'Privilege escalation rejected: only administrators can change user roles.';
    END IF;

    -- Only existing MASTER_ADMIN can promote a user to MASTER_ADMIN
    IF UPPER(TRIM(NEW.role)) = 'MASTER_ADMIN' AND NOT (
      COALESCE(auth.role(), '') = 'service_role' OR
      public.is_master_admin()
    ) THEN
      RAISE EXCEPTION 'Privilege escalation rejected: only Master Administrators can grant the MASTER_ADMIN role.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- C. Update admin_create_user to support MASTER_ADMIN role creation
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_first_name TEXT,
  p_last_name TEXT,
  p_role TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_display_name TEXT;
  v_clean_role TEXT;
  v_clean_email TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized. Admin access required.';
  END IF;

  v_clean_email := LOWER(TRIM(p_email));
  IF v_clean_email = '' OR v_clean_email NOT LIKE '%_@__%.__%' THEN
    RAISE EXCEPTION 'Invalid email address.';
  END IF;

  IF p_password IS NULL OR LENGTH(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters long.';
  END IF;

  v_clean_role := UPPER(TRIM(COALESCE(p_role, 'USER')));
  IF v_clean_role NOT IN ('MASTER_ADMIN', 'ADMIN', 'USER') THEN
    RAISE EXCEPTION 'Invalid role. Role must be MASTER_ADMIN, ADMIN, or USER.';
  END IF;

  IF v_clean_role = 'MASTER_ADMIN' AND NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only a Master Administrator can create a Master Admin user.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_clean_email) THEN
    RAISE EXCEPTION 'User already exists with this email address.';
  END IF;

  v_user_id := gen_random_uuid();
  v_display_name := TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, ''));
  IF v_display_name = '' THEN
    v_display_name := split_part(v_clean_email, '@', 1);
  END IF;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    invited_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at,
    is_sso_user,
    deleted_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    v_user_id,
    'authenticated',
    'authenticated',
    v_clean_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    NULL,
    '',
    NULL,
    '',
    NULL,
    '',
    '',
    NULL,
    NULL,
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('first_name', p_first_name, 'last_name', p_last_name, 'role', v_clean_role),
    FALSE,
    now(),
    now(),
    NULL,
    NULL,
    '',
    '',
    NULL,
    '',
    0,
    NULL,
    '',
    NULL,
    FALSE,
    NULL
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_clean_email),
    'email',
    v_clean_email,
    now(),
    now(),
    now()
  );

  INSERT INTO public.profiles (id, role, display_name, first_name, last_name, updated_at)
  VALUES (v_user_id, v_clean_role, v_display_name, p_first_name, p_last_name, now())
  ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      display_name = EXCLUDED.display_name,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      updated_at = now();

  RETURN v_user_id;
END;
$$;

-- D. Force Override Capabilities for MASTER_ADMIN
CREATE OR REPLACE FUNCTION public.force_override_daily_inventory(
  p_daily_inventory_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only a Master Administrator can force override finalized records.';
  END IF;

  -- Unlock the daily inventory session back to DRAFT state
  UPDATE public.daily_inventory
  SET state = 'DRAFT',
      finalized_at = NULL,
      finalized_by = NULL
  WHERE id = p_daily_inventory_id;

  INSERT INTO public.audit_logs (user_id, action, target_table, target_id, details)
  VALUES (auth.uid(), 'FORCE_OVERRIDE_RECORD', 'daily_inventory', p_daily_inventory_id, jsonb_build_object('action', 'reopened_to_draft'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.force_override_daily_inventory(UUID) TO authenticated;

-- ============================================================================
-- 2. DATABASE CONCURRENCY & TRANSACTION SAFETY
-- ============================================================================

-- A. Add version column for Optimistic Concurrency Control (OCC)
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.stock_batches 
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- B. Harden consume_stock with Row-Level Locking (SELECT ... FOR UPDATE)
-- on both inventory_items AND stock_batches to eliminate race conditions
CREATE OR REPLACE FUNCTION public.consume_stock(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_remaining NUMERIC := p_quantity;
  v_batch RECORD;
  v_deduct NUMERIC;
  v_auth_uid UUID := auth.uid();
  v_item RECORD;
BEGIN
  IF p_quantity <= 0 THEN
    RETURN;
  END IF;

  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. CRITICAL: Row-Level Lock on target inventory item
  -- Serializes simultaneous requests editing the exact same item
  SELECT id, min_quantity, version INTO v_item 
  FROM public.inventory_items 
  WHERE id = p_item_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % does not exist', p_item_id;
  END IF;

  -- 2. Row-Level Lock on active non-expired stock batches (FEFO order)
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

    -- Deduct from batch and increment batch version
    UPDATE public.stock_batches
    SET quantity = quantity - v_deduct,
        version = version + 1
    WHERE id = v_batch.id;

    -- Record movement in immutable ledger
    INSERT INTO public.stock_movements (
      item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
    ) VALUES (
      p_item_id, v_batch.id, 'REMOVE', v_batch.quantity, -v_deduct, v_batch.quantity - v_deduct, v_auth_uid, p_reason
    );

    v_remaining := v_remaining - v_deduct;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient valid stock for item % to consume % (Remaining deficit: %)', p_item_id, p_quantity, v_remaining;
  END IF;

  -- 3. Increment item version for OCC
  UPDATE public.inventory_items
  SET version = version + 1
  WHERE id = p_item_id;

END;
$$;

-- C. Harden add_stock with row-level locks
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch_id UUID;
  v_auth_uid UUID := auth.uid();
  v_item RECORD;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock item row to serialize updates
  SELECT id INTO v_item 
  FROM public.inventory_items 
  WHERE id = p_item_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % does not exist', p_item_id;
  END IF;

  INSERT INTO public.stock_batches (item_id, quantity, expiry_date, received_date, version)
  VALUES (p_item_id, p_quantity, p_expiry_date, p_received_date, 1)
  RETURNING id INTO v_batch_id;

  INSERT INTO public.stock_movements (
    item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
  ) VALUES (
    p_item_id, v_batch_id, 'ADD', 0, p_quantity, p_quantity, v_auth_uid, p_reason
  );

  UPDATE public.inventory_items
  SET version = version + 1
  WHERE id = p_item_id;

END;
$$;

-- D. Harden adjust_stock with row-level locks
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_batch_id UUID,
  p_new_quantity NUMERIC,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch RECORD;
  v_diff NUMERIC;
  v_type TEXT;
  v_auth_uid UUID := auth.uid();
BEGIN
  IF p_new_quantity < 0 THEN
    RAISE EXCEPTION 'Quantity cannot be negative';
  END IF;

  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock batch row
  SELECT * INTO v_batch FROM public.stock_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  -- Lock item row
  PERFORM 1 FROM public.inventory_items WHERE id = v_batch.item_id FOR UPDATE;

  v_diff := p_new_quantity - v_batch.quantity;
  IF v_diff = 0 THEN
    RETURN;
  END IF;

  IF v_diff > 0 THEN
    v_type := 'ADJUST_UP';
  ELSE
    v_type := 'ADJUST_DOWN';
  END IF;

  UPDATE public.stock_batches 
  SET quantity = p_new_quantity,
      version = version + 1 
  WHERE id = p_batch_id;

  UPDATE public.inventory_items
  SET version = version + 1
  WHERE id = v_batch.item_id;

  INSERT INTO public.stock_movements (
    item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
  ) VALUES (
    v_batch.item_id, p_batch_id, v_type, v_batch.quantity, v_diff, p_new_quantity, v_auth_uid, p_reason
  );

END;
$$;

-- ============================================================================
-- 3. TOP 3 STATISTICS DATABASE QUERIES & VIEW
-- ============================================================================

-- Function to return Top 3 Best Sellers, Most Stocked, and Least Stocked
CREATE OR REPLACE FUNCTION public.get_dashboard_top3_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_best_sellers jsonb;
  v_most_stocked jsonb;
  v_least_stocked jsonb;
BEGIN
  -- Top 3 Best Sellers: Order by sold_quantity DESC LIMIT 3
  SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb) INTO v_best_sellers
  FROM (
    SELECT 
      i.id,
      i.name AS item_name,
      COALESCE(c.name, 'General') AS category_name,
      i.unit,
      COALESCE(ABS(SUM(sm.quantity_change)), 0) AS sold_quantity
    FROM public.inventory_items i
    LEFT JOIN public.categories c ON i.category_id = c.id
    LEFT JOIN public.stock_movements sm ON i.id = sm.item_id AND sm.type = 'REMOVE'
    WHERE i.is_active = true AND (i.is_archived = false OR i.is_archived IS NULL)
    GROUP BY i.id, i.name, c.name, i.unit
    ORDER BY sold_quantity DESC, i.name ASC
    LIMIT 3
  ) sub;

  -- Top 3 Most Stocked: Order by current_stock DESC LIMIT 3
  SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb) INTO v_most_stocked
  FROM (
    SELECT 
      i.id,
      i.name AS item_name,
      COALESCE(c.name, 'General') AS category_name,
      i.unit,
      COALESCE(SUM(b.quantity), 0) AS current_stock
    FROM public.inventory_items i
    LEFT JOIN public.categories c ON i.category_id = c.id
    LEFT JOIN public.stock_batches b ON i.id = b.item_id AND b.quantity > 0
    WHERE i.is_active = true AND (i.is_archived = false OR i.is_archived IS NULL)
    GROUP BY i.id, i.name, c.name, i.unit
    ORDER BY current_stock DESC, i.name ASC
    LIMIT 3
  ) sub;

  -- Top 3 Least Stocked: Order by current_stock ASC LIMIT 3
  SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb) INTO v_least_stocked
  FROM (
    SELECT 
      i.id,
      i.name AS item_name,
      COALESCE(c.name, 'General') AS category_name,
      i.unit,
      COALESCE(SUM(b.quantity), 0) AS current_stock,
      i.min_quantity
    FROM public.inventory_items i
    LEFT JOIN public.categories c ON i.category_id = c.id
    LEFT JOIN public.stock_batches b ON i.id = b.item_id AND b.quantity > 0
    WHERE i.is_active = true AND (i.is_archived = false OR i.is_archived IS NULL)
    GROUP BY i.id, i.name, c.name, i.unit, i.min_quantity
    ORDER BY current_stock ASC, i.name ASC
    LIMIT 3
  ) sub;

  RETURN jsonb_build_object(
    'best_sellers', v_best_sellers,
    'most_stocked', v_most_stocked,
    'least_stocked', v_least_stocked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_top3_stats() TO authenticated, anon;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
