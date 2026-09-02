BEGIN;
SELECT plan(1);

-- We test that finalize_daily_inventory throws if state is not DRAFT
-- We need to mock a daily inventory first
INSERT INTO public.daily_inventory (id, inventory_date, state) VALUES ('d0000000-0000-0000-0000-000000000001', CURRENT_DATE, 'FINALIZED');

SELECT throws_ok(
    $$SELECT public.finalize_daily_inventory('d0000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid)$$,
    'P0001',
    'Daily inventory is not in DRAFT state',
    'Cannot finalize a non-DRAFT daily inventory'
);

SELECT * FROM finish();
ROLLBACK;
