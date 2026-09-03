-- migrations/20260903120000_fix_adjust_stock_movement_type.sql
--
-- FIX: cleanup_rpc_signatures.sql (20260902130000) changed public.adjust_stock
-- to record stock_movements of type 'ADJUST_UP'/'ADJUST_DOWN', but:
--   1. stock_movements_type_check only permits 'ADD' | 'REMOVE' | 'ADJUST'
--      so every adjustment violated the CHECK constraint and failed at the DB
--      layer (the app could not adjust any stock batch).
--   2. The frontend MovementType type only recognizes 'ADD' | 'REMOVE' |
--      'ADJUST' (src/features/inventory/types/index.ts), and movement-history
--      badges expect 'ADJUST'.
--
-- This restores 'ADJUST' as the movement type while preserving the hardened
-- signature (no user_id) and auth.uid().

CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_batch_id UUID,
  p_new_quantity NUMERIC,
  p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_batch RECORD;
  v_diff NUMERIC;
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

  UPDATE public.stock_batches SET quantity = p_new_quantity WHERE id = p_batch_id;

  INSERT INTO public.stock_movements (
    item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
  ) VALUES (
    v_batch.item_id, p_batch_id, 'ADJUST', v_batch.quantity, v_diff, p_new_quantity, v_auth_uid, p_reason
  );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
