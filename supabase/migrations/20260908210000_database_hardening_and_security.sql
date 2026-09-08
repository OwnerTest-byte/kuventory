-- 20260908210000_database_hardening_and_security.sql
-- Comprehensive Database Quality & Security Hardening Migration
-- 
-- 1. Privilege Escalation Protection: Prevents non-admins from altering role in public.profiles.
-- 2. Immutable Stock Movements Ledger: Prevents regular users from modifying or deleting historical movements.
-- 3. Finalized Daily Inventory Locking: Protects finalized daily inventory sessions and item rows from mutation.
-- 4. Principle of Least Privilege: Revokes excessive ALL grants from anon on tables and administrative routines.
-- 5. Security Definer RPC Hardening: Explicit search_path and public.is_admin() checks on administrative RPCs.
-- 6. High-Performance Query Indexes: Adds composite indexes for FEFO, stock history, notifications, and reports.
-- 7. Audit Trail Protection: Logs administrative actions cleanly without ever recording passwords or credentials.

-- ============================================================================
-- 1. PRIVILEGE ESCALATION PROTECTION (profiles.role)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If role is changing, verify caller is service_role or an existing verified admin
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT (
      COALESCE(auth.role(), '') = 'service_role' OR
      public.is_admin()
    ) THEN
      RAISE EXCEPTION 'Privilege escalation rejected: only administrators can change user roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_role();

-- Normalize and harden role check functions
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
  RETURN UPPER(TRIM(COALESCE(v_role, ''))) = 'ADMIN';
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

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

-- ============================================================================
-- 2. HISTORICAL DATA PROTECTION (stock_movements Immutable Ledger)
-- ============================================================================

-- Drop all previous delete policies on stock_movements
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.stock_movements;
DROP POLICY IF EXISTS "Enable delete for admins" ON public.stock_movements;
DROP POLICY IF EXISTS "Service role can delete stock_movements" ON public.stock_movements;

-- Only service_role can delete if administrative cascade is required
CREATE POLICY "Service role can delete stock_movements"
  ON public.stock_movements FOR DELETE
  TO service_role
  USING (true);

-- Trigger strictly enforcing immutability of stock movements
CREATE OR REPLACE FUNCTION public.enforce_stock_movements_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Stock movements represent an immutable ledger and cannot be updated.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF COALESCE(auth.role(), '') != 'service_role' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Stock movements represent an immutable ledger and cannot be deleted by regular users.';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_movements_immutable ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_immutable
BEFORE UPDATE OR DELETE ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.enforce_stock_movements_immutable();

-- ============================================================================
-- 3. DAILY INVENTORY & ITEMS FINALIZATION LOCKING
-- ============================================================================

-- Drop all existing update/delete policies on daily_inventory to ensure clean idempotent definition
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.daily_inventory;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.daily_inventory;
DROP POLICY IF EXISTS "Users can update daily_inventory if DRAFT" ON public.daily_inventory;
DROP POLICY IF EXISTS "Admins can update daily_inventory" ON public.daily_inventory;
DROP POLICY IF EXISTS "Admins can delete daily_inventory if DRAFT" ON public.daily_inventory;

CREATE POLICY "Users can update daily_inventory if DRAFT"
  ON public.daily_inventory FOR UPDATE
  TO authenticated
  USING (state = 'DRAFT')
  WITH CHECK (state = 'DRAFT');

CREATE POLICY "Admins can update daily_inventory"
  ON public.daily_inventory FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete daily_inventory if DRAFT"
  ON public.daily_inventory FOR DELETE
  TO authenticated
  USING (state = 'DRAFT' AND public.is_admin());

-- Drop all existing update/delete policies on daily_inventory_items
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.daily_inventory_items;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.daily_inventory_items;
DROP POLICY IF EXISTS "Users can update daily_inventory_items if parent is DRAFT" ON public.daily_inventory_items;
DROP POLICY IF EXISTS "Admins can update daily_inventory_items" ON public.daily_inventory_items;
DROP POLICY IF EXISTS "Users can delete daily_inventory_items if parent is DRAFT" ON public.daily_inventory_items;

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

CREATE POLICY "Admins can update daily_inventory_items"
  ON public.daily_inventory_items FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Users can delete daily_inventory_items if parent is DRAFT"
  ON public.daily_inventory_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.daily_inventory di
      WHERE di.id = daily_inventory_items.daily_inventory_id
        AND di.state = 'DRAFT'
    )
  );

