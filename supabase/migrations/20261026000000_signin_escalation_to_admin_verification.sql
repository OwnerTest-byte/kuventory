-- ============================================================================
-- MIGRATION: 20261026000000_signin_escalation_to_admin_verification.sql
-- PURPOSE:
--   6th-attempt escalation (owner decision, 2026-10-25): the FIRST failed
--   attempt after a completed countdown — on either guard — must route the
--   person to an administrator for identity verification instead of starting
--   another retry cycle:
--     LOGIN:    lockout expires -> next failed sign-in (the 6th attempt) sets
--               verification_required. No second lockout, no attempts note.
--     RECOVERY: wrong-identifier cooldown expires -> next unknown submission
--               (the 6th wrong identifier) returns the escalation response.
--   Both flags are server-authoritative (carried by every check RPC so
--   reloads/reopens/polls stay truthful) and clear ONLY through:
--     - an administrator's authorized early unlock (unlock_account),
--     - a successful sign-in (reset_my_login_lockout), or
--     - an identity-verified assisted-recovery reset (RESOLVE_RESET).
--   The recovery side self-expires after 1 hour; a CORRECT identifier always
--   goes straight through to a ticket (escalation never blocks a real
--   account). get_locked_accounts now also lists verification-required
--   accounts so the admin console shows what needs human verification.
-- Forward-only. Lockout (5/15->30) and wrong-identifier (5/15->2 min)
-- policies are unchanged. No RLS/policy changes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. STATE COLUMNS
-- ----------------------------------------------------------------------------
ALTER TABLE public.account_security_state
  ADD COLUMN IF NOT EXISTS verification_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_lockout_at TIMESTAMPTZ;

ALTER TABLE public.account_recovery_attempt_state
  ADD COLUMN IF NOT EXISTS verification_required_until TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 2. record_failed_login_attempt — 6TH-ATTEMPT ESCALATION
--    Policy unchanged (5 failures / 15 min -> 30-min lockout). New: any
--    failed attempt after a lockout completed within 24 hours escalates
--    immediately (no second lockout); lock issuance records last_lockout_at.
-- ----------------------------------------------------------------------------
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
  v_escalated BOOLEAN := false;
