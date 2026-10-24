-- ============================================================================
-- MIGRATION: 20261024190000_blueprint_remediation_p0_and_p1.sql
-- PURPOSE: System Remediation for P0 and P1 audit findings:
--   1. Harden adjust_stock_to_target:
--      - Eliminate fabricated 90-day expiry dates out of thin air (P1-5)
--      - Require caller authentication and administrator role verification
--      - Eliminate actor identity fallbacks (no caller-supplied user_id)
--      - In downward adjustment, fail closed on insufficient batch stock (no unlogged deductions)
--      - Set explicit search_path = public, auth, pg_temp
--      - Revoke execution from anon and PUBLIC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.adjust_stock_to_target(
  p_item_id UUID,
  p_target_quantity NUMERIC,
  p_reason TEXT DEFAULT 'Physical Count Adjustment',
  p_user_id UUID DEFAULT NULL, -- Ignored in favor of verified auth.uid()
  p_expiry_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_current_total NUMERIC;
  v_diff NUMERIC;
  v_safe_target NUMERIC;
  v_batch_id UUID;
  v_target_expiry DATE;
  v_batch_code TEXT;
BEGIN
  -- 1. Authentication & Authorization Enforcement
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to adjust inventory stock.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only administrators can adjust inventory stock.';
  END IF;

  IF p_target_quantity IS NULL OR p_target_quantity < 0 THEN
    RAISE EXCEPTION 'Target quantity must be a non-negative number.';
  END IF;

  v_safe_target := p_target_quantity;

  -- 2. Lock item record
  PERFORM 1 FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % does not exist.', p_item_id;
  END IF;

  -- 3. Calculate current physical sum of batches
  SELECT COALESCE(SUM(quantity), 0) INTO v_current_total
  FROM public.stock_batches
  WHERE item_id = p_item_id;

  v_diff := v_safe_target - v_current_total;

  IF v_diff = 0 THEN
    RETURN 0;
  END IF;

  -- 4. Upward Adjustment: Requires genuine expiration date (NEVER invent arbitrary dates)
  IF v_diff > 0 THEN
    IF p_expiry_date IS NOT NULL AND p_expiry_date >= CURRENT_DATE THEN
      v_target_expiry := p_expiry_date;
    ELSE
      -- Inherit earliest active non-expired batch expiry if one exists
      SELECT expiry_date INTO v_target_expiry
      FROM public.stock_batches
      WHERE item_id = p_item_id AND expiry_date >= CURRENT_DATE AND quantity > 0
      ORDER BY expiry_date ASC
      LIMIT 1;
    END IF;

    -- Fail closed if no verified expiration date can be determined
    IF v_target_expiry IS NULL OR v_target_expiry < CURRENT_DATE THEN
      RAISE EXCEPTION 'An expiration date is mandatory when adjusting physical stock upward for item %.', p_item_id;
    END IF;

    v_batch_code := format('ADJ-%s-%s', to_char(CURRENT_DATE, 'YYYYMMDD'), substring(gen_random_uuid()::text, 1, 6));

    INSERT INTO public.stock_batches (
      item_id, batch_code, quantity, initial_quantity, expiry_date, received_date
    ) VALUES (
      p_item_id, v_batch_code, v_diff, v_diff, v_target_expiry, CURRENT_DATE
    ) RETURNING id INTO v_batch_id;

    INSERT INTO public.stock_movements (
      item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
    ) VALUES (
      p_item_id, v_batch_id, 'ADJUST', v_current_total, v_diff, v_safe_target, v_caller_id, COALESCE(p_reason, 'Physical Count Adjustment (Up)')
    );

  ELSE
    -- 5. Downward Adjustment: Canonical FEFO consumption (fail-closed, no unlogged direct batch deductions)
    PERFORM public.consume_stock(
      p_item_id, ABS(v_diff), COALESCE(p_reason, 'Physical Count Adjustment (Down)')
    );
  END IF;

  RETURN v_diff;
END;
$$;

-- Security Grants: Revoke anon/PUBLIC and grant exclusively to authenticated
REVOKE EXECUTE ON FUNCTION public.adjust_stock_to_target(UUID, NUMERIC, TEXT, UUID, DATE) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_stock_to_target(UUID, NUMERIC, TEXT, UUID, DATE) TO authenticated;