-- Enforce locking via trigger on daily_inventory to prevent tampering with finalized sessions
CREATE OR REPLACE FUNCTION public.protect_finalized_daily_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.state = 'FINALIZED' AND NEW.state = 'FINALIZED' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Finalized daily inventory sessions are locked and cannot be modified.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_finalized_daily_inventory ON public.daily_inventory;
CREATE TRIGGER trg_protect_finalized_daily_inventory
BEFORE UPDATE ON public.daily_inventory
FOR EACH ROW
EXECUTE FUNCTION public.protect_finalized_daily_inventory();

-- ============================================================================
-- 4. REVOKE EXCESSIVE PRIVILEGES FROM ANON
-- ============================================================================

-- Revoke dangerous table grants from anon
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;

-- Re-grant minimal legitimate usage
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.system_settings TO anon;

-- Explicitly revoke execution on administrative and destructive RPCs from anon
REVOKE EXECUTE ON FUNCTION public.remove_inventory_item(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.archive_inventory_item(UUID, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_system_setting(TEXT, JSONB) FROM anon;

-- Ensure authenticated users have proper access to authorized functions
GRANT EXECUTE ON FUNCTION public.remove_inventory_item(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_inventory_item(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_system_setting(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_system_setting(TEXT) TO authenticated;

-- ============================================================================
-- 5. HARDEN SECURITY DEFINER RPCs & AUDIT LOGGING
-- ============================================================================

-- Ensure pgcrypto extension is installed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  p_user_id UUID,
  p_new_password TEXT
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized. Admin access required.';
  END IF;

  IF p_new_password IS NULL OR LENGTH(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters long.';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  -- Record audit trail WITHOUT exposing sensitive passwords
  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
  VALUES (auth.uid(), 'PASSWORD_RESET', 'profiles', p_user_id, jsonb_build_object('user_id', p_user_id));

  RETURN TRUE;
END;
$$;

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
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized. Admin access required.';
  END IF;

  v_clean_role := UPPER(TRIM(COALESCE(p_role, 'USER')));
  IF v_clean_role NOT IN ('ADMIN', 'USER') THEN
    RAISE EXCEPTION 'Invalid role. Role must be ADMIN or USER.';
  END IF;

  v_user_id := gen_random_uuid();
  v_display_name := TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, ''));
  IF v_display_name = '' THEN
    v_display_name := p_email;
  END IF;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('first_name', p_first_name, 'last_name', p_last_name, 'role', v_clean_role),
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

  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
  VALUES (auth.uid(), 'USER_CREATE', 'profiles', v_user_id, jsonb_build_object('email', p_email, 'role', v_clean_role));

  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized. Admin access required.';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete active logged-in administrator account.';
  END IF;

  DELETE FROM public.profiles WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;

  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, old_data)
  VALUES (auth.uid(), 'USER_DELETE', 'profiles', p_user_id, jsonb_build_object('deleted_user_id', p_user_id));

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_system_setting(p_key TEXT, p_value JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized. Admin access required.';
  END IF;

  INSERT INTO public.system_settings (key, value, updated_at, updated_by)
  VALUES (p_key, p_value, now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now(),
      updated_by = auth.uid();

  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
  VALUES (auth.uid(), 'SYSTEM_SETTING_UPDATE', 'system_settings', NULL, jsonb_build_object('key', p_key));
END;
$$;

-- ============================================================================
-- 6. HIGH-PERFORMANCE QUERY INDEXES
-- ============================================================================

-- Items catalog filtering & sorting
CREATE INDEX IF NOT EXISTS idx_inventory_items_active_archived ON public.inventory_items(is_archived, is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON public.inventory_items(name);

-- Stock batches FEFO optimization (item_id + quantity + expiry date + received date)
CREATE INDEX IF NOT EXISTS idx_stock_batches_fefo ON public.stock_batches(item_id, quantity, expiry_date ASC NULLS LAST, received_date ASC);

-- Stock movements ledger indexing for audit, user history, and chronological queries
CREATE INDEX IF NOT EXISTS idx_stock_movements_item_created ON public.stock_movements(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON public.stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_user ON public.stock_movements(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON public.stock_movements(type);

-- Daily inventory queries and item lookups
CREATE INDEX IF NOT EXISTS idx_daily_inventory_state_date ON public.daily_inventory(state, inventory_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_inventory_items_item ON public.daily_inventory_items(item_id);

-- Unread notifications query optimization
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, is_read, created_at DESC);

-- Audit logs performance indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.audit_logs(target_table, target_id);

-- Suppliers directory
CREATE INDEX IF NOT EXISTS idx_suppliers_active_name ON public.suppliers(is_active, name);

-- ============================================================================
-- 7. REFRESH SCHEMA CACHE
-- ============================================================================

NOTIFY pgrst, 'reload schema';
