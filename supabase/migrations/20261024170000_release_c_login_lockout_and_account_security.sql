-- ============================================================================
-- MIGRATION: 20261024170000_release_c_login_lockout_and_account_security.sql
-- Description:
--   Release C — Server-Enforced Login Lockout and Authoritative Password Recovery:
--   1. Create public.account_security_state table for failed attempt tracking and lockouts.
--   2. Create public.security_events for audit-grade immutable security logging.
--   3. Implement record_login_attempt() with 5-failure threshold and 30-minute lockout.
--   4. Implement non-enumerating check_account_lockout() and check_lockout_status_by_token().
--   5. Implement unlock_account() with hierarchical RBAC enforcement (Admin -> Staff, Super Admin -> Admin/Staff).
--   6. Implement get_locked_accounts() for Security -> Login Lockouts management.
--   7. Implement server-authoritative request_password_reset() with database-level throttling.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. CREATE public.account_security_state TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_security_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_lookup TEXT NOT NULL UNIQUE,
  user_id UUID,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  lockout_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (lockout_status IN ('ACTIVE', 'UNLOCKED', 'EXPIRED')),
  lockout_token_hash TEXT,
  unlocked_at TIMESTAMPTZ,
  unlocked_by UUID REFERENCES public.profiles(id),
  unlock_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_sec_lookup ON public.account_security_state(email_lookup);
CREATE INDEX IF NOT EXISTS idx_account_sec_locked ON public.account_security_state(locked_until);
CREATE INDEX IF NOT EXISTS idx_account_sec_token ON public.account_security_state(lockout_token_hash);

ALTER TABLE public.account_security_state ENABLE ROW LEVEL SECURITY;

-- Block direct reads and writes by anon and authenticated; all access must use SECURITY DEFINER RPCs
DROP POLICY IF EXISTS "No direct client access on account_security_state" ON public.account_security_state;
CREATE POLICY "No direct client access on account_security_state"
  ON public.account_security_state
  FOR ALL
  TO anon, authenticated
  USING (false);

-- ----------------------------------------------------------------------------
-- 2. CREATE public.security_events TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  email_masked TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  actor_id UUID REFERENCES public.profiles(id),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_type ON public.security_events(event_type, created_at DESC);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Super Admin and Admin can read security events; normal users and anon cannot
DROP POLICY IF EXISTS "Admins can view security events" ON public.security_events;
CREATE POLICY "Admins can view security events"
  ON public.security_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN')
    )
  );

GRANT SELECT ON public.security_events TO authenticated;

