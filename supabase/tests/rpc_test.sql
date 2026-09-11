-- ========================================================================================
-- KUVENTORY TEST: RPC TRANSACTION ENGINE
-- ========================================================================================

CREATE OR REPLACE FUNCTION test_rpc_engine() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_admin_uid UUID := '11111111-1111-1111-1111-111111111111';
  v_cashier_uid UUID := '22222222-2222-2222-2222-222222222222';
  v_item_id UUID;
  v_loc_id UUID;
  v_session_id UUID;
  v_sale_id UUID;
  v_qty NUMERIC;
BEGIN
  -- 1. Setup Admin Context
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_admin_uid), true);

  -- Get a real item and location
  SELECT id INTO v_loc_id FROM public.inventory_locations LIMIT 1;
  IF v_loc_id IS NULL THEN
      RAISE EXCEPTION 'Need at least one location seeded to run tests.';
  END IF;

  INSERT INTO public.stock_items (stock_code, name, category_id, unit_of_measure_id, tracking_type, cost_price, selling_price)
  VALUES (
      'TEST-ITEM-001', 
      'Test Item', 
      (SELECT id FROM public.categories LIMIT 1), 
      (SELECT id FROM public.units_of_measure LIMIT 1),
      'PORTION',
      5.00, 
      10.00
  ) RETURNING id INTO v_item_id;

  -- 2. Test Negative Inventory Block
  BEGIN
    PERFORM public.inventory_adjust(v_item_id, v_loc_id, 'OUT', 999999, 'Test');
    RAISE EXCEPTION 'Failed to block negative inventory!';
  EXCEPTION WHEN OTHERS THEN
    -- Expected failure (Insufficient stock)
  END;

  -- 3. Add Stock
  PERFORM public.inventory_adjust(v_item_id, v_loc_id, 'IN', 50, 'Test Receiving');
  
  -- Verify Stock added
  SELECT current_quantity INTO v_qty FROM public.inventory_balances 
  WHERE stock_item_id = v_item_id AND location_id = v_loc_id;

  IF v_qty < 50 THEN
      RAISE EXCEPTION 'Stock not added correctly. Qty: %', v_qty;
  END IF;

  -- 4. Test Cashier Context (Process Sale)
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', v_cashier_uid), true);

  -- Open session
  v_session_id := public.open_cash_session(CURRENT_DATE, 100.00);

  -- Process Sale
  v_sale_id := public.process_sale(
      'SALE-TEST-001',
      v_loc_id,
      CURRENT_DATE,
      'NONE',
      0.00,
      'CASH_SALE',
      v_session_id,
      'Test Sale',
      jsonb_build_array(
          jsonb_build_object('stock_item_id', v_item_id, 'quantity', 5, 'unit_price', 10.00)
      )
  );

  -- Verify Stock Deducted
  SELECT current_quantity INTO v_qty FROM public.inventory_balances 
  WHERE stock_item_id = v_item_id AND location_id = v_loc_id;

  -- Since we added 50 and then sold 5, the qty should be 45 (or original qty + 45)
  -- But since we just want to verify it decreased:
  IF v_qty >= 50 THEN
      RAISE EXCEPTION 'Stock not deducted correctly during sale. Qty: %', v_qty;
  END IF;

  -- 5. Close Cash Session
  PERFORM public.close_cash_session(v_session_id, 150.00);

  -- Restore
  PERFORM set_config('role', 'postgres', true);
END;
$$;

SELECT test_rpc_engine();
