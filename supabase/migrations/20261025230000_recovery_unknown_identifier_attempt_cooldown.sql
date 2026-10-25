-- ============================================================================
-- MIGRATION: 20261025230000_recovery_unknown_identifier_attempt_cooldown.sql
-- PURPOSE:
--   Wrong-identifier attempts on the assisted recovery dialog are now counted:
--   5 submissions for identifiers that match no KUVENTORY account (per
--   identifier, within a 15-minute window) trigger a 2-minute COOLDOWN —
--   explicitly NOT a lockout. The account is untouched; no lockout row is
--   created; a correct identifier is never blocked by this mechanism.
--   DESIGN (owner decision, 2026-10-25):
--     - Cooldown duration 2 minutes = the existing recovery cooldown.
--     - Counter resets fully once the cooldown expires (generation marker).
--     - Audit trail stays append-only: the marker is an event row, no deletes.
--   check_assisted_recovery_cooldown v2 additionally reports an active
--   unknown-identifier cooldown so a reopened dialog still shows the truth.
-- Forward-only. No changes to the existing-account ticket path, lockout
-- policy, RLS, or notification routing.
-- ============================================================================

-- Supporting index for per-mask generation counting (converged name).
CREATE INDEX IF NOT EXISTS idx_security_events_type_masked_time
  ON public.security_events (event_type, email_masked, created_at DESC);

-- ----------------------------------------------------------------------------
-- 1. submit_assisted_recovery_request v4 — UNKNOWN-IDENTIFIER ATTEMPT LIMIT
--    Only the unknown-account branch changes; the existing-account path below
--    is byte-for-byte the v3 behavior.
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
  v_unknown_count INT := 0;
  v_gen_start TIMESTAMPTZ;
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
    -- UNKNOWN IDENTIFIER: countable wrong attempt + generation cooldown.
    -- Serialize per identifier so concurrent submissions cannot undercount.
    -- ------------------------------------------------------------------
    PERFORM pg_advisory_xact_lock(hashtext('kuventory_recovery_unknown:' || v_norm_email)::bigint);

    -- Generation marker: the cooldown event that started the most recent
    -- 2-minute cooldown for this masked identifier. Attempts are counted
    -- only AFTER the latest marker, so an expired cooldown leaves the
    -- counter back at zero with no deletes (append-only audit).
    SELECT max(created_at) INTO v_gen_start
    FROM public.security_events
    WHERE event_type = 'ASSISTED_RECOVERY_UNKNOWN_COOLDOWN'
      AND email_masked = v_masked;

    IF v_gen_start IS NOT NULL AND (v_now - v_gen_start) < v_unknown_cooldown THEN
      v_next_allowed := v_gen_start + v_unknown_cooldown;
      v_seconds_rem := GREATEST(0, EXTRACT(EPOCH FROM (v_next_allowed - v_now))::INT);

      -- Cooldown already active: reject with the live remaining time and no
      -- additional side effects beyond this audit event.
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
        'server_now', v_now,
        'next_allowed_at', v_next_allowed,
        'seconds_remaining', v_seconds_rem,
        'message', 'Too many attempts with unknown identifiers. Please wait before trying again.'
      );
    END IF;

    -- Wrong attempts in the CURRENT generation (after the latest marker)
    -- and inside the 15-minute window.
    SELECT count(*) INTO v_unknown_count
    FROM public.security_events
    WHERE event_type = 'ASSISTED_RECOVERY_UNKNOWN_ACCOUNT'
      AND email_masked = v_masked
      AND created_at > GREATEST(COALESCE(v_gen_start, timestamptz '-infinity'), v_now - v_unknown_window);

    -- Record this attempt first: both branches below have now used one of
    -- the five allowed wrong attempts.
    INSERT INTO public.security_events (
      event_type, email_masked, details
    ) VALUES (
      'ASSISTED_RECOVERY_UNKNOWN_ACCOUNT', v_masked,
      jsonb_build_object('reason', 'no matching KUVENTORY account')
    );

    IF v_unknown_count >= 4 THEN
      -- This submission is the 5th wrong attempt: start the cooldown. This
      -- is a COOLDOWN, not a lockout — no account state is modified.
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
        'server_now', v_now,
        'next_allowed_at', v_now + v_unknown_cooldown,
        'seconds_remaining', EXTRACT(EPOCH FROM v_unknown_cooldown)::INT,
        'message', 'Too many attempts with unknown identifiers. Please wait 2 minutes before trying again.'
      );
    END IF;

    RETURN jsonb_build_object(
      'accepted', false,
      'account_exists', false,
      'server_now', v_now,
      'attempts_remaining', 4 - v_unknown_count,
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
-- 2. check_assisted_recovery_cooldown v2 — ALSO REPORTS THE UNKNOWN-
--    IDENTIFIER COOLDOWN. Response shape is unchanged; callers keep a single
--    cooldown pipeline. The returned next_allowed_at is the LATER of the
--    ticket cooldown and the active unknown-identifier cooldown, with an
--    accurate message naming which limit applies.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_assisted_recovery_cooldown(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_norm_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_masked TEXT;
  v_now TIMESTAMPTZ := now();
  v_last TIMESTAMPTZ;
  v_marker TIMESTAMPTZ;
  v_next_allowed TIMESTAMPTZ;
  v_unknown_next TIMESTAMPTZ;
  v_seconds_rem INT := 0;
  v_cooldown CONSTANT INTERVAL := interval '2 minutes';
  v_unknown_cooldown CONSTANT INTERVAL := interval '2 minutes';
BEGIN
  IF v_norm_email = '' OR position('@' in v_norm_email) = 0 THEN
    RETURN jsonb_build_object(
      'valid', false,
      'can_submit', false,
      'server_now', v_now,
      'message', 'Enter your account login identifier to check availability.'
    );
  END IF;

  v_masked := public.mask_email(v_norm_email);

  -- Ticket cooldown for an existing account (authoritative table row).
  SELECT max(created_at) INTO v_last
  FROM public.account_recovery_requests
  WHERE email_lookup = v_norm_email;

  IF v_last IS NOT NULL AND (v_now - v_last) < v_cooldown THEN
    v_next_allowed := v_last + v_cooldown;
  END IF;

  -- Unknown-identifier cooldown: same generation rule as submit v4.
  SELECT max(created_at) INTO v_marker
  FROM public.security_events
  WHERE event_type = 'ASSISTED_RECOVERY_UNKNOWN_COOLDOWN'
    AND email_masked = v_masked;

  IF v_marker IS NOT NULL AND (v_now - v_marker) < v_unknown_cooldown THEN
    v_unknown_next := v_marker + v_unknown_cooldown;
    IF v_next_allowed IS NULL OR v_unknown_next > v_next_allowed THEN
      v_next_allowed := v_unknown_next;
    END IF;
  END IF;

  IF v_next_allowed IS NOT NULL THEN
    v_seconds_rem := GREATEST(0, EXTRACT(EPOCH FROM (v_next_allowed - v_now))::INT);

    RETURN jsonb_build_object(
      'valid', true,
      'can_submit', false,
      'server_now', v_now,
      'next_allowed_at', v_next_allowed,
      'seconds_remaining', v_seconds_rem,
      'message', CASE
        WHEN v_unknown_next IS NOT NULL AND v_next_allowed = v_unknown_next
          THEN 'Too many attempts with unknown identifiers. Please wait before trying again.'
        ELSE 'A recovery request was recently submitted for this identifier. Please wait before submitting another.'
      END
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

-- Reload schema cache so PostgREST exposes the replaced functions immediately.
NOTIFY pgrst, 'reload schema';
