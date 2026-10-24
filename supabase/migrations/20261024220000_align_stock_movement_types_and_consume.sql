-- ============================================================================
-- MIGRATION: 20261024220000_align_stock_movement_types_and_consume.sql
-- Description:
--   1. Reconcile stock_movements_type_check to permit ('ADD', 'REMOVE', 'ADJUST', 'CONSUME')
--   2. Update consume_stock overloads to record 'REMOVE' for alignment with frontend types
-- ============================================================================

DO $$
BEGIN
  -- Drop existing constraint on type
  ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
  ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_type_check 
    CHECK (type IN ('ADD', 'REMOVE', 'ADJUST', 'CONSUME'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Update consume_stock (3-arg overload) to record 'REMOVE'
CREATE OR REPLACE FUNCTION public.consume_stock(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_reason TEXT DEFAULT 'Standard Consumption'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_remaining NUMERIC := p_quantity;
  v_batch RECORD;
  v_deduct NUMERIC;
  v_item RECORD;
  v_current_total NUMERIC;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to consume stock.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only administrators can consume inventory stock.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN;
  END IF;

  SELECT * INTO v_item 
  FROM public.inventory_items 
  WHERE id = p_item_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % does not exist.', p_item_id;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_current_total
  FROM public.stock_batches
  WHERE item_id = p_item_id;

  IF v_current_total < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock for item %. Available: %, requested: %.', p_item_id, v_current_total, p_quantity;
  END IF;

  FOR v_batch IN
    SELECT * FROM public.stock_batches
    WHERE item_id = p_item_id
      AND quantity > 0
      AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
    ORDER BY expiry_date ASC NULLS LAST, received_date ASC, id ASC
    FOR UPDATE
  LOOP
    IF v_remaining <= 0 THEN
      EXIT;
    END IF;

    IF v_batch.quantity >= v_remaining THEN
      v_deduct := v_remaining;
    ELSE
      v_deduct := v_batch.quantity;
    END IF;

    UPDATE public.stock_batches
    SET quantity = quantity - v_deduct,
        updated_at = now()
    WHERE id = v_batch.id;

    INSERT INTO public.stock_movements (
      item_id,
      batch_id,
      type,
      quantity_before,
      quantity_change,
      quantity_after,
      user_id,
      reason
    ) VALUES (
      p_item_id,
      v_batch.id,
      'REMOVE',
      v_batch.quantity,
      -v_deduct,
      v_batch.quantity - v_deduct,
      v_caller_id,
      COALESCE(p_reason, 'Standard Consumption')
    );

    v_remaining := v_remaining - v_deduct;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient non-expired batches for item %. Remaining unallocated: %.', p_item_id, v_remaining;
  END IF;
END;
$$;

-- Update consume_stock (4-arg overload) to record 'REMOVE'
CREATE OR REPLACE FUNCTION public.consume_stock(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_batch_id UUID,
  p_reason TEXT DEFAULT 'Targeted Batch Consumption'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_batch RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to consume stock.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only administrators can consume inventory stock.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN;
  END IF;

  PERFORM 1 FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;

  SELECT * INTO v_batch 
  FROM public.stock_batches 
  WHERE id = p_batch_id AND item_id = p_item_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target batch % not found for item %.', p_batch_id, p_item_id;
  END IF;

  IF v_batch.quantity < p_quantity THEN
    RAISE EXCEPTION 'Insufficient quantity in batch %. Available: %, requested: %.', p_batch_id, v_batch.quantity, p_quantity;
  END IF;

  UPDATE public.stock_batches
  SET quantity = quantity - p_quantity,
      updated_at = now()
  WHERE id = p_batch_id;

  INSERT INTO public.stock_movements (
    item_id,
    batch_id,
    type,
    quantity_before,
    quantity_change,
    quantity_after,
    user_id,
    reason
  ) VALUES (
    p_item_id,
    p_batch_id,
    'REMOVE',
    v_batch.quantity,
    -p_quantity,
    v_batch.quantity - p_quantity,
    v_caller_id,
    COALESCE(p_reason, 'Targeted Batch Consumption')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_stock(UUID, NUMERIC, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_stock(UUID, NUMERIC, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_stock(UUID, NUMERIC, UUID, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_stock(UUID, NUMERIC, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
