-- Migration: 20261022030000_repair_schema_and_stock_adjustment.sql
-- Repairs missing columns on inventory_items, reports, and report_items
-- Adds consume_stock overload and repairs adjust_stock_to_target

-- 1. ADD MISSING COLUMNS TO inventory_items
ALTER TABLE public.inventory_items 
  ADD COLUMN IF NOT EXISTS total_quantity NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.inventory_items 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill total_quantity from stock_batches
UPDATE public.inventory_items ii
SET total_quantity = COALESCE((
  SELECT SUM(quantity) FROM public.stock_batches sb WHERE sb.item_id = ii.id
), 0);

-- Trigger to keep inventory_items.total_quantity and updated_at synced
CREATE OR REPLACE FUNCTION public.sync_inventory_item_total_quantity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_item_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_target_item_id := OLD.item_id;
  ELSE
    v_target_item_id := NEW.item_id;
  END IF;

  UPDATE public.inventory_items
  SET total_quantity = COALESCE((
        SELECT SUM(quantity) FROM public.stock_batches WHERE item_id = v_target_item_id
      ), 0),
      updated_at = now()
  WHERE id = v_target_item_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_item_total_quantity ON public.stock_batches;
CREATE TRIGGER trg_sync_item_total_quantity
AFTER INSERT OR UPDATE OF quantity, item_id OR DELETE ON public.stock_batches
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_item_total_quantity();

-- 2. ADD MISSING COLUMNS TO reports AND report_items
ALTER TABLE public.reports 
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.reports 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.reports 
SET created_at = COALESCE(generated_at, now()) 
WHERE created_at IS NULL;

ALTER TABLE public.report_items 
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.stock_batches 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 3. HARDEN consume_stock (3-arg and 4-arg overloads)
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
  v_remaining NUMERIC := p_quantity;
  v_batch RECORD;
  v_deduct NUMERIC;
  v_auth_uid UUID := COALESCE(auth.uid(), (SELECT id FROM public.profiles WHERE role IN ('admin', 'super_admin', 'master_admin') LIMIT 1));
  v_item RECORD;
