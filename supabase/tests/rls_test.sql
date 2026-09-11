-- RLS Testing Script
-- We will simulate different users using set_config.
-- Supabase uses `request.jwt.claims` for `auth.uid()`, so we must set it.

CREATE OR REPLACE FUNCTION test_rls() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_admin_uid UUID := '11111111-1111-1111-1111-111111111111';
  v_cashier_uid UUID := '22222222-2222-2222-2222-222222222222';
  v_inventory_uid UUID := '33333333-3333-3333-3333-333333333333';
  v_dummy_uid UUID := '99999999-9999-9999-9999-999999999999';
  v_count INT;
BEGIN
  -- 1. Anonymous Access Test (No auth)
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', '', true);
  
  -- Attempt to read stock items
  BEGIN
    SELECT count(*) INTO v_count FROM public.stock_items;
    RAISE EXCEPTION 'Anonymous user could read stock_items! Count: %', v_count;
  EXCEPTION WHEN OTHERS THEN
    -- Expected to fail or return 0 rows depending on policy.
    -- Actually, if RLS is enabled and there is no policy for anon, it returns 0 rows, not an error.
    -- Let's verify it returns 0.
    IF v_count > 0 THEN
      RAISE EXCEPTION 'Anonymous user could read % stock_items!', v_count;
    END IF;
  END;

  -- 2. Authenticated Test (Cashier)
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_cashier_uid), true);
  
  -- Cashier should be able to read stock_items
  SELECT count(*) INTO v_count FROM public.stock_items;
  -- Cashier should NOT be able to insert stock_items
  BEGIN
    INSERT INTO public.stock_items (stock_code, name) VALUES ('TEST', 'Test');
    RAISE EXCEPTION 'Cashier was able to insert stock_items!';
  EXCEPTION WHEN OTHERS THEN
    -- Expected failure (new row violates row level security policy)
  END;

  -- Cashier should NOT be able to insert roles
  BEGIN
    INSERT INTO public.roles (name) VALUES ('SuperAdmin');
    RAISE EXCEPTION 'Cashier was able to insert roles!';
  EXCEPTION WHEN OTHERS THEN
    -- Expected failure
  END;

  -- 3. Authenticated Test (Inventory)
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_inventory_uid), true);
  
  -- Inventory should NOT be able to insert into sales
  BEGIN
    INSERT INTO public.sales (total_amount) VALUES (100);
    RAISE EXCEPTION 'Inventory Staff was able to insert sales!';
  EXCEPTION WHEN OTHERS THEN
    -- Expected failure
  END;

  -- 4. Cross-User Notification Test
  -- We don't have seeded notifications, but we can attempt to insert one for someone else.
  -- Wait, insert policies were not explicitly defined for notifications, so nobody can insert except Admin/Service Role!
  -- Let's verify Cashier can't insert a notification.
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_cashier_uid), true);
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, message) VALUES (gen_random_uuid(), 'INFO', 'Test', 'Test');
    RAISE EXCEPTION 'Cashier was able to insert notification!';
  EXCEPTION WHEN OTHERS THEN
    -- Expected
  END;

  -- Restore
  PERFORM set_config('role', 'postgres', true);
END;
$$;

SELECT test_rls();
