-- ============================================================================
-- Migration: 20261003190000_zero_stock_expiry_and_notifications.sql
-- Description: Enforce zero-stock expiry business rules and instant notification cleanup.
-- ============================================================================

-- 1. Create Active Expiring Stock View
-- Strictly filters out batches with quantity <= 0.
-- Historical records remain untouched in stock_batches and stock_movements.
CREATE OR REPLACE VIEW public.active_expiring_stock_view AS
SELECT 
  sb.id AS batch_id,
  sb.item_id,
  COALESCE(i.name, 'Unknown Item') AS item_name,
  COALESCE(i.unit, 'pcs') AS unit,
  sb.batch_code,
  sb.quantity,
  sb.expiry_date,
  sb.received_date,
  sb.created_at,
  CASE 
    WHEN sb.expiry_date < CURRENT_DATE THEN 'EXPIRED'
    WHEN sb.expiry_date <= CURRENT_DATE + INTERVAL '14 days' THEN 'EXPIRING_SOON'
    ELSE 'HEALTHY'
  END AS expiry_status,
  CASE 
    WHEN sb.expiry_date IS NOT NULL THEN (sb.expiry_date - CURRENT_DATE)
    ELSE NULL
  END AS days_until_expiry
FROM public.stock_batches sb
JOIN public.inventory_items i ON sb.item_id = i.id
WHERE sb.quantity > 0 
  AND sb.expiry_date IS NOT NULL
  AND (i.is_archived = false OR i.is_archived IS NULL);

GRANT SELECT ON public.active_expiring_stock_view TO authenticated, anon;

-- 2. Harden check_expiry_notifications Function
-- Excludes zero-quantity batches and automatically resolves expired/expiring notifications
-- when a batch has been depleted to 0.
CREATE OR REPLACE FUNCTION public.check_expiry_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch RECORD;
  v_item_name TEXT;
BEGIN
  -- A. Automatically resolve notifications for depleted batches (quantity <= 0)
  UPDATE public.notifications n
  SET is_read = true, 
      read_at = NOW()
  FROM public.stock_batches sb
  WHERE n.batch_id = sb.id
    AND sb.quantity <= 0
    AND n.is_read = false
    AND n.type IN ('EXPIRED', 'EXPIRING_SOON');

  -- B. Active EXPIRED batches (quantity > 0 only)
  FOR v_batch IN
    SELECT sb.id, sb.item_id, COALESCE(i.name, 'Item') AS name, sb.expiry_date, sb.quantity
    FROM public.stock_batches sb
    JOIN public.inventory_items i ON sb.item_id = i.id
    WHERE sb.quantity > 0
      AND sb.expiry_date < CURRENT_DATE
      AND (i.is_archived = false OR i.is_archived IS NULL)
  LOOP
    v_item_name := COALESCE(v_batch.name, 'Item');
    INSERT INTO public.notifications (type, title, message, item_id, batch_id, dedup_key)
    VALUES (
      'EXPIRED',
      'Expired Batch: ' || v_item_name,
      v_item_name || ' has ' || v_batch.quantity || ' expired units from batch expiring on ' || v_batch.expiry_date || '.',
      v_batch.item_id,
      v_batch.id,
      'EXPIRED_' || v_batch.id
    ) ON CONFLICT (dedup_key) DO UPDATE
      SET is_read = false, created_at = NOW();

    -- Clear any old EXPIRING_SOON notification for this batch
    UPDATE public.notifications 
    SET is_read = true, read_at = NOW()
    WHERE dedup_key = 'EXPIRING_' || v_batch.id;
  END LOOP;

  -- C. Active EXPIRING SOON batches (quantity > 0 and within 14 days)
  FOR v_batch IN
    SELECT sb.id, sb.item_id, COALESCE(i.name, 'Item') AS name, sb.expiry_date, sb.quantity
    FROM public.stock_batches sb
    JOIN public.inventory_items i ON sb.item_id = i.id
    WHERE sb.quantity > 0
      AND sb.expiry_date >= CURRENT_DATE
      AND sb.expiry_date <= CURRENT_DATE + INTERVAL '14 days'
      AND (i.is_archived = false OR i.is_archived IS NULL)
  LOOP
    v_item_name := COALESCE(v_batch.name, 'Item');
    INSERT INTO public.notifications (type, title, message, item_id, batch_id, dedup_key)
    VALUES (
      'EXPIRING_SOON',
      'Expiring Soon: ' || v_item_name,
      v_item_name || ' has ' || v_batch.quantity || ' units expiring on ' || v_batch.expiry_date || '.',
      v_batch.item_id,
      v_batch.id,
      'EXPIRING_' || v_batch.id
    ) ON CONFLICT (dedup_key) DO UPDATE
      SET is_read = false, created_at = NOW();
  END LOOP;
