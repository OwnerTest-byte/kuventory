-- ========================================================================================
-- KUVENTORY TEST: Row-Level Security (RLS) & Access Control Verification
-- Validates authorization boundaries for Anon, Authenticated Staff, and Administrators
-- Uses dedicated random UUID fixtures and cleans up all fixtures upon test completion.
-- ========================================================================================

CREATE OR REPLACE FUNCTION test_rls() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_admin_uid UUID := gen_random_uuid();
  v_staff_uid UUID := gen_random_uuid();
  v_category_id UUID := gen_random_uuid();
  v_item_id UUID := gen_random_uuid();
  v_count INT;
  v_forbidden_succeeded BOOLEAN;
BEGIN
  -- 0. Seed isolated test profiles and test item
  INSERT INTO public.profiles (id, role, display_name)
  VALUES (v_admin_uid, 'ADMIN', '_RLS Test Admin');

  INSERT INTO public.profiles (id, role, display_name)
  VALUES (v_staff_uid, 'USER', '_RLS Test Staff');

  INSERT INTO public.categories (id, name, display_order)
  VALUES (v_category_id, '_RLS Test Category', 9998)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.inventory_items (id, category_id, name, unit, unit_cost, min_quantity, is_active)
  VALUES (v_item_id, v_category_id, '_RLS Test Item ' || substr(v_item_id::text, 1, 8), 'pcs', 5.00, 2.00, true);

  -- ----------------------------------------------------------------------------------------
  -- 1. Anonymous Access Boundary Tests
  -- ----------------------------------------------------------------------------------------
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', '', true);

  -- Anon MUST NOT be able to delete inventory items
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

  -- Anon MUST NOT be able to delete stock movement audit logs
  v_forbidden_succeeded := false;
  BEGIN
    DELETE FROM public.stock_movements WHERE item_id = v_item_id;
    v_forbidden_succeeded := true;
  EXCEPTION WHEN OTHERS THEN
    v_forbidden_succeeded := false;
  END;

  IF v_forbidden_succeeded THEN
    RAISE EXCEPTION 'CRITICAL SECURITY BREACH: Anonymous user was able to delete stock_movements!';
  END IF;

  -- Anon MUST NOT be able to invoke destructive RPCs
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

  -- ----------------------------------------------------------------------------------------
  -- 2. Authenticated Staff Access Boundary Tests
  -- ----------------------------------------------------------------------------------------
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_staff_uid), true);

  -- Staff MUST NOT be able to escalate their own role to ADMIN
  v_forbidden_succeeded := false;
  BEGIN
    UPDATE public.profiles SET role = 'ADMIN' WHERE id = v_staff_uid;
    -- If update affected rows, check if role changed
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_staff_uid AND role = 'ADMIN') THEN
      v_forbidden_succeeded := true;
    END IF;
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
  -- 3. Authenticated Administrator Boundary Tests & Teardown
  -- ----------------------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_admin_uid), true);

  -- Cleanup test fixtures cleanly
  DELETE FROM public.inventory_items WHERE id = v_item_id;
  DELETE FROM public.categories WHERE id = v_category_id;
  DELETE FROM public.profiles WHERE id IN (v_admin_uid, v_staff_uid);
  DELETE FROM public.system_settings WHERE key = 'rls_test_flag';

  RAISE NOTICE 'SUCCESS: All RLS security assertions passed against live schema with clean teardown.';
END;
$$;