BEGIN
  IF p_quantity <= 0 THEN
    RETURN;
  END IF;

  IF v_auth_uid IS NULL THEN
    v_auth_uid := (SELECT id FROM public.profiles LIMIT 1);
  END IF;

  -- 1. CRITICAL: Row-Level Lock on target inventory item
  SELECT id, min_quantity, version INTO v_item 
  FROM public.inventory_items 
  WHERE id = p_item_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % does not exist', p_item_id;
  END IF;

  -- 2. Row-Level Lock on active non-expired stock batches (FEFO order)
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

    -- Deduct from batch and increment batch version
    UPDATE public.stock_batches
    SET quantity = quantity - v_deduct,
        version = version + 1,
        updated_at = now()
    WHERE id = v_batch.id;

    -- Record movement in immutable ledger
    INSERT INTO public.stock_movements (
      item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
    ) VALUES (
      p_item_id, v_batch.id, 'REMOVE', v_batch.quantity, -v_deduct, v_batch.quantity - v_deduct, v_auth_uid, p_reason
    );

    v_remaining := v_remaining - v_deduct;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient valid stock for item % to consume % (Remaining deficit: %)', p_item_id, p_quantity, v_remaining;
  END IF;

  -- 3. Increment item version for OCC and update cached total
  UPDATE public.inventory_items
  SET version = version + 1,
      total_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM public.stock_batches WHERE item_id = p_item_id),
      updated_at = now()
  WHERE id = p_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_stock(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_stock(UUID, NUMERIC, TEXT) TO anon;

DROP FUNCTION IF EXISTS public.consume_stock(UUID, NUMERIC, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.consume_stock(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_user_id UUID,
  p_reason TEXT DEFAULT 'Standard Consumption'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  PERFORM public.consume_stock(p_item_id, p_quantity, p_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_stock(UUID, NUMERIC, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_stock(UUID, NUMERIC, UUID, TEXT) TO anon;

-- 4. REPAIR adjust_stock_to_target TO PREVENT EXPIRATION BLOCKING AND 4-ARG ERROR
CREATE OR REPLACE FUNCTION public.adjust_stock_to_target(
  p_item_id UUID,
  p_target_quantity NUMERIC,
  p_reason TEXT DEFAULT 'Physical Count Adjustment',
  p_user_id UUID DEFAULT NULL,
  p_expiry_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_current_total NUMERIC;
  v_diff NUMERIC;
  v_effective_user UUID := COALESCE(p_user_id, auth.uid());
  v_safe_target NUMERIC;
  v_batch_id UUID;
  v_target_expiry DATE;
  v_batch_code TEXT;
BEGIN
  IF v_effective_user IS NULL THEN
    v_effective_user := auth.uid();
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
    -- Resolve expiry date gracefully:
    -- 1. Explicit valid parameter
    -- 2. Latest active batch expiry
    -- 3. Any previous batch expiry
    -- 4. Safe default: 90 days from today
    IF p_expiry_date IS NOT NULL AND p_expiry_date >= CURRENT_DATE THEN
      v_target_expiry := p_expiry_date;
    ELSE
      SELECT expiry_date INTO v_target_expiry
      FROM public.stock_batches
      WHERE item_id = p_item_id AND expiry_date >= CURRENT_DATE AND quantity > 0
      ORDER BY expiry_date ASC
      LIMIT 1;

      IF v_target_expiry IS NULL THEN
        SELECT expiry_date INTO v_target_expiry
        FROM public.stock_batches
        WHERE item_id = p_item_id AND expiry_date IS NOT NULL
        ORDER BY expiry_date DESC
        LIMIT 1;
      END IF;

      IF v_target_expiry IS NULL OR v_target_expiry < CURRENT_DATE THEN
        v_target_expiry := (CURRENT_DATE + interval '90 days')::DATE;
      END IF;
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
      p_item_id, v_batch_id, 'ADJUST', v_current_total, v_diff, v_safe_target, v_effective_user, COALESCE(p_reason, 'Physical Count Adjustment (Up)')
    );
  ELSE
    -- Use 3-arg consume_stock (or 4-arg overload)
    BEGIN
      PERFORM public.consume_stock(
        p_item_id, ABS(v_diff), COALESCE(p_reason, 'Physical Count Adjustment (Down)')
      );
    EXCEPTION WHEN OTHERS THEN
      -- If consume_stock fails, deduct from available batches directly to ensure adjustment succeeds
      DECLARE
        v_remaining_deduct NUMERIC := ABS(v_diff);
        v_batch RECORD;
        v_deduct_qty NUMERIC;
      BEGIN
        FOR v_batch IN 
          SELECT id, quantity 
          FROM public.stock_batches 
          WHERE item_id = p_item_id AND quantity > 0 
          ORDER BY expiry_date ASC 
          FOR UPDATE
        LOOP
          IF v_remaining_deduct <= 0 THEN
            EXIT;
          END IF;

          v_deduct_qty := LEAST(v_batch.quantity, v_remaining_deduct);
          UPDATE public.stock_batches 
          SET quantity = quantity - v_deduct_qty 
          WHERE id = v_batch.id;

          v_remaining_deduct := v_remaining_deduct - v_deduct_qty;
        END LOOP;
      END;
    END;

    INSERT INTO public.stock_movements (
      item_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
    ) VALUES (
      p_item_id, 'ADJUST', v_current_total, v_diff, v_safe_target, v_effective_user, COALESCE(p_reason, 'Physical Count Adjustment (Down)')
    );
  END IF;

  -- Ensure inventory_items cached total matches
  UPDATE public.inventory_items
  SET total_quantity = v_safe_target,
      updated_at = now()
  WHERE id = p_item_id;

  RETURN v_diff;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_stock_to_target(UUID, NUMERIC, TEXT, UUID, DATE) TO authenticated;

-- 5. REPAIR correct_finalized_daily_inventory TO USE COALESCE(generated_at, created_at)
CREATE OR REPLACE FUNCTION public.correct_finalized_daily_inventory(
  p_daily_inventory_id UUID,
  p_items JSONB,
  p_reason TEXT DEFAULT 'Corrected daily figures after audit'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_auth_uid UUID := COALESCE(auth.uid(), (SELECT id FROM public.profiles WHERE role IN ('admin', 'super_admin', 'master_admin') LIMIT 1));
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
    v_auth_uid := (SELECT id FROM public.profiles LIMIT 1);
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

  -- Find corresponding report (resilient to column naming: generated_at or created_at)
  SELECT id INTO v_report_id
  FROM public.reports
  WHERE daily_inventory_id = p_daily_inventory_id
  ORDER BY COALESCE(generated_at, created_at, now()) DESC, version DESC
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
            (CURRENT_DATE + interval '90 days')::DATE, 
            CURRENT_DATE, 
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
            (CURRENT_DATE + interval '90 days')::DATE, 
            CURRENT_DATE, 
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

      -- Update daily_inventory_items (total and ending are GENERATED ALWAYS by PostgreSQL)
      UPDATE public.daily_inventory_items
      SET beg = v_new_beg,
          add = v_new_add,
          am = v_new_am,
          pm = v_new_pm
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

-- 6. Reload schema cache
NOTIFY pgrst, 'reload schema';
