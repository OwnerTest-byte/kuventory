-- ==============================================================================
-- KUVENTORY MIGRATION: 20261022010000_fix_session_hostility_and_overload.sql
-- Description: Fix PostgREST function overloading ambiguity on claim_user_session,
--              extend lease duration to 300s, prevent false-positive logouts,
--              and allow seamless credential-authenticated login takeovers.
-- ==============================================================================

-- 1. Drop ambiguous legacy 4-argument overload of claim_user_session
DROP FUNCTION IF EXISTS public.claim_user_session(TEXT, TEXT, TEXT, INT);

-- 2. Canonical claim_user_session RPC with p_force_takeover DEFAULT true
CREATE OR REPLACE FUNCTION public.claim_user_session(
  p_session_id TEXT,
  p_client_id TEXT,
  p_device_info TEXT,
  p_lease_seconds INT DEFAULT 300,
  p_force_takeover BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_lease RECORD;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_duration INT := COALESCE(p_lease_seconds, 300);
  v_expires_at TIMESTAMPTZ;
  v_target_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'reason', 'UNAUTHENTICATED', 
      'message', 'User authentication required to claim session.'
    );
  END IF;

  IF v_duration < 10 THEN v_duration := 10; END IF;
  IF v_duration > 3600 THEN v_duration := 3600; END IF;

  v_expires_at := v_now + (v_duration || ' seconds')::INTERVAL;

  -- Lock existing lease row for this user
  SELECT * INTO v_lease
  FROM public.user_session_leases
  WHERE user_id = v_uid
  FOR UPDATE;

  -- CASE 1: Active unexpired session held by another client
  IF FOUND AND 
     v_lease.status = 'ACTIVE' AND 
     v_lease.lease_expires_at > v_now AND 
     v_lease.client_id <> p_client_id THEN

    -- If caller explicitly declined takeover (e.g. passive probe)
    IF p_force_takeover IS FALSE THEN
      RETURN jsonb_build_object(
        'success', false,
        'reason', 'OCCUPIED',
        'message', 'This account is currently active on another device.',
        'occupied_device_info', v_lease.device_info,
        'occupied_since', v_lease.created_at,
        'last_seen', v_lease.last_heartbeat_at
      );
    ELSE
      -- ATOMIC TAKEOVER: Legitimate credential login supersedes previous session lease
      UPDATE public.user_session_leases
      SET session_id = COALESCE(p_session_id, session_id),
          client_id = p_client_id,
          device_info = COALESCE(p_device_info, device_info),
          created_at = v_now,
          last_heartbeat_at = v_now,
          lease_expires_at = v_expires_at,
          status = 'ACTIVE',
          revoked_by = NULL,
          revoked_at = NULL,
          revocation_reason = NULL
      WHERE id = v_lease.id;

      BEGIN
        INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
        VALUES (
          v_uid, 
          'SESSION_TAKEOVER_CLAIMED', 
          'user_session_leases', 
          v_lease.id, 
          jsonb_build_object(
            'prior_client_id', v_lease.client_id,
            'new_client_id', p_client_id,
            'new_device_info', p_device_info,
            'lease_duration_sec', v_duration
          )
        );
      EXCEPTION WHEN OTHERS THEN
        -- Audit log failure should never abort valid authentication
      END;

      RETURN jsonb_build_object(
        'success', true,
        'client_id', p_client_id,
        'lease_expires_at', v_expires_at,
        'takeover', true
      );
    END IF;
  END IF;

  -- CASE 2: No lease exists yet -> Create new lease row
  IF NOT FOUND THEN
    INSERT INTO public.user_session_leases (
      user_id,
      session_id,
      client_id,
      device_info,
      created_at,
      last_heartbeat_at,
      lease_expires_at,
      status
    ) VALUES (
      v_uid,
      COALESCE(p_session_id, 'SESSION_' || gen_random_uuid()),
      p_client_id,
      p_device_info,
      v_now,
      v_now,
      v_expires_at,
      'ACTIVE'
    ) RETURNING id INTO v_target_id;
  ELSE
    -- CASE 3: Lease expired, was revoked, or is being re-claimed by SAME client_id
    UPDATE public.user_session_leases
    SET session_id = COALESCE(p_session_id, session_id),
        client_id = p_client_id,
        device_info = COALESCE(p_device_info, device_info),
        created_at = v_now,
        last_heartbeat_at = v_now,
        lease_expires_at = v_expires_at,
        status = 'ACTIVE',
        revoked_by = NULL,
        revoked_at = NULL,
        revocation_reason = NULL
    WHERE id = v_lease.id
    RETURNING id INTO v_target_id;
  END IF;

  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
    VALUES (
      v_uid, 
      'SESSION_CLAIMED', 
      'user_session_leases', 
      v_target_id,
      jsonb_build_object(
        'client_id', p_client_id,
        'device_info', p_device_info,
        'lease_duration_sec', v_duration
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Audit log failure should never abort valid session claim
  END;

  RETURN jsonb_build_object(
    'success', true,
    'client_id', p_client_id,
    'lease_expires_at', v_expires_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_user_session(TEXT, TEXT, TEXT, INT, BOOLEAN) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_user_session(TEXT, TEXT, TEXT, INT, BOOLEAN) TO authenticated;

-- 3. Resilient heartbeat_user_session RPC
-- Seamlessly auto-renews for authenticated users without kicking them out on transient background timer throttling
CREATE OR REPLACE FUNCTION public.heartbeat_user_session(
  p_client_id TEXT,
  p_lease_seconds INT DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_lease RECORD;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_duration INT := COALESCE(p_lease_seconds, 300);
  v_new_expiry TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'UNAUTHENTICATED', 
      'message', 'Authentication required to renew session lease.'
    );
  END IF;

  IF v_duration < 10 THEN v_duration := 10; END IF;
  IF v_duration > 3600 THEN v_duration := 3600; END IF;

  -- Lock target user's lease row exclusively
  SELECT * INTO v_lease
  FROM public.user_session_leases
  WHERE user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Auto-heal: Insert new active lease for this authenticated user rather than terminating
    INSERT INTO public.user_session_leases (
      user_id,
      session_id,
      client_id,
      device_info,
      created_at,
      last_heartbeat_at,
      lease_expires_at,
      status
    ) VALUES (
      v_uid,
      'SESSION_' || gen_random_uuid(),
      p_client_id,
      'Web Browser',
      v_now,
      v_now,
      v_now + (v_duration || ' seconds')::INTERVAL,
      'ACTIVE'
    ) RETURNING lease_expires_at INTO v_new_expiry;

    RETURN jsonb_build_object(
      'status', 'ACTIVE', 
      'lease_expires_at', v_new_expiry
    );
  END IF;

  -- Terminal Case 1: Session was explicitly revoked by an administrator
  IF v_lease.status = 'REVOKED' THEN
    RETURN jsonb_build_object(
      'status', 'REVOKED',
      'reason', COALESCE(v_lease.revocation_reason, 'Your session was ended by an administrator.'),
      'revoked_at', v_lease.revoked_at
    );
  END IF;

  -- Terminal Case 2: Client identity mismatch ONLY if another device is currently active within its lease window
  IF v_lease.client_id IS DISTINCT FROM p_client_id AND v_lease.status = 'ACTIVE' AND v_lease.lease_expires_at > v_now THEN
    RETURN jsonb_build_object(
      'status', 'SUPERSEDED_OR_OCCUPIED',
      'message', 'This account is now active on another browser or device.'
    );
  END IF;

  -- Atomic renewal of lease (revives expired or extends active lease for this client)
  v_new_expiry := v_now + (v_duration || ' seconds')::INTERVAL;
  UPDATE public.user_session_leases
     SET last_heartbeat_at = v_now,
         lease_expires_at = v_new_expiry,
         client_id = p_client_id,
         status = 'ACTIVE'
   WHERE id = v_lease.id;

  RETURN jsonb_build_object(
    'status', 'ACTIVE', 
    'lease_expires_at', v_new_expiry
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.heartbeat_user_session(TEXT, INT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_user_session(TEXT, INT) TO authenticated;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
