-- migrations/20260903130000_fix_notification_type_oos.sql
--
-- FIX: The inventory-threshold trigger wrote out-of-stock notifications with
-- type 'OOS', but the frontend NotificationType union and UI
-- (src/features/inventory/types/index.ts, NotificationCenter, NotificationBell)
-- only recognize 'OUT_OF_STOCK'. Real out-of-stock notifications therefore fell
-- through without their intended badge/icon.
--
-- This redefines trigger_check_inventory_thresholds() to emit 'OUT_OF_STOCK'
-- (keeping the same title/message and dedup_key prefix, and the same dedup
-- ON CONFLICT DO NOTHING + mark-read-on-recovery model).

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

  SELECT COALESCE(SUM(quantity), 0) INTO v_total
  FROM public.stock_batches
  WHERE item_id = v_item_id;

  SELECT min_quantity, name INTO v_min, v_name
  FROM public.inventory_items
  WHERE id = v_item_id;

  IF v_total = 0 THEN
    -- Out of Stock
    INSERT INTO public.notifications (type, title, message, item_id, dedup_key)
    VALUES ('OUT_OF_STOCK', 'Out of Stock: ' || v_name, v_name || ' has completely run out of stock.', v_item_id, 'OOS_' || v_item_id)
    ON CONFLICT (dedup_key) DO NOTHING;
  ELSIF v_total <= v_min THEN
    -- Low Stock
    INSERT INTO public.notifications (type, title, message, item_id, dedup_key)
    VALUES ('LOW_STOCK', 'Low Stock: ' || v_name, v_name || ' is below the minimum threshold of ' || v_min || ' (Current: ' || v_total || ').', v_item_id, 'LOW_' || v_item_id)
    ON CONFLICT (dedup_key) DO NOTHING;
  ELSE
    -- Stock is fine, mark pending notifications of this type as read
    UPDATE public.notifications
    SET is_read = true, read_at = NOW()
    WHERE dedup_key IN ('OOS_' || v_item_id, 'LOW_' || v_item_id);
  END IF;

  RETURN NULL;
END;
$function$;
