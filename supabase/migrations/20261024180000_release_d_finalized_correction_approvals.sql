-- ============================================================================
-- MIGRATION: 20261024180000_release_d_finalized_correction_approvals.sql
-- Description:
--   Release D — Accidental Finalized-Day Correction Workflow and Two-Stage Approval:
--   1. Create public.daily_inventory_correction_requests table with auditable state machine.
--   2. Implement submit_correction_request() for Staff (leaves inventory untouched).
--   3. Implement admin_review_correction_request() with separation of duties (no self-approval).
--   4. Implement super_admin_approve_and_apply_correction() executing atomic stock reconciliation.
--   5. Implement apply_approved_daily_inventory_correction() with fail-closed atomic transaction.
--   6. Enforce RLS and explicit grants for requester, admin, and super admin.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CREATE public.daily_inventory_correction_requests TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_inventory_correction_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_inventory_id UUID NOT NULL REFERENCES public.daily_inventory(id) ON DELETE CASCADE,
  inventory_date DATE NOT NULL,
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL,
  expected_revision INTEGER NOT NULL DEFAULT 1,
  proposed_items JSONB NOT NULL,
  baseline_items JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_ADMIN' CHECK (
    status IN (
      'PENDING_ADMIN',
      'RETURNED_TO_REQUESTER',
      'REJECTED_BY_ADMIN',
      'PENDING_SUPER_ADMIN',
      'REJECTED_BY_SUPER_ADMIN',
      'APPLIED',
      'FAILED_REQUIRES_REVIEW'
    )
  ),
  admin_reviewer_id UUID REFERENCES public.profiles(id),
  admin_reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  super_admin_reviewer_id UUID REFERENCES public.profiles(id),
  super_admin_reviewed_at TIMESTAMPTZ,
  super_admin_notes TEXT,
  applied_at TIMESTAMPTZ,
  applied_revision_id UUID REFERENCES public.daily_inventory_revisions(id),
  idempotency_key TEXT UNIQUE,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_correction_reason_nonempty CHECK (length(trim(reason)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_corr_req_sheet ON public.daily_inventory_correction_requests(daily_inventory_id);
CREATE INDEX IF NOT EXISTS idx_corr_req_status ON public.daily_inventory_correction_requests(status);
CREATE INDEX IF NOT EXISTS idx_corr_req_requester ON public.daily_inventory_correction_requests(requested_by);

ALTER TABLE public.daily_inventory_correction_requests ENABLE ROW LEVEL SECURITY;

-- Read policies: Requesters see their own, Admins see all
DROP POLICY IF EXISTS "Requesters can read own correction requests" ON public.daily_inventory_correction_requests;
CREATE POLICY "Requesters can read own correction requests"
  ON public.daily_inventory_correction_requests FOR SELECT
  TO authenticated
  USING (
    requested_by = (SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN')
    )
  );

-- Direct client updates/deletes are strictly disabled; all mutations execute via RPCs
DROP POLICY IF EXISTS "No direct client mutation on correction requests" ON public.daily_inventory_correction_requests;
CREATE POLICY "No direct client mutation on correction requests"
  ON public.daily_inventory_correction_requests FOR UPDATE
  TO authenticated
  USING (false);

GRANT SELECT ON public.daily_inventory_correction_requests TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. SUBMIT CORRECTION REQUEST RPC (Staff, Admin, Super Admin)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_correction_request(
  p_daily_inventory_id UUID,
  p_reason TEXT,
  p_proposed_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_caller_name TEXT;
  v_sheet public.daily_inventory%ROWTYPE;
  v_baseline JSONB;
  v_req_id UUID;
  v_rev_count INT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to submit a correction request.';
  END IF;

  SELECT role, COALESCE(display_name, 'Staff Member') INTO v_caller_role, v_caller_name
  FROM public.profiles
  WHERE id = v_caller_id;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'A legitimate reason explaining why the finalized day requires correction is mandatory.';
  END IF;

  IF p_proposed_items IS NULL OR jsonb_array_length(p_proposed_items) = 0 THEN
    RAISE EXCEPTION 'At least one proposed item correction must be specified.';
  END IF;

  SELECT * INTO v_sheet
  FROM public.daily_inventory
  WHERE id = p_daily_inventory_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily inventory worksheet % does not exist.', p_daily_inventory_id;
  END IF;

  IF v_sheet.state != 'FINALIZED' THEN
    RAISE EXCEPTION 'Only finalized inventory sheets can have correction requests submitted. Current status: %', v_sheet.state;
  END IF;

  -- Capture exact baseline snapshot of current worksheet items
  SELECT jsonb_agg(row_to_json(dii.*)) INTO v_baseline
  FROM public.daily_inventory_items dii
  WHERE dii.daily_inventory_id = p_daily_inventory_id;

  -- Determine expected next revision
  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_rev_count
  FROM public.daily_inventory_revisions
  WHERE daily_inventory_id = p_daily_inventory_id;

  -- Insert pending correction request record
  INSERT INTO public.daily_inventory_correction_requests (
    daily_inventory_id,
    inventory_date,
    requested_by,
    reason,
    expected_revision,
    proposed_items,
    baseline_items,
    status,
    idempotency_key
  ) VALUES (
    p_daily_inventory_id,
    v_sheet.inventory_date,
    v_caller_id,
    trim(p_reason),
    v_rev_count,
    p_proposed_items,
    COALESCE(v_baseline, '[]'::jsonb),
    'PENDING_ADMIN',
    format('corr_%s_%s_%s', p_daily_inventory_id, v_caller_id, extract(epoch from now())::bigint)
  ) RETURNING id INTO v_req_id;

  -- Dispatch notification to Administrators for Stage 1 Review
  INSERT INTO public.notifications (
    type, title, message, target_id, dedup_key, created_at
  ) VALUES (
    'CORRECTION_REQUEST',
    format('Correction Request: %s', v_sheet.inventory_date),
    format('%s requested a correction for finalized worksheet (%s): "%s". Pending Admin Review.', v_caller_name, v_sheet.inventory_date, trim(p_reason)),
    '/admin',
    format('notif_corr_req_%s', v_req_id),
    now()
  );

  -- Audit trail
  INSERT INTO public.audit_logs (
    actor_id, action, target_table, target_id, new_data, reason
  ) VALUES (
    v_caller_id,
    'CORRECTION_REQUEST_SUBMITTED',
    'daily_inventory_correction_requests',
    v_req_id,
    jsonb_build_object(
      'daily_inventory_id', p_daily_inventory_id,
      'inventory_date', v_sheet.inventory_date,
      'reason', trim(p_reason)
    ),
    trim(p_reason)
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_req_id,
    'status', 'PENDING_ADMIN',
    'inventory_date', v_sheet.inventory_date,
    'message', 'Correction request submitted successfully. It is now queued for Stage 1 Admin review.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_correction_request(UUID, TEXT, JSONB) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. STAGE 1: ADMIN REVIEW RPC (Approve & Forward, Return, or Reject)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_review_correction_request(
  p_request_id UUID,
  p_decision TEXT,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_caller_name TEXT;
  v_req public.daily_inventory_correction_requests%ROWTYPE;
  v_clean_decision TEXT := upper(trim(COALESCE(p_decision, '')));
  v_clean_notes TEXT := trim(COALESCE(p_notes, ''));
  v_new_status TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;

  SELECT role, COALESCE(display_name, 'Administrator') INTO v_caller_role, v_caller_name
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only administrators can perform Stage 1 correction reviews.';
  END IF;

  SELECT * INTO v_req
  FROM public.daily_inventory_correction_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction request % not found.', p_request_id;
  END IF;

  IF v_req.status != 'PENDING_ADMIN' THEN
    RAISE EXCEPTION 'Request cannot be reviewed in current status: %', v_req.status;
  END IF;

  -- Separation of duties: Requester cannot review own request
  IF v_req.requested_by = v_caller_id THEN
    RAISE EXCEPTION 'Conflict of Interest: you cannot review a correction request that you submitted.';
  END IF;

  IF v_clean_decision = 'APPROVE_AND_FORWARD' THEN
    v_new_status := 'PENDING_SUPER_ADMIN';
  ELSIF v_clean_decision = 'RETURN' THEN
    IF v_clean_notes = '' THEN
      RAISE EXCEPTION 'Notes explaining what information is required are mandatory when returning a request.';
    END IF;
    v_new_status := 'RETURNED_TO_REQUESTER';
  ELSIF v_clean_decision = 'REJECT' THEN
    IF v_clean_notes = '' THEN
      RAISE EXCEPTION 'A rejection reason is mandatory.';
    END IF;
    v_new_status := 'REJECTED_BY_ADMIN';
  ELSE
    RAISE EXCEPTION 'Invalid decision "%". Must be APPROVE_AND_FORWARD, RETURN, or REJECT.', p_decision;
  END IF;

  UPDATE public.daily_inventory_correction_requests
  SET status = v_new_status,
      admin_reviewer_id = v_caller_id,
      admin_reviewed_at = now(),
      admin_notes = v_clean_notes,
      updated_at = now()
  WHERE id = p_request_id;

  -- Notifications
  IF v_new_status = 'PENDING_SUPER_ADMIN' THEN
    INSERT INTO public.notifications (
      type, title, message, target_id, dedup_key, created_at
    ) VALUES (
      'CORRECTION_STAGE2',
      format('Final Approval Needed: %s', v_req.inventory_date),
      format('Admin %s verified correction for %s. Awaiting Super Admin final approval.', v_caller_name, v_req.inventory_date),
      '/super-admin',
      format('notif_stage2_%s', p_request_id),
      now()
    );
  ELSE
    INSERT INTO public.notifications (
      type, title, message, target_id, dedup_key, created_at
    ) VALUES (
      'CORRECTION_STATUS',
      format('Correction Request %s: %s', v_new_status, v_req.inventory_date),
      format('Admin review complete: %s. Notes: %s', v_new_status, v_clean_notes),
      '/daily-inventory',
      format('notif_corr_status_%s_%s', p_request_id, v_new_status),
      now()
    );
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (
    actor_id, action, target_table, target_id, new_data, reason
  ) VALUES (
    v_caller_id,
    'ADMIN_REVIEW_CORRECTION_REQUEST',
    'daily_inventory_correction_requests',
    p_request_id,
    jsonb_build_object('decision', v_clean_decision, 'new_status', v_new_status),
    v_clean_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', v_new_status,
    'message', format('Correction request reviewed: %s.', v_new_status)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_correction_request(UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. ATOMIC APPLICATION OF APPROVED CORRECTION (Stage 2 RPC)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_approved_daily_inventory_correction(
  p_request_id UUID,
  p_super_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_caller_name TEXT;
  v_req public.daily_inventory_correction_requests%ROWTYPE;
  v_sheet public.daily_inventory%ROWTYPE;
  v_report_id UUID;
  v_rev_count INT;
  v_rev_id UUID;
  v_item RECORD;
  v_existing_item RECORD;
  v_item_id UUID;
  v_new_beg NUMERIC;
  v_new_add NUMERIC;
  v_new_am NUMERIC;
  v_new_pm NUMERIC;
  v_new_ending NUMERIC;
  v_delta_consumption NUMERIC;
  v_delta_add NUMERIC;
  v_stock_deltas JSONB := '[]'::jsonb;
  v_requester_name TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to approve and apply corrections.';
  END IF;

  SELECT role, COALESCE(display_name, 'Super Administrator') INTO v_caller_role, v_caller_name
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('SUPER_ADMIN', 'MASTER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only Super Administrators can give final approval and apply corrections.';
  END IF;

  -- 1. Lock correction request FOR UPDATE
  SELECT * INTO v_req
  FROM public.daily_inventory_correction_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction request % does not exist.', p_request_id;
  END IF;

  IF v_req.status != 'PENDING_SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Request cannot be applied: current status is "%". Required: PENDING_SUPER_ADMIN.', v_req.status;
  END IF;

  IF v_req.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Idempotency Violation: this correction request was already applied at %.', v_req.applied_at;
  END IF;

  -- Separation of duties: Requester cannot be Super Admin approver
  IF v_req.requested_by = v_caller_id THEN
    RAISE EXCEPTION 'Conflict of Interest: Super Administrator cannot grant final approval to their own correction request.';
  END IF;

  -- 2. Lock worksheet FOR UPDATE
  SELECT * INTO v_sheet
  FROM public.daily_inventory
  WHERE id = v_req.daily_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Worksheet % not found.', v_req.daily_inventory_id;
  END IF;

  IF v_sheet.state != 'FINALIZED' THEN
    RAISE EXCEPTION 'Worksheet is not in FINALIZED state (current: %). Correction cannot be applied.', v_sheet.state;
  END IF;

  SELECT COALESCE(display_name, 'Staff Requester') INTO v_requester_name
  FROM public.profiles
  WHERE id = v_req.requested_by;

  -- Determine next sequential revision number
  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_rev_count
  FROM public.daily_inventory_revisions
  WHERE daily_inventory_id = v_req.daily_inventory_id;

  SELECT id INTO v_report_id
  FROM public.reports
  WHERE daily_inventory_id = v_req.daily_inventory_id;

  -- 3. Atomic stock reconciliation & sheet update
  FOR v_item IN SELECT * FROM jsonb_to_recordset(v_req.proposed_items) AS x(
    item_id UUID, beg NUMERIC, add NUMERIC, am NUMERIC, pm NUMERIC, ending NUMERIC
  )
  LOOP
    v_item_id := v_item.item_id;
    v_new_beg := GREATEST(0, COALESCE(v_item.beg, 0));
    v_new_add := GREATEST(0, COALESCE(v_item.add, 0));
    v_new_am := GREATEST(0, COALESCE(v_item.am, 0));
    v_new_pm := GREATEST(0, COALESCE(v_item.pm, 0));
    v_new_ending := GREATEST(0, (v_new_beg + v_new_add - v_new_am - v_new_pm));

    SELECT * INTO v_existing_item
    FROM public.daily_inventory_items
    WHERE daily_inventory_id = v_req.daily_inventory_id AND item_id = v_item_id
    FOR UPDATE;

    IF FOUND THEN
      v_delta_consumption := (v_new_am + v_new_pm) - (COALESCE(v_existing_item.am, 0) + COALESCE(v_existing_item.pm, 0));
      v_delta_add := v_new_add - COALESCE(v_existing_item.add, 0);

      -- Transactional stock adjustment: if any fails, entire block rolls back
      IF v_delta_consumption > 0 THEN
        PERFORM public.consume_stock(
          v_item_id, 
          v_delta_consumption, 
          format('Approved Correction Req %s (Rev %s): Deducted %s consumption', p_request_id, v_rev_count, v_delta_consumption)
        );
      ELSIF v_delta_consumption < 0 THEN
        PERFORM public.add_stock(
          v_item_id, 
          abs(v_delta_consumption), 
          (CURRENT_DATE + interval '90 days')::DATE, 
          CURRENT_DATE, 
          format('Approved Correction Req %s (Rev %s): Restored %s consumption', p_request_id, v_rev_count, abs(v_delta_consumption))
        );
      END IF;

      IF v_delta_add > 0 THEN
        PERFORM public.add_stock(
          v_item_id, 
          v_delta_add, 
          (CURRENT_DATE + interval '90 days')::DATE, 
          CURRENT_DATE, 
          format('Approved Correction Req %s (Rev %s): +%s delivery adjustment', p_request_id, v_rev_count, v_delta_add)
        );
      ELSIF v_delta_add < 0 THEN
        PERFORM public.consume_stock(
          v_item_id, 
          abs(v_delta_add), 
          format('Approved Correction Req %s (Rev %s): -%s delivery reduction', p_request_id, v_rev_count, abs(v_delta_add))
        );
      END IF;

      -- Update base columns in daily_inventory_items (total & ending computed by PostgreSQL)
      UPDATE public.daily_inventory_items
      SET beg = v_new_beg,
          add = v_new_add,
          am = v_new_am,
          pm = v_new_pm
      WHERE id = v_existing_item.id;

      IF v_delta_consumption != 0 OR v_delta_add != 0 THEN
        v_stock_deltas := v_stock_deltas || jsonb_build_object(
          'item_id', v_item_id,
          'delta_consumption', v_delta_consumption,
          'delta_add', v_delta_add
        );
      END IF;

      -- Update report snapshot
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

  -- 4. Record auditable revision record
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
    v_req.daily_inventory_id,
    v_rev_count,
    v_sheet.inventory_date,
    v_req.reason,
    v_caller_id,
    format('%s (Approved by %s)', v_requester_name, v_caller_name),
    v_req.baseline_items,
    v_req.proposed_items,
    v_stock_deltas,
    now()
  ) RETURNING id INTO v_rev_id;

  -- 5. Mark request APPLIED
  UPDATE public.daily_inventory_correction_requests
  SET status = 'APPLIED',
      super_admin_reviewer_id = v_caller_id,
      super_admin_reviewed_at = now(),
      super_admin_notes = trim(COALESCE(p_super_admin_notes, '')),
      applied_at = now(),
      applied_revision_id = v_rev_id,
      updated_at = now()
  WHERE id = p_request_id;

  -- 6. Insert audit log
  INSERT INTO public.audit_logs (
    actor_id, action, target_table, target_id, new_data, reason
  ) VALUES (
    v_caller_id,
    'CORRECTION_APPLIED',
    'daily_inventory_correction_requests',
    p_request_id,
    jsonb_build_object(
      'revision_number', v_rev_count,
      'revision_id', v_rev_id,
      'stock_deltas', v_stock_deltas,
      'approver', v_caller_name
    ),
    v_req.reason
  );

  -- 7. Dispatch notification to Requester and Admin
  INSERT INTO public.notifications (
    type, title, message, target_id, dedup_key, created_at
  ) VALUES (
    'CORRECTION_APPLIED',
    format('Correction Applied (Rev #%s): %s', v_rev_count, v_sheet.inventory_date),
    format('Super Admin %s granted final approval. Revision #%s applied to inventory worksheet.', v_caller_name, v_rev_count),
    '/daily-inventory',
    format('notif_applied_%s', p_request_id),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'revision_number', v_rev_count,
    'applied_revision_id', v_rev_id,
    'stock_deltas', v_stock_deltas,
    'message', format('Successfully applied Revision #%s to finalized inventory sheet.', v_rev_count)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_approved_daily_inventory_correction(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. STAGE 2 SUPER ADMIN DECISION RPC (Approve or Reject)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_admin_review_correction_request(
  p_request_id UUID,
  p_decision TEXT,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_caller_name TEXT;
  v_clean_decision TEXT := upper(trim(COALESCE(p_decision, '')));
  v_clean_notes TEXT := trim(COALESCE(p_notes, ''));
  v_req public.daily_inventory_correction_requests%ROWTYPE;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;

  SELECT role, COALESCE(display_name, 'Super Administrator') INTO v_caller_role, v_caller_name
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('SUPER_ADMIN', 'MASTER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only Super Administrators can perform Stage 2 final approvals.';
  END IF;

  SELECT * INTO v_req
  FROM public.daily_inventory_correction_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction request % not found.', p_request_id;
  END IF;

  IF v_clean_decision = 'APPROVE' THEN
    -- Executes atomic application transaction
    RETURN public.apply_approved_daily_inventory_correction(p_request_id, v_clean_notes);
  ELSIF v_clean_decision = 'REJECT' THEN
    IF v_clean_notes = '' THEN
      RAISE EXCEPTION 'A rejection reason is mandatory.';
    END IF;

    UPDATE public.daily_inventory_correction_requests
    SET status = 'REJECTED_BY_SUPER_ADMIN',
        super_admin_reviewer_id = v_caller_id,
        super_admin_reviewed_at = now(),
        super_admin_notes = v_clean_notes,
        updated_at = now()
    WHERE id = p_request_id;

    INSERT INTO public.notifications (
      type, title, message, target_id, dedup_key, created_at
    ) VALUES (
      'CORRECTION_REJECTED',
      format('Correction Request Rejected: %s', v_req.inventory_date),
      format('Super Admin %s rejected correction request. Reason: %s', v_caller_name, v_clean_notes),
      '/daily-inventory',
      format('notif_rej_%s', p_request_id),
      now()
    );

    RETURN jsonb_build_object(
      'success', true,
      'status', 'REJECTED_BY_SUPER_ADMIN',
      'message', 'Correction request rejected by Super Administrator.'
    );
  ELSE
    RAISE EXCEPTION 'Invalid decision "%". Must be APPROVE or REJECT.', p_decision;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.super_admin_review_correction_request(UUID, TEXT, TEXT) TO authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
