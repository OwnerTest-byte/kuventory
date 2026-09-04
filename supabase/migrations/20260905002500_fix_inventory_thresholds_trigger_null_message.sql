-- 20260905002500_fix_inventory_thresholds_trigger_null_message.sql
-- FIX: Prevent NOT-NULL constraint violation on notifications.message when deleting an item or its batches.
-- If the item has already been deleted or does not exist, or is archived/inactive,
-- the trigger should safely exit without attempting to concatenate NULL values into the notification.

CREATE OR REPLACE FUNCTION public.trigger_check_inventory_thresholds()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_item_id UUID;
  v_total NUMERIC;
  v_min NUMERIC;
  v_name TEXT;
  v_is_archived BOOLEAN;
  v_is_active BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'inventory_items' THEN
      RETURN NULL;
    END IF;
    v_item_id := OLD.item_id;
  ELSIF TG_TABLE_NAME = 'inventory_items' THEN
    v_item_id := NEW.id;
  ELSE
    v_item_id := NEW.item_id;
  END IF;

  IF v_item_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT min_quantity, name, is_archived, is_active 
  INTO v_min, v_name, v_is_archived, v_is_active
  FROM public.inventory_items
  WHERE id = v_item_id;

  -- If item was deleted, does not exist, or is archived/inactive, exit cleanly
  IF NOT FOUND OR v_name IS NULL OR v_is_archived = TRUE OR v_is_active = FALSE THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_total
  FROM public.stock_batches
  WHERE item_id = v_item_id;

  IF v_total = 0 THEN
    -- Out of Stock
    INSERT INTO public.notifications (type, title, message, item_id, dedup_key)
    VALUES (
      'OUT_OF_STOCK', 
      'Out of Stock: ' || v_name, 
      v_name || ' has completely run out of stock.', 
      v_item_id, 
      'OOS_' || v_item_id
    )
    ON CONFLICT (dedup_key) DO UPDATE
    SET is_read = false, created_at = NOW();
  ELSIF v_total <= v_min THEN
    -- Low Stock
    INSERT INTO public.notifications (type, title, message, item_id, dedup_key)
    VALUES (
      'LOW_STOCK', 
      'Low Stock: ' || v_name, 
      v_name || ' is below the minimum threshold of ' || v_min || ' (Current: ' || v_total || ').', 
      v_item_id, 
      'LOW_' || v_item_id
    )
    ON CONFLICT (dedup_key) DO UPDATE
    SET is_read = false, created_at = NOW();
  ELSE
    -- Stock is fine, mark pending notifications of this type as read
    UPDATE public.notifications
    SET is_read = true, read_at = NOW()
    WHERE dedup_key IN ('OOS_' || v_item_id, 'LOW_' || v_item_id);
  END IF;

  RETURN NULL;
END;
$function$;
