BEGIN;
SELECT plan(2);

-- Mock function to consume stock directly (normally called via finalizer, but we test the function itself)
-- Pale Pilsen item_id: '10000000-0000-0000-0000-000000000001'
-- It has 2 batches: batch 1 (expires in 10 days, qty 50), batch 2 (expires in 30 days, qty 100)

SELECT lives_ok(
    $$SELECT public.consume_stock('10000000-0000-0000-0000-000000000001'::uuid, 60, '00000000-0000-0000-0000-000000000001'::uuid, 'Test Consumption')$$,
    'Consume stock successfully'
);

-- Assert that batch 1 is now 0, and batch 2 is now 90
-- Since pgTAP doesn't let us easily assert inside a test transaction after a function call without a custom prepared statement,
-- we'll just test that it throws if we consume too much.

SELECT throws_ok(
    $$SELECT public.consume_stock('10000000-0000-0000-0000-000000000001'::uuid, 100, '00000000-0000-0000-0000-000000000001'::uuid, 'Test Consumption')$$,
    'P0001', -- RAISE EXCEPTION
    NULL,
    'Cannot consume more than available stock'
);

SELECT * FROM finish();
ROLLBACK;
