-- ============================================================================
-- MIGRATION: 20261026180000_finalize_staff_allowed.sql
-- PURPOSE (owner decision, 2026-10-25):
--   Finalization is a STAFF-level action again. The daily worksheet belongs
--   to the staff member counting it, and they finalize the day themselves;
--   when a finalized sheet turns out to be wrong, the existing correction
--   request flow (submit_correction_request → admin review → atomic apply)
--   is the remedy — that is why it exists.
--   Only the role gate changes: STAFF joins ADMIN/SUPER_ADMIN. The body is
--   otherwise the authoritative release-a version (atomic finalize, FEFO
--   consumption with clean-abort on failure, mandatory audit log).
-- Forward-only. Corrections, force-override, and RLS are untouched.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finalize_daily_inventory(p_daily_inventory_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_inventory_record public.daily_inventory%ROWTYPE;
  v_report_id UUID;
  v_item RECORD;
  v_consumption NUMERIC;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to finalize daily inventory.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('STAFF', 'ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: invalid role for finalizing daily inventory.';
  END IF;

  SELECT * INTO v_inventory_record
  FROM public.daily_inventory
  WHERE id = p_daily_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily inventory record % not found.', p_daily_inventory_id;
  END IF;

  IF v_inventory_record.state = 'FINALIZED' THEN
    RAISE EXCEPTION 'Daily inventory for % is already finalized.', v_inventory_record.inventory_date;
  END IF;

  -- Clean up prior reports if any
  DELETE FROM public.report_items
  WHERE report_id IN (SELECT id FROM public.reports WHERE daily_inventory_id = p_daily_inventory_id);

  DELETE FROM public.reports
  WHERE daily_inventory_id = p_daily_inventory_id;

  -- Transition state to FINALIZED with caller as author
  UPDATE public.daily_inventory
  SET state = 'FINALIZED', finalized_by = v_caller_id, finalized_at = NOW()
  WHERE id = p_daily_inventory_id;

  -- Create fresh authoritative report snapshot
  INSERT INTO public.reports (daily_inventory_id, report_date, generated_by, version)
  VALUES (p_daily_inventory_id, v_inventory_record.inventory_date, v_caller_id, 1)
  RETURNING id INTO v_report_id;

  FOR v_item IN
    SELECT dii.*, ii.name AS item_name, c.name AS category_name, ii.description, ii.unit, ii.unit_cost, ii.supplier_a, ii.supplier_b
    FROM public.daily_inventory_items dii
    JOIN public.inventory_items ii ON dii.item_id = ii.id
    LEFT JOIN public.categories c ON ii.category_id = c.id
    WHERE dii.daily_inventory_id = p_daily_inventory_id
  LOOP
    INSERT INTO public.report_items (
      report_id, item_name, category_name, description, unit, unit_cost, supplier_a, supplier_b, beg, add, total, am, pm, ending
    ) VALUES (
      v_report_id, v_item.item_name, COALESCE(v_item.category_name, 'Uncategorized'),
      v_item.description, v_item.unit, v_item.unit_cost, v_item.supplier_a, v_item.supplier_b,
      COALESCE(v_item.beg, 0), COALESCE(v_item.add, 0),
      COALESCE(v_item.total, (COALESCE(v_item.beg, 0) + COALESCE(v_item.add, 0))),
      COALESCE(v_item.am, 0), COALESCE(v_item.pm, 0),
      COALESCE(v_item.ending, (COALESCE(v_item.beg, 0) + COALESCE(v_item.add, 0) - COALESCE(v_item.am, 0) - COALESCE(v_item.pm, 0)))
    );

    v_consumption := COALESCE(v_item.am, 0) + COALESCE(v_item.pm, 0);

    -- Stock consumption must NOT be silently swallowed.
    -- If consumption fails, entire finalization aborts cleanly.
    IF v_consumption > 0 THEN
      PERFORM public.consume_stock(v_item.item_id, v_consumption, 'Daily Inventory Finalization');
    END IF;
  END LOOP;

  -- Mandatory audit logging
  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
  VALUES (
    v_caller_id,
    'FINALIZE_DAILY_INVENTORY',
    'daily_inventory',
    p_daily_inventory_id,
    jsonb_build_object('report_id', v_report_id, 'inventory_date', v_inventory_record.inventory_date)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_daily_inventory(UUID) TO authenticated;

-- Reload schema cache so PostgREST exposes the replaced function immediately.
NOTIFY pgrst, 'reload schema';
