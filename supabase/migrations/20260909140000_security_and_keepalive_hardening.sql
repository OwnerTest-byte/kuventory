-- 20260909140000_security_and_keepalive_hardening.sql
-- KUVENTORY Comprehensive Security Hardening & Keepalive Pass:
-- 1. Revoke excessive universal grants from unauthenticated role 'anon' (Checks 07, 41, 70)
-- 2. Restrict destructive inventory deletion RPC and RLS policies to verified Administrators (Checks 05, 08, 15, 33)
-- 3. Prevent cross-user / finalized daily inventory overwrites (Check 06)
-- 4. Prevent self-privilege escalation on public.profiles.role (Checks 05, 34, 51)
-- 5. Harden new user signup trigger against role injection (Checks 34, 51)
-- 6. Enforce 8+ character password validation and locked search_path on admin_reset_user_password (Checks 16, 50)
-- 7. Implement lightweight keepalive ping function for Supabase free-tier continuity

-- ==============================================================================
-- 1. REVOKE UNIVERSAL PUBLIC SCHEMA ACCESS FROM ANON (CHECKS 07, 41, 70)
-- ==============================================================================
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- Allow public/anon read access ONLY to the public stock view if needed for unauthenticated widgets
GRANT SELECT ON public.inventory_stock_view TO anon, authenticated;

-- ==============================================================================
-- 2. RESTRICT DESTRUCTIVE DELETION & RPC TO ADMIN ONLY (CHECKS 05, 08, 15, 33)
-- ==============================================================================
REVOKE EXECUTE ON FUNCTION public.remove_inventory_item(UUID) FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION public.remove_inventory_item(p_item_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Strict server-side administrator verification
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrative privileges required to permanently delete inventory items.';
  END IF;

  DELETE FROM public.daily_inventory_items WHERE item_id = p_item_id;
  DELETE FROM public.stock_batches WHERE item_id = p_item_id;
  DELETE FROM public.stock_movements WHERE item_id = p_item_id;
  DELETE FROM public.notifications WHERE item_id = p_item_id;
  DELETE FROM public.inventory_items WHERE id = p_item_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_inventory_item(UUID) TO authenticated;

-- Re-enforce admin-only DELETE RLS policies
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.inventory_items;
CREATE POLICY "Enable delete for admins" ON public.inventory_items FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.stock_batches;
CREATE POLICY "Enable delete for admins" ON public.stock_batches FOR DELETE TO authenticated USING (public.is_admin());

-- ==============================================================================
-- 3. SCOPE DAILY INVENTORY UPDATES (CHECK 06)
-- ==============================================================================
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.daily_inventory;
CREATE POLICY "Staff update unfinalized or own daily inventory" ON public.daily_inventory 
  FOR UPDATE TO authenticated 
  USING (state = 'DRAFT' OR created_by = auth.uid() OR public.is_admin());

-- ==============================================================================
-- 4. PREVENT ROLE TAMPERING ON PROFILES TABLE (CHECKS 05, 34, 51)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.prevent_profile_role_tampering()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent changing role unless caller is an active verified Administrator
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Users cannot modify their own security role.';
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
-- 5. HARDEN HANDLE_NEW_USER TRIGGER (CHECKS 34, 51)
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
  v_role TEXT := 'USER'; -- Hardened: Default to USER regardless of what is passed in user_metadata
  v_display_name TEXT;
BEGIN
  v_display_name := TRIM(COALESCE(v_first_name, '') || ' ' || COALESCE(v_last_name, ''));
  IF v_display_name = '' THEN
    v_display_name := new.email;
  END IF;

  -- First user in the database becomes initial ADMIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) THEN
    v_role := 'ADMIN';
  END IF;

  INSERT INTO public.profiles (id, role, display_name, first_name, last_name, updated_at)
  VALUES (new.id, v_role, v_display_name, v_first_name, v_last_name, now())
  ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      updated_at = now();

  RETURN new;
END;
$$;

-- ==============================================================================
-- 6. SECURE ADMIN_RESET_USER_PASSWORD (CHECKS 16, 50)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  p_user_id UUID,
  p_new_password TEXT
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized. Admin access required.';
  END IF;

  IF p_new_password IS NULL OR LENGTH(p_new_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters long.';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated;

-- ==============================================================================
-- 7. LIGHTWEIGHT KEEPALIVE PING FUNCTION
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.ping_keepalive()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN jsonb_build_object(
    'status', 'ok',
    'timestamp', now(),
    'service', 'kuventory-database',
    'uptime_heartbeat', 'active'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ping_keepalive() TO anon, authenticated, service_role;

-- ==============================================================================
-- 8. REFRESH SCHEMA CACHE
-- ==============================================================================
NOTIFY pgrst, 'reload schema';
