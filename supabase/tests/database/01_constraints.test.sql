BEGIN;
SELECT plan(4);

-- 1. Test negative quantity constraint on stock_batches
PREPARE insert_negative_stock AS INSERT INTO public.stock_batches (item_id, quantity) VALUES ('10000000-0000-0000-0000-000000000001', -10);
SELECT throws_ok(
    'insert_negative_stock',
    '23514', -- Check violation
    NULL,
    'Cannot insert negative stock batch quantity'
);

-- 2. Test negative unit_cost on inventory_items
PREPARE insert_negative_cost AS INSERT INTO public.inventory_items (category_id, name, unit, unit_cost) VALUES ('c0000000-0000-0000-0000-000000000001', 'Test', 'Box', -5.00);
SELECT throws_ok(
    'insert_negative_cost',
    '23514',
    NULL,
    'Cannot insert negative unit_cost'
);

-- 3. Test invalid daily inventory state
PREPARE insert_invalid_state AS INSERT INTO public.daily_inventory (inventory_date, state) VALUES (CURRENT_DATE + INTERVAL '1 day', 'INVALID_STATE');
SELECT throws_ok(
    'insert_invalid_state',
    '23514',
    NULL,
    'Cannot insert invalid state into daily_inventory'
);

-- 4. Test missing unit on inventory_items
PREPARE insert_missing_unit AS INSERT INTO public.inventory_items (category_id, name, unit_cost) VALUES ('c0000000-0000-0000-0000-000000000001', 'Test 2', 5.00);
SELECT throws_ok(
    'insert_missing_unit',
    '23502', -- Not null violation
    NULL,
    'Cannot insert missing unit'
);

SELECT * FROM finish();
ROLLBACK;
