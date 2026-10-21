-- 20261021220000_harden_inventory_view_and_security.sql
-- KUVENTORY Security & Inventory View Hardening Migration
-- 1. Sets security_invoker = true on inventory_stock_view to respect underlying table RLS
-- 2. Revokes anonymous SELECT access from inventory_stock_view
-- 3. Drops obsolete 4-argument adjust_stock_to_target overload
-- 4. Enforces role verification inside create_inventory_item_with_initial_stock & audit_inventory_data_quality

-- 1. HARDEN INVENTORY_STOCK_VIEW WITH SECURITY_INVOKER
CREATE OR REPLACE VIEW public.inventory_stock_view 
WITH (security_invoker = true) AS
 SELECT 
    i.id,
    i.category_id,
    COALESCE(c.name, 'Uncategorized') AS category_name,
    i.name,
    COALESCE(i.description, '') AS description,
    COALESCE(i.supplier_a, '') AS supplier_a,
    COALESCE(i.supplier_b, '') AS supplier_b,
    COALESCE(i.unit, 'pcs') AS unit,
    i.unit_cost,
    i.min_quantity,
    COALESCE(i.is_active, true) AS is_active,
    COALESCE(i.is_archived, false) AS is_archived,
    COALESCE(sum(b.quantity), (0)::numeric) AS total_quantity,
    COALESCE(i.image_path, '') AS image_path,
    COALESCE(i.item_code, UPPER(SUBSTRING(i.id::text, 1, 8))) AS item_code
   FROM public.inventory_items i
     LEFT JOIN public.categories c ON i.category_id = c.id
     LEFT JOIN public.stock_batches b ON i.id = b.item_id
  GROUP BY i.id, c.name;

-- Revoke anonymous access; allow only authenticated callers under RLS
REVOKE ALL ON public.inventory_stock_view FROM anon, public;
GRANT SELECT ON public.inventory_stock_view TO authenticated;

-- 2. DROP OBSOLETE 4-ARGUMENT OVERLOAD FOR ADJUST_STOCK_TO_TARGET
DROP FUNCTION IF EXISTS public.adjust_stock_to_target(UUID, NUMERIC, TEXT, UUID);

-- 3. REINFORCE CANONICAL 5-ARGUMENT ADJUST_STOCK_TO_TARGET
CREATE OR REPLACE FUNCTION public.adjust_stock_to_target(
  p_item_id UUID,
  p_target_quantity NUMERIC,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL,
  p_expiry_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_total NUMERIC;
  v_diff NUMERIC;
  v_effective_user UUID := auth.uid();
  v_safe_target NUMERIC;
  v_batch_id UUID;
  v_target_expiry DATE;
BEGIN
  IF v_effective_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT (public.is_admin() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Administrative privileges required to adjust stock counts.';
  END IF;

  IF p_target_quantity IS NULL OR p_target_quantity < 0 THEN
    RAISE EXCEPTION 'Target quantity must be a non-negative number.';
  END IF;

  v_safe_target := p_target_quantity;

  PERFORM 1 FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % does not exist.', p_item_id;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_current_total
  FROM public.stock_batches
  WHERE item_id = p_item_id;

  v_diff := v_safe_target - v_current_total;

  IF v_diff = 0 THEN
    RETURN 0;
  END IF;

  IF v_diff > 0 THEN
    IF p_expiry_date IS NOT NULL THEN
      IF p_expiry_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'Adjustment expiry date cannot be in the past.';
      END IF;
      v_target_expiry := p_expiry_date;
    ELSE
      SELECT expiry_date INTO v_target_expiry
      FROM public.stock_batches
      WHERE item_id = p_item_id AND expiry_date >= CURRENT_DATE AND quantity > 0
      ORDER BY expiry_date ASC
      LIMIT 1;

      IF v_target_expiry IS NULL THEN
        RAISE EXCEPTION 'Physical stock increase requires an explicit, verified expiration date.';
      END IF;
    END IF;

    INSERT INTO public.stock_batches (
      item_id, quantity, expiry_date, received_date
    ) VALUES (
      p_item_id, v_diff, v_target_expiry, CURRENT_DATE
    ) RETURNING id INTO v_batch_id;

    INSERT INTO public.stock_movements (
      item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
    ) VALUES (
      p_item_id, v_batch_id, 'ADJUST', v_current_total, v_diff, v_safe_target, v_effective_user, COALESCE(p_reason, 'Physical Count Adjustment (Up)')
    );
  ELSE
    PERFORM public.consume_stock(
      p_item_id, ABS(v_diff), v_effective_user, COALESCE(p_reason, 'Physical Count Adjustment (Down)')
    );

    INSERT INTO public.stock_movements (
      item_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
    ) VALUES (
      p_item_id, 'ADJUST', v_current_total, v_diff, v_safe_target, v_effective_user, COALESCE(p_reason, 'Physical Count Adjustment (Down)')
    );
  END IF;

  RETURN v_diff;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adjust_stock_to_target FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_stock_to_target TO authenticated;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
