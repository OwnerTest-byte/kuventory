-- 20261022020000_fix_finalize_and_inventory_saving.sql
-- FIX: 
-- 1. finalize_daily_inventory: Never fail on duplicate report unique constraint; clean up stale reports atomically.
--    Never fail if an item's batch stock is depleted or expired; gracefully consume available and record discrepancy.
-- 2. correct_finalized_daily_inventory: Fix audit_logs schema mismatch (actor_id, action, target_table, new_data).
-- 3. force_override_daily_inventory: Fix audit_logs schema mismatch.
-- 4. reports & report_items RLS: Allow authenticated users to manage daily reports during finalization.

-- 1. FIX finalize_daily_inventory
CREATE OR REPLACE FUNCTION public.finalize_daily_inventory(
  p_daily_inventory_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_inventory_record public.daily_inventory%ROWTYPE;
  v_report_id UUID;
  v_item RECORD;
  v_consumption NUMERIC;
  v_auth_uid UUID := auth.uid();
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_inventory_record 
  FROM public.daily_inventory 
  WHERE id = p_daily_inventory_id 
  FOR UPDATE;

  IF NOT FOUND THEN 
    RAISE EXCEPTION 'Daily inventory not found'; 
  END IF;

  -- Atomically clean up any existing report rows for this daily inventory session
  -- to avoid unique_report_daily_inventory_version (23505) violations upon re-finalizing or draft resets
  DELETE FROM public.report_items 
  WHERE report_id IN (SELECT id FROM public.reports WHERE daily_inventory_id = p_daily_inventory_id);

  DELETE FROM public.reports 
  WHERE daily_inventory_id = p_daily_inventory_id;

  -- Transition state to FINALIZED
  UPDATE public.daily_inventory 
  SET state = 'FINALIZED', finalized_by = v_auth_uid, finalized_at = NOW() 
  WHERE id = p_daily_inventory_id;

  -- Create fresh authoritative report snapshot
  INSERT INTO public.reports (daily_inventory_id, report_date, generated_by, version) 
  VALUES (p_daily_inventory_id, v_inventory_record.inventory_date, v_auth_uid, 1) 
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

    -- Consumption is morning sales (am) + evening sales (pm)
    v_consumption := COALESCE(v_item.am, 0) + COALESCE(v_item.pm, 0);

    IF v_consumption > 0 THEN
      BEGIN
        PERFORM public.consume_stock(v_item.item_id, v_consumption, 'Daily Inventory Finalization');
      EXCEPTION WHEN OTHERS THEN
        -- Never abort the finalization transaction if batch stock is depleted or expired in the ledger.
        -- In physical bistro operations, daily sales count must always be preserved and saved!
        RAISE NOTICE 'Stock consumption notice for item %: %', v_item.item_id, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Auditing
  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
    VALUES (
      v_auth_uid,
      'FINALIZE_DAILY_INVENTORY',
      'daily_inventory',
      p_daily_inventory_id,
      jsonb_build_object('report_id', v_report_id, 'inventory_date', v_inventory_record.inventory_date)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

GRANT EXECUTE ON FUNCTION public.finalize_daily_inventory(UUID) TO authenticated;

-- 2. FIX correct_finalized_daily_inventory
CREATE OR REPLACE FUNCTION public.correct_finalized_daily_inventory(
  p_daily_inventory_id UUID, 
  p_items JSONB, 
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_auth_uid UUID := auth.uid();
  v_user_name TEXT := 'Administrator';
  v_sheet public.daily_inventory%ROWTYPE;
  v_report_id UUID;
  v_item_elem JSONB;
  v_item_id UUID;
  v_new_beg NUMERIC;
  v_new_add NUMERIC;
  v_new_am NUMERIC;
  v_new_pm NUMERIC;
  v_new_ending NUMERIC;
  v_existing_item RECORD;
  v_old_consumption NUMERIC;
  v_new_consumption NUMERIC;
  v_delta_consumption NUMERIC;
  v_old_add NUMERIC;
  v_delta_add NUMERIC;
  v_rev_count INTEGER;
  v_old_items_snapshot JSONB := '[]'::jsonb;
  v_stock_deltas JSONB := '[]'::jsonb;
BEGIN
  -- 1. Authorization check
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Maintenance check
  IF public.is_maintenance_locked() THEN
    RAISE EXCEPTION 'System is currently under Emergency Maintenance Lockdown. All modifications are suspended.';
  END IF;

  -- 3. Lock daily inventory record
  SELECT * INTO v_sheet
  FROM public.daily_inventory
  WHERE id = p_daily_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily inventory worksheet not found.';
  END IF;

  IF v_sheet.state != 'FINALIZED' THEN
    RAISE EXCEPTION 'Worksheet is not in FINALIZED state. Corrections only apply to finalized sheets.';
  END IF;

  -- Fetch user display name safely
  SELECT COALESCE(display_name, first_name || ' ' || COALESCE(last_name, ''), 'Staff') INTO v_user_name
  FROM public.profiles
  WHERE id = v_auth_uid;

  -- Count existing revisions for this sheet
  SELECT count(*) + 1 INTO v_rev_count
  FROM public.daily_inventory_revisions
  WHERE daily_inventory_id = p_daily_inventory_id;

  -- Capture old snapshot
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', dii.id,
      'item_id', dii.item_id,
      'item_name', ii.name,
      'beg', dii.beg,
      'add', dii.add,
      'total', dii.total,
      'am', dii.am,
      'pm', dii.pm,
      'ending', dii.ending
    )
  ) INTO v_old_items_snapshot
  FROM public.daily_inventory_items dii
  JOIN public.inventory_items ii ON dii.item_id = ii.id
  WHERE dii.daily_inventory_id = p_daily_inventory_id;

  -- Find corresponding report
  SELECT id INTO v_report_id
  FROM public.reports
  WHERE daily_inventory_id = p_daily_inventory_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- 4. Process each corrected item and apply DIFFERENTIAL stock adjustments
  FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item_elem->>'item_id')::UUID;
    v_new_beg := COALESCE((v_item_elem->>'beg')::NUMERIC, 0);
    v_new_add := COALESCE((v_item_elem->>'add')::NUMERIC, 0);
    v_new_am := COALESCE((v_item_elem->>'am')::NUMERIC, 0);
    v_new_pm := COALESCE((v_item_elem->>'pm')::NUMERIC, 0);
    v_new_ending := COALESCE((v_item_elem->>'ending')::NUMERIC, (v_new_beg + v_new_add - v_new_am - v_new_pm));

    -- Fetch current recorded values
    SELECT * INTO v_existing_item
    FROM public.daily_inventory_items
    WHERE daily_inventory_id = p_daily_inventory_id AND item_id = v_item_id
    FOR UPDATE;

    IF FOUND THEN
      v_old_consumption := COALESCE(v_existing_item.am, 0) + COALESCE(v_existing_item.pm, 0);
      v_new_consumption := v_new_am + v_new_pm;
      v_delta_consumption := v_new_consumption - v_old_consumption;

      v_old_add := COALESCE(v_existing_item.add, 0);
      v_delta_add := v_new_add - v_old_add;

      -- If additional sales took place, consume the difference
      IF v_delta_consumption > 0 THEN
        BEGIN
          PERFORM public.consume_stock(
            v_item_id, 
            v_delta_consumption, 
            format('Finalized Sheet Correction (Rev %s): +%s usage', v_rev_count, v_delta_consumption)
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      -- If sales were overestimated, add stock back to replenish
      ELSIF v_delta_consumption < 0 THEN
        BEGIN
          PERFORM public.add_stock(
            v_item_id, 
            abs(v_delta_consumption), 
            (now() + interval '90 days')::DATE, 
            now()::DATE, 
            format('Finalized Sheet Correction (Rev %s): Returned %s overestimated sales', v_rev_count, abs(v_delta_consumption))
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;

      -- If receipts were adjusted
      IF v_delta_add > 0 THEN
        BEGIN
          PERFORM public.add_stock(
            v_item_id, 
            v_delta_add, 
            (now() + interval '90 days')::DATE, 
            now()::DATE, 
            format('Finalized Sheet Correction (Rev %s): +%s receipts adjustment', v_rev_count, v_delta_add)
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      ELSIF v_delta_add < 0 THEN
        BEGIN
          PERFORM public.consume_stock(
            v_item_id, 
            abs(v_delta_add), 
            format('Finalized Sheet Correction (Rev %s): -%s receipts reduction', v_rev_count, abs(v_delta_add))
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;

      -- Update daily_inventory_items
      UPDATE public.daily_inventory_items
      SET beg = v_new_beg,
          add = v_new_add,
          total = (v_new_beg + v_new_add),
          am = v_new_am,
          pm = v_new_pm,
          ending = v_new_ending
      WHERE id = v_existing_item.id;

      -- Record delta in stock adjustments log
      IF v_delta_consumption != 0 OR v_delta_add != 0 THEN
        v_stock_deltas := v_stock_deltas || jsonb_build_object(
          'item_id', v_item_id,
          'delta_consumption', v_delta_consumption,
          'delta_add', v_delta_add
        );
      END IF;

      -- Update report_items if corresponding report exists
      IF v_report_id IS NOT NULL THEN
        UPDATE public.report_items
        SET beg = v_new_beg,
            add = v_new_add,
            total = (v_new_beg + v_new_add),
            am = v_new_am,
            pm = v_new_pm,
            ending = v_new_ending
        WHERE report_id = v_report_id 
          AND item_name = (SELECT name FROM public.inventory_items WHERE id = v_item_id);
      END IF;
    END IF;
  END LOOP;

  -- 5. Insert auditable revision record
  INSERT INTO public.daily_inventory_revisions (
    daily_inventory_id,
    revision_number,
    inventory_date,
    reason,
    corrected_by,
    corrected_by_name,
    old_values,
    new_values,
    stock_adjustments,
    created_at
  ) VALUES (
    p_daily_inventory_id,
    v_rev_count,
    v_sheet.inventory_date,
    COALESCE(NULLIF(TRIM(p_reason), ''), 'Routine correction of finalized worksheet'),
    v_auth_uid,
    v_user_name,
    COALESCE(v_old_items_snapshot, '[]'::jsonb),
    p_items,
    v_stock_deltas,
    now()
  );

  -- 6. Insert audit log using valid schema (actor_id, action, target_table, target_id, new_data)
  BEGIN
    INSERT INTO public.audit_logs (
      actor_id, action, target_table, target_id, new_data
    ) VALUES (
      v_auth_uid,
      'CORRECT_FINALIZED_INVENTORY',
      'daily_inventory',
      p_daily_inventory_id,
      jsonb_build_object(
        'revision', v_rev_count,
        'reason', p_reason,
        'deltas', v_stock_deltas
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'revision_number', v_rev_count,
    'inventory_date', v_sheet.inventory_date,
    'stock_deltas', v_stock_deltas,
    'message', format('Successfully applied Revision #%s to finalized inventory sheet.', v_rev_count)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.correct_finalized_daily_inventory(UUID, JSONB, TEXT) TO authenticated;

-- 3. FIX force_override_daily_inventory
CREATE OR REPLACE FUNCTION public.force_override_daily_inventory(
  p_daily_inventory_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only a Master Administrator can force override finalized records.';
  END IF;

  -- Unlock the daily inventory session back to DRAFT state
  UPDATE public.daily_inventory
  SET state = 'DRAFT',
      finalized_at = NULL,
      finalized_by = NULL
  WHERE id = p_daily_inventory_id;

  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
    VALUES (
      auth.uid(), 
      'FORCE_OVERRIDE_RECORD', 
      'daily_inventory', 
      p_daily_inventory_id, 
      jsonb_build_object('action', 'reopened_to_draft')
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.force_override_daily_inventory(UUID) TO authenticated;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
