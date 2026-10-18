-- ==============================================================================
-- KUVENTORY SUPER ADMIN OPERATIONS CONSOLE HARDENING
-- Migration: 20261018180000_super_admin_operations_console_hardening.sql
-- ==============================================================================

-- 1. EXTEND RECOVERY_POINTS AND SYSTEM_INCIDENTS SCHEMA
ALTER TABLE public.recovery_points 
  ADD COLUMN IF NOT EXISTS snapshot_payload JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.system_incidents 
  ADD COLUMN IF NOT EXISTS resolution_note TEXT;

-- 2. ARCHIVE OLD DAILY INVENTORIES RPC
-- Reads retention threshold from system_settings (key: super_retention_policy)
CREATE OR REPLACE FUNCTION public.archive_old_daily_inventories()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_threshold_days INTEGER := 30;
  v_setting_row RECORD;
  v_archived_count INTEGER := 0;
  v_cutoff_date DATE;
  v_actor_id UUID := auth.uid();
BEGIN
  -- Read threshold from system_settings if configured
  SELECT value INTO v_setting_row
  FROM public.system_settings
  WHERE key = 'super_retention_policy';

  IF v_setting_row.value IS NOT NULL AND (v_setting_row.value->>'sheet_archival_days') IS NOT NULL THEN
    v_threshold_days := GREATEST(7, LEAST(365, (v_setting_row.value->>'sheet_archival_days')::INTEGER));
  END IF;

  v_cutoff_date := CURRENT_DATE - (v_threshold_days || ' days')::INTERVAL;

  -- Archive finalized sheets older than cutoff date
  WITH archived AS (
    UPDATE public.daily_inventory
    SET state = 'ARCHIVED',
        updated_at = now()
    WHERE state = 'FINALIZED'
      AND inventory_date < v_cutoff_date
    RETURNING id
  )
  SELECT count(*) INTO v_archived_count FROM archived;

  -- Insert audit log
  INSERT INTO public.audit_logs (
    actor_id,
    action,
    target_table,
    new_data
  ) VALUES (
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

REVOKE EXECUTE ON FUNCTION public.archive_old_daily_inventories() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_old_daily_inventories() TO authenticated;


-- 3. READ-ONLY STOCK DRIFT ANALYSIS RPC
CREATE OR REPLACE FUNCTION public.analyze_stock_drift()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_results JSONB := '[]'::jsonb;
  v_discrepancy_count INTEGER := 0;
BEGIN
  IF NOT (public.is_admin() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied. Administrative authority required for stock drift analysis.';
  END IF;

  WITH batch_sums AS (
    SELECT 
      item_id,
      COALESCE(SUM(quantity), 0) AS total_batches_quantity,
      COUNT(id) AS active_batches_count
    FROM public.stock_batches
    WHERE quantity > 0
    GROUP BY item_id
  ),
  drift_calc AS (
    SELECT 
      i.id AS item_id,
      i.name AS item_name,
      i.unit,
      COALESCE(i.total_quantity, 0) AS current_quantity,
      COALESCE(b.total_batches_quantity, 0) AS batch_sum,
      (COALESCE(i.total_quantity, 0) - COALESCE(b.total_batches_quantity, 0)) AS drift_delta,
      COALESCE(b.active_batches_count, 0) AS active_batches_count,
      (COALESCE(i.total_quantity, 0) <> COALESCE(b.total_batches_quantity, 0)) AS has_drift
    FROM public.inventory_items i
    LEFT JOIN batch_sums b ON b.item_id = i.id
    WHERE i.is_active = true
    ORDER BY (COALESCE(i.total_quantity, 0) <> COALESCE(b.total_batches_quantity, 0)) DESC, i.name ASC
  )
  SELECT 
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'item_id', item_id,
        'item_name', item_name,
        'unit', unit,
        'current_quantity', current_quantity,
        'batch_sum', batch_sum,
        'drift_delta', drift_delta,
        'active_batches_count', active_batches_count,
        'has_drift', has_drift
      )
    ), '[]'::jsonb),
    COUNT(*) FILTER (WHERE has_drift = true)
  INTO v_results, v_discrepancy_count
  FROM drift_calc;

  RETURN jsonb_build_object(
    'success', true,
    'total_items_analyzed', (SELECT count(*) FROM public.inventory_items WHERE is_active = true),
    'discrepancy_count', v_discrepancy_count,
    'analyzed_at', now(),
    'items', v_results
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.analyze_stock_drift() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.analyze_stock_drift() TO authenticated;


-- 4. ATOMIC STOCK DRIFT REPAIR RPC
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
  v_reconciled_items JSONB := '[]'::jsonb;
  v_reconciled_count INTEGER := 0;
  r RECORD;
  v_new_total NUMERIC;
  v_old_total NUMERIC;
  v_delta NUMERIC;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied. Only Super Admin may execute atomic stock drift repairs.';
  END IF;

  FOR r IN
    SELECT 
      i.id AS item_id,
      i.name AS item_name,
      i.total_quantity AS old_quantity,
      COALESCE(SUM(b.quantity), 0) AS batch_sum
    FROM public.inventory_items i
    LEFT JOIN public.stock_batches b ON b.item_id = i.id AND b.quantity > 0
    WHERE i.is_active = true
      AND (p_item_ids IS NULL OR i.id = ANY(p_item_ids))
    GROUP BY i.id, i.name, i.total_quantity
    HAVING i.total_quantity <> COALESCE(SUM(b.quantity), 0)
    FOR UPDATE OF i
  LOOP
    v_old_total := r.old_quantity;
    v_new_total := r.batch_sum;
    v_delta := v_new_total - v_old_total;

    -- Update inventory item
    UPDATE public.inventory_items
    SET total_quantity = v_new_total,
        updated_at = now()
    WHERE id = r.item_id;

    -- Record in stock_movements ledger to preserve financial and inventory audit integrity
    INSERT INTO public.stock_movements (
      item_id,
      type,
      quantity_before,
      quantity_change,
      quantity_after,
      user_id,
      reason
    ) VALUES (
      r.item_id,
      'RECONCILIATION',
      v_old_total,
      v_delta,
      v_new_total,
      v_actor_id,
      COALESCE(p_reason, 'Super Admin Stock Drift Rebalance')
    );

    -- Log to audit_logs
    INSERT INTO public.audit_logs (
      actor_id,
      action,
      target_table,
      target_id,
      new_data
    ) VALUES (
      v_actor_id,
      'STOCK_DRIFT_RECONCILED',
      'inventory_items',
      r.item_id,
      jsonb_build_object(
        'item_id', r.item_id,
        'item_name', r.item_name,
        'old_quantity', v_old_total,
        'new_quantity', v_new_total,
        'delta', v_delta,
        'reason', p_reason
      )
    );

    v_reconciled_items := v_reconciled_items || jsonb_build_object(
      'item_id', r.item_id,
      'item_name', r.item_name,
      'old_quantity', v_old_total,
      'new_quantity', v_new_total,
      'delta', v_delta
    );

    v_reconciled_count := v_reconciled_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'reconciled_count', v_reconciled_count,
    'executed_at', now(),
    'reconciled_items', v_reconciled_items
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_stock_drift(UUID[], TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_stock_drift(UUID[], TEXT) TO authenticated;


-- 5. READ-ONLY DEPLETED BATCH SCANNER RPC
CREATE OR REPLACE FUNCTION public.scan_depleted_batches()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batches JSONB := '[]'::jsonb;
  v_count INTEGER := 0;
BEGIN
  IF NOT (public.is_admin() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied. Administrative authority required.';
  END IF;

  WITH depleted AS (
    SELECT 
      b.id AS batch_id,
      b.item_id,
      i.name AS item_name,
      b.expiry_date,
      b.quantity,
      b.created_at,
      (SELECT count(*) FROM public.stock_movements sm WHERE sm.batch_id = b.id) AS movement_count
    FROM public.stock_batches b
    JOIN public.inventory_items i ON i.id = b.item_id
    WHERE b.quantity = 0
    ORDER BY b.expiry_date ASC, b.created_at ASC
  )
  SELECT 
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'batch_id', batch_id,
        'item_id', item_id,
        'item_name', item_name,
        'expiry_date', expiry_date,
        'quantity', quantity,
        'created_at', created_at,
        'movement_count', movement_count
      )
    ), '[]'::jsonb),
    count(*)
  INTO v_batches, v_count
  FROM depleted;

  RETURN jsonb_build_object(
    'success', true,
    'depleted_batch_count', v_count,
    'batches', v_batches
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.scan_depleted_batches() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.scan_depleted_batches() TO authenticated;


-- 6. CONTROLLED DEPLETED BATCH CLEANUP RPC
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
  v_processed_count INTEGER := 0;
  r RECORD;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied. Only Super Admin may prune depleted batches.';
  END IF;

  IF p_batch_ids IS NULL OR array_length(p_batch_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', true, 'processed_count', 0, 'message', 'No batches specified.');
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
    END IF;

    -- Audit log
    INSERT INTO public.audit_logs (
      actor_id,
      action,
      target_table,
      target_id,
      new_data
    ) VALUES (
      v_actor_id,
      'DEPLETED_BATCH_CLEANED',
      'stock_batches',
      r.id,
      jsonb_build_object(
        'batch_id', r.id,
        'item_id', r.item_id,
        'movement_count', r.movement_count,
        'action_taken', CASE WHEN r.movement_count = 0 THEN 'DELETED' ELSE 'ARCHIVED' END,
        'reason', p_reason
      )
    );

    v_processed_count := v_processed_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_processed_count,
    'message', format('Successfully processed %s depleted batches.', v_processed_count)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_depleted_batches(UUID[], TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_depleted_batches(UUID[], TEXT) TO authenticated;


-- 7. INCIDENT MANAGEMENT RPCS
CREATE OR REPLACE FUNCTION public.create_manual_incident(
  p_title TEXT,
  p_description TEXT,
  p_severity TEXT,
  p_component TEXT,
  p_context JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_incident_id UUID;
  v_res JSONB;
BEGIN
  IF NOT (public.is_admin() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied. Administrative authority required to report incidents.';
  END IF;

  IF TRIM(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'Incident title is mandatory.';
  END IF;

  IF p_severity NOT IN ('CRITICAL', 'WARNING', 'INFO') THEN
    p_severity := 'WARNING';
  END IF;

  INSERT INTO public.system_incidents (
    title,
    description,
    severity,
    status,
    component,
    created_at
  ) VALUES (
    TRIM(p_title),
    TRIM(COALESCE(p_description, '')),
    p_severity,
    'OPEN',
    COALESCE(p_component, 'General System'),
    now()
  )
  RETURNING id INTO v_incident_id;

  -- Log to audit trail
  INSERT INTO public.audit_logs (
    actor_id,
    action,
    target_table,
    target_id,
    new_data
  ) VALUES (
    v_actor_id,
    'INCIDENT_CREATED',
    'system_incidents',
    v_incident_id,
    jsonb_build_object(
      'title', p_title,
      'severity', p_severity,
      'component', p_component,
      'context', p_context
    )
  );

  SELECT to_jsonb(si) INTO v_res FROM public.system_incidents si WHERE id = v_incident_id;
  RETURN v_res;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_manual_incident(TEXT, TEXT, TEXT, TEXT, JSONB) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_manual_incident(TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;


CREATE OR REPLACE FUNCTION public.update_incident_status(
  p_incident_id UUID,
  p_status TEXT,
  p_resolution_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_email TEXT;
  v_res JSONB;
BEGIN
  IF NOT (public.is_admin() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied. Administrative authority required to update incident status.';
  END IF;

  IF p_status NOT IN ('OPEN', 'INVESTIGATING', 'RESOLVED') THEN
    RAISE EXCEPTION 'Invalid incident status: %', p_status;
  END IF;

  -- Get actor display identity
  SELECT COALESCE(email, 'Super Admin') INTO v_actor_email
  FROM auth.users
  WHERE id = v_actor_id;

  UPDATE public.system_incidents
  SET status = p_status,
      resolution_note = CASE 
        WHEN p_resolution_note IS NOT NULL AND TRIM(p_resolution_note) <> '' 
        THEN TRIM(p_resolution_note) 
        ELSE resolution_note 
      END,
      resolved_at = CASE WHEN p_status = 'RESOLVED' THEN now() ELSE NULL END,
      resolved_by = CASE WHEN p_status = 'RESOLVED' THEN COALESCE(v_actor_email, 'Super Admin') ELSE NULL END
  WHERE id = p_incident_id;

  -- Log to audit trail
  INSERT INTO public.audit_logs (
    actor_id,
    action,
    target_table,
    target_id,
    new_data
  ) VALUES (
    v_actor_id,
    'INCIDENT_STATUS_UPDATED',
    'system_incidents',
    p_incident_id,
    jsonb_build_object(
      'status', p_status,
      'resolution_note', p_resolution_note,
      'resolved_by', v_actor_email
    )
  );

  SELECT to_jsonb(si) INTO v_res FROM public.system_incidents si WHERE id = p_incident_id;
  RETURN v_res;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_incident_status(UUID, TEXT, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_incident_status(UUID, TEXT, TEXT) TO authenticated;


-- 8. SESSION LEASE REVOCATION RPC
CREATE OR REPLACE FUNCTION public.revoke_user_session_lease(
  p_client_id TEXT,
  p_reason TEXT DEFAULT 'Super Admin Security Revocation'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_revoked_count INTEGER := 0;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied. Only Super Admin may revoke remote session leases.';
  END IF;

  UPDATE public.user_session_leases
  SET status = 'REVOKED',
      revoked_by = v_actor_id,
      revoked_at = now(),
      revocation_reason = COALESCE(p_reason, 'Super Admin Security Revocation')
  WHERE client_id = p_client_id
    AND status = 'ACTIVE';

  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

  -- Audit log
  INSERT INTO public.audit_logs (
    actor_id,
    action,
    target_table,
    target_id,
    new_data
  ) VALUES (
    v_actor_id,
    'SESSION_LEASE_REVOKED',
    'user_session_leases',
    p_client_id,
    jsonb_build_object(
      'client_id', p_client_id,
      'revoked_count', v_revoked_count,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'client_id', p_client_id,
    'revoked_count', v_revoked_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_user_session_lease(TEXT, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_user_session_lease(TEXT, TEXT) TO authenticated;
