-- ============================================================================
-- MIGRATION: 20261025240000_recovery_attempt_state_exact_identifier.sql
-- PURPOSE:
--   Fixes a live-probe-verified defect in 20261025230000: the wrong-identifier
--   counter was keyed on the MASKED email, and public.mask_email collapses
--   distinct identifiers (e.g. manager@ / monitor@ -> 'm***r@kuventory.com').
--   Consequences observed live: one identifier's attempts contaminated another
--   (fresh identifier arrived pre-counted and could be throttled instantly).
--   FIX: per-EXACT-IDENTIFIER state, keyed by sha256(normalized identifier) in
--   a dedicated table — mirroring the account_security_state pattern used by
--   the login lockout. No raw identifier is stored; audit events stay masked.
--   Semantics unchanged and owner-approved: 5 unknown-identifier submissions
--   per identifier within 15 minutes -> 2-minute COOLDOWN (NOT a lockout);
--   allowance fully resets when the cooldown expires or the window lapses.
--   check_assisted_recovery_cooldown now reads the same state table.
-- CUTOVER NOTE: any unknown-identifier cooldown active at cutover (at most
--   2 minutes old, recorded only as a marker event) lapses. Acceptable on
--   this internal system; the new state table is authoritative from now on.
-- Forward-only. Existing-account ticket path, lockout policy, and RLS on
-- other objects are untouched.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Per-identifier attempt state (hash-keyed; invisible to all clients)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_recovery_attempt_state (
  identifier_hash TEXT PRIMARY KEY,
  unknown_attempts INT NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cooldown_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No policies + RLS enabled = deny all client roles; only the server
-- (SECURITY DEFINER functions running as owner) may read or write it.
ALTER TABLE public.account_recovery_attempt_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_recovery_attempt_state FROM anon, authenticated;

-- The mask-based counting index from 20261025230000 is dead: counting no
-- longer queries security_events at all.
DROP INDEX IF EXISTS public.idx_security_events_type_masked_time;

-- ----------------------------------------------------------------------------
-- 2. submit_assisted_recovery_request v5 — EXACT-IDENTIFIER ATTEMPT STATE
--    Only the unknown-identifier branch changes; the existing-account path is
--    byte-for-byte the v3/v4 behavior.
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
  v_id_hash TEXT;
  v_stored_attempts INT;
  v_stored_cooldown_until TIMESTAMPTZ;
  v_stored_last_attempt TIMESTAMPTZ;
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
    -- UNKNOWN IDENTIFIER: countable wrong attempt + cooldown, tracked per
    -- EXACT identifier (sha256 hash — distinct identifiers never share
    -- state even when their masks collide). Serialized under the advisory
    -- transaction lock so concurrent submissions cannot undercount.
    -- ------------------------------------------------------------------
    PERFORM pg_advisory_xact_lock(hashtext('kuventory_recovery_unknown:' || v_norm_email)::bigint);

    v_id_hash := encode(digest(v_norm_email, 'sha256'), 'hex');

    SELECT s.unknown_attempts, s.cooldown_until, s.last_attempt_at
    INTO v_stored_attempts, v_stored_cooldown_until, v_stored_last_attempt
    FROM public.account_recovery_attempt_state s
    WHERE s.identifier_hash = v_id_hash;

    -- Active cooldown: reject with the live remaining time; no state change.
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
        'server_now', v_now,
        'next_allowed_at', v_stored_cooldown_until,
        'seconds_remaining', v_seconds_rem,
        'message', 'Too many attempts with unknown identifiers. Please wait before trying again.'
      );
    END IF;

    -- Prior attempts that still count: only when the stored cooldown has
    -- expired AND the last attempt is inside the 15-minute window. An
    -- expired cooldown or a lapsed window starts a fresh 5-attempt
    -- allowance.
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
      -- This submission is the 5th wrong attempt inside the window: start
      -- the cooldown. This is a COOLDOWN, not a lockout — no account state
      -- is modified and no lockout token is issued.
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
        last_attempt_at = EXCLUDED.last_attempt_at,
        updated_at = EXCLUDED.updated_at;

    RETURN jsonb_build_object(
      'accepted', false,
      'account_exists', false,
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
-- 3. check_assisted_recovery_cooldown v3 — same combination logic, now reading
--    the per-identifier attempt state (exact, not mask-based). Response shape
--    is unchanged; callers keep a single cooldown pipeline.
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
  v_next_allowed TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
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

  -- Ticket cooldown for an existing account (authoritative table row).
  SELECT max(created_at) INTO v_last
  FROM public.account_recovery_requests
  WHERE email_lookup = v_norm_email;

  IF v_last IS NOT NULL AND (v_now - v_last) < v_cooldown THEN
    v_next_allowed := v_last + v_cooldown;
  END IF;

  -- Unknown-identifier cooldown: exact per-identifier state.
  SELECT s.cooldown_until INTO v_unknown_until
  FROM public.account_recovery_attempt_state s
  WHERE s.identifier_hash = encode(digest(v_norm_email, 'sha256'), 'hex');

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
