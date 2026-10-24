-- ============================================================================
-- MIGRATION: 20261025220000_recovery_account_existence_gate.sql
-- PURPOSE:
--   1. Recovery existence gate: submit_assisted_recovery_request must refuse
--      identifiers that match no KUVENTORY account. A password-recovery
--      ticket for a nonexistent account can never lead to an authorized
--      password change, so accepting it only creates misleading feedback and
--      administrative noise.
--      DESIGN TRADEOFF (owner decision, 2026-10-25): this internal staff
--      system prefers fail-fast validation with an explicit "no account
--      matches" response over anti-enumeration opacity. The existence signal
--      is acceptable here; ghost tickets are not.
--   2. Public support contacts v2: get_public_support_contacts now returns an
--      opted-in administrator ONLY when at least one public contact method
--      (support phone, support email, or >=1 public link) actually exists, so
--      the recovery screen never renders an empty contact card.
-- Forward-only. No policy changes to lockout, cooldown, or RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. submit_assisted_recovery_request v3 — ACCOUNT EXISTENCE GATE FIRST
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

  -- EXISTENCE GATE: resolve the account BEFORE anything else. Recovery is
  -- only meaningful for an account that exists; unknown identifiers are
  -- rejected with a clear message and no side effects beyond one audit event.
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_norm_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    INSERT INTO public.security_events (
      event_type, email_masked, details
    ) VALUES (
      'ASSISTED_RECOVERY_UNKNOWN_ACCOUNT', v_masked,
      jsonb_build_object('reason', 'no matching KUVENTORY account')
    );

    RETURN jsonb_build_object(
      'accepted', false,
      'account_exists', false,
      'server_now', v_now,
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
-- 2. get_public_support_contacts v2 — ONLY CONTACTS WITH REAL DETAILS
--    An opted-in administrator appears on the recovery/lockout screen only
--    when at least one public contact method exists: a non-empty support
--    phone, a non-empty support email, or one or more public profile links.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_support_contacts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(contact_row), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      p.display_name,
      COALESCE(p.job_title, CASE WHEN p.role = 'SUPER_ADMIN' THEN 'System Administrator' ELSE 'Branch Administrator' END) AS job_title,
      NULLIF(trim(COALESCE(p.support_phone, '')), '') AS support_phone,
      NULLIF(trim(COALESCE(p.support_email, '')), '') AS support_email,
      p.avatar_url,
      p.role,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', pcl.id,
          'label', pcl.label,
          'platform', pcl.platform,
          'url', pcl.url,
          'sort_order', pcl.sort_order
        ) ORDER BY pcl.sort_order ASC, pcl.created_at ASC)
        FROM public.profile_contact_links pcl
        WHERE pcl.profile_id = p.id AND pcl.is_public = true
      ), '[]'::jsonb) AS links
    FROM public.profiles p
    WHERE p.show_on_lockout_screen = true
      AND p.role IN ('ADMIN', 'SUPER_ADMIN')
      AND (
        NULLIF(trim(COALESCE(p.support_phone, '')), '') IS NOT NULL
        OR NULLIF(trim(COALESCE(p.support_email, '')), '') IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.profile_contact_links pcl
          WHERE pcl.profile_id = p.id AND pcl.is_public = true
        )
      )
    ORDER BY
      CASE WHEN p.role = 'SUPER_ADMIN' THEN 1 ELSE 2 END,
      p.created_at ASC
  ) contact_row;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_support_contacts() TO anon, authenticated;

-- Reload schema cache so PostgREST exposes the replaced functions immediately.
NOTIFY pgrst, 'reload schema';
