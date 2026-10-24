-- ============================================================================
-- MIGRATION: 20261025120000_assisted_recovery_and_lockout_authoritative_repair.sql
-- PURPOSE: Complete the account recovery, cooldown, and login-lockout repair:
--   1. Atomic server-side 2-minute throttle on submit_assisted_recovery_request
--      (advisory transaction lock => two simultaneous requests can never both
--      bypass the cooldown). Every response now carries server_now,
--      next_allowed_at, and seconds_remaining so clients derive countdowns
--      from authoritative timestamps instead of local decrementing state.
--   2. New check_assisted_recovery_cooldown(): side-effect-free authoritative
--      cooldown lookup so a reopened dialog can reconcile without creating
--      a ticket.
--   3. Login lockout RPCs (record_failed_login_attempt, check_account_lockout,
--      check_lockout_status_by_token) now return server_now plus an explicit
--      machine-readable status (LOCKED / UNLOCKED / EXPIRED / ADMIN_UNLOCKED /
--      NOT_FOUND) so a transport failure can never be confused with an
--      unlocked account.
--   4. New review_assisted_recovery_request(): the missing administrator
--      review/decision stage for account_recovery_requests. Performs the
--      authorized password reset server-side and marks the ticket COMPLETED
--      only when that reset actually succeeds (single transaction: any failure
--      rolls the ticket back to its prior state).
--   5. RLS repairs: retire the stale MASTER_ADMIN reference on
--      account_recovery_requests and make the ASSISTED_RECOVERY_REQUEST
--      notification type visible to administrators.
-- Forward-only. No historical migration is edited.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. AUTHORITATIVE, ATOMICALLY THROTTLED submit_assisted_recovery_request
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_assisted_recovery_request(
  p_email TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
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
  v_last TIMESTAMPTZ;
  v_next_allowed TIMESTAMPTZ;
  v_seconds_rem INT;
  v_cooldown CONSTANT INTERVAL := interval '2 minutes';
BEGIN
  IF v_norm_email = '' OR position('@' in v_norm_email) = 0 THEN
    RETURN jsonb_build_object(
      'accepted', false,
      'error', 'Valid email identifier required.',
      'server_now', v_now
    );
  END IF;

  -- Serialize concurrent submissions for the same identifier inside one
  -- transaction: the second caller blocks until the first commits, then sees
  -- the authoritative row and is throttled. Two racing clients can never both
  -- create tickets.
  PERFORM pg_advisory_xact_lock(hashtext('kuventory_assisted_recovery:' || v_norm_email)::bigint);

  SELECT max(created_at) INTO v_last
  FROM public.account_recovery_requests
  WHERE email_lookup = v_norm_email;

  IF v_last IS NOT NULL AND (v_now - v_last) < v_cooldown THEN
    v_next_allowed := v_last + v_cooldown;
    v_seconds_rem := GREATEST(0, EXTRACT(EPOCH FROM (v_next_allowed - v_now))::INT);

    INSERT INTO public.security_events (
      event_type, email_masked, details
    ) VALUES (
      'ASSISTED_RECOVERY_THROTTLED', v_masked,
      jsonb_build_object('seconds_remaining', v_seconds_rem)
    );

    -- Generic message: never confirms whether the account exists and never
    -- re-issues the reference or credential (plaintext credential is not
    -- stored and cannot be recovered).
    RETURN jsonb_build_object(
      'accepted', false,
      'throttled', true,
      'existing_request', true,
      'server_now', v_now,
      'next_allowed_at', v_next_allowed,
      'seconds_remaining', v_seconds_rem,
      'message', 'A recovery request for this identifier was recently submitted. Please wait before submitting another.'
    );
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
    'accepted', true,
    'throttled', false,
    'server_now', v_now,
    'next_allowed_at', v_now + v_cooldown,
    'seconds_remaining', EXTRACT(EPOCH FROM v_cooldown)::INT,
    'request_reference', v_ref,
    'status_credential', v_credential,
    'message', 'Your recovery request has been received. Save your request reference and status credential to track progress.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_assisted_recovery_request(TEXT, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. SIDE-EFFECT-FREE COOLDOWN CHECK (reopened dialog / reload reconciliation)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_assisted_recovery_cooldown(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_norm_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_now TIMESTAMPTZ := now();
  v_last TIMESTAMPTZ;
  v_next_allowed TIMESTAMPTZ;
  v_seconds_rem INT := 0;
  v_cooldown CONSTANT INTERVAL := interval '2 minutes';
BEGIN
  IF v_norm_email = '' OR position('@' in v_norm_email) = 0 THEN
    RETURN jsonb_build_object(
      'valid', false,
      'can_submit', false,
      'server_now', v_now,
      'message', 'Enter your account login identifier to check availability.'
    );
  END IF;

  SELECT max(created_at) INTO v_last
  FROM public.account_recovery_requests
  WHERE email_lookup = v_norm_email;

  IF v_last IS NOT NULL AND (v_now - v_last) < v_cooldown THEN
    v_next_allowed := v_last + v_cooldown;
    v_seconds_rem := GREATEST(0, EXTRACT(EPOCH FROM (v_next_allowed - v_now))::INT);

    RETURN jsonb_build_object(
      'valid', true,
      'can_submit', false,
      'server_now', v_now,
      'next_allowed_at', v_next_allowed,
      'seconds_remaining', v_seconds_rem,
      'message', 'A recovery request was recently submitted for this identifier. Please wait before submitting another.'
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'can_submit', true,
    'server_now', v_now,
    'next_allowed_at', NULL,
    'seconds_remaining', 0,
    'message', 'You may submit a recovery request now.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_assisted_recovery_cooldown(TEXT) TO anon, authenticated;

-- 2b. check_assisted_recovery_status: same non-enumerating contract, now also
--     returning resolved_at so requesters can see when a decision was made.
--     Administrator notes are NEVER exposed — only the requester-visible
--     decision_reason.
CREATE OR REPLACE FUNCTION public.check_assisted_recovery_status(
  p_request_reference TEXT,
  p_status_credential TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
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
    'resolved_at', v_rec.resolved_at,
    'decision_reason', v_rec.decision_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_assisted_recovery_status(TEXT, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. LOGIN LOCKOUT RPCs WITH server_now + EXPLICIT STATUS CONTRACT
-- ----------------------------------------------------------------------------

-- A. record_failed_login_attempt (adds server_now; policy unchanged:
--      5 failures in 15 minutes -> 30-minute lockout)
CREATE OR REPLACE FUNCTION public.record_failed_login_attempt(
  p_email TEXT,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
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
    RETURN jsonb_build_object(
      'status', 'UNLOCKED', 'is_locked', false, 'failed_attempts', 0,
      'seconds_remaining', 0, 'server_now', v_now
    );
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

  -- If already locked, return the authoritative remaining duration without
  -- incrementing the counter.
  IF v_rec.locked_until IS NOT NULL AND v_rec.locked_until > v_now THEN
    RETURN jsonb_build_object(
      'status', 'LOCKED',
      'is_locked', true,
      'locked_until', v_rec.locked_until,
      'seconds_remaining', GREATEST(0, EXTRACT(EPOCH FROM (v_rec.locked_until - v_now))::INT),
      'failed_attempts', v_rec.failed_attempts,
      'server_now', v_now,
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

  -- Threshold evaluation: 5 failures triggers a 30-minute lockout
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

    INSERT INTO public.security_events (
      event_type, email_masked, ip_address, user_agent, details
    ) VALUES (
      'ACCOUNT_LOCKED', v_masked, p_ip, p_user_agent,
      jsonb_build_object(
        'failed_attempts', v_failed_count,
        'locked_until', v_locked_until,
        'duration_minutes', 30
      )
    );
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
    'status', CASE WHEN v_is_locked THEN 'LOCKED' ELSE 'UNLOCKED' END,
    'is_locked', v_is_locked,
    'locked_until', v_locked_until,
    'seconds_remaining', v_seconds_rem,
    'failed_attempts', v_failed_count,
    'lockout_token', v_token,
    'server_now', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_failed_login_attempt(TEXT, TEXT, TEXT) TO anon, authenticated;

-- B. check_account_lockout (adds server_now + explicit status)
CREATE OR REPLACE FUNCTION public.check_account_lockout(
  p_email TEXT,
  p_ip TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_norm_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_rec public.account_security_state%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_token TEXT := NULL;
  v_token_hash TEXT := NULL;
BEGIN
  IF v_norm_email = '' THEN
    RETURN jsonb_build_object(
      'status', 'UNLOCKED', 'is_locked', false, 'failed_attempts', 0, 'server_now', v_now
    );
  END IF;

  SELECT * INTO v_rec
  FROM public.account_security_state
  WHERE email_lookup = v_norm_email;

  IF NOT FOUND OR v_rec.locked_until IS NULL OR v_rec.locked_until <= v_now THEN
    RETURN jsonb_build_object(
      'status', CASE WHEN v_rec.locked_until IS NOT NULL AND v_rec.locked_until <= v_now THEN 'EXPIRED' ELSE 'UNLOCKED' END,
      'is_locked', false,
      'locked_until', NULL,
      'seconds_remaining', 0,
      'failed_attempts', COALESCE(v_rec.failed_attempts, 0),
      'server_now', v_now
    );
  END IF;

  -- Actively locked: issue an opaque polling token when none exists yet
  IF v_rec.lockout_token_hash IS NULL THEN
    v_token := encode(gen_random_bytes(16), 'hex');
    v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

    UPDATE public.account_security_state
    SET lockout_token_hash = v_token_hash
    WHERE id = v_rec.id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'LOCKED',
    'is_locked', true,
    'locked_until', v_rec.locked_until,
    'seconds_remaining', GREATEST(0, EXTRACT(EPOCH FROM (v_rec.locked_until - v_now))::INT),
    'failed_attempts', v_rec.failed_attempts,
    'lockout_token', v_token,
    'server_now', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_account_lockout(TEXT, TEXT) TO anon, authenticated;

-- C. check_lockout_status_by_token (adds server_now + explicit status that
--    distinguishes early administrative unlock from ordinary expiry)
CREATE OR REPLACE FUNCTION public.check_lockout_status_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_hash TEXT;
  v_rec public.account_security_state%ROWTYPE;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object(
      'status', 'NOT_FOUND', 'is_locked', false, 'was_unlocked', false,
      'token_valid', false, 'seconds_remaining', 0, 'server_now', v_now
    );
  END IF;

  v_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_rec
  FROM public.account_security_state
  WHERE lockout_token_hash = v_hash;

  IF NOT FOUND THEN
    -- Token no longer matches any active lock: it was cleared by an
    -- authorized administrative unlock (unlock_account NULLs the hash).
    RETURN jsonb_build_object(
      'status', 'NOT_FOUND',
      'is_locked', false,
      'was_unlocked', true,
      'token_valid', false,
      'locked_until', NULL,
      'seconds_remaining', 0,
      'server_now', v_now
    );
  END IF;

  IF v_rec.lockout_status = 'UNLOCKED' THEN
    RETURN jsonb_build_object(
      'status', 'ADMIN_UNLOCKED',
      'is_locked', false,
      'was_unlocked', true,
      'token_valid', true,
      'locked_until', NULL,
      'seconds_remaining', 0,
      'server_now', v_now
    );
  END IF;

  IF v_rec.locked_until IS NULL OR v_rec.locked_until <= v_now THEN
    RETURN jsonb_build_object(
      'status', 'EXPIRED',
      'is_locked', false,
      'was_unlocked', false,
      'token_valid', true,
      'locked_until', NULL,
      'seconds_remaining', 0,
      'server_now', v_now
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'LOCKED',
    'is_locked', true,
    'was_unlocked', false,
    'token_valid', true,
    'locked_until', v_rec.locked_until,
    'seconds_remaining', GREATEST(0, EXTRACT(EPOCH FROM (v_rec.locked_until - v_now))::INT),
    'server_now', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_lockout_status_by_token(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. ADMINISTRATOR REVIEW / DECISION WORKFLOW FOR account_recovery_requests
--    Decisions:
--      HUMAN_REVIEW       -> ticket stays open, flagged for deeper review
--      NEEDS_INFORMATION  -> ticket stays open, requester must be contacted
--      REJECT             -> ticket closed as REJECTED (reason required)
--      RESOLVE_RESET      -> identity-verified authorized password reset:
--                            the ONLY path that may mark a ticket COMPLETED,
--                            and it does so only if the password update,
--                            session revocation, and lockout clear all succeed
--                            inside this single transaction.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_assisted_recovery_request(
  p_request_id UUID,
  p_decision TEXT,
  p_notes TEXT DEFAULT NULL,
  p_new_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_caller_name TEXT;
  v_rec public.account_recovery_requests%ROWTYPE;
  v_target_user_id UUID;
  v_target_role TEXT;
  v_now TIMESTAMPTZ := now();
  v_masked TEXT;
  v_clean_notes TEXT := trim(COALESCE(p_notes, ''));
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to review recovery requests.';
  END IF;

  SELECT role, COALESCE(display_name, 'Administrator') INTO v_caller_role, v_caller_name
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only Administrators may review account recovery requests.';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('HUMAN_REVIEW', 'NEEDS_INFORMATION', 'REJECT', 'RESOLVE_RESET') THEN
    RAISE EXCEPTION 'Invalid decision. Allowed: HUMAN_REVIEW, NEEDS_INFORMATION, REJECT, RESOLVE_RESET.';
  END IF;

  SELECT * INTO v_rec
  FROM public.account_recovery_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recovery request % not found.', p_request_id;
  END IF;

  IF v_rec.status IN ('REJECTED', 'COMPLETED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Request % is already resolved (%); its decision is final.', v_rec.request_reference, v_rec.status;
  END IF;

  -- The requester must never be able to approve their own recovery. Check
  -- both the ticket's recorded user and the CURRENT account behind the
  -- identifier (tickets can predate the account linkage).
  IF v_rec.user_id IS NOT NULL AND v_rec.user_id = v_caller_id THEN
    RAISE EXCEPTION 'Permission Denied: you cannot review your own recovery request.';
  END IF;

  v_masked := public.mask_email(v_rec.email_lookup);

  -- Resolve the CURRENT account behind the ticket identifier.
  SELECT id INTO v_target_user_id
  FROM auth.users
  WHERE lower(email) = v_rec.email_lookup
  LIMIT 1;

  IF v_target_user_id IS NOT NULL AND v_target_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Permission Denied: you cannot review your own recovery request.';
  END IF;

  IF v_target_user_id IS NOT NULL THEN
    SELECT role INTO v_target_role FROM public.profiles WHERE id = v_target_user_id;
  END IF;

  -- Hierarchical RBAC (mirrors unlock_account / admin_reset_user_password):
  --   ADMIN          -> USER / STAFF targets only
  --   SUPER_ADMIN    -> USER / STAFF / ADMIN targets
  --   SUPER_ADMIN targets always require a SUPER_ADMIN reviewer
  IF COALESCE(v_target_role, 'USER') = 'SUPER_ADMIN' AND v_caller_role <> 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Permission Denied: only a Super Administrator may recover a Super Administrator account.';
  END IF;

  IF v_caller_role = 'ADMIN' AND COALESCE(v_target_role, 'USER') NOT IN ('USER', 'STAFF') THEN
    RAISE EXCEPTION 'Permission Denied: Administrators may only review recovery requests for Staff accounts.';
  END IF;

  ------------------------------------------------------------------ REJECT --
  IF p_decision = 'REJECT' THEN
    IF v_clean_notes = '' THEN
      RAISE EXCEPTION 'A rejection reason is required.';
    END IF;

    UPDATE public.account_recovery_requests
    SET status = 'REJECTED',
        admin_reviewer_id = v_caller_id,
        admin_reviewed_at = v_now,
        admin_notes = v_clean_notes,
        decision_reason = v_clean_notes,
        resolved_at = v_now,
        updated_at = v_now
    WHERE id = v_rec.id;

    INSERT INTO public.security_events (
      event_type, email_masked, actor_id, details
    ) VALUES (
      'ASSISTED_RECOVERY_REJECTED', v_masked, v_caller_id,
      jsonb_build_object('request_reference', v_rec.request_reference)
    );

    INSERT INTO public.audit_logs (
      actor_id, action, target_table, target_id, new_data, reason
    ) VALUES (
      v_caller_id, 'ASSISTED_RECOVERY_REJECTED', 'account_recovery_requests', v_rec.id,
      jsonb_build_object('status', 'REJECTED', 'request_reference', v_rec.request_reference),
      v_clean_notes
    );

    RETURN jsonb_build_object(
      'success', true,
      'status', 'REJECTED',
      'message', format('Recovery request %s rejected by %s.', v_rec.request_reference, v_caller_name)
    );
  END IF;

  ------------------------------------------------------------- OPEN STATES --
  IF p_decision IN ('HUMAN_REVIEW', 'NEEDS_INFORMATION') THEN
    UPDATE public.account_recovery_requests
    SET status = p_decision,
        admin_reviewer_id = v_caller_id,
        admin_reviewed_at = v_now,
        admin_notes = NULLIF(v_clean_notes, ''),
        decision_reason = NULLIF(v_clean_notes, ''),
        updated_at = v_now
    WHERE id = v_rec.id;

    INSERT INTO public.audit_logs (
      actor_id, action, target_table, target_id, new_data
    ) VALUES (
      v_caller_id, 'ASSISTED_RECOVERY_REVIEW_STATE', 'account_recovery_requests', v_rec.id,
      jsonb_build_object('status', p_decision, 'request_reference', v_rec.request_reference)
    );

    RETURN jsonb_build_object(
      'success', true,
      'status', p_decision,
      'message', format('Recovery request %s marked %s.', v_rec.request_reference, p_decision)
    );
  END IF;

  -------------------------------------------------- RESOLVE_RESET (final) --
  -- Identity-verified authorized reset. Requires the target account to exist
  -- and a compliant new password; the ticket is marked COMPLETED only if the
  -- entire operation succeeds. Any RAISE below rolls back every change,
  -- including the ticket status, so a failed reset can never be reported as
  -- a successful resolution.
  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'No account currently exists for identifier of request %. Resolve cannot proceed.', v_rec.request_reference;
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RAISE EXCEPTION 'A new password of at least 8 characters is required to complete the authorized reset.';
  END IF;

  IF v_clean_notes = '' THEN
    RAISE EXCEPTION 'An identity-verification note is required to complete an authorized reset.';
  END IF;

  -- 1. The authorized password change itself
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = v_now
  WHERE id = v_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target account could not be updated; reset aborted.';
  END IF;

  -- 2. Revoke every existing session so a stolen password or live token
  --    cannot survive an identity-verified recovery.
  DELETE FROM auth.sessions WHERE user_id = v_target_user_id;

  -- 3. Clear any active login lockout for the recovered account
  UPDATE public.account_security_state
  SET failed_attempts = 0,
      window_started_at = NULL,
      last_failed_at = NULL,
      locked_until = NULL,
      lockout_status = 'UNLOCKED',
      lockout_token_hash = NULL,
      unlocked_at = v_now,
      unlocked_by = v_caller_id,
      unlock_reason = 'Cleared by assisted-recovery password reset',
      updated_at = v_now
  WHERE email_lookup = v_rec.email_lookup;

  -- 4. Close the ticket as COMPLETED with the actual outcome recorded
  UPDATE public.account_recovery_requests
  SET status = 'COMPLETED',
      user_id = v_target_user_id,
      admin_reviewer_id = v_caller_id,
      admin_reviewed_at = v_now,
      admin_notes = v_clean_notes,
      decision_reason = 'Identity verified by administrator; password reset completed and account unlocked.',
      resolved_at = v_now,
      updated_at = v_now
  WHERE id = v_rec.id;

  INSERT INTO public.security_events (
    event_type, email_masked, actor_id, details
  ) VALUES (
    'ASSISTED_RECOVERY_COMPLETED', v_masked, v_caller_id,
    jsonb_build_object(
      'request_reference', v_rec.request_reference,
      'password_reset', true,
      'lockout_cleared', true,
      'sessions_revoked', true
    )
  );

  INSERT INTO public.audit_logs (
    actor_id, action, target_table, target_id, new_data, reason
  ) VALUES (
    v_caller_id, 'ASSISTED_RECOVERY_RESET_COMPLETED', 'account_recovery_requests', v_rec.id,
    jsonb_build_object(
      'status', 'COMPLETED',
      'request_reference', v_rec.request_reference,
      'target_user_id', v_target_user_id,
      'password_reset', true,
      'lockout_cleared', true,
      'sessions_revoked', true
    ),
    v_clean_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', 'COMPLETED',
    'message', format('Identity verified. Password reset completed and account unlocked for request %s.', v_rec.request_reference)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_assisted_recovery_request(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. RLS REPAIRS
-- ----------------------------------------------------------------------------

-- A. account_recovery_requests: retire the stale MASTER_ADMIN reference from
--    the retired-role era. Raw identifiers stay restricted to ADMIN / SUPER_ADMIN.
DROP POLICY IF EXISTS "Admins view recovery requests" ON public.account_recovery_requests;
CREATE POLICY "Admins view recovery requests"
  ON public.account_recovery_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- B. notifications: make ASSISTED_RECOVERY_REQUEST visible (and manageable)
--    to administrators under the zero-trust policy model.
DROP POLICY IF EXISTS "notifications_select_policy" ON public.notifications;
CREATE POLICY "notifications_select_policy"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      type IN (
        'LOW_STOCK',
        'OUT_OF_STOCK',
        'EXPIRING_SOON',
        'EXPIRED',
        'BATCH_DEPLETED',
        'STOCK_DISCREPANCY',
        'DAILY_SHEET',
        'SHEET_CORRECTION'
      )
    )
    OR (
      type IN (
        'PASSWORD_RESET',
        'RECOVERY_REQUEST',
        'ASSISTED_RECOVERY_REQUEST',
        'ACCOUNT_LOCKOUT',
        'SECURITY_ALERT',
        'SYSTEM',
        'MAINTENANCE'
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role IN ('ADMIN', 'SUPER_ADMIN')
      )
    )
  );

DROP POLICY IF EXISTS "notifications_update_policy" ON public.notifications;
CREATE POLICY "notifications_update_policy"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      type IN (
        'LOW_STOCK',
        'OUT_OF_STOCK',
        'EXPIRING_SOON',
        'EXPIRED',
        'BATCH_DEPLETED',
        'STOCK_DISCREPANCY',
        'DAILY_SHEET',
        'SHEET_CORRECTION'
      )
    )
    OR (
      type IN (
        'PASSWORD_RESET',
        'RECOVERY_REQUEST',
        'ASSISTED_RECOVERY_REQUEST',
        'ACCOUNT_LOCKOUT',
        'SECURITY_ALERT',
        'SYSTEM',
        'MAINTENANCE'
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role IN ('ADMIN', 'SUPER_ADMIN')
      )
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (
      type IN (
        'LOW_STOCK',
        'OUT_OF_STOCK',
        'EXPIRING_SOON',
        'EXPIRED',
        'BATCH_DEPLETED',
        'STOCK_DISCREPANCY',
        'DAILY_SHEET',
        'SHEET_CORRECTION'
      )
    )
    OR (
      type IN (
        'PASSWORD_RESET',
        'RECOVERY_REQUEST',
        'ASSISTED_RECOVERY_REQUEST',
        'ACCOUNT_LOCKOUT',
        'SECURITY_ALERT',
        'SYSTEM',
        'MAINTENANCE'
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role IN ('ADMIN', 'SUPER_ADMIN')
      )
    )
  );

-- Reload schema cache so PostgREST exposes the replaced RPCs immediately.
NOTIFY pgrst, 'reload schema';
