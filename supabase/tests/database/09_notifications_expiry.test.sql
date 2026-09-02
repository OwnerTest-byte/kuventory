BEGIN;
SELECT plan(6);

-- 1. Setup Data
INSERT INTO public.categories (id, name) VALUES ('c0000000-0000-0000-0000-000000000099', 'Test Category Expiry');
INSERT INTO public.inventory_items (id, category_id, name, unit, unit_cost, min_quantity) 
VALUES ('f0000000-0000-0000-0000-000000000099', 'c0000000-0000-0000-0000-000000000099', 'Expiry Item', 'pcs', 1.00, 0);

-- Batch 1: Expires in 60 days (Safe)
INSERT INTO public.stock_batches (id, item_id, quantity, expiry_date, received_date)
VALUES ('b0000000-0000-0000-0000-000000000099', 'f0000000-0000-0000-0000-000000000099', 10.00, CURRENT_DATE + INTERVAL '60 days', CURRENT_DATE);

-- Batch 2: Expires in 15 days (Expiring Soon)
INSERT INTO public.stock_batches (id, item_id, quantity, expiry_date, received_date)
VALUES ('b0000000-0000-0000-0000-000000000098', 'f0000000-0000-0000-0000-000000000099', 10.00, CURRENT_DATE + INTERVAL '15 days', CURRENT_DATE);

-- Batch 3: Expired yesterday (Expired)
INSERT INTO public.stock_batches (id, item_id, quantity, expiry_date, received_date)
VALUES ('b0000000-0000-0000-0000-000000000097', 'f0000000-0000-0000-0000-000000000099', 10.00, CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE);

-- 2. Run the cron job logic manually
SELECT public.check_expiry_notifications();

-- 3. Tests
SELECT is_empty(
  $$ SELECT 1 FROM public.notifications WHERE batch_id = 'b0000000-0000-0000-0000-000000000099' $$,
  'No notification for batch expiring in > 30 days'
);

SELECT results_eq(
  $$ SELECT type FROM public.notifications WHERE batch_id = 'b0000000-0000-0000-0000-000000000098' AND dedup_key = 'EXPIRING_b0000000-0000-0000-0000-000000000098' $$,
  ARRAY['EXPIRING_SOON'],
  'EXPIRING_SOON notification created for batch inside 30-day window'
);

SELECT results_eq(
  $$ SELECT type FROM public.notifications WHERE batch_id = 'b0000000-0000-0000-0000-000000000097' AND dedup_key = 'EXPIRED_b0000000-0000-0000-0000-000000000097' $$,
  ARRAY['EXPIRED'],
  'EXPIRED notification created for expired batch'
);

-- 4. Test Deduplication
SELECT public.check_expiry_notifications();

SELECT results_eq(
  $$ SELECT COUNT(*)::INT FROM public.notifications WHERE batch_id = 'b0000000-0000-0000-0000-000000000098' $$,
  ARRAY[1::INT],
  'Deduplication prevents multiple EXPIRING_SOON notifications on subsequent checks'
);

-- 5. Test State Transition (Expiring Soon -> Expired)
-- Make Batch 2 expire
UPDATE public.stock_batches SET expiry_date = CURRENT_DATE - INTERVAL '1 day' WHERE id = 'b0000000-0000-0000-0000-000000000098';
SELECT public.check_expiry_notifications();

SELECT results_eq(
  $$ SELECT type FROM public.notifications WHERE batch_id = 'b0000000-0000-0000-0000-000000000098' AND dedup_key = 'EXPIRED_b0000000-0000-0000-0000-000000000098' $$,
  ARRAY['EXPIRED'],
  'EXPIRED notification correctly generated when an expiring batch finally expires'
);

SELECT is(
  (SELECT dedup_key FROM public.notifications WHERE batch_id = 'b0000000-0000-0000-0000-000000000098' AND type = 'EXPIRING_SOON' LIMIT 1),
  NULL,
  'EXPIRING_SOON lock is cleared once the batch fully expires'
);

SELECT * FROM finish();
ROLLBACK;
