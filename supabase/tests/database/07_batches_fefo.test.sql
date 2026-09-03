BEGIN;

-- Include pgTap
SELECT plan(10);

-- 1. Create Mock Environment
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
INSERT INTO public.categories (id, name, description) VALUES ('c0000000-0000-0000-0000-000000000010', 'FEFO Category', 'Desc') ON CONFLICT DO NOTHING;
INSERT INTO public.inventory_items (id, category_id, name, unit) VALUES ('10000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000010', 'FEFO Item', 'Box') ON CONFLICT DO NOTHING;
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000000002', 'testuser2@kuventory.com') ON CONFLICT DO NOTHING;

-- Clear any existing batches/movements for this item if tests are re-run in same tx
DELETE FROM public.stock_movements WHERE item_id = '10000000-0000-0000-0000-000000000010';
DELETE FROM public.stock_batches WHERE item_id = '10000000-0000-0000-0000-000000000010';

-- 2. Setup Batches
-- Batch A: Expired
INSERT INTO public.stock_batches (id, item_id, quantity, expiry_date, received_date) 
VALUES ('b0000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000010', 10, CURRENT_DATE - 1, CURRENT_DATE - 5);

-- Batch B: Expires in 5 days (Earliest valid)
INSERT INTO public.stock_batches (id, item_id, quantity, expiry_date, received_date) 
VALUES ('b0000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000010', 20, CURRENT_DATE + 5, CURRENT_DATE - 2);

-- Batch C: Expires in 10 days
INSERT INTO public.stock_batches (id, item_id, quantity, expiry_date, received_date) 
VALUES ('b0000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000010', 30, CURRENT_DATE + 10, CURRENT_DATE - 2);

-- Batch D: No expiry
INSERT INTO public.stock_batches (id, item_id, quantity, expiry_date, received_date) 
VALUES ('b0000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000010', 15, NULL, CURRENT_DATE - 1);

-- Batch E: Expires in 10 days (same date as C, but received later, so C should be consumed before E)
INSERT INTO public.stock_batches (id, item_id, quantity, expiry_date, received_date) 
VALUES ('b0000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000010', 10, CURRENT_DATE + 10, CURRENT_DATE - 1);


-- 3. Verify Initial State
SELECT results_eq(
  $$ SELECT total_quantity FROM public.inventory_stock_view WHERE item_id = '10000000-0000-0000-0000-000000000010' $$,
  ARRAY[85::NUMERIC],
  'Total stock should be 85 (including expired, as view currently sums all quantities. If view changes, update this test)'
);

-- 4. Consume Stock (Partial Consumption of Earliest Valid Batch)
-- Request 5. Should consume from Batch B.
SELECT lives_ok(
  $$ SELECT public.consume_stock('10000000-0000-0000-0000-000000000010', 5, 'Test') $$,
  'consume_stock 5 should succeed'
);

SELECT results_eq(
  $$ SELECT quantity FROM public.stock_batches WHERE id = 'b0000000-0000-0000-0000-000000000010' $$,
  ARRAY[10::NUMERIC],
  'Batch A (Expired) should be untouched'
);

SELECT results_eq(
  $$ SELECT quantity FROM public.stock_batches WHERE id = 'b0000000-0000-0000-0000-000000000011' $$,
  ARRAY[15::NUMERIC],
  'Batch B should have 5 deducted (20 - 5 = 15)'
);


-- 5. Consume Stock (Multi-batch Consumption & Deterministic Tie Break)
-- Request 50.
-- Available Valid: Batch B (15) + Batch C (30) + Batch E (10) + Batch D (15) = 70.
-- It should consume: 15 from B, then 30 from C, then 5 from E.
SELECT lives_ok(
  $$ SELECT public.consume_stock('10000000-0000-0000-0000-000000000010', 50, 'Test 2') $$,
  'consume_stock 50 should succeed'
);

SELECT results_eq(
  $$ SELECT quantity FROM public.stock_batches WHERE id = 'b0000000-0000-0000-0000-000000000011' $$,
  ARRAY[0::NUMERIC],
  'Batch B should be fully consumed (0)'
);

SELECT results_eq(
  $$ SELECT quantity FROM public.stock_batches WHERE id = 'b0000000-0000-0000-0000-000000000012' $$,
  ARRAY[0::NUMERIC],
  'Batch C should be fully consumed (0)'
);

SELECT results_eq(
  $$ SELECT quantity FROM public.stock_batches WHERE id = 'b0000000-0000-0000-0000-000000000014' $$,
  ARRAY[5::NUMERIC],
  'Batch E should have 5 remaining (10 - 5 = 5). Tie-breaker favored C over E based on received_date.'
);

SELECT results_eq(
  $$ SELECT quantity FROM public.stock_batches WHERE id = 'b0000000-0000-0000-0000-000000000013' $$,
  ARRAY[15::NUMERIC],
  'Batch D (No expiry) should be untouched because E (dated) was consumed first.'
);

-- 6. Insufficient Valid Stock
-- Request 30.
-- Available Valid: Batch E (5) + Batch D (15) = 20.
-- Batch A (10) is expired, so it doesn't count.
-- Total valid is 20, but we request 30.
SELECT throws_ok(
  $$ SELECT public.consume_stock('10000000-0000-0000-0000-000000000010', 30, 'Fail') $$,
  'Insufficient valid stock for item 10000000-0000-0000-0000-000000000010 to consume 30',
  'consume_stock should throw error if insufficient VALID stock, completely ignoring expired batches'
);


SELECT * FROM finish();
ROLLBACK;


