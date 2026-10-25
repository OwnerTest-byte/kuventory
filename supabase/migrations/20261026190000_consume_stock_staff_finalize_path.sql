-- ============================================================================
-- MIGRATION: 20261026190000_consume_stock_staff_finalize_path.sql
-- PURPOSE (owner report: Finalize Day did not work for STAFF):
--   finalize_daily_inventory (20261026180000) calls consume_stock for every
--   worksheet item with AM/PM sales. consume_stock's role gate rejected
--   STAFF callers, so any staff finalization of a sheet with sales aborted
--   with "Forbidden: only administrators can consume inventory stock."
--   FIX: STAFF joins the consume allowlist. This is safe: staff never reach
--   a direct consume button (the catalog is admin-only and route-guarded) —
--   the staff path into this function is exclusively the finalization of
--   their own worksheet, which is exactly the owner-intended workflow.
-- Body otherwise identical to the authoritative 20261024220000 version
-- (FEFO order, expired batches excluded, row locks, movements recorded).
-- The 4-arg batch overload keeps its admin-only gate (admin console tool).
-- ============================================================================

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
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('STAFF', 'ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: invalid role for consuming inventory stock.';
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

GRANT EXECUTE ON FUNCTION public.consume_stock(UUID, NUMERIC, TEXT) TO authenticated;

-- Reload schema cache so PostgREST exposes the replaced function immediately.
NOTIFY pgrst, 'reload schema';
