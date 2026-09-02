-- 1. inventory_stock_view (Aggregates current physical stock)
CREATE OR REPLACE VIEW public.inventory_stock_view
WITH (security_invoker = true)
AS
SELECT 
  i.id AS item_id,
  i.category_id,
  i.name,
  i.description,
  i.unit,
  i.unit_cost,
  i.min_quantity,
  i.is_active,
  COALESCE(SUM(b.quantity), 0) AS total_quantity
FROM public.inventory_items i
LEFT JOIN public.stock_batches b ON i.id = b.item_id
GROUP BY i.id;

-- 2. add_stock (SECURITY DEFINER to insert batches/movements reliably)
CREATE OR REPLACE FUNCTION public.add_stock(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_expiry_date DATE,
  p_received_date DATE,
  p_user_id UUID,
  p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_batch_id UUID;
  v_is_active BOOLEAN;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;

  -- Ensure item exists and is active
  SELECT is_active INTO v_is_active FROM public.inventory_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found';
  END IF;
  
  IF NOT v_is_active THEN
    RAISE EXCEPTION 'Cannot add stock to an archived item';
  END IF;

  -- Create batch
  INSERT INTO public.stock_batches (item_id, quantity, expiry_date, received_date)
  VALUES (p_item_id, p_quantity, p_expiry_date, p_received_date)
  RETURNING id INTO v_batch_id;

  -- Record movement
  INSERT INTO public.stock_movements (
    item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
  ) VALUES (
    p_item_id, v_batch_id, 'ADD', 0, p_quantity, p_quantity, p_user_id, p_reason
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. adjust_stock (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_batch_id UUID,
  p_new_quantity NUMERIC,
  p_user_id UUID,
  p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_batch RECORD;
  v_diff NUMERIC;
BEGIN
  IF p_new_quantity < 0 THEN
    RAISE EXCEPTION 'Quantity cannot be negative';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required for stock adjustments';
  END IF;

  -- Lock the batch row for update to prevent concurrent race conditions
  SELECT * INTO v_batch FROM public.stock_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  v_diff := p_new_quantity - v_batch.quantity;

  -- Skip if no actual change
  IF v_diff = 0 THEN
    RETURN;
  END IF;

  -- Update batch
  UPDATE public.stock_batches
  SET quantity = p_new_quantity
  WHERE id = p_batch_id;

  -- Record movement
  INSERT INTO public.stock_movements (
    item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
  ) VALUES (
    v_batch.item_id, p_batch_id, 'ADJUST', v_batch.quantity, v_diff, p_new_quantity, p_user_id, p_reason
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. get_stock_history (Helper view to retrieve history with item details)
CREATE OR REPLACE VIEW public.stock_history_view
WITH (security_invoker = true)
AS
SELECT 
  sm.id AS movement_id,
  sm.type,
  sm.quantity_before,
  sm.quantity_change,
  sm.quantity_after,
  sm.reason,
  sm.created_at,
  i.id AS item_id,
  i.name AS item_name,
  i.unit,
  b.id AS batch_id,
  b.expiry_date,
  b.received_date,
  p.id AS actor_id,
  p.display_name AS actor_name
FROM public.stock_movements sm
JOIN public.inventory_items i ON sm.item_id = i.id
LEFT JOIN public.stock_batches b ON sm.batch_id = b.id
LEFT JOIN public.profiles p ON sm.user_id = p.id
ORDER BY sm.created_at DESC;
