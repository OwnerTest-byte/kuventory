BEGIN;
SELECT plan(10);

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

-- 3. Test 2: Consume down to low stock (<= 10)
UPDATE public.stock_batches SET quantity = 10.00 WHERE id = 'b0000000-0000-0000-0000-000000000098';
SELECT results_eq(
  $$ SELECT type FROM public.notifications WHERE item_id = 'f0000000-0000-0000-0000-000000000098' AND dedup_key = 'LOW_f0000000-0000-0000-0000-000000000098' $$,
  ARRAY['LOW_STOCK'],
  'LOW_STOCK notification created when quantity hits min_quantity'
);

-- 4. Test 3: Deduplication
-- Update again but stay low stock
UPDATE public.stock_batches SET quantity = 5.00 WHERE id = 'b0000000-0000-0000-0000-000000000098';
SELECT results_eq(
  $$ SELECT COUNT(*)::INT FROM public.notifications WHERE item_id = 'f0000000-0000-0000-0000-000000000098' AND type = 'LOW_STOCK' $$,
  ARRAY[1::INT],
  'Duplicate LOW_STOCK notifications are prevented by dedup_key'
);

-- 5. Test 4: Out of Stock
UPDATE public.stock_batches SET quantity = 0.00 WHERE id = 'b0000000-0000-0000-0000-000000000098';
SELECT results_eq(
  $$ SELECT type FROM public.notifications WHERE item_id = 'f0000000-0000-0000-0000-000000000098' AND dedup_key = 'OOS_f0000000-0000-0000-0000-000000000098' $$,
  ARRAY['OUT_OF_STOCK'],
  'OUT_OF_STOCK notification created when quantity hits 0'
);

-- And verify LOW_STOCK lock was cleared (dedup_key is NULL for the older low stock)
SELECT is(
  (SELECT dedup_key FROM public.notifications WHERE item_id = 'f0000000-0000-0000-0000-000000000098' AND type = 'LOW_STOCK' LIMIT 1),
  NULL,
  'LOW_STOCK lock is cleared when hitting OUT_OF_STOCK'
);

-- 6. Test 5: Restored Stock
UPDATE public.stock_batches SET quantity = 20.00 WHERE id = 'b0000000-0000-0000-0000-000000000098';
SELECT is(
  (SELECT dedup_key FROM public.notifications WHERE item_id = 'f0000000-0000-0000-0000-000000000098' AND type = 'OUT_OF_STOCK' LIMIT 1),
  NULL,
  'OOS lock is cleared when stock is restored'
);

-- 7. Test 6: Drop back to low stock again creates a NEW notification
UPDATE public.stock_batches SET quantity = 9.00 WHERE id = 'b0000000-0000-0000-0000-000000000098';
SELECT results_eq(
  $$ SELECT COUNT(*)::INT FROM public.notifications WHERE item_id = 'f0000000-0000-0000-0000-000000000098' AND type = 'LOW_STOCK' $$,
  ARRAY[2::INT],
  'A second LOW_STOCK notification is created after a restoration cycle'
);

SELECT results_eq(
  $$ SELECT type FROM public.notifications WHERE item_id = 'f0000000-0000-0000-0000-000000000098' AND dedup_key = 'LOW_f0000000-0000-0000-0000-000000000098' $$,
  ARRAY['LOW_STOCK'],
  'The new LOW_STOCK notification holds the lock'
);

-- 8. Test 7: Item min_quantity update trigger
UPDATE public.stock_batches SET quantity = 20.00 WHERE id = 'b0000000-0000-0000-0000-000000000098';
-- Stock is 20. Min is 10. No lock active.
UPDATE public.inventory_items SET min_quantity = 30.00 WHERE id = 'f0000000-0000-0000-0000-000000000098';
-- Now 20 <= 30. Low stock should be triggered by the item update.
SELECT results_eq(
  $$ SELECT COUNT(*)::INT FROM public.notifications WHERE item_id = 'f0000000-0000-0000-0000-000000000098' AND type = 'LOW_STOCK' $$,
  ARRAY[3::INT],
  'Updating item min_quantity triggers low stock correctly'
);

SELECT results_eq(
  $$ SELECT type FROM public.notifications WHERE item_id = 'f0000000-0000-0000-0000-000000000098' AND dedup_key = 'LOW_f0000000-0000-0000-0000-000000000098' $$,
  ARRAY['LOW_STOCK'],
  'The new LOW_STOCK holds the lock from the item update'
);

SELECT * FROM finish();
ROLLBACK;
