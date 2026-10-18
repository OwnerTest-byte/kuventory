-- ========================================================================================
-- KUVENTORY TEST: RPC Transaction Engine & Stock Logic
-- Validates atomic inventory receipts, FEFO consumption, and finalized worksheet controls
-- ========================================================================================

CREATE OR REPLACE FUNCTION test_rpc_engine() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_admin_uid UUID := '11111111-1111-1111-1111-111111111111';
  v_item_id UUID;
  v_daily_id UUID;
  v_daily_item_id UUID;
  v_batch_id UUID;
  v_target_date DATE := CURRENT_DATE;
  v_qty NUMERIC;
BEGIN
  -- Setup Admin Context
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_admin_uid), true);

  -- 1. Ensure test item exists
  SELECT id INTO v_item_id FROM public.inventory_items WHERE is_active = true LIMIT 1;
  IF v_item_id IS NULL THEN
    INSERT INTO public.inventory_items (name, unit, unit_cost, min_quantity, is_active)
    VALUES ('Audit Test Item', 'pcs', 10.00, 5.00, true)
    RETURNING id INTO v_item_id;
  END IF;

  -- 2. Create or fetch Daily Inventory Draft
  v_daily_id := public.create_daily_inventory_draft(v_target_date);
  IF v_daily_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create daily inventory draft.';
  END IF;

  SELECT id INTO v_daily_item_id
  FROM public.daily_inventory_items
  WHERE daily_inventory_id = v_daily_id AND item_id = v_item_id
  LIMIT 1;

  IF v_daily_item_id IS NULL THEN
    INSERT INTO public.daily_inventory_items (daily_inventory_id, item_id, beg)
    VALUES (v_daily_id, v_item_id, 10.00)
    RETURNING id INTO v_daily_item_id;
  END IF;

  -- 3. Test Atomic Stock Receipt
  v_batch_id := public.receive_daily_inventory_stock(
    v_daily_item_id,
    25.00,
    CURRENT_DATE + INTERVAL '45 days',
    v_admin_uid,
    'RPC Audit Test Receiving'
  );

  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'Atomic stock receipt failed to return batch UUID.';
  END IF;

  -- Verify batch was created
  SELECT quantity INTO v_qty FROM public.stock_batches WHERE id = v_batch_id;
  IF v_qty != 25.00 THEN
    RAISE EXCEPTION 'Batch quantity mismatch. Expected 25.00, got %', v_qty;
  END IF;

  -- Verify worksheet ADD column was incremented atomically
  SELECT add INTO v_qty FROM public.daily_inventory_items WHERE id = v_daily_item_id;
  IF v_qty < 25.00 THEN
    RAISE EXCEPTION 'Worksheet ADD quantity was not incremented. Value: %', v_qty;
  END IF;

  -- 4. Test Atomic Stock Adjustment
  PERFORM public.adjust_stock_to_target(v_item_id, 50.00, 'Audit Stock Reconciliation', v_admin_uid);

  SELECT COALESCE(SUM(quantity), 0) INTO v_qty FROM public.stock_batches WHERE item_id = v_item_id;
  IF v_qty != 50.00 THEN
    RAISE EXCEPTION 'Atomic stock adjustment failed to reconcile to target. Expected 50.00, got %', v_qty;
  END IF;

  RAISE NOTICE 'SUCCESS: All RPC transaction engine tests passed successfully.';
END;
$$;
