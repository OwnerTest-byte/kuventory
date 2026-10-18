-- ========================================================================================
-- KUVENTORY TEST: Row-Level Security (RLS) & Access Control Verification
-- Validates authorization boundaries for Anon, Authenticated Staff, and Administrators
-- against the live schema: profiles, inventory_items, stock_batches, stock_movements, daily_inventory
-- ========================================================================================

CREATE OR REPLACE FUNCTION test_rls() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_admin_uid UUID := '11111111-1111-1111-1111-111111111111';
  v_staff_uid UUID := '22222222-2222-2222-2222-222222222222';
  v_item_id UUID;
  v_count INT;
  v_forbidden_succeeded BOOLEAN;
BEGIN
  -- 0. Seed test profiles if not present
  INSERT INTO public.profiles (id, role, display_name)
  VALUES (v_admin_uid, 'ADMIN', 'Test Admin')
  ON CONFLICT (id) DO UPDATE SET role = 'ADMIN';

  INSERT INTO public.profiles (id, role, display_name)
  VALUES (v_staff_uid, 'USER', 'Test Staff')
  ON CONFLICT (id) DO UPDATE SET role = 'USER';

  SELECT id INTO v_item_id FROM public.inventory_items LIMIT 1;

  -- ----------------------------------------------------------------------------------------
  -- 1. Anonymous Access Boundary Tests
  -- ----------------------------------------------------------------------------------------
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', '', true);

  -- Anon MUST NOT be able to delete inventory items
  IF v_item_id IS NOT NULL THEN
    v_forbidden_succeeded := false;
    BEGIN
      DELETE FROM public.inventory_items WHERE id = v_item_id;
      v_forbidden_succeeded := true;
    EXCEPTION WHEN OTHERS THEN
      v_forbidden_succeeded := false;
    END;

    IF v_forbidden_succeeded THEN
      RAISE EXCEPTION 'CRITICAL SECURITY BREACH: Anonymous user was able to delete inventory items!';
    END IF;
  END IF;

  -- Anon MUST NOT be able to delete stock movement audit logs
  v_forbidden_succeeded := false;
  BEGIN
    DELETE FROM public.stock_movements;
    v_forbidden_succeeded := true;
  EXCEPTION WHEN OTHERS THEN
    v_forbidden_succeeded := false;
  END;

  IF v_forbidden_succeeded THEN
    RAISE EXCEPTION 'CRITICAL SECURITY BREACH: Anonymous user was able to delete stock_movements!';
  END IF;

  -- Anon MUST NOT be able to invoke destructive RPCs
  IF v_item_id IS NOT NULL THEN
    v_forbidden_succeeded := false;
    BEGIN
      PERFORM public.remove_inventory_item(v_item_id);
      v_forbidden_succeeded := true;
    EXCEPTION WHEN OTHERS THEN
      v_forbidden_succeeded := false;
    END;

    IF v_forbidden_succeeded THEN
      RAISE EXCEPTION 'CRITICAL SECURITY BREACH: Anonymous user was able to invoke remove_inventory_item!';
    END IF;
  END IF;

  -- ----------------------------------------------------------------------------------------
  -- 2. Authenticated Staff Access Boundary Tests
  -- ----------------------------------------------------------------------------------------
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_staff_uid), true);

  -- Staff MUST NOT be able to escalate their own role to ADMIN
  v_forbidden_succeeded := false;
  BEGIN
    UPDATE public.profiles SET role = 'ADMIN' WHERE id = v_staff_uid;
    v_forbidden_succeeded := true;
  EXCEPTION WHEN OTHERS THEN
    v_forbidden_succeeded := false;
  END;

  IF v_forbidden_succeeded THEN
    RAISE EXCEPTION 'CRITICAL SECURITY BREACH: Staff member was able to escalate own role to ADMIN!';
  END IF;

  -- Staff MUST NOT be able to delete stock_movements (immutable audit ledger)
  v_forbidden_succeeded := false;
  BEGIN
    DELETE FROM public.stock_movements;
    v_forbidden_succeeded := true;
  EXCEPTION WHEN OTHERS THEN
    v_forbidden_succeeded := false;
  END;

  IF v_forbidden_succeeded THEN
    RAISE EXCEPTION 'CRITICAL SECURITY BREACH: Staff member was able to delete stock movements ledger!';
  END IF;

  -- ----------------------------------------------------------------------------------------
  -- 3. Authenticated Administrator Boundary Tests
  -- ----------------------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_admin_uid), true);

  -- Admin can manage system settings
  PERFORM public.set_system_setting('rls_test_flag', '{"tested": true}'::jsonb);

  RAISE NOTICE 'SUCCESS: All RLS security assertions passed against live schema.';
END;
$$;