-- Helper function to mask email safely (e.g. j***e@example.com)
CREATE OR REPLACE FUNCTION public.mask_email(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_parts TEXT[];
  v_local TEXT;
  v_domain TEXT;
  v_masked_local TEXT;
BEGIN
  IF p_email IS NULL OR p_email = '' OR position('@' in p_email) = 0 THEN
    RETURN '***@unknown.com';
  END IF;

  v_parts := string_to_array(p_email, '@');
  v_local := v_parts[1];
  v_domain := v_parts[2];

  IF length(v_local) <= 2 THEN
    v_masked_local := substring(v_local from 1 for 1) || '***';
  ELSE
    v_masked_local := substring(v_local from 1 for 1) || '***' || substring(v_local from length(v_local) for 1);
  END IF;

  RETURN v_masked_local || '@' || v_domain;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. RECORD LOGIN ATTEMPT RPC (5 failures in 15 mins -> 30 mins lockout)
-- ----------------------------------------------------------------------------
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
  IF v_norm_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email is required');
  END IF;

  -- Attempt to resolve user_id safely
  SELECT id INTO v_resolved_user_id
  FROM auth.users
  WHERE lower(email) = v_norm_email
  LIMIT 1;

  -- Lock row for update or insert new row
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

  -- 1. SUCCESS CASE
  IF p_success THEN
    UPDATE public.account_security_state
    SET failed_attempts = 0,
        window_started_at = NULL,
        last_failed_at = NULL,
        locked_until = NULL,
        lockout_status = 'EXPIRED',
        lockout_token_hash = NULL,
        updated_at = v_now
    WHERE id = v_rec.id;

    INSERT INTO public.security_events (
      event_type, email_masked, ip_address, user_agent, actor_id, details
    ) VALUES (
      'LOGIN_SUCCESS', v_masked, p_ip, p_user_agent, v_resolved_user_id,
      jsonb_build_object('timestamp', v_now)
    );

    RETURN jsonb_build_object(
      'is_locked', false,
      'locked_until', null,
      'seconds_remaining', 0,
      'failed_attempts', 0
    );
  END IF;

  -- 2. FAILURE CASE
  -- Check if already actively locked
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

  -- Check rolling window (15 minutes)
  IF v_rec.window_started_at IS NULL OR (v_now - v_rec.window_started_at) > interval '15 minutes' THEN
    -- New observation window
    v_failed_count := 1;
    v_rec.window_started_at := v_now;
  ELSE
    -- Increment within existing observation window
    v_failed_count := v_rec.failed_attempts + 1;
  END IF;

  -- Threshold evaluation: 5 failures triggers 30-minute lockout
  IF v_failed_count >= 5 THEN
    v_is_locked := true;
    v_locked_until := v_now + interval '30 minutes';
    v_seconds_rem := 1800; -- 30 minutes in seconds

    -- Generate opaque random hex token for non-enumerating browser polling
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
    'is_locked', v_is_locked,
    'locked_until', v_locked_until,
    'seconds_remaining', v_seconds_rem,
    'failed_attempts', v_failed_count,
    'lockout_token', v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_login_attempt(TEXT, BOOLEAN, TEXT, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. CHECK ACCOUNT LOCKOUT STATUS (Pre-check before authentication)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_account_lockout(
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
  v_rec public.account_security_state%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_token TEXT := NULL;
  v_token_hash TEXT := NULL;
BEGIN
  IF v_norm_email = '' THEN
    RETURN jsonb_build_object('is_locked', false);
  END IF;

  SELECT * INTO v_rec
  FROM public.account_security_state
  WHERE email_lookup = v_norm_email;

  IF NOT FOUND OR v_rec.locked_until IS NULL OR v_rec.locked_until <= v_now THEN
    RETURN jsonb_build_object(
      'is_locked', false,
      'failed_attempts', COALESCE(v_rec.failed_attempts, 0)
    );
  END IF;

  -- If locked and has no token yet, issue one
  IF v_rec.lockout_token_hash IS NULL THEN
    v_token := encode(gen_random_bytes(16), 'hex');
    v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

    UPDATE public.account_security_state
    SET lockout_token_hash = v_token_hash
    WHERE id = v_rec.id;
  END IF;

  RETURN jsonb_build_object(
    'is_locked', true,
    'locked_until', v_rec.locked_until,
    'seconds_remaining', GREATEST(0, EXTRACT(EPOCH FROM (v_rec.locked_until - v_now))::INT),
    'failed_attempts', v_rec.failed_attempts,
    'lockout_token', v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_account_lockout(TEXT, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. NON-ENUMERATING STATUS POLLING BY OPAQUE TOKEN
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_lockout_status_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_hash TEXT;
  v_rec public.account_security_state%ROWTYPE;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('is_locked', false, 'error', 'Invalid token');
  END IF;

  v_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_rec
  FROM public.account_security_state
  WHERE lockout_token_hash = v_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('is_locked', false, 'was_unlocked', true);
  END IF;

  IF v_rec.locked_until IS NULL OR v_rec.locked_until <= v_now OR v_rec.lockout_status = 'UNLOCKED' THEN
    RETURN jsonb_build_object(
      'is_locked', false,
      'locked_until', null,
      'seconds_remaining', 0,
      'was_unlocked', (v_rec.lockout_status = 'UNLOCKED' OR v_rec.locked_until <= v_now)
    );
  END IF;

  RETURN jsonb_build_object(
    'is_locked', true,
    'locked_until', v_rec.locked_until,
    'seconds_remaining', GREATEST(0, EXTRACT(EPOCH FROM (v_rec.locked_until - v_now))::INT),
    'was_unlocked', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_lockout_status_by_token(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. HIERARCHICAL UNLOCK ACCOUNT RPC
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

  -- Perform atomic unlock
  UPDATE public.account_security_state
  SET failed_attempts = 0,
      locked_until = NULL,
      lockout_status = 'UNLOCKED',
      lockout_token_hash = NULL,
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
      'previous_locked_until', v_sec.locked_until
    )
  );

  INSERT INTO public.audit_logs (
    actor_id, action, target_table, target_id, new_data, reason
  ) VALUES (
    v_caller_id,
    'ACCOUNT_UNLOCKED',
    'account_security_state',
    v_sec.id,
    jsonb_build_object('email_masked', v_masked, 'unlocked_at', v_now),
    trim(p_reason)
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Account %s successfully unlocked by %s.', v_masked, v_caller_name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_account(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. GET LOCKED ACCOUNTS RPC (For Security -> Login Lockouts Console)
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
      p.display_name,
      COALESCE(p.role, 'USER') as user_role,
      ass.updated_at
    FROM public.account_security_state ass
    LEFT JOIN public.profiles p ON ass.user_id = p.id
    WHERE ass.locked_until IS NOT NULL AND ass.locked_until > now()
    ORDER BY ass.locked_until DESC
  ) row_data;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_locked_accounts() TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. AUTHORITATIVE request_password_reset RPC WITH SERVER-SIDE THROTTLE
-- ----------------------------------------------------------------------------
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

  -- 2. Lookup user_id if account exists (never leaked to public)
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

  -- 4. Insert notification for administrators
  INSERT INTO public.notifications (
    type, title, message, target_id, dedup_key, created_at
  ) VALUES (
    'PASSWORD_RESET',
    format('Password Reset Requested: %s', v_masked),
    format('User requested password reset [%s]. Account verified: %s.', v_request_code, CASE WHEN v_user_id IS NOT NULL THEN 'YES' ELSE 'NO' END),
    '/admin',
    format('pwd_reset_%s_%s', v_norm_email, to_char(v_now, 'YYYYMMDDHH24MI')),
    v_now
  );

  -- 5. Append security event
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

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
