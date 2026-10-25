-- ============================================================================
-- MIGRATION: 20261026120000_lockout_admin_unlock_only.sql
-- PURPOSE (owner decision, 2026-10-25):
--   The 30-minute countdown is REMOVED. A lockout no longer releases itself
--   by time: once 5 consecutive failures lock the account, the ONLY ways back
--   are (a) an administrator's verified early unlock, (b) an identity-verified
--   assisted-recovery reset, or (c) a successful sign-in (which proves the
--   person had the right credentials all along). The lockout card carries no
--   timer — it routes the user to administrator contact, and the existing
--   10-second poll flips the screen back the moment an admin unlocks.
--   The 6th-attempt rule is preserved and strengthened: unlock_account KEEPS
--   last_lockout_at, so the FIRST failed attempt after an admin lift (within
--   24h of the lock) goes straight back to administrator verification — no
--   fresh 5-attempt cycle, no countdown reset.
--   locked_until is no longer written for new locks (NULL = no time expiry);
--   legacy rows with a future locked_until are treated as ACTIVE until an
--   administrator unlocks them (their timer no longer releases them either —
--   consistent, honest behavior).
-- Forward-only. RLS untouched. The 15-minute failure window and the 5-failure
-- threshold are unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. record_failed_login_attempt — locks have no time-based expiry
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
  v_failed_count INT := 0;
  v_resolved_user_id UUID := NULL;
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

  -- Already locked (ACTIVE has no time-based release): return the
  -- authoritative state without incrementing the counter.
  IF v_rec.lockout_status = 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'status', 'LOCKED',
      'is_locked', true,
      'locked_until', NULL,
      'seconds_remaining', 0,
      'failed_attempts', v_rec.failed_attempts,
      'escalation_required', v_rec.verification_required,
      'server_now', v_now,
      'message', 'Account is locked until an administrator verifies your identity and unlocks it. Contact an administrator through the official support channels.'
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

  -- 6TH-ATTEMPT RULE: a failed sign-in AFTER a lockout within the last 24
  -- hours (including one an administrator just lifted) escalates immediately
  -- — no fresh countdown cycle is offered.
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
      jsonb_build_object('path', 'login', 'trigger', 'first failed attempt after a lockout (admin-lifted or active)')
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

  -- Threshold evaluation: 5 failures locks the account until an
  -- administrator verifies and unlocks it. No expiry is written.
  IF v_failed_count >= 5 THEN
    v_is_locked := true;

    v_token := encode(gen_random_bytes(16), 'hex');
    v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

    UPDATE public.account_security_state
    SET failed_attempts = v_failed_count,
        window_started_at = v_rec.window_started_at,
        last_failed_at = v_now,
        locked_until = NULL,
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
        'released_by', 'administrator unlock only',
        'no_time_expiry', true
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
    'locked_until', NULL,
    'seconds_remaining', 0,
    'failed_attempts', v_failed_count,
    'lockout_token', v_token,
    'escalation_required', false,
    'server_now', v_now,
    'message', CASE WHEN v_is_locked
      THEN 'Account locked after 5 consecutive failed attempts. An administrator must verify your identity and unlock it.'
      ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_failed_login_attempt(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. check_account_lockout — ACTIVE never releases by time
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

  IF NOT FOUND OR v_rec.lockout_status != 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'status', 'UNLOCKED',
      'is_locked', false,
      'locked_until', NULL,
      'seconds_remaining', 0,
      'failed_attempts', COALESCE(v_rec.failed_attempts, 0),
      'escalation_required', COALESCE(v_rec.verification_required, false),
      'server_now', v_now
    );
  END IF;

  -- Actively locked (no time-based release): issue an opaque polling token
  -- when none exists yet.
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
    'locked_until', NULL,
    'seconds_remaining', 0,
    'failed_attempts', v_rec.failed_attempts,
    'lockout_token', v_token,
    'escalation_required', v_rec.verification_required,
    'server_now', v_now,
    'message', 'Account is locked until an administrator verifies your identity and unlocks it. Contact an administrator through the official support channels.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_account_lockout(TEXT, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. check_lockout_status_by_token — ACTIVE never releases by time; EXPIRED
--    is only the server-side status set by reset_my_login_lockout
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
    -- Token no longer matches any state row: cleared by an authorized
    -- administrative unlock (unlock_account NULLs the hash).
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

  IF v_rec.lockout_status = 'EXPIRED' THEN
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
    'locked_until', NULL,
    'seconds_remaining', 0,
    'escalation_required', v_rec.verification_required,
    'server_now', v_now,
    'message', 'Account is locked until an administrator verifies your identity and unlocks it.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_lockout_status_by_token(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. unlock_account — the verified human remedy. Clears lock, counters and
--    the verification requirement, but KEEPS last_lockout_at: the next failed
--    attempt within 24h goes straight back to administrator verification
--    (no fresh countdown cycle after a lift).
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

  -- Perform atomic unlock. last_lockout_at is intentionally KEPT: it anchors
  -- the 6th-attempt rule so a post-lift failure returns to administrator
  -- verification instead of starting a fresh failure cycle.
  UPDATE public.account_security_state
  SET failed_attempts = 0,
      locked_until = NULL,
      lockout_status = 'UNLOCKED',
      lockout_token_hash = NULL,
      verification_required = false,
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
      'verification_requirement_cleared', v_sec.verification_required,
      'escalation_anchor_kept_until', v_sec.last_lockout_at + interval '24 hours'
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
    'message', format('Account %s successfully unlocked by %s. If the next sign-in fails, administrator verification will be required again.', v_masked, v_caller_name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_account(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. get_locked_accounts — every ACTIVE lock (no time filter); countdown
--    column removed in favor of the unlock-only semantics
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
      0 as seconds_remaining,
      ass.verification_required,
      ass.last_lockout_at,
      p.display_name,
      COALESCE(p.role, 'USER') as user_role,
      ass.updated_at
    FROM public.account_security_state ass
    LEFT JOIN public.profiles p ON ass.user_id = p.id
    WHERE ass.lockout_status = 'ACTIVE' OR ass.verification_required = true
    ORDER BY
      ass.verification_required DESC,
      ass.last_failed_at DESC NULLS LAST,
      ass.updated_at DESC
  ) row_data;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_locked_accounts() TO authenticated;

-- Reload schema cache so PostgREST exposes the replaced functions immediately.
NOTIFY pgrst, 'reload schema';