END;
$$;

-- 3. Trigger to immediately resolve batch notifications when quantity drops to 0
CREATE OR REPLACE FUNCTION public.trigger_on_batch_quantity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If batch was depleted to 0, immediately resolve its active expiry notifications
  IF NEW.quantity <= 0 THEN
    UPDATE public.notifications
    SET is_read = true, read_at = NOW()
    WHERE batch_id = NEW.id
      AND type IN ('EXPIRED', 'EXPIRING_SOON')
      AND is_read = false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_quantity_cleanup ON public.stock_batches;
CREATE TRIGGER trg_batch_quantity_cleanup
AFTER UPDATE OF quantity ON public.stock_batches
FOR EACH ROW
EXECUTE FUNCTION public.trigger_on_batch_quantity_change();

-- 4. Operational Top 3 Query (Most Outgoing / Deducted Stock - Non-Sales)
CREATE OR REPLACE FUNCTION public.get_operational_top3_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_most_outgoing jsonb;
  v_most_stocked jsonb;
  v_least_stocked jsonb;
BEGIN
  -- Top 3 Most Outgoing / Most Used Items: Calculated from actual stock deductions
  SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb) INTO v_most_outgoing
  FROM (
    SELECT 
      i.id,
      i.name AS item_name,
      COALESCE(c.name, 'General') AS category_name,
      i.unit,
      COALESCE(ABS(SUM(sm.quantity_change)), 0) AS outgoing_quantity
    FROM public.inventory_items i
    LEFT JOIN public.categories c ON i.category_id = c.id
    LEFT JOIN public.stock_movements sm ON i.id = sm.item_id AND sm.type = 'REMOVE'
    WHERE i.is_active = true AND (i.is_archived = false OR i.is_archived IS NULL)
    GROUP BY i.id, i.name, c.name, i.unit
    ORDER BY outgoing_quantity DESC, i.name ASC
    LIMIT 3
  ) sub;

  -- Top 3 Most Stocked: Order by current_stock DESC LIMIT 3
  SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb) INTO v_most_stocked
  FROM (
    SELECT 
      i.id,
      i.name AS item_name,
      COALESCE(c.name, 'General') AS category_name,
      i.unit,
      COALESCE(SUM(b.quantity), 0) AS current_stock
    FROM public.inventory_items i
    LEFT JOIN public.categories c ON i.category_id = c.id
    LEFT JOIN public.stock_batches b ON i.id = b.item_id AND b.quantity > 0
    WHERE i.is_active = true AND (i.is_archived = false OR i.is_archived IS NULL)
    GROUP BY i.id, i.name, c.name, i.unit
    ORDER BY current_stock DESC, i.name ASC
    LIMIT 3
  ) sub;

  -- Top 3 Least Stocked: Order by current_stock ASC LIMIT 3
  SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb) INTO v_least_stocked
  FROM (
    SELECT 
      i.id,
      i.name AS item_name,
      COALESCE(c.name, 'General') AS category_name,
      i.unit,
      COALESCE(SUM(b.quantity), 0) AS current_stock,
      i.min_quantity
    FROM public.inventory_items i
    LEFT JOIN public.categories c ON i.category_id = c.id
    LEFT JOIN public.stock_batches b ON i.id = b.item_id AND b.quantity > 0
    WHERE i.is_active = true AND (i.is_archived = false OR i.is_archived IS NULL)
    GROUP BY i.id, i.name, c.name, i.unit, i.min_quantity
    ORDER BY current_stock ASC, i.name ASC
    LIMIT 3
  ) sub;

  RETURN jsonb_build_object(
    'most_outgoing', v_most_outgoing,
    'most_stocked', v_most_stocked,
    'least_stocked', v_least_stocked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_operational_top3_stats() TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