BEGIN
  IF v_norm_email = '' OR position('@' in v_norm_email) = 0 THEN
    RETURN jsonb_build_object(
      'status', 'UNLOCKED', 'is_locked', false, 'failed_attempts', 0,
      'seconds_remaining', 0, 'escalation_required', false, 'server_now', v_now
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
      'escalation_required', v_rec.verification_required,
      'server_now', v_now,
      'message', 'Account is currently locked due to previous failed attempts.'
    );
  END IF;

  -- Already in administrator-verification state: every further attempt
  -- returns the escalation response; nothing is counted or locked.
  IF v_rec.verification_required THEN
    RETURN jsonb_build_object(
      'status', 'UNLOCKED',
      'is_locked', false,
      'locked_until', NULL,
      'seconds_remaining', 0,
      'failed_attempts', v_rec.failed_attempts,
      'escalation_required', true,
      'server_now', v_now,
      'message', 'Administrator verification required. Contact an administrator through the official support channels to verify your identity.'
    );
  END IF;

  -- 6TH-ATTEMPT RULE: a failed sign-in AFTER a lockout completed within the
  -- last 24 hours escalates immediately. This is the first attempt after the
  -- countdown lifted — no second lockout cycle is offered.
  IF v_rec.last_lockout_at IS NOT NULL AND v_rec.last_lockout_at > v_now - interval '24 hours' THEN
    UPDATE public.account_security_state
    SET verification_required = true,
        failed_attempts = 1,
        window_started_at = v_now,
        last_failed_at = v_now,
        updated_at = v_now
    WHERE id = v_rec.id;

    INSERT INTO public.security_events (
      event_type, email_masked, ip_address, user_agent, actor_id, details
    ) VALUES (
      'ACCOUNT_ESCALATION_REQUIRED', v_masked, p_ip, p_user_agent, v_resolved_user_id,
      jsonb_build_object('path', 'login', 'trigger', 'first failed attempt after lockout expiry')
    );

    INSERT INTO public.security_events (
      event_type, email_masked, ip_address, user_agent, details
    ) VALUES (
      'LOGIN_FAILED', v_masked, p_ip, p_user_agent,
      jsonb_build_object('escalated', true, 'attempt_number', 1, 'window_started', v_now)
    );

    RETURN jsonb_build_object(
      'status', 'UNLOCKED',
      'is_locked', false,
      'locked_until', NULL,
      'seconds_remaining', 0,
      'failed_attempts', 1,
      'escalation_required', true,
      'server_now', v_now,
      'message', 'Administrator verification required. Contact an administrator through the official support channels to verify your identity.'
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
        last_lockout_at = v_now,
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
    'escalation_required', v_escalated,
    'server_now', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_failed_login_attempt(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. check_account_lockout — every response carries escalation_required
-- ----------------------------------------------------------------------------
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
      'status', 'UNLOCKED', 'is_locked', false, 'failed_attempts', 0,
      'escalation_required', false, 'server_now', v_now
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
      'escalation_required', COALESCE(v_rec.verification_required, false),
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
    'escalation_required', v_rec.verification_required,
    'server_now', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_account_lockout(TEXT, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. check_lockout_status_by_token — every response carries escalation_required
-- ----------------------------------------------------------------------------
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
      'token_valid', false, 'seconds_remaining', 0,
      'escalation_required', false, 'server_now', v_now
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
      'escalation_required', false,
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
      'escalation_required', v_rec.verification_required,
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
      'escalation_required', v_rec.verification_required,
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
    'escalation_required', v_rec.verification_required,
    'server_now', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_lockout_status_by_token(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. unlock_account — identity verified: clears lockout AND the verification
--    requirement (this is the human remedy loop's clearing action)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unlock_account(
  p_account_security_id UUID,
  p_reason TEXT
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
  v_sec public.account_security_state%ROWTYPE;
  v_target_profile public.profiles%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_masked TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to unlock accounts.';
  END IF;

  SELECT role, COALESCE(display_name, 'Admin') INTO v_caller_role, v_caller_name
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only administrators can unlock locked accounts.';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'A legitimate reason is required to unlock an account.';
  END IF;

  SELECT * INTO v_sec
  FROM public.account_security_state
  WHERE id = p_account_security_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target account security record % not found.', p_account_security_id;
  END IF;

  -- Hierarchical RBAC validation:
  -- Admin can only unlock Staff ('USER')
  -- Super Admin can unlock Staff ('USER') and Admin ('ADMIN')
  IF v_sec.user_id IS NOT NULL THEN
    SELECT * INTO v_target_profile
    FROM public.profiles
    WHERE id = v_sec.user_id;

    IF FOUND THEN
      IF v_caller_role = 'ADMIN' AND v_target_profile.role != 'USER' THEN
        RAISE EXCEPTION 'Permission Denied: Administrators may only unlock Staff accounts. Contact Super Admin.';
      END IF;

      IF v_target_profile.id = v_caller_id THEN
        RAISE EXCEPTION 'Permission Denied: Self-unlocking is strictly prohibited by security policy.';
      END IF;
    END IF;
  END IF;

  v_masked := public.mask_email(v_sec.email_lookup);

  -- Perform atomic unlock: identity has been verified by this administrator,
  -- so the administrator-verification requirement is cleared with the lock.
  UPDATE public.account_security_state
  SET failed_attempts = 0,
      locked_until = NULL,
      lockout_status = 'UNLOCKED',
      lockout_token_hash = NULL,
      verification_required = false,
      last_lockout_at = NULL,
      unlocked_at = v_now,
      unlocked_by = v_caller_id,
      unlock_reason = trim(p_reason),
      updated_at = v_now
  WHERE id = v_sec.id;

  INSERT INTO public.security_events (
    event_type, email_masked, actor_id, details
  ) VALUES (
    'ACCOUNT_UNLOCKED', v_masked, v_caller_id,
    jsonb_build_object(
      'unlocked_by', v_caller_name,
      'reason', trim(p_reason),
      'previous_locked_until', v_sec.locked_until,
      'verification_requirement_cleared', v_sec.verification_required
    )
  );

  INSERT INTO public.audit_logs (
    actor_id, action, target_table, target_id, new_data, reason
  ) VALUES (
    v_caller_id,
    'ACCOUNT_UNLOCKED',
    'account_security_state',
    v_sec.id,
    jsonb_build_object('email_masked', v_masked, 'unlocked_at', v_now, 'verification_cleared', v_sec.verification_required),
    trim(p_reason)
  );

  RETURN jsonb_build_object(
    'success', true,
    'escalation_cleared', v_sec.verification_required,
    'message', format('Account %s successfully unlocked by %s.', v_masked, v_caller_name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_account(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. reset_my_login_lockout — successful sign-in proves identity: clears the
--    verification requirement as well
-- ----------------------------------------------------------------------------
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
      verification_required = false,
      last_lockout_at = NULL,
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

-- ----------------------------------------------------------------------------
-- 7. get_locked_accounts — the console now also lists verification-required
--    accounts (they carry no active lock) with their status for the badge
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_locked_accounts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_result JSONB;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: administrator access required.';
  END IF;

  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      ass.id,
      ass.email_lookup,
      public.mask_email(ass.email_lookup) as email_masked,
      ass.failed_attempts,
      ass.window_started_at,
      ass.last_failed_at,
      ass.locked_until,
      ass.lockout_status,
      GREATEST(0, EXTRACT(EPOCH FROM (ass.locked_until - now()))::INT) as seconds_remaining,
      ass.verification_required,
      ass.last_lockout_at,
      p.display_name,
      COALESCE(p.role, 'USER') as user_role,
      ass.updated_at
    FROM public.account_security_state ass
    LEFT JOIN public.profiles p ON ass.user_id = p.id
    WHERE (ass.locked_until IS NOT NULL AND ass.locked_until > now())
       OR ass.verification_required = true
    ORDER BY
      ass.verification_required DESC,
      ass.locked_until DESC NULLS LAST,
      ass.updated_at DESC
  ) row_data;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_locked_accounts() TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. review_assisted_recovery_request — identical to the 20261025120000
--    authoritative body (self-review prevention, hierarchical RBAC, atomic
--    RESOLVE_RESET) with ONE addition: RESOLVE_RESET also clears the
--    administrator-verification requirement (the administrator just verified
--    identity) on both the account lockout state and the wrong-identifier
--    attempt state.
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

  -------------------------------------------------------------- REJECTION --
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

  -------------------------------------------------- RESOLVE_RESET (final) --
  -- Identity-verified authorized reset. Requires the target account to exist
  -- and a compliant new password; the ticket is marked COMPLETED only if the
  -- entire operation succeeds. Any RAISE below rolls back every change,
  -- including the ticket status, so a failed reset can never be reported as a
  -- successful resolution.
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

  -- 3. Clear any active login lockout AND the administrator-verification
  --    requirement for the recovered account (identity was just verified).
  UPDATE public.account_security_state
  SET failed_attempts = 0,
      window_started_at = NULL,
      last_failed_at = NULL,
      locked_until = NULL,
      lockout_status = 'UNLOCKED',
      lockout_token_hash = NULL,
      verification_required = false,
      last_lockout_at = NULL,
      unlocked_at = v_now,
      unlocked_by = v_caller_id,
      unlock_reason = 'Cleared by assisted-recovery password reset',
      updated_at = v_now
  WHERE email_lookup = v_rec.email_lookup;

  -- 4. Clear the wrong-identifier escalation for this identifier as well
  UPDATE public.account_recovery_attempt_state
  SET verification_required_until = NULL,
      updated_at = v_now
  WHERE identifier_hash = encode(digest(v_rec.email_lookup, 'sha256'), 'hex');

  -- 5. Close the ticket as COMPLETED with the actual outcome recorded
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
-- 9. submit_assisted_recovery_request v6 — 6TH-WRONG-IDENTIFIER ESCALATION
--    Only the unknown-identifier branch changes: the first unknown submission
--    after a cooldown expired within the last hour escalates to administrator
--    verification for 1 hour. The known-identifier ticket path is unchanged
--    (escalation never blocks a real account).
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
  v_unknown_cooldown CONSTANT INTERVAL := interval '2 minutes';
  v_unknown_window CONSTANT INTERVAL := interval '15 minutes';
  v_escalation_window CONSTANT INTERVAL := interval '1 hour';
  v_id_hash TEXT;
  v_stored_attempts INT;
  v_stored_cooldown_until TIMESTAMPTZ;
  v_stored_last_attempt TIMESTAMPTZ;
  v_stored_verification_until TIMESTAMPTZ;
  v_prior INT := 0;
BEGIN
  IF v_norm_email = '' OR position('@' in v_norm_email) = 0 THEN
    RETURN jsonb_build_object(
      'accepted', false,
      'error', 'Valid email identifier required.',
      'server_now', v_now
    );
  END IF;

  -- EXISTENCE GATE: resolve the account BEFORE anything else.
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_norm_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    -- ------------------------------------------------------------------
    -- UNKNOWN IDENTIFIER: escalation first, then cooldown, then counting.
    -- ------------------------------------------------------------------
    PERFORM pg_advisory_xact_lock(hashtext('kuventory_recovery_unknown:' || v_norm_email)::bigint);

    v_id_hash := encode(digest(v_norm_email, 'sha256'), 'hex');

    SELECT s.unknown_attempts, s.cooldown_until, s.last_attempt_at, s.verification_required_until
    INTO v_stored_attempts, v_stored_cooldown_until, v_stored_last_attempt, v_stored_verification_until
    FROM public.account_recovery_attempt_state s
    WHERE s.identifier_hash = v_id_hash;

    -- Already in administrator-verification state for this identifier.
    IF v_stored_verification_until IS NOT NULL AND v_now < v_stored_verification_until THEN
      v_seconds_rem := GREATEST(0, EXTRACT(EPOCH FROM (v_stored_verification_until - v_now))::INT);

      INSERT INTO public.security_events (
        event_type, email_masked, details
      ) VALUES (
        'ASSISTED_RECOVERY_UNKNOWN_THROTTLED', v_masked,
        jsonb_build_object('escalated', true, 'seconds_remaining', v_seconds_rem)
      );

      RETURN jsonb_build_object(
        'accepted', false,
        'escalation_required', true,
        'server_now', v_now,
        'next_allowed_at', v_stored_verification_until,
        'seconds_remaining', v_seconds_rem,
        'message', 'Contact an administrator to verify your identity and confirm your correct login identifier.'
      );
    END IF;

    -- Active 2-minute cooldown (unchanged behavior).
    IF v_stored_cooldown_until IS NOT NULL AND v_now < v_stored_cooldown_until THEN
      v_seconds_rem := GREATEST(0, EXTRACT(EPOCH FROM (v_stored_cooldown_until - v_now))::INT);

      INSERT INTO public.security_events (
        event_type, email_masked, details
      ) VALUES (
        'ASSISTED_RECOVERY_UNKNOWN_THROTTLED', v_masked,
        jsonb_build_object('seconds_remaining', v_seconds_rem)
      );

      RETURN jsonb_build_object(
        'accepted', false,
        'throttled', true,
        'unknown_identifier_cooldown', true,
        'escalation_required', false,
        'server_now', v_now,
        'next_allowed_at', v_stored_cooldown_until,
        'seconds_remaining', v_seconds_rem,
        'message', 'Too many attempts with unknown identifiers. Please wait before trying again.'
      );
    END IF;

    -- 6TH-WRONG-IDENTIFIER RULE: the first unknown submission after a
    -- cooldown expired within the last hour escalates for 1 hour.
    IF v_stored_cooldown_until IS NOT NULL
       AND v_stored_cooldown_until <= v_now
       AND v_stored_cooldown_until > v_now - v_escalation_window THEN

      UPDATE public.account_recovery_attempt_state
      SET verification_required_until = v_now + v_escalation_window,
          last_attempt_at = v_now,
          updated_at = v_now
      WHERE identifier_hash = v_id_hash;

      INSERT INTO public.security_events (
        event_type, email_masked, details
      ) VALUES (
        'ACCOUNT_ESCALATION_REQUIRED', v_masked,
        jsonb_build_object('path', 'recovery', 'trigger', 'first unknown identifier after cooldown expiry', 'window_seconds', EXTRACT(EPOCH FROM v_escalation_window)::INT)
      );

      RETURN jsonb_build_object(
        'accepted', false,
        'escalation_required', true,
        'server_now', v_now,
        'next_allowed_at', v_now + v_escalation_window,
        'seconds_remaining', EXTRACT(EPOCH FROM v_escalation_window)::INT,
        'message', 'Contact an administrator to verify your identity and confirm your correct login identifier.'
      );
    END IF;

    -- Prior attempts that still count (unchanged v5 semantics).
    IF v_stored_attempts IS NOT NULL
       AND (v_stored_cooldown_until IS NULL OR v_now >= v_stored_cooldown_until)
       AND v_stored_last_attempt > v_now - v_unknown_window THEN
      v_prior := v_stored_attempts;
    END IF;

    INSERT INTO public.security_events (
      event_type, email_masked, details
    ) VALUES (
      'ASSISTED_RECOVERY_UNKNOWN_ACCOUNT', v_masked,
      jsonb_build_object('reason', 'no matching KUVENTORY account')
    );

    IF v_prior >= 4 THEN
      INSERT INTO public.account_recovery_attempt_state (
        identifier_hash, unknown_attempts, window_started_at, cooldown_until, last_attempt_at, updated_at
      ) VALUES (
        v_id_hash, v_prior + 1,
        v_now,
        v_now + v_unknown_cooldown, v_now, v_now
      )
      ON CONFLICT (identifier_hash) DO UPDATE
      SET unknown_attempts = EXCLUDED.unknown_attempts,
          cooldown_until = EXCLUDED.cooldown_until,
          verification_required_until = NULL,
          last_attempt_at = EXCLUDED.last_attempt_at,
          updated_at = EXCLUDED.updated_at;

      INSERT INTO public.security_events (
        event_type, email_masked, details
      ) VALUES (
        'ASSISTED_RECOVERY_UNKNOWN_COOLDOWN', v_masked,
        jsonb_build_object('cooldown_seconds', EXTRACT(EPOCH FROM v_unknown_cooldown)::INT)
      );

      RETURN jsonb_build_object(
        'accepted', false,
        'throttled', true,
        'unknown_identifier_cooldown', true,
        'escalation_required', false,
        'server_now', v_now,
        'next_allowed_at', v_now + v_unknown_cooldown,
        'seconds_remaining', EXTRACT(EPOCH FROM v_unknown_cooldown)::INT,
        'message', 'Too many attempts with unknown identifiers. Please wait 2 minutes before trying again.'
      );
    END IF;

    INSERT INTO public.account_recovery_attempt_state (
      identifier_hash, unknown_attempts, window_started_at, cooldown_until, last_attempt_at, updated_at
    ) VALUES (
      v_id_hash, v_prior + 1,
      v_now, NULL, v_now, v_now
    )
    ON CONFLICT (identifier_hash) DO UPDATE
    SET unknown_attempts = EXCLUDED.unknown_attempts,
        window_started_at = CASE
          WHEN public.account_recovery_attempt_state.unknown_attempts = EXCLUDED.unknown_attempts - 1
             AND public.account_recovery_attempt_state.last_attempt_at > EXCLUDED.last_attempt_at - v_unknown_window
          THEN public.account_recovery_attempt_state.window_started_at
          ELSE EXCLUDED.window_started_at
        END,
        cooldown_until = NULL,
        verification_required_until = NULL,
        last_attempt_at = EXCLUDED.last_attempt_at,
        updated_at = EXCLUDED.updated_at;

    RETURN jsonb_build_object(
      'accepted', false,
      'account_exists', false,
      'escalation_required', false,
      'server_now', v_now,
      'attempts_remaining', 4 - v_prior,
      'message', 'No KUVENTORY account matches this identifier. Check the spelling or contact your administrator.'
    );
  END IF;

  -- Serialize concurrent submissions for the same identifier inside one
  -- transaction: the second caller blocks until the first commits, then sees
  -- the authoritative row and is throttled.
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
-- 10. check_assisted_recovery_cooldown v4 — reports the escalation state so a
--     reopened dialog reconciles without submitting
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_assisted_recovery_cooldown(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_norm_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_last TIMESTAMPTZ;
  v_unknown_until TIMESTAMPTZ;
  v_verification_until TIMESTAMPTZ;
  v_next_allowed TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
  v_seconds_rem INT := 0;
  v_cooldown CONSTANT INTERVAL := interval '2 minutes';
BEGIN
  IF v_norm_email = '' OR position('@' in v_norm_email) = 0 THEN
    RETURN jsonb_build_object(
      'valid', false,
      'can_submit', false,
      'escalation_required', false,
      'server_now', v_now,
      'message', 'Enter your account login identifier to check availability.'
    );
  END IF;

  -- Ticket cooldown for an existing account (authoritative table row).
  SELECT max(created_at) INTO v_last
  FROM public.account_recovery_requests
  WHERE email_lookup = v_norm_email;

  IF v_last IS NOT NULL AND (v_now - v_last) < v_cooldown THEN
    v_next_allowed := v_last + v_cooldown;
  END IF;

  -- Unknown-identifier state: exact per-identifier.
  SELECT s.cooldown_until, s.verification_required_until
  INTO v_unknown_until, v_verification_until
  FROM public.account_recovery_attempt_state s
  WHERE s.identifier_hash = encode(digest(v_norm_email, 'sha256'), 'hex');

  -- Administrator-verification escalation outranks any cooldown.
  IF v_verification_until IS NOT NULL AND v_now < v_verification_until THEN
    v_seconds_rem := GREATEST(0, EXTRACT(EPOCH FROM (v_verification_until - v_now))::INT);

    RETURN jsonb_build_object(
      'valid', true,
      'can_submit', false,
      'escalation_required', true,
      'server_now', v_now,
      'next_allowed_at', v_verification_until,
      'seconds_remaining', v_seconds_rem,
      'message', 'Contact an administrator to verify your identity and confirm your correct login identifier.'
    );
  END IF;

  IF v_unknown_until IS NOT NULL AND v_now < v_unknown_until THEN
    IF v_next_allowed IS NULL OR v_unknown_until > v_next_allowed THEN
      v_next_allowed := v_unknown_until;
    END IF;
  ELSE
    v_unknown_until := NULL;
  END IF;

  IF v_next_allowed IS NOT NULL THEN
    v_seconds_rem := GREATEST(0, EXTRACT(EPOCH FROM (v_next_allowed - v_now))::INT);

    RETURN jsonb_build_object(
      'valid', true,
      'can_submit', false,
      'escalation_required', false,
      'server_now', v_now,
      'next_allowed_at', v_next_allowed,
      'seconds_remaining', v_seconds_rem,
      'message', CASE
        WHEN v_unknown_until IS NOT NULL
          THEN 'Too many attempts with unknown identifiers. Please wait before trying again.'
        ELSE 'A recovery request was recently submitted for this identifier. Please wait before submitting another.'
      END
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'can_submit', true,
    'escalation_required', false,
    'server_now', v_now,
    'next_allowed_at', NULL,
    'seconds_remaining', 0,
    'message', 'You may submit a recovery request now.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_assisted_recovery_cooldown(TEXT) TO anon, authenticated;

-- Reload schema cache so PostgREST exposes the replaced functions immediately.
NOTIFY pgrst, 'reload schema';
