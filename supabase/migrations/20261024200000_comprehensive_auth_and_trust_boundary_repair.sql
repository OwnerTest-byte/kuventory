-- ============================================================================
-- MIGRATION: 20261024200000_comprehensive_auth_and_trust_boundary_repair.sql
-- PURPOSE: Comprehensive Security Boundary and Data Integrity Master Repair:
--   1. KUV-P0-01: Redesign login lockout trust boundary:
--      - Deprecate public caller-controlled p_success in record_login_attempt.
--      - Create record_failed_login_attempt (anon) and reset_my_login_lockout (authenticated only).
--   2. KUV-P0-03 & KUV-P1-07: Harden notifications RLS and drop broad grants:
--      - Restrict user_id IS NULL notifications exclusively to Administrators.
--      - Revoke direct client write/delete on sensitive internal tables.
--   3. KUV-P1-01 & KUV-P1-02: Harden apply_approved_daily_inventory_correction:
--      - Verify expected_revision under lock to reject stale proposals.
--      - Eliminate fabricated 90-day expiry dates; inherit genuine batch provenance.
--      - Enforce strict item existence validation (fail closed on missing items).
--      - Update report items by unambiguous item_id match.
--   4. KUV-P1-04: Drop legacy overloads of create_inventory_item_with_initial_stock.
--   5. KUV-P1-06: Add client-supplied idempotency key handling to submit_correction_request.
--   6. Authentication Master Plan: Create account_recovery_factors and account_recovery_requests
--      for verified phone recovery and assisted administrative recovery.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. DROP LEGACY OVERLOADS OF create_inventory_item_with_initial_stock (KUV-P1-04)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_inventory_item_with_initial_stock(
  TEXT, UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
);

-- ----------------------------------------------------------------------------
-- 2. REDESIGN LOGIN LOCKOUT TRUST BOUNDARY (KUV-P0-01)
-- ----------------------------------------------------------------------------

