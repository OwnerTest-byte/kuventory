BEGIN;

-- Include pgTap
SELECT plan(8);

-- Authenticate as admin so SECURITY DEFINER RPCs (which call auth.uid()) work
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

-- Mock a test category and item
INSERT INTO public.categories (id, name, description) VALUES ('c0000000-0000-0000-0000-000000000009', 'Test Category', 'Desc');
INSERT INTO public.inventory_items (id, category_id, name, unit) VALUES ('10000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000009', 'Test Item', 'Box');

-- Ensure the user we use exists
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000000001', 'testadmin@kuventory.com') ON CONFLICT DO NOTHING;
-- Note: inserting to auth.users creates a profile via triggers, so we can use it.

-- 1. Test add_stock function (positive) -- hardened signature (no user_id)
SELECT lives_ok(
  $$ SELECT public.add_stock('10000000-0000-0000-0000-000000000009', 100, CURRENT_DATE + 30, CURRENT_DATE, 'Initial delivery') $$,
  'add_stock should succeed with valid inputs'
);

-- 2. Verify stock view
SELECT results_eq(
  $$ SELECT total_quantity FROM public.inventory_stock_view WHERE item_id = '10000000-0000-0000-0000-000000000009' $$,
  ARRAY[100::NUMERIC],
  'inventory_stock_view should accurately reflect total quantity'
);

-- 3. Verify stock movement was created
SELECT results_eq(
  $$ SELECT type, quantity_change FROM public.stock_movements WHERE item_id = '10000000-0000-0000-0000-000000000009' AND type = 'ADD' $$,
  $$ VALUES ('ADD'::text, 100::NUMERIC) $$,
  'add_stock should record an ADD movement'
);

-- 4. Test add_stock function (negative quantity) -- hardened message 'Quantity must be positive'
SELECT throws_ok(
  $$ SELECT public.add_stock('10000000-0000-0000-0000-000000000009', -50, CURRENT_DATE + 30, CURRENT_DATE, 'Bad delivery') $$,
  'Quantity must be positive',
  'add_stock should throw exception on negative quantity'
);

-- 5. Test adjust_stock function (positive) -- hardened signature (no user_id), type ADJUST_DOWN
DO $$
DECLARE v_batch_id UUID;
BEGIN
  SELECT id INTO v_batch_id FROM public.stock_batches WHERE item_id = '10000000-0000-0000-0000-000000000009' LIMIT 1;
  PERFORM public.adjust_stock(v_batch_id, 80, 'Damaged items');
END $$;

-- 6. Verify adjustment reflects in view
SELECT results_eq(
  $$ SELECT total_quantity FROM public.inventory_stock_view WHERE item_id = '10000000-0000-0000-0000-000000000009' $$,
  ARRAY[80::NUMERIC],
  'adjust_stock should update batch and reflect in total quantity'
);

-- 7. Verify adjust movement -- hardened uses 'ADJUST' type (restored)
SELECT results_eq(
  $$ SELECT type, quantity_change, quantity_after FROM public.stock_movements WHERE item_id = '10000000-0000-0000-0000-000000000009' AND type = 'ADJUST' $$,
  $$ VALUES ('ADJUST'::text, -20::NUMERIC, 80::NUMERIC) $$,
  'adjust_stock should record an ADJUST movement with the correct difference'
);

-- 8. Test adjust_stock (negative quantity)
SELECT throws_ok(
  $$ 
    DO $body$ 
    DECLARE v_batch_id UUID; 
    BEGIN 
      SELECT id INTO v_batch_id FROM public.stock_batches WHERE item_id = '10000000-0000-0000-0000-000000000009' LIMIT 1; 
      PERFORM public.adjust_stock(v_batch_id, -5, 'Invalid'); 
    END $body$; 
  $$,
  'Quantity cannot be negative',
  'adjust_stock should reject negative target quantities'
);

-- 9. Test stock history view
SELECT results_eq(
  $$ SELECT COUNT(*)::integer FROM public.stock_history_view WHERE item_id = '10000000-0000-0000-0000-000000000009' $$,
  ARRAY[2::integer],
  'stock_history_view should return 2 records for this item (ADD and ADJUST)'
);

SELECT * FROM finish();

ROLLBACK;

