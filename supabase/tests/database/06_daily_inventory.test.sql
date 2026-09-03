BEGIN;

SELECT plan(7);

-- Setup: Create an item and some initial stock
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
INSERT INTO public.categories (id, name) VALUES ('33333333-3333-3333-3333-333333333333', 'Test Category') ON CONFLICT DO NOTHING;
INSERT INTO public.inventory_items (id, category_id, name, unit) VALUES ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Test Item Daily', 'pcs') ON CONFLICT DO NOTHING;

-- Initial Stock of 50 (hardened signature: no user_id)
SELECT public.add_stock('44444444-4444-4444-4444-444444444444', 50, CURRENT_DATE + 30, CURRENT_DATE, 'Initial Test Stock');

-- 1. Test create_daily_inventory_draft (hardened signature: no user_id)
SELECT lives_ok(
  $$ SELECT public.create_daily_inventory_draft(CURRENT_DATE); $$,
  'create_daily_inventory_draft executes successfully'
);

-- 2. Verify draft state
SELECT results_eq(
  $$ SELECT state FROM public.daily_inventory WHERE inventory_date = CURRENT_DATE $$,
  $$ VALUES ('DRAFT'::text) $$,
  'Draft is created in DRAFT state'
);

-- 3. Verify BEG stock is prepopulated correctly
SELECT results_eq(
  $$ SELECT beg FROM public.daily_inventory_items dii JOIN public.daily_inventory di ON di.id = dii.daily_inventory_id WHERE di.inventory_date = CURRENT_DATE AND dii.item_id = '44444444-4444-4444-4444-444444444444' $$,
  $$ VALUES (50.00::numeric) $$,
  'Beginning stock (beg) correctly prepopulates from live stock (50)'
);

-- 4. Test calculation columns (update am, pm and add)
-- With beg=50, add=15, am=5, pm=55: total = 50+15 = 65, ending = 65-5-55 = 5.
UPDATE public.daily_inventory_items
SET am = 5, pm = 55, add = 15
WHERE item_id = '44444444-4444-4444-4444-444444444444'
AND daily_inventory_id = (SELECT id FROM public.daily_inventory WHERE inventory_date = CURRENT_DATE);

SELECT results_eq(
  $$ SELECT ending FROM public.daily_inventory_items dii JOIN public.daily_inventory di ON di.id = dii.daily_inventory_id WHERE di.inventory_date = CURRENT_DATE AND dii.item_id = '44444444-4444-4444-4444-444444444444' $$,
  $$ VALUES (50.00::numeric + 15.00::numeric - 5.00::numeric - 55.00::numeric) $$,
  'Ending stock correctly calculated by Postgres GENERATED ALWAYS'
);

-- 5. Test Finalization
-- finalize consumes (total - pm) = (65 - 55) = 10 from live stock.
SELECT lives_ok(
  $$ SELECT public.finalize_daily_inventory((SELECT id FROM public.daily_inventory WHERE inventory_date = CURRENT_DATE)); $$,
  'finalize_daily_inventory executes successfully'
);

-- 6. Verify state transitioned to FINALIZED
SELECT results_eq(
  $$ SELECT state FROM public.daily_inventory WHERE inventory_date = CURRENT_DATE $$,
  $$ VALUES ('FINALIZED'::text) $$,
  'State changed to FINALIZED'
);

-- 7. Verify live stock was consumed by FEFO during finalization
-- 'add' in the daily inventory does NOT automatically call add_stock; it is only a recorded column.
-- finalize consumed (total - pm) = 10 of the original 50, so 40 remains.
SELECT results_eq(
  $$ SELECT quantity FROM public.stock_batches WHERE item_id = '44444444-4444-4444-4444-444444444444' $$,
  $$ VALUES (40.00::numeric) $$,
  'Live stock physically consumed by FEFO during finalization (50 - 10 = 40)'
);

SELECT * FROM finish();
ROLLBACK;