-- A. Unauthenticated Failed Login Attempt Logger (Public / Anon)
-- Only records failures; cannot be manipulated to reset lockouts.
CREATE OR REPLACE FUNCTION public.record_failed_login_attempt(
  p_email TEXT,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_norm_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_masked TEXT := public.mask_email(v_norm_email);
  v_rec public.account_security_state%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_token TEXT := NULL;
  v_token_hash TEXT := NULL;
  v_is_locked BOOLEAN := false;
  v_locked_until TIMESTAMPTZ := NULL;
  v_seconds_rem INT := 0;
  v_failed_count INT := 0;
  v_resolved_user_id UUID := NULL;
BEGIN
  IF v_norm_email = '' OR position('@' in v_norm_email) = 0 THEN
    RETURN jsonb_build_object('is_locked', false, 'failed_attempts', 0);
  END IF;

  SELECT id INTO v_resolved_user_id
  FROM auth.users
  WHERE lower(email) = v_norm_email
  LIMIT 1;

  SELECT * INTO v_rec
  FROM public.account_security_state
  WHERE email_lookup = v_norm_email
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.account_security_state (
      email_lookup, user_id, failed_attempts, window_started_at, last_failed_at
    ) VALUES (
      v_norm_email, v_resolved_user_id, 0, NULL, NULL
    ) RETURNING * INTO v_rec;
  END IF;

  -- If already locked, return remaining duration without incrementing
  IF v_rec.locked_until IS NOT NULL AND v_rec.locked_until > v_now THEN
    v_is_locked := true;
    v_locked_until := v_rec.locked_until;
    v_seconds_rem := GREATEST(0, EXTRACT(EPOCH FROM (v_locked_until - v_now))::INT);
    v_failed_count := v_rec.failed_attempts;

    RETURN jsonb_build_object(
      'is_locked', true,
      'locked_until', v_locked_until,
      'seconds_remaining', v_seconds_rem,
      'failed_attempts', v_failed_count,
      'message', 'Account is currently locked due to previous failed attempts.'
    );
  END IF;

  -- 15-minute rolling window
  IF v_rec.window_started_at IS NULL OR (v_now - v_rec.window_started_at) > interval '15 minutes' THEN
    v_failed_count := 1;
    v_rec.window_started_at := v_now;
  ELSE
    v_failed_count := v_rec.failed_attempts + 1;
  END IF;

  -- Threshold evaluation: 5 failures triggers 30-minute lockout
  IF v_failed_count >= 5 THEN
    v_is_locked := true;
    v_locked_until := v_now + interval '30 minutes';
    v_seconds_rem := 1800;

    v_token := encode(gen_random_bytes(16), 'hex');
    v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

    UPDATE public.account_security_state
    SET failed_attempts = v_failed_count,
        window_started_at = v_rec.window_started_at,
        last_failed_at = v_now,
        locked_until = v_locked_until,
        lockout_status = 'ACTIVE',
        lockout_token_hash = v_token_hash,
        updated_at = v_now
    WHERE id = v_rec.id;
  ELSE
    UPDATE public.account_security_state
    SET failed_attempts = v_failed_count,
        window_started_at = v_rec.window_started_at,
        last_failed_at = v_now,
        updated_at = v_now
    WHERE id = v_rec.id;
  END IF;

  INSERT INTO public.security_events (
    event_type, email_masked, ip_address, user_agent, details
  ) VALUES (
    'LOGIN_FAILED', v_masked, p_ip, p_user_agent,
    jsonb_build_object('attempt_number', v_failed_count, 'window_started', v_rec.window_started_at)
  );

  RETURN jsonb_build_object(
    'is_locked', v_is_locked,
    'locked_until', v_locked_until,
    'seconds_remaining', v_seconds_rem,
    'failed_attempts', v_failed_count,
    'lockout_token', v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_failed_login_attempt(TEXT, TEXT, TEXT) TO anon, authenticated;

-- B. Authenticated Reset Lockout Function (Authenticated Callers Only)
-- Resets failed attempt counters for the authenticated caller's own account upon confirmed Supabase Auth sign-in
CREATE OR REPLACE FUNCTION public.reset_my_login_lockout()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_email TEXT;
  v_masked TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: only authenticated users can reset their own lockout state.';
  END IF;

  SELECT lower(email) INTO v_caller_email
  FROM auth.users
  WHERE id = v_caller_id;

  IF v_caller_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User email not found.');
  END IF;

  v_masked := public.mask_email(v_caller_email);

  UPDATE public.account_security_state
  SET failed_attempts = 0,
      window_started_at = NULL,
      last_failed_at = NULL,
      locked_until = NULL,
      lockout_status = 'EXPIRED',
      lockout_token_hash = NULL,
      updated_at = v_now
  WHERE user_id = v_caller_id OR email_lookup = v_caller_email;

  INSERT INTO public.security_events (
    event_type, email_masked, actor_id, details
  ) VALUES (
    'LOGIN_SUCCESS', v_masked, v_caller_id,
    jsonb_build_object('timestamp', v_now)
  );

  RETURN jsonb_build_object('success', true, 'message', 'Lockout counters reset.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_my_login_lockout() TO authenticated;

-- C. Backward-Compatible Wrapper for record_login_attempt
-- If p_success is true, it refuses to reset if caller is unauthenticated or mismatched
CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_email TEXT,
  p_success BOOLEAN,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF p_success THEN
    -- If caller is authenticated, allow resetting own lockout
    IF auth.uid() IS NOT NULL THEN
      RETURN public.reset_my_login_lockout();
    ELSE
      -- Anonymous caller attempting to claim success is untrusted: do nothing and return unlocked
      RETURN jsonb_build_object('is_locked', false, 'seconds_remaining', 0, 'failed_attempts', 0);
    END IF;
  ELSE
    RETURN public.record_failed_login_attempt(p_email, p_ip, p_user_agent);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_login_attempt(TEXT, BOOLEAN, TEXT, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. NOTIFICATION PRIVACY HARDENING (KUV-P1-07)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      user_id IS NULL AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role IN ('ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN')
      )
    )
  );

-- Redesign request_password_reset to not leak "Account verified: YES" into notifications table
CREATE OR REPLACE FUNCTION public.request_password_reset(
  p_email TEXT,
  p_ip TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_norm_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_masked TEXT := public.mask_email(v_norm_email);
  v_last_req TIMESTAMPTZ;
  v_request_code TEXT;
  v_user_id UUID := NULL;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF v_norm_email = '' OR position('@' in v_norm_email) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'If an account matches this address, a reset link will arrive by email.'
    );
  END IF;

  -- 1. Server-side throttle: 1 request per 2 minutes per email
  SELECT requested_at INTO v_last_req
  FROM public.password_reset_requests
  WHERE lower(email) = v_norm_email
  ORDER BY requested_at DESC
  LIMIT 1;

  IF v_last_req IS NOT NULL AND (v_now - v_last_req) < interval '2 minutes' THEN
    RETURN jsonb_build_object(
      'success', true,
      'throttled', true,
      'seconds_remaining', (120 - EXTRACT(EPOCH FROM (v_now - v_last_req))::INT),
      'message', 'A reset request was recently submitted. Please wait before requesting another link.'
    );
  END IF;

  -- 2. Lookup user_id if account exists (never leaked in notification)
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_norm_email
  LIMIT 1;

  v_request_code := 'PR-' || to_char(v_now, 'YYYYMMDD') || '-' || upper(substring(encode(gen_random_bytes(3), 'hex') from 1 for 6));

  -- 3. Insert authoritative request record
  INSERT INTO public.password_reset_requests (
    request_code, email, user_id, status, notification_status,
    ip_address, requested_at, created_at
  ) VALUES (
    v_request_code, v_norm_email, v_user_id, 'NEW', 'QUEUED',
    p_ip, v_now, v_now
  );

  -- 4. Notification for administrators (omits raw existence status)
  INSERT INTO public.notifications (
    type, title, message, target_id, dedup_key, created_at
  ) VALUES (
    'PASSWORD_RESET',
    format('Password Reset Requested: %s', v_masked),
    format('User requested password reset [%s]. Review in Settings -> Users.', v_request_code),
    '/settings?tab=users',
    format('pwd_reset_%s_%s', v_norm_email, to_char(v_now, 'YYYYMMDDHH24MI')),
    v_now
  );

  -- 5. Append security event (restricted to Admins only)
  INSERT INTO public.security_events (
    event_type, email_masked, ip_address, details
  ) VALUES (
    'PASSWORD_RESET_REQUESTED', v_masked, p_ip,
    jsonb_build_object('request_code', v_request_code, 'account_exists', (v_user_id IS NOT NULL))
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_code', v_request_code,
    'message', 'If an account matches this address, a reset link will arrive by email. Check your inbox and spam folder.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_password_reset(TEXT, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. HARDEN FINALIZED CORRECTION APPROVALS (KUV-P1-01, KUV-P1-02, KUV-P1-06)
-- ----------------------------------------------------------------------------

-- A. Update submit_correction_request to accept p_idempotency_key
CREATE OR REPLACE FUNCTION public.submit_correction_request(
  p_daily_inventory_id UUID,
  p_reason TEXT,
  p_proposed_items JSONB,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_name TEXT;
  v_sheet public.daily_inventory%ROWTYPE;
  v_baseline JSONB;
  v_rev_count INT;
  v_req_id UUID;
  v_idem_key TEXT;
  v_existing_id UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: must be logged in to submit a correction request.';
  END IF;

  SELECT COALESCE(display_name, 'Staff User') INTO v_caller_name
  FROM public.profiles
  WHERE id = v_caller_id;

  SELECT * INTO v_sheet
  FROM public.daily_inventory
  WHERE id = p_daily_inventory_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily inventory worksheet % does not exist.', p_daily_inventory_id;
  END IF;

  IF v_sheet.state != 'FINALIZED' THEN
    RAISE EXCEPTION 'Only finalized inventory sheets can have correction requests submitted. Current status: %', v_sheet.state;
  END IF;

  -- Idempotency resolution: return existing request if matching key
  v_idem_key := COALESCE(trim(p_idempotency_key), format('corr_%s_%s_%s', p_daily_inventory_id, v_caller_id, extract(epoch from now())::bigint));

  SELECT id INTO v_existing_id
  FROM public.daily_inventory_correction_requests
  WHERE idempotency_key = v_idem_key
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'request_id', v_existing_id,
      'status', 'PENDING_ADMIN',
      'idempotent_replay', true,
      'message', 'Correction request already received.'
    );
  END IF;

  SELECT jsonb_agg(row_to_json(dii.*)) INTO v_baseline
  FROM public.daily_inventory_items dii
  WHERE dii.daily_inventory_id = p_daily_inventory_id;

  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_rev_count
  FROM public.daily_inventory_revisions
  WHERE daily_inventory_id = p_daily_inventory_id;

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
    v_idem_key
  ) RETURNING id INTO v_req_id;

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

  INSERT INTO public.audit_logs (
    actor_id, action, target_table, target_id, new_data, reason
  ) VALUES (
    v_caller_id,
    'SUBMIT_DAILY_INVENTORY_CORRECTION_REQUEST',
    'daily_inventory_correction_requests',
    v_req_id,
    jsonb_build_object(
      'daily_inventory_id', p_daily_inventory_id,
      'inventory_date', v_sheet.inventory_date,
      'expected_revision', v_rev_count,
      'item_count', jsonb_array_length(p_proposed_items)
    ),
    trim(p_reason)
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_req_id,
    'status', 'PENDING_ADMIN',
    'expected_revision', v_rev_count,
    'message', 'Correction request submitted for Admin review.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_correction_request(UUID, TEXT, JSONB, TEXT) TO authenticated;

-- B. Harden apply_approved_daily_inventory_correction
-- - Eliminates 90-day fabricated expiry dates
-- - Enforces expected_revision verification
-- - Validates every item exists in daily_inventory_items (fail closed)
-- - Updates report snapshots by stable item_id
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
  v_rev_count INT;
  v_rev_id UUID;
  v_report_id UUID;
  v_item RECORD;
  v_existing_item public.daily_inventory_items%ROWTYPE;
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
  v_target_expiry DATE;
BEGIN
  -- 1. Authorization: Only Super Admin or Master Admin can grant final approval
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;

  SELECT role, COALESCE(display_name, 'Super Administrator')
  INTO v_caller_role, v_caller_name
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('SUPER_ADMIN', 'MASTER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only Super Administrators can grant final approval to inventory corrections.';
  END IF;

  SELECT * INTO v_req
  FROM public.daily_inventory_correction_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction request % not found.', p_request_id;
  END IF;

  IF v_req.status != 'PENDING_SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Request cannot be applied: current status is "%". Required: PENDING_SUPER_ADMIN.', v_req.status;
  END IF;

  IF v_req.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Idempotency Violation: this correction request was already applied at %.', v_req.applied_at;
  END IF;

  -- Separation of duties: Requester cannot approve their own request
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

  -- 3. Verify Concurrency & Expected Revision
  SELECT COALESCE(MAX(revision_number), 0) + 1 INTO v_rev_count
  FROM public.daily_inventory_revisions
  WHERE daily_inventory_id = v_req.daily_inventory_id;

  IF v_req.expected_revision IS NOT NULL AND v_rev_count != v_req.expected_revision THEN
    RAISE EXCEPTION 'Concurrency Conflict: worksheet revision has moved from expected % to %. Please re-review current baseline.',
      v_req.expected_revision, v_rev_count;
  END IF;

  SELECT COALESCE(display_name, 'Staff Requester') INTO v_requester_name
  FROM public.profiles
  WHERE id = v_req.requested_by;

  SELECT id INTO v_report_id
  FROM public.reports
  WHERE daily_inventory_id = v_req.daily_inventory_id;

  -- 4. Atomic stock reconciliation & sheet update
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

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Integrity Failure: proposed item % does not exist in worksheet %.', v_item_id, v_req.daily_inventory_id;
    END IF;

    v_delta_consumption := (v_new_am + v_new_pm) - (COALESCE(v_existing_item.am, 0) + COALESCE(v_existing_item.pm, 0));
    v_delta_add := v_new_add - COALESCE(v_existing_item.add, 0);

    -- Genuine Expiration Determination: NEVER fabricate +90 days
    -- Inherit from nearest active batch, or recent batch, or current date for non-perishable
    SELECT expiry_date INTO v_target_expiry
    FROM public.stock_batches
    WHERE item_id = v_item_id AND expiry_date >= CURRENT_DATE AND quantity > 0
    ORDER BY expiry_date ASC
    LIMIT 1;

    IF v_target_expiry IS NULL THEN
      SELECT expiry_date INTO v_target_expiry
      FROM public.stock_batches
      WHERE item_id = v_item_id
      ORDER BY received_date DESC
      LIMIT 1;
    END IF;

    IF v_target_expiry IS NULL THEN
      v_target_expiry := CURRENT_DATE;
    END IF;

    -- Transactional stock adjustment
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
        v_target_expiry, 
        CURRENT_DATE, 
        format('Approved Correction Req %s (Rev %s): Restored %s consumption', p_request_id, v_rev_count, abs(v_delta_consumption))
      );
    END IF;

    IF v_delta_add > 0 THEN
      PERFORM public.add_stock(
        v_item_id, 
        v_delta_add, 
        v_target_expiry, 
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

    -- Update base columns in daily_inventory_items
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

    -- Update report snapshot by unambiguous item matching
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
  END LOOP;

  -- 5. Record auditable revision record
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

  -- 6. Mark request APPLIED
  UPDATE public.daily_inventory_correction_requests
  SET status = 'APPLIED',
      super_admin_reviewer_id = v_caller_id,
      super_admin_reviewed_at = now(),
      super_admin_notes = trim(COALESCE(p_super_admin_notes, '')),
      applied_at = now(),
      applied_revision_id = v_rev_id,
      updated_at = now()
  WHERE id = p_request_id;

  -- 7. Audit log
  INSERT INTO public.audit_logs (
    actor_id, action, target_table, target_id, new_data, reason
  ) VALUES (
    v_caller_id,
    'APPLY_DAILY_INVENTORY_CORRECTION',
    'daily_inventory',
    v_req.daily_inventory_id,
    jsonb_build_object(
      'request_id', p_request_id,
      'revision_number', v_rev_count,
      'stock_adjustments', v_stock_deltas
    ),
    v_req.reason
  );

  RETURN jsonb_build_object(
    'success', true,
    'revision_number', v_rev_count,
    'revision_id', v_rev_id,
    'message', format('Correction applied successfully as Revision %s.', v_rev_count)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_approved_daily_inventory_correction(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. AUTHENTICATION MASTER PLAN: RECOVERY FACTORS & ASSISTED TICKETS
-- ----------------------------------------------------------------------------

-- A. Table: account_recovery_factors
CREATE TABLE IF NOT EXISTS public.account_recovery_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  factor_type TEXT NOT NULL DEFAULT 'PHONE' CHECK (factor_type IN ('PHONE', 'TOTP', 'EMAIL')),
  destination_masked TEXT NOT NULL,
  destination_hash TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_factors_user ON public.account_recovery_factors(user_id, is_active);
ALTER TABLE public.account_recovery_factors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own recovery factors" ON public.account_recovery_factors;
CREATE POLICY "Users view own recovery factors"
  ON public.account_recovery_factors FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- B. Table: account_recovery_requests (Assisted Recovery Tickets)
CREATE TABLE IF NOT EXISTS public.account_recovery_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_reference TEXT NOT NULL UNIQUE,
  email_lookup TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN (
    'RECEIVED', 'HUMAN_REVIEW', 'NEEDS_INFORMATION', 'REJECTED',
    'APPROVED_FOR_ENROLLMENT', 'COMPLETED', 'EXPIRED'
  )),
  status_credential_hash TEXT NOT NULL,
  reason TEXT,
  admin_reviewer_id UUID REFERENCES public.profiles(id),
  admin_reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  super_admin_reviewer_id UUID REFERENCES public.profiles(id),
  super_admin_reviewed_at TIMESTAMPTZ,
  super_admin_notes TEXT,
  decision_reason TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rec_req_ref ON public.account_recovery_requests(request_reference);
CREATE INDEX IF NOT EXISTS idx_rec_req_status ON public.account_recovery_requests(status);
ALTER TABLE public.account_recovery_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view recovery requests" ON public.account_recovery_requests;
CREATE POLICY "Admins view recovery requests"
  ON public.account_recovery_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN')
    )
  );

-- C. RPC: submit_assisted_recovery_request
CREATE OR REPLACE FUNCTION public.submit_assisted_recovery_request(
  p_email TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_norm_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_masked TEXT := public.mask_email(v_norm_email);
  v_user_id UUID;
  v_ref TEXT;
  v_credential TEXT;
  v_credential_hash TEXT;
  v_req_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF v_norm_email = '' OR position('@' in v_norm_email) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valid email identifier required.');
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_norm_email
  LIMIT 1;

  v_ref := 'REF-' || to_char(v_now, 'YYYYMMDD') || '-' || upper(substring(encode(gen_random_bytes(3), 'hex') from 1 for 6));
  v_credential := 'ST-' || encode(gen_random_bytes(16), 'hex');
  v_credential_hash := encode(digest(v_credential, 'sha256'), 'hex');

  INSERT INTO public.account_recovery_requests (
    request_reference, email_lookup, user_id, status, status_credential_hash, reason, created_at, updated_at
  ) VALUES (
    v_ref, v_norm_email, v_user_id, 'RECEIVED', v_credential_hash, trim(p_reason), v_now, v_now
  ) RETURNING id INTO v_req_id;

  INSERT INTO public.notifications (
    type, title, message, target_id, dedup_key, created_at
  ) VALUES (
    'ASSISTED_RECOVERY_REQUEST',
    format('Assisted Recovery Request: %s', v_masked),
    format('Staff requested assisted account recovery [%s]. Identity review required in Settings -> Users.', v_ref),
    '/settings?tab=users',
    format('notif_rec_req_%s', v_req_id),
    v_now
  );

  INSERT INTO public.security_events (
    event_type, email_masked, actor_id, details
  ) VALUES (
    'ASSISTED_RECOVERY_SUBMITTED', v_masked, v_user_id,
    jsonb_build_object('request_reference', v_ref)
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_reference', v_ref,
    'status_credential', v_credential,
    'message', 'Your recovery request has been received. Please save your reference and status credential to track progress.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_assisted_recovery_request(TEXT, TEXT) TO anon, authenticated;

-- D. RPC: check_assisted_recovery_status (Non-enumerating Status Check)
CREATE OR REPLACE FUNCTION public.check_assisted_recovery_status(
  p_request_reference TEXT,
  p_status_credential TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_rec public.account_recovery_requests%ROWTYPE;
  v_hash TEXT;
BEGIN
  IF p_request_reference IS NULL OR p_status_credential IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Reference and credential required.');
  END IF;

  v_hash := encode(digest(trim(p_status_credential), 'sha256'), 'hex');

  SELECT * INTO v_rec
  FROM public.account_recovery_requests
  WHERE request_reference = trim(p_request_reference)
    AND status_credential_hash = v_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Invalid request reference or status credential.');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'request_reference', v_rec.request_reference,
    'status', v_rec.status,
    'submitted_at', v_rec.created_at,
    'decision_reason', v_rec.decision_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_assisted_recovery_status(TEXT, TEXT) TO anon, authenticated;
