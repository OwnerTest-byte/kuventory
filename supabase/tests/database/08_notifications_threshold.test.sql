BEGIN;
SELECT plan(7);

-- 1. Setup Data
INSERT INTO public.categories (id, name) VALUES ('c0000000-0000-0000-0000-000000000098', 'Test Category Threshold');
INSERT INTO public.inventory_items (id, category_id, name, unit, unit_cost, min_quantity) 
VALUES ('f0000000-0000-0000-0000-000000000098', 'c0000000-0000-0000-0000-000000000098', 'Test Item 1', 'pcs', 1.00, 10.00);

-- 2. Test 1: Insert batch > min_quantity (no notification)
INSERT INTO public.stock_batches (id, item_id, quantity, received_date)
VALUES ('b0000000-0000-0000-0000-000000000098', 'f0000000-0000-0000-0000-000000000098', 20.00, CURRENT_DATE);

SELECT is_empty(
  $$ SELECT 1 FROM public.notifications WHERE item_id = 'f0000000-0000-0000-0000-000000000098' $$,
  'No notification when stock > min_quantity'
);

-- 3. Test 2: Consume down to low stock (<= 10) -> LOW_STOCK created exactly once
UPDATE public.stock_batches SET quantity = 10.00 WHERE id = 'b0000000-0000-0000-0000-000000000098';
SELECT results_eq(
  $$ SELECT type FROM public.notifications WHERE item_id = 'f0000000-0000-0000-0000-000000000098' AND dedup_key = 'LOW_f0000000-0000-0000-0000-000000000098' $$,
  ARRAY['LOW_STOCK'],
  'LOW_STOCK notification created when quantity hits min_quantity (type LOW_STOCK)'
);

-- 4. Test 3: Deduplication while remaining low
UPDATE public.stock_batches SET quantity = 5.00 WHERE id = 'b0000000-0000-0000-0000-000000000098';
SELECT results_eq(
  $$ SELECT COUNT(*)::INT FROM public.notifications WHERE item_id = 'f0000000-0000-0000-0000-000000000098' AND type = 'LOW_STOCK' $$,
  ARRAY[1::INT],
  'Duplicate LOW_STOCK notifications are prevented by dedup_key'
);

-- 5. Test 4: Out of Stock (quantity = 0) -> OUT_OF_STOCK with the frontend-canonical type
UPDATE public.stock_batches SET quantity = 0.00 WHERE id = 'b0000000-0000-0000-0000-000000000098';
SELECT results_eq(
  $$ SELECT type FROM public.notifications WHERE item_id = 'f0000000-0000-0000-0000-000000000098' AND dedup_key = 'OOS_f0000000-0000-0000-0000-000000000098' $$,
  ARRAY['OUT_OF_STOCK'],
  'OUT_OF_STOCK notification created when quantity hits 0 (type OUT_OF_STOCK)'
);

-- 6. Test 5: Restore stock above threshold -> pending OOS/LOW notifications are marked read
UPDATE public.stock_batches SET quantity = 20.00 WHERE id = 'b0000000-0000-0000-0000-000000000098';
SELECT results_eq(
  $$ SELECT COUNT(*)::INT FROM public.notifications WHERE item_id = 'f0000000-0000-0000-0000-000000000098' AND is_read = true $$,
  ARRAY[2::INT],
  'Restoring stock above threshold marks the OOS and LOW notifications as read'
);

-- 7. Test 6: Drop back below threshold again -> LOW dedup_key still prevents a duplicate
UPDATE public.stock_batches SET quantity = 9.00 WHERE id = 'b0000000-0000-0000-0000-000000000098';
SELECT results_eq(
  $$ SELECT COUNT(*)::INT FROM public.notifications WHERE item_id = 'f0000000-0000-0000-0000-000000000098' AND type = 'LOW_STOCK' $$,
  ARRAY[1::INT],
  'Dedup_key prevents duplicate LOW_STOCK after a restoration cycle'
);

-- 8. Test 7: Increasing item min_quantity while stock is below is handled by the same dedup
UPDATE public.stock_batches SET quantity = 20.00 WHERE id = 'b0000000-0000-0000-0000-000000000098';
UPDATE public.inventory_items SET min_quantity = 30.00 WHERE id = 'f0000000-0000-0000-0000-000000000098';
SELECT results_eq(
  $$ SELECT COUNT(*)::INT FROM public.notifications WHERE item_id = 'f0000000-0000-0000-0000-000000000098' AND type = 'LOW_STOCK' $$,
  ARRAY[1::INT],
  'Item min_quantity update reuses the existing LOW_STOCK dedup (no duplicate)'
);

SELECT * FROM finish();
ROLLBACK;
