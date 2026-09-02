BEGIN;

SELECT plan(7);

-- Setup: Create an item and some initial stock
INSERT INTO public.categories (id, name) VALUES ('33333333-3333-3333-3333-333333333333', 'Test Category') ON CONFLICT DO NOTHING;
INSERT INTO public.inventory_items (id, category_id, name, unit) VALUES ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Test Item Daily', 'pcs') ON CONFLICT DO NOTHING;

-- Initial Stock of 50
SELECT public.add_stock('44444444-4444-4444-4444-444444444444', 50, CURRENT_DATE + 30, CURRENT_DATE, auth.uid(), 'Initial Test Stock');

-- 1. Test create_daily_inventory_draft
SELECT lives_ok(
  $$ SELECT public.create_daily_inventory_draft(CURRENT_DATE, auth.uid()); $$,
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

-- 4. Test calculation columns (update am and pm)
UPDATE public.daily_inventory_items
SET am = 5, pm = 10, add = 15
WHERE item_id = '44444444-4444-4444-4444-444444444444'
AND daily_inventory_id = (SELECT id FROM public.daily_inventory WHERE inventory_date = CURRENT_DATE);

SELECT results_eq(
  $$ SELECT ending FROM public.daily_inventory_items dii JOIN public.daily_inventory di ON di.id = dii.daily_inventory_id WHERE di.inventory_date = CURRENT_DATE AND dii.item_id = '44444444-4444-4444-4444-444444444444' $$,
  $$ VALUES (50.00::numeric + 15.00::numeric - 5.00::numeric - 10.00::numeric) $$,
  'Ending stock correctly calculated by Postgres GENERATED ALWAYS'
);

-- 5. Test Finalization
SELECT lives_ok(
  $$ SELECT public.finalize_daily_inventory((SELECT id FROM public.daily_inventory WHERE inventory_date = CURRENT_DATE), auth.uid()); $$,
  'finalize_daily_inventory executes successfully'
);

-- 6. Verify state transitioned to FINALIZED
SELECT results_eq(
  $$ SELECT state FROM public.daily_inventory WHERE inventory_date = CURRENT_DATE $$,
  $$ VALUES ('FINALIZED'::text) $$,
  'State changed to FINALIZED'
);

-- 7. Verify live stock was consumed (50 + 15(manual added directly?) - 15(consumed) = 35)
-- wait, the 'add' in daily inventory does NOT automatically call add_stock.
-- Option A says: The user clicks the ADD cell, which opens a modal... immediately calling add_stock.
-- In this test, we haven't called add_stock for the 15, we just updated the `add` column in the draft.
-- So live stock should just be 50 - 15 (am+pm consumed) = 35.
SELECT results_eq(
  $$ SELECT quantity FROM public.stock_batches WHERE item_id = '44444444-4444-4444-4444-444444444444' $$,
  $$ VALUES (35.00::numeric) $$,
  'Live stock physically consumed by FEFO during finalization (50 - 15 = 35)'
);

SELECT * FROM finish();
ROLLBACK;
