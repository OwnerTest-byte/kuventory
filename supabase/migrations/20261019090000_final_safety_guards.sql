-- KUVENTORY final safety guards and database procedure hardening.
-- Fixes findings C3 (archival role check), C4 (row-locked stock drift repair without GROUP BY FOR UPDATE),
-- C6 (truthful automation job execution), and H9 (preserving depleted batches with movement ledger references).

-- 1. ARCHIVE OLD DAILY INVENTORIES (C3)
-- A security-definer function must enforce its own caller permissions.
CREATE OR REPLACE FUNCTION public.archive_old_daily_inventories()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_policy JSONB;
  v_threshold_days INTEGER := 30;
  v_cutoff_date DATE;
  v_archived_count INTEGER := 0;
  v_actor_id UUID := auth.uid();
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied. Only an authenticated Super Admin may run worksheet archival.';
  END IF;

  SELECT value INTO v_policy
  FROM public.system_settings
  WHERE key = 'super_retention_policy';

  IF jsonb_typeof(v_policy) = 'object'
     AND COALESCE(v_policy->>'sheet_archival_days', '') ~ '^[0-9]+$' THEN
    v_threshold_days := GREATEST(7, LEAST(90, (v_policy->>'sheet_archival_days')::INTEGER));
  END IF;

  v_cutoff_date := CURRENT_DATE - v_threshold_days;

  WITH archived AS (
    UPDATE public.daily_inventory
    SET state = 'ARCHIVED', updated_at = now()
    WHERE state = 'FINALIZED'
      AND inventory_date < v_cutoff_date
    RETURNING id
  )
  SELECT count(*) INTO v_archived_count FROM archived;

  INSERT INTO public.audit_logs (actor_id, action, target_table, new_data)
  VALUES (
    v_actor_id,
    'ARCHIVE_DAILY_INVENTORIES',
    'daily_inventory',
    jsonb_build_object(
      'archived_count', v_archived_count,
      'threshold_days', v_threshold_days,
      'cutoff_date', v_cutoff_date,
      'executed_at', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'archived_count', v_archived_count,
    'threshold_days', v_threshold_days,
    'cutoff_date', v_cutoff_date
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.archive_old_daily_inventories() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_old_daily_inventories() TO authenticated;


-- 2. RECONCILE STOCK DRIFT (C4)
-- Avoid GROUP BY/SUM combined with FOR UPDATE.
-- Lock each candidate inventory item in a separate non-aggregate query,
-- recompute its active batch total under that lock, and write the ledger atomically.
CREATE OR REPLACE FUNCTION public.reconcile_stock_drift(
  p_item_ids UUID[] DEFAULT NULL,
  p_reason TEXT DEFAULT 'Super Admin Stock Drift Rebalance'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_candidate RECORD;
  v_item_name TEXT;
  v_old_total NUMERIC;
  v_new_total NUMERIC;
  v_delta NUMERIC;
  v_reconciled_count INTEGER := 0;
  v_reconciled_items JSONB := '[]'::jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied. Only Super Admin may execute atomic stock drift repairs.';
  END IF;

  FOR v_candidate IN
    SELECT i.id
    FROM public.inventory_items i
    WHERE i.is_active = true
      AND (p_item_ids IS NULL OR i.id = ANY(p_item_ids))
    ORDER BY i.id
  LOOP
    -- Lock the parent inventory item row first
    PERFORM 1
    FROM public.inventory_items i
    WHERE i.id = v_candidate.id
    FOR UPDATE;

    SELECT i.name, COALESCE(i.total_quantity, 0)
    INTO v_item_name, v_old_total
    FROM public.inventory_items i
    WHERE i.id = v_candidate.id;

    -- Recalculate sum of non-depleted stock batches under the item lock
    SELECT COALESCE(SUM(b.quantity), 0)
    INTO v_new_total
    FROM public.stock_batches b
    WHERE b.item_id = v_candidate.id AND b.quantity > 0;

    IF v_old_total <> v_new_total THEN
      v_delta := v_new_total - v_old_total;

      UPDATE public.inventory_items
      SET total_quantity = v_new_total, updated_at = now()
      WHERE id = v_candidate.id;

      INSERT INTO public.stock_movements (
        item_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
      ) VALUES (
        v_candidate.id,
        'RECONCILIATION',
        v_old_total,
        v_delta,
        v_new_total,
        v_actor_id,
        COALESCE(NULLIF(TRIM(p_reason), ''), 'Super Admin Stock Drift Rebalance')
      );

      INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
      VALUES (
        v_actor_id,
        'STOCK_DRIFT_RECONCILED',
        'inventory_items',
        v_candidate.id,
        jsonb_build_object(
          'item_id', v_candidate.id,
          'item_name', v_item_name,
          'old_quantity', v_old_total,
          'new_quantity', v_new_total,
          'delta', v_delta,
          'reason', COALESCE(p_reason, 'Super Admin Stock Drift Rebalance')
        )
      );

      v_reconciled_items := v_reconciled_items || jsonb_build_array(jsonb_build_object(
        'item_id', v_candidate.id,
        'item_name', v_item_name,
        'old_quantity', v_old_total,
        'new_quantity', v_new_total,
        'delta', v_delta
      ));
      v_reconciled_count := v_reconciled_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'reconciled_count', v_reconciled_count,
    'executed_at', now(),
    'reconciled_items', v_reconciled_items
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_stock_drift(UUID[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_stock_drift(UUID[], TEXT) TO authenticated;


-- 3. CLEANUP DEPLETED BATCHES WITH AUDIT PRESERVATION (H9)
-- Distinguishes deleted batches from preserved batches with movement ledger references.
CREATE OR REPLACE FUNCTION public.cleanup_depleted_batches(
  p_batch_ids UUID[],
  p_reason TEXT DEFAULT 'Super Admin Depleted Batch Pruning'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_deleted_count INTEGER := 0;
  v_preserved_count INTEGER := 0;
  r RECORD;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied. Only Super Admin may prune depleted batches.';
  END IF;

  IF p_batch_ids IS NULL OR array_length(p_batch_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'processed_count', 0,
      'deleted_count', 0,
      'preserved_count', 0,
      'message', 'No batches specified.'
    );
  END IF;

  FOR r IN
    SELECT b.id, b.item_id, (SELECT count(*) FROM public.stock_movements sm WHERE sm.batch_id = b.id) AS movement_count
    FROM public.stock_batches b
    WHERE b.id = ANY(p_batch_ids)
      AND b.quantity = 0
    FOR UPDATE
  LOOP
    -- If batch has ZERO movements referencing it, it can be safely removed
    IF r.movement_count = 0 THEN
      DELETE FROM public.stock_batches WHERE id = r.id;
      v_deleted_count := v_deleted_count + 1;

      INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
      VALUES (
        v_actor_id,
        'DEPLETED_BATCH_DELETED',
        'stock_batches',
        r.id,
        jsonb_build_object(
          'batch_id', r.id,
          'item_id', r.item_id,
          'movement_count', 0,
          'action_taken', 'DELETED',
          'reason', p_reason
        )
      );
    ELSE
      -- Batch is referenced in the immutable stock ledger; preserve for audit trail
      v_preserved_count := v_preserved_count + 1;

      INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
      VALUES (
        v_actor_id,
        'DEPLETED_BATCH_PRESERVED',
        'stock_batches',
        r.id,
        jsonb_build_object(
          'batch_id', r.id,
          'item_id', r.item_id,
          'movement_count', r.movement_count,
          'action_taken', 'PRESERVED_FOR_AUDIT',
          'preservation_reason', 'Batch has referencing stock movements in immutable ledger',
          'reason', p_reason
        )
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_deleted_count + v_preserved_count,
    'deleted_count', v_deleted_count,
    'preserved_count', v_preserved_count,
    'message', format('Processed %s depleted batches: %s deleted, %s preserved for audit integrity.',
                      v_deleted_count + v_preserved_count, v_deleted_count, v_preserved_count)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_depleted_batches(UUID[], TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_depleted_batches(UUID[], TEXT) TO authenticated;


-- 4. TRUTHFUL AUTOMATION JOB EXECUTION (C6)
-- Executes real operational tasks with genuine duration and failure reporting.
CREATE OR REPLACE FUNCTION public.trigger_automation_job(p_job_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_start TIMESTAMPTZ := clock_timestamp();
  v_duration_ms INTEGER;
  v_result JSONB;
  v_archived JSONB;
  v_low_count INTEGER := 0;
  v_exp_count INTEGER := 0;
  v_checkpoint JSONB;
  v_today TEXT := to_char(CURRENT_DATE, 'YYYY-MM-DD');
  v_item RECORD;
  v_batch RECORD;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access Denied: Only Super Admin may trigger automation jobs.';
  END IF;

  UPDATE public.system_automations
  SET last_status = 'Running',
      last_run_at = now()
  WHERE job_key = p_job_key;

  IF p_job_key = 'daily_sync' THEN
    v_archived := public.archive_old_daily_inventories();
    v_result := jsonb_build_object(
      'job', p_job_key,
      'archived_count', v_archived->'archived_count',
      'cutoff_date', v_archived->'cutoff_date',
      'message', format('Daily sync pass: archived %s older worksheets.', v_archived->>'archived_count')
    );

  ELSIF p_job_key = 'low_stock_alert' THEN
    FOR v_item IN
      SELECT id, name, total_quantity, COALESCE(min_quantity, 10) AS min_qty, unit
      FROM public.inventory_items
      WHERE is_active = true AND total_quantity <= COALESCE(min_quantity, 10)
    LOOP
      INSERT INTO public.notifications (
        type, title, message, item_id, target_id, dedup_key, is_read, created_at
      ) VALUES (
        'LOW_STOCK',
        format('Low Stock: %s', v_item.name),
        format('%s is down to %s %s (threshold: %s).', v_item.name, v_item.total_quantity, COALESCE(v_item.unit, 'pcs'), v_item.min_qty),
        v_item.id,
        format('/items/%s', v_item.id),
        format('LOW_%s_%s', v_item.id, v_today),
        false,
        now()
      )
      ON CONFLICT (dedup_key) DO NOTHING;
      v_low_count := v_low_count + 1;
    END LOOP;

    v_result := jsonb_build_object(
      'job', p_job_key,
      'low_stock_items_evaluated', v_low_count,
      'message', format('Evaluated stock thresholds: %s items flagged for low stock.', v_low_count)
    );

  ELSIF p_job_key = 'expiry_check' THEN
    FOR v_batch IN
      SELECT b.id, b.item_id, b.expiry_date, b.quantity, ii.name AS item_name
      FROM public.stock_batches b
      JOIN public.inventory_items ii ON b.item_id = ii.id
      WHERE b.quantity > 0 AND b.expiry_date <= (CURRENT_DATE + interval '7 days')
    LOOP
      INSERT INTO public.notifications (
        type, title, message, item_id, target_id, dedup_key, is_read, created_at
      ) VALUES (
        'EXPIRING_SOON',
        format('Expiring Batch: %s', v_batch.item_name),
        format('Batch %s of %s expires on %s. Quantity: %s.', substring(v_batch.id::text, 1, 8), v_batch.item_name, v_batch.expiry_date, v_batch.quantity),
        v_batch.item_id,
        format('/items/%s', v_batch.item_id),
        format('EXP_%s_%s', v_batch.id, v_today),
        false,
        now()
      )
      ON CONFLICT (dedup_key) DO NOTHING;
      v_exp_count := v_exp_count + 1;
    END LOOP;

    v_result := jsonb_build_object(
      'job', p_job_key,
      'expiring_batches_flagged', v_exp_count,
      'message', format('Scanned expiry queues: %s batches within 7-day expiry threshold flagged.', v_exp_count)
    );

  ELSIF p_job_key = 'backup_snapshot' THEN
    v_checkpoint := public.create_recovery_checkpoint(
      format('Nightly Auto-Snapshot %s', v_today),
      'Automated background checkpoint captured via operational console',
      'DAILY',
      false
    );
    v_result := jsonb_build_object(
      'job', p_job_key,
      'checkpoint_code', v_checkpoint->'point_code',
      'message', format('Recovery point %s captured successfully.', v_checkpoint->>'point_code')
    );

  ELSE
    RAISE EXCEPTION 'Job key % is not configured or unsupported on this server.', p_job_key;
  END IF;

  v_duration_ms := (EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000)::INTEGER;

  UPDATE public.system_automations
  SET last_status = 'Success',
      last_duration_ms = v_duration_ms,
      last_error = NULL,
      updated_at = now()
  WHERE job_key = p_job_key;

  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
  VALUES (
    auth.uid(),
    'TRIGGER_AUTOMATION',
    'system_automations',
    p_job_key,
    jsonb_build_object(
      'job_key', p_job_key,
      'duration_ms', v_duration_ms,
      'result', v_result,
      'executed_at', now()
    )
  );

  RETURN jsonb_build_object('success', true, 'duration_ms', v_duration_ms, 'data', v_result);
EXCEPTION
  WHEN OTHERS THEN
    v_duration_ms := (EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000)::INTEGER;
    UPDATE public.system_automations
    SET last_status = 'Failed',
        last_duration_ms = v_duration_ms,
        last_error = SQLERRM,
        updated_at = now()
    WHERE job_key = p_job_key;
    RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_automation_job(TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_automation_job(TEXT) TO authenticated;
