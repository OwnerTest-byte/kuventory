-- migrations/20260903110000_fix_consume_stock_expired_exclusion.sql
--
-- FIX: Restore the expired-batch exclusion that was accidentally dropped when
-- security_hardening.sql (20260902120000) rewrote public.consume_stock().
--
-- The earlier fefo_update.sql (20260902080000) correctly excluded expired
-- batches from automatic FEFO consumption via:
--   AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
-- The hardening rewrite dropped that clause, causing expired stock to be
-- consumed FIRST (FEFO would pick expired product). This restores the intended
-- behavior while preserving the hardened signature (no user_id) and auth.uid().
--
-- Verified by supabase/tests/database/07_batches_fefo.test.sql.

CREATE OR REPLACE FUNCTION public.consume_stock(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_remaining NUMERIC := p_quantity;
  v_batch RECORD;
  v_deduct NUMERIC;
  v_auth_uid UUID := auth.uid();
BEGIN
  IF p_quantity <= 0 THEN
    RETURN;
  END IF;

  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock VALID batches for this item to prevent concurrent modification.
  -- Expired batches (expiry_date < CURRENT_DATE) are EXCLUDED from automatic
  -- FEFO consumption, so expired product is never picked/served.
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
    SET quantity = quantity - v_deduct
    WHERE id = v_batch.id;

    INSERT INTO public.stock_movements (
      item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
    ) VALUES (
      p_item_id, v_batch.id, 'REMOVE', v_batch.quantity, -v_deduct, v_batch.quantity - v_deduct, v_auth_uid, p_reason
    );

    v_remaining := v_remaining - v_deduct;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient valid stock for item % to consume %', p_item_id, p_quantity;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
