-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.trigger_check_inventory_thresholds()
RETURNS TRIGGER AS $$
DECLARE
  v_item_id UUID;
  v_total NUMERIC;
  v_min NUMERIC;
  v_name TEXT;
BEGIN
  -- Determine the item_id based on the table and operation
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'inventory_items' THEN
      RETURN NULL; -- Deleting an item cascades to everything anyway, skip threshold
    END IF;
    v_item_id := OLD.item_id;
  ELSIF TG_TABLE_NAME = 'inventory_items' THEN
    v_item_id := NEW.id;
  ELSE
    v_item_id := NEW.item_id;
  END IF;

  -- Calculate total VALID stock
  SELECT COALESCE(SUM(quantity), 0) INTO v_total
  FROM public.stock_batches
  WHERE item_id = v_item_id
    AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE);

  -- Get item metadata
  SELECT name, min_quantity INTO v_name, v_min
  FROM public.inventory_items
  WHERE id = v_item_id;

  -- If item was deleted between triggers, just exit
  IF v_name IS NULL THEN
    RETURN NULL;
  END IF;

  -- Evaluate thresholds
  IF v_total = 0 THEN
    -- OUT OF STOCK
    INSERT INTO public.notifications (type, title, message, item_id, dedup_key)
    VALUES (
      'OUT_OF_STOCK',
      'Out of Stock: ' || v_name,
      v_name || ' has completely run out of stock.',
      v_item_id,
      'OOS_' || v_item_id
    ) ON CONFLICT (dedup_key) DO NOTHING;
    
    -- Clear LOW_STOCK deduplication lock if it exists
    UPDATE public.notifications 
    SET dedup_key = NULL 
    WHERE dedup_key = 'LOW_' || v_item_id;

  ELSIF v_total <= v_min THEN
    -- LOW STOCK
    INSERT INTO public.notifications (type, title, message, item_id, dedup_key)
    VALUES (
      'LOW_STOCK',
      'Low Stock: ' || v_name,
      v_name || ' is running low (' || v_total || ' remaining).',
      v_item_id,
      'LOW_' || v_item_id
    ) ON CONFLICT (dedup_key) DO NOTHING;
    
    -- Clear OUT_OF_STOCK deduplication lock if it exists
    UPDATE public.notifications 
    SET dedup_key = NULL 
    WHERE dedup_key = 'OOS_' || v_item_id;

  ELSE
    -- STOCK RESTORED (Normal)
    -- Release all locks for this item
    UPDATE public.notifications 
    SET dedup_key = NULL 
    WHERE dedup_key IN ('OOS_' || v_item_id, 'LOW_' || v_item_id);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Bind trigger to stock_batches
DROP TRIGGER IF EXISTS on_batch_change_check_thresholds ON public.stock_batches;
CREATE TRIGGER on_batch_change_check_thresholds
AFTER INSERT OR UPDATE OF quantity OR DELETE ON public.stock_batches
FOR EACH ROW EXECUTE FUNCTION public.trigger_check_inventory_thresholds();

-- 3. Bind trigger to inventory_items
DROP TRIGGER IF EXISTS on_item_change_check_thresholds ON public.inventory_items;
CREATE TRIGGER on_item_change_check_thresholds
AFTER UPDATE OF min_quantity ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.trigger_check_inventory_thresholds();
