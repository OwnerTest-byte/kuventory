BEGIN;
SELECT plan(7);

-- Removed invalid profiles insert

-- Insert categories and inventory with unique names to avoid seed.sql collision
INSERT INTO public.categories (id, name, description) VALUES 
('11111111-1111-1111-1111-111111111111', 'TEST_BEVERAGES_10', 'Drinks');

INSERT INTO public.inventory_items (id, category_id, name, unit, unit_cost, supplier_a) VALUES 
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'TEST_PALE_PILSEN', 'Bottle', 50.00, 'SMB');

-- Insert stock so consumption doesn't fail
INSERT INTO public.stock_batches (id, item_id, quantity, received_date) VALUES 
('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 10, CURRENT_DATE);

-- Insert a daily inventory draft (created_by NULL)
INSERT INTO public.daily_inventory (id, inventory_date, state, created_by) VALUES
('33333333-3333-3333-3333-333333333333', '2099-01-01'::DATE, 'DRAFT', NULL);

INSERT INTO public.daily_inventory_items (daily_inventory_id, item_id, beg, add, am, pm) VALUES
('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 10, 5, 2, 3);

-- Test 1: Finalize Daily Inventory
SELECT lives_ok(
  $$ SELECT public.finalize_daily_inventory('33333333-3333-3333-3333-333333333333'::uuid, NULL); $$,
  'finalize_daily_inventory should succeed'
);

-- Test 2: Check Report Generation
SELECT results_eq(
  $$ SELECT status, version FROM public.reports WHERE daily_inventory_id = '33333333-3333-3333-3333-333333333333'; $$,
  $$ VALUES ('ACTIVE'::text, 1) $$,
  'Report header should be created with ACTIVE status and version 1'
);

-- Test 3: Check Report Items Snapshot
SELECT results_eq(
  $$ SELECT item_name, category_name, unit, unit_cost, supplier_a, beg, add, total, am, pm, ending FROM public.report_items 
     WHERE report_id = (SELECT id FROM public.reports WHERE daily_inventory_id = '33333333-3333-3333-3333-333333333333'); $$,
  $$ VALUES ('TEST_PALE_PILSEN'::text, 'TEST_BEVERAGES_10'::text, 'Bottle'::text, 50.00, 'SMB'::text, 10.00, 5.00, 15.00, 2.00, 3.00, 10.00) $$,
  'Report items should precisely match the daily inventory and master data'
);

-- Test 4: Alter the live inventory data
UPDATE public.inventory_items 
SET name = 'Pale Pilsen NEW', unit_cost = 60.00, supplier_a = 'SMB_NEW' 
WHERE id = '22222222-2222-2222-2222-222222222222';

UPDATE public.categories 
SET name = 'Alcohol' 
WHERE id = '11111111-1111-1111-1111-111111111111';

-- Test 5: Verify Immutability
SELECT results_eq(
  $$ SELECT item_name, category_name, unit, unit_cost, supplier_a, beg, add, total, am, pm, ending FROM public.report_items 
     WHERE report_id = (SELECT id FROM public.reports WHERE daily_inventory_id = '33333333-3333-3333-3333-333333333333'); $$,
  $$ VALUES ('TEST_PALE_PILSEN'::text, 'TEST_BEVERAGES_10'::text, 'Bottle'::text, 50.00, 'SMB'::text, 10.00, 5.00, 15.00, 2.00, 3.00, 10.00) $$,
  'Report snapshot MUST remain strictly unchanged despite master data updates'
);

-- Test 6: Verify duplicate finalization fails via RPC state check
SELECT throws_ok(
  $$ SELECT public.finalize_daily_inventory('33333333-3333-3333-3333-333333333333'::uuid, NULL); $$,
  'Daily inventory is not in DRAFT state',
  'RPC should prevent double finalization'
);

-- Test 7: Verify duplicate finalization fails via UNIQUE constraint (simulate manual insert)
SELECT throws_ok(
  $$ INSERT INTO public.reports (daily_inventory_id, report_date, generated_by, version) 
     VALUES ('33333333-3333-3333-3333-333333333333', CURRENT_DATE, NULL, 1); $$,
  '23505', -- unique_violation
  NULL,
  'UNIQUE constraint should prevent creating duplicate versions for the same daily_inventory_id'
);

SELECT * FROM finish();
ROLLBACK;
