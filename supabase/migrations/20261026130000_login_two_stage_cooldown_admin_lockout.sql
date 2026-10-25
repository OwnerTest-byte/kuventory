-- ============================================================================
-- MIGRATION: 20261026130000_login_two_stage_cooldown_admin_lockout.sql
-- PURPOSE (owner decision, 2026-10-25 — supersedes the no-expiry policy of
-- 20261026120000 with a TWO-STAGE design that mirrors the assisted-recovery
-- flow):
--   STAGE 1 — COOLDOWN (timed, self-releasing): the 5th failed login within
--   the 15-minute window writes lockout_status='ACTIVE' WITH
--   locked_until = now + 30 minutes. The login screen shows the live
--   countdown; when it lapses the account self-releases (EXPIRED) and the
--   user may try again — no administrator needed.
--   STAGE 2 — ADMINISTRATOR LOCKOUT (no timer): the FIRST failed attempt
--   after a cooldown completed within 24 hours (the 6th attempt) sets
--   verification_required. There is no countdown and no self-release: only
--   an administrator's verified unlock, a successful sign-in, or an
--   identity-verified recovery reset restores access.
--   A post-unlock failure re-enters stage 2 directly (the anchor is kept) —
--   never a fresh 5-attempt cycle.
-- Consequences for the check RPCs:
--   ACTIVE + locked_until > now      -> LOCKED with authoritative remaining time
--   ACTIVE + lapsed + not verified   -> EXPIRED (self-release)
--   verification_required            -> escalation response, no timer
--   unlock_account                   -> unchanged (keeps last_lockout_at)
-- Forward-only. 15-minute window, 5-failure threshold, recovery cooldown,
-- and all RLS/policies are unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. record_failed_login_attempt — two-stage
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

  -- STAGE 1 ACTIVE (cooldown still running): authoritative remaining time,
  -- no counting.
  IF v_rec.lockout_status = 'ACTIVE'
     AND v_rec.locked_until IS NOT NULL
     AND v_rec.locked_until > v_now THEN
    RETURN jsonb_build_object(
      'status', 'LOCKED',
      'is_locked', true,
      'locked_until', v_rec.locked_until,
      'seconds_remaining', GREATEST(0, EXTRACT(EPOCH FROM (v_rec.locked_until - v_now))::INT),
      'failed_attempts', v_rec.failed_attempts,
      'escalation_required', false,
      'server_now', v_now,
      'message', 'Account is temporarily paused after repeated failed attempts. Please wait for the cooldown to end, or contact an administrator through the official support channels.'
    );
  END IF;

  -- STAGE 2 (administrator lockout): every further attempt returns the
  -- escalation response; nothing is counted or timed.
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

  -- STAGE-2 TRIGGER (the 6th attempt): a failed sign-in AFTER a cooldown
  -- completed within the last 24 hours — including one an administrator just
  -- lifted — escalates immediately. No fresh countdown cycle is offered.
  IF v_rec.last_lockout_at IS NOT NULL AND v_rec.last_lockout_at > v_now - interval '24 hours' THEN
    UPDATE public.account_security_state
    SET verification_required = true,
        failed_attempts = 1,
        window_started_at = v_now,
        last_failed_at = v_now,
        locked_until = NULL,
        updated_at = v_now
    WHERE id = v_rec.id;

    INSERT INTO public.security_events (
      event_type, email_masked, ip_address, user_agent, actor_id, details
    ) VALUES (
      'ACCOUNT_ESCALATION_REQUIRED', v_masked, p_ip, p_user_agent, v_resolved_user_id,
      jsonb_build_object('path', 'login', 'trigger', 'first failed attempt after cooldown expiry')
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

  -- A lapsed stage-1 lock (cooldown expired, not escalated) restarts the
  -- failure window fresh below — its remaining handling is identical to a
  -- clean state.

  -- 15-minute rolling window
  IF v_rec.window_started_at IS NULL OR (v_now - v_rec.window_started_at) > interval '15 minutes' THEN
    v_failed_count := 1;
    v_rec.window_started_at := v_now;
  ELSE
    v_failed_count := v_rec.failed_attempts + 1;
  END IF;

  -- STAGE-1 THRESHOLD: the 5th failure starts the timed cooldown.
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
        'stage', 'cooldown',
        'cooldown_minutes', 30
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
    'escalation_required', false,
    'server_now', v_now,
    'message', CASE WHEN v_is_locked
      THEN 'Account paused for 30 minutes after 5 consecutive failed attempts. Wait for the cooldown to end, or contact an administrator.'
      ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_failed_login_attempt(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. check_account_lockout — cooldown carries the timer; verification does not
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

  IF v_rec.verification_required THEN
    -- Stage 2: administrator lockout — no timer.
    RETURN jsonb_build_object(
      'status', 'UNLOCKED',
      'is_locked', false,
      'locked_until', NULL,
      'seconds_remaining', 0,
      'failed_attempts', COALESCE(v_rec.failed_attempts, 0),
      'escalation_required', true,
      'server_now', v_now,
      'message', 'Administrator verification required. Contact an administrator through the official support channels to verify your identity.'
    );
  END IF;

  IF NOT FOUND OR v_rec.lockout_status != 'ACTIVE'
     OR v_rec.locked_until IS NULL OR v_rec.locked_until <= v_now THEN
    RETURN jsonb_build_object(
      'status', 'UNLOCKED',
      'is_locked', false,
      'locked_until', NULL,
      'seconds_remaining', 0,
      'failed_attempts', COALESCE(v_rec.failed_attempts, 0),
      'escalation_required', false,
      'server_now', v_now
    );
  END IF;

  -- Stage 1 cooldown still running: issue an opaque polling token when none
  -- exists yet, and return the authoritative remaining time.
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
    'escalation_required', false,
    'server_now', v_now,
    'message', 'Account is temporarily paused after repeated failed attempts. Please wait for the cooldown to end, or contact an administrator through the official support channels.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_account_lockout(TEXT, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. check_lockout_status_by_token — cooldown tick-down vs escalation hold
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
    -- Token no longer matches: cleared by an authorized administrative
    -- unlock (unlock_account NULLs the hash).
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

  -- ACTIVE: stage depends on the timer.
  IF v_rec.locked_until IS NOT NULL AND v_rec.locked_until > v_now THEN
    RETURN jsonb_build_object(
      'status', 'LOCKED',
      'is_locked', true,
      'was_unlocked', false,
      'token_valid', true,
      'locked_until', v_rec.locked_until,
      'seconds_remaining', GREATEST(0, EXTRACT(EPOCH FROM (v_rec.locked_until - v_now))::INT),
      'escalation_required', false,
      'server_now', v_now
    );
  END IF;

  -- ACTIVE with a lapsed/absent timer and not verified: the cooldown has
  -- self-released — the user may retry (the next failure escalates).
  RETURN jsonb_build_object(
    'status', 'EXPIRED',
    'is_locked', false,
    'was_unlocked', false,
    'token_valid', true,
    'locked_until', NULL,
    'seconds_remaining', 0,
    'escalation_required', false,
    'server_now', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_lockout_status_by_token(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. get_locked_accounts — cooldown rows carry their remaining time
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
      CASE
        WHEN ass.locked_until IS NOT NULL AND ass.locked_until > now()
          THEN GREATEST(0, EXTRACT(EPOCH FROM (ass.locked_until - now()))::INT)
        ELSE 0
      END as seconds_remaining,
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
