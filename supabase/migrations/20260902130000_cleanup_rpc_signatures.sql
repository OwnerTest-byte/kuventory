-- migrations/20260902130000_cleanup_rpc_signatures.sql

-- A. update add_stock to remove p_user_id
DROP FUNCTION IF EXISTS public.add_stock(UUID, NUMERIC, DATE, DATE, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.add_stock(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_expiry_date DATE,
  p_received_date DATE,
  p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_batch_id UUID;
  v_auth_uid UUID := auth.uid();
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.stock_batches (item_id, quantity, expiry_date, received_date)
  VALUES (p_item_id, p_quantity, p_expiry_date, p_received_date)
  RETURNING id INTO v_batch_id;

  INSERT INTO public.stock_movements (
    item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
  ) VALUES (
    p_item_id, v_batch_id, 'ADD', 0, p_quantity, p_quantity, v_auth_uid, p_reason
  );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- B. update adjust_stock to remove p_user_id
DROP FUNCTION IF EXISTS public.adjust_stock(UUID, NUMERIC, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_batch_id UUID,
  p_new_quantity NUMERIC,
  p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_batch RECORD;
  v_diff NUMERIC;
  v_type TEXT;
  v_auth_uid UUID := auth.uid();
BEGIN
  IF p_new_quantity < 0 THEN
    RAISE EXCEPTION 'Quantity cannot be negative';
  END IF;

  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_batch FROM public.stock_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  v_diff := p_new_quantity - v_batch.quantity;
  
  IF v_diff = 0 THEN
    RETURN;
  END IF;

  IF v_diff > 0 THEN
    v_type := 'ADJUST_UP';
  ELSE
    v_type := 'ADJUST_DOWN';
  END IF;

  UPDATE public.stock_batches SET quantity = p_new_quantity WHERE id = p_batch_id;

  INSERT INTO public.stock_movements (
    item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
  ) VALUES (
    v_batch.item_id, p_batch_id, v_type, v_batch.quantity, v_diff, p_new_quantity, v_auth_uid, p_reason
  );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
