-- Replace consume_stock to handle FEFO determinism and expired batch exclusion
CREATE OR REPLACE FUNCTION public.consume_stock(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_user_id UUID,
  p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_remaining NUMERIC := p_quantity;
  v_batch RECORD;
  v_deduct NUMERIC;
BEGIN
  IF p_quantity <= 0 THEN
    RETURN;
  END IF;

  -- Lock valid batches for this item to prevent concurrent modification.
  -- Expired batches (expiry_date < CURRENT_DATE) are EXCLUDED from automatic FEFO consumption.
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

    -- Deduct from batch
    UPDATE public.stock_batches
    SET quantity = quantity - v_deduct
    WHERE id = v_batch.id;

    -- Record movement
    INSERT INTO public.stock_movements (
      item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
    ) VALUES (
      p_item_id, v_batch.id, 'REMOVE', v_batch.quantity, -v_deduct, v_batch.quantity - v_deduct, p_user_id, p_reason
    );

    v_remaining := v_remaining - v_deduct;
  END LOOP;

  -- If we didn't have enough valid stock to fulfill the request, raise an exception.
  -- This ensures atomicity: if they try to consume more than exists, the whole transaction rolls back.
  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient valid stock for item % to consume %', p_item_id, p_quantity;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
