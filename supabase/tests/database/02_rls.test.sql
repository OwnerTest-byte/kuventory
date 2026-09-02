BEGIN;
SELECT plan(3);

-- Test 1: User cannot modify categories
SET ROLE authenticated;
-- We need to mock auth.uid() and auth.role() for RLS to work properly in tests,
-- but a simpler way is to just switch role and assert. Since 'authenticated' role doesn't have ADMIN profile,
-- it should fail RLS.
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- The USER profile
SET request.jwt.claims = '{"role":"authenticated"}';

-- Actually pgTAP has `throws_ok` but we can also just test if we can insert.
-- The RLS policy for insert categories requires `public.is_admin()`.

PREPARE insert_category AS INSERT INTO public.categories (name) VALUES ('Test Cat');
SELECT throws_ok(
    'insert_category',
    '42501', -- Insufficient privilege
    'new row violates row-level security policy for table "categories"',
    'User cannot insert category'
);

-- Test 2: User cannot update inventory items
-- For UPDATE, RLS doesn't throw by default, it silently ignores rows it can't update.
UPDATE public.inventory_items SET unit_cost = 999 WHERE name = 'Pale Pilsen';

SELECT results_eq(
    $$SELECT unit_cost FROM public.inventory_items WHERE name = 'Pale Pilsen'$$,
    ARRAY[50.00::numeric(10,2)],
    'User cannot update inventory item (silent failure)'
);

-- Test 3: Admin CAN insert categories
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- The ADMIN profile

SELECT lives_ok(
    $$INSERT INTO public.categories (name) VALUES ('Admin Cat')$$,
    'Admin can insert category'
);

SELECT * FROM finish();
ROLLBACK;
