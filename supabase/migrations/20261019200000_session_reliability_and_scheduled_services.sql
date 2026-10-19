-- ==============================================================================
-- KUVENTORY MIGRATION: 20261019200000_session_reliability_and_scheduled_services.sql
-- Description: Session Lease Reliability, Explicit Takeover, and Scheduled Services
-- Author: Senior Database & Security Engineer
-- ==============================================================================

-- 1. Ensure REPLICA IDENTITY FULL on user_session_leases for realtime accuracy
ALTER TABLE public.user_session_leases REPLICA IDENTITY FULL;

-- 2. HARDENED SESSION HEARTBEAT RPC
-- Prevents renewal of expired leases under FOR UPDATE row-level lock.
-- Rejects unauthenticated callers, missing rows, revoked sessions, and superseded client IDs.
CREATE OR REPLACE FUNCTION public.heartbeat_user_session(
  p_client_id TEXT,
  p_lease_seconds INT DEFAULT 45
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
  v_duration INT := COALESCE(p_lease_seconds, 45);
  v_new_expiry TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'UNAUTHENTICATED', 
      'message', 'Authentication required to renew session lease.'
    );
  END IF;

  -- Bound requested lease between 10 and 300 seconds
  IF v_duration < 10 THEN v_duration := 10; END IF;
  IF v_duration > 300 THEN v_duration := 300; END IF;

  -- Lock target user's lease row exclusively
  SELECT * INTO v_lease
  FROM public.user_session_leases
  WHERE user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'NO_LEASE', 
      'message', 'Your session lease could not be verified. Please sign in again.'
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

  -- Terminal Case 2: Client identity mismatch (Account signed in on another device)
  IF v_lease.client_id IS DISTINCT FROM p_client_id THEN
    RETURN jsonb_build_object(
      'status', 'SUPERSEDED_OR_OCCUPIED',
      'message', 'This account is now active on another browser or device.'
    );
  END IF;

  -- Terminal Case 3: Lease has already expired past clock_timestamp() or status is EXPIRED
  -- Never resurrect an EXPIRED row or a lease whose timestamp has passed.
  IF v_lease.status = 'EXPIRED' OR v_lease.lease_expires_at <= v_now THEN
    UPDATE public.user_session_leases
       SET status = 'EXPIRED'
     WHERE id = v_lease.id
       AND status <> 'REVOKED';

    RETURN jsonb_build_object(
      'status', 'EXPIRED',
      'message', 'Your session expired because it could not be verified in time. Please sign in again.'
    );
  END IF;

  -- Non-active state check
  IF v_lease.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'status', 'EXPIRED', 
      'message', 'Your session is no longer active. Please sign in again.'
    );
  END IF;

  -- Atomic extension of valid active lease
  UPDATE public.user_session_leases
     SET last_heartbeat_at = v_now,
         lease_expires_at = v_now + (v_duration || ' seconds')::INTERVAL,
         status = 'ACTIVE'
   WHERE id = v_lease.id
     AND user_id = v_uid
     AND client_id = p_client_id
     AND status = 'ACTIVE'
     AND lease_expires_at > v_now
   RETURNING lease_expires_at INTO v_new_expiry;

  IF v_new_expiry IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'EXPIRED', 
      'message', 'Your session could not be renewed. Please sign in again.'
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'ACTIVE', 
    'lease_expires_at', v_new_expiry
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.heartbeat_user_session(TEXT, INT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_user_session(TEXT, INT) TO authenticated;


-- 3. HARDENED SESSION CLAIM & ATOMIC TAKEOVER RPC
-- Supports explicit user-confirmed takeover of active sessions.
CREATE OR REPLACE FUNCTION public.claim_user_session(
  p_session_id TEXT,
  p_client_id TEXT,
  p_device_info TEXT,
  p_lease_seconds INT DEFAULT 45,
  p_force_takeover BOOLEAN DEFAULT false
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
  v_duration INT := COALESCE(p_lease_seconds, 45);
  v_expires_at TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'reason', 'UNAUTHENTICATED', 
      'message', 'User authentication required to claim session.'
    );
  END IF;

  IF v_duration < 10 THEN v_duration := 10; END IF;
  IF v_duration > 300 THEN v_duration := 300; END IF;

  v_expires_at := v_now + (v_duration || ' seconds')::INTERVAL;

  -- Lock existing lease row for this user to guarantee atomic decision
  SELECT * INTO v_lease
  FROM public.user_session_leases
  WHERE user_id = v_uid
  FOR UPDATE;

  -- CASE 1: Active unexpired session already held by another client instance
  IF FOUND AND 
     v_lease.status = 'ACTIVE' AND 
     v_lease.lease_expires_at > v_now AND 
     v_lease.client_id <> p_client_id THEN

    -- If caller did NOT request explicit takeover, reject with OCCUPIED details
    IF NOT p_force_takeover THEN
      INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
      VALUES (
        v_uid, 
        'SESSION_DENIED_OCCUPIED', 
        'user_session_leases', 
        v_lease.id::text, 
        jsonb_build_object(
          'attempted_client_id', p_client_id,
          'active_client_id', v_lease.client_id,
          'active_device_info', v_lease.device_info,
          'lease_expires_at', v_lease.lease_expires_at
        )
      );

      RETURN jsonb_build_object(
        'success', false,
        'reason', 'OCCUPIED',
        'message', 'This account is currently active on another device.',
        'occupied_device_info', v_lease.device_info,
        'occupied_since', v_lease.created_at,
        'last_seen', v_lease.last_heartbeat_at
      );
    ELSE
      -- ATOMIC TAKEOVER: Caller confirmed takeover. Supersede old lease.
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

      INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
      VALUES (
        v_uid, 
        'SESSION_TAKEOVER_CLAIMED', 
        'user_session_leases', 
        v_lease.id::text, 
        jsonb_build_object(
          'prior_client_id', v_lease.client_id,
          'new_client_id', p_client_id,
          'prior_device_info', v_lease.device_info,
          'new_device_info', p_device_info,
          'lease_duration_sec', v_duration
        )
      );

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
    );
  ELSE
    -- CASE 3: Lease expired, was revoked, or is being re-claimed by the SAME client_id
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
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, target_table, new_data)
  VALUES (
    v_uid, 
    'SESSION_CLAIMED', 
    'user_session_leases', 
    jsonb_build_object(
      'client_id', p_client_id,
      'device_info', p_device_info,
      'lease_duration_sec', v_duration
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'client_id', p_client_id,
    'lease_expires_at', v_expires_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_user_session(TEXT, TEXT, TEXT, INT, BOOLEAN) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_user_session(TEXT, TEXT, TEXT, INT, BOOLEAN) TO authenticated;


-- 4. HARDENED SESSION REVOCATION RPC (FOR ADMINS)
CREATE OR REPLACE FUNCTION public.revoke_user_session_lease(
  p_client_id TEXT,
  p_reason TEXT DEFAULT 'Session ended by administrator'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_revoked_count INTEGER := 0;
  v_target_user_id UUID;
BEGIN
  IF NOT (public.is_admin() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied. Only authorized administrators may revoke remote session leases.';
  END IF;

  SELECT user_id INTO v_target_user_id
  FROM public.user_session_leases
  WHERE client_id = p_client_id;

  UPDATE public.user_session_leases
  SET status = 'REVOKED',
      revoked_by = v_actor_id,
      revoked_at = clock_timestamp(),
      revocation_reason = COALESCE(p_reason, 'Session ended by administrator')
  WHERE client_id = p_client_id;

  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

  -- Record audit log
  INSERT INTO public.audit_logs (
    actor_id,
    action,
    target_table,
    target_id,
    new_data
  ) VALUES (
    v_actor_id,
    'SESSION_LEASE_REVOKED',
    'user_session_leases',
    p_client_id,
    jsonb_build_object(
      'client_id', p_client_id,
      'target_user_id', v_target_user_id,
      'revoked_count', v_revoked_count,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'client_id', p_client_id,
    'revoked_count', v_revoked_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_user_session_lease(TEXT, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_user_session_lease(TEXT, TEXT) TO authenticated;


-- 5. TRUTHFUL ACTIVE & RECENT USER SESSIONS RPC
CREATE OR REPLACE FUNCTION public.get_active_user_sessions()
RETURNS TABLE (
  lease_id UUID,
  user_id UUID,
  email TEXT,
  role TEXT,
  display_name TEXT,
  client_id TEXT,
  device_info TEXT,
  created_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  status TEXT,
  is_occupied_now BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator access required.';
  END IF;

  RETURN QUERY
  SELECT 
    l.id AS lease_id,
    l.user_id,
    u.email::text,
    COALESCE(p.role, 'USER') AS role,
    COALESCE(p.display_name, u.email::text) AS display_name,
    l.client_id,
    l.device_info,
    l.created_at,
    l.last_heartbeat_at,
    l.lease_expires_at,
    CASE 
      WHEN l.status = 'REVOKED' THEN 'REVOKED'
      WHEN l.status = 'EXPIRED' OR l.lease_expires_at <= clock_timestamp() THEN 'EXPIRED'
      ELSE 'ACTIVE'
    END AS status,
    (l.status = 'ACTIVE' AND l.lease_expires_at > clock_timestamp()) AS is_occupied_now
  FROM public.user_session_leases l
  JOIN auth.users u ON l.user_id = u.id
  LEFT JOIN public.profiles p ON l.user_id = p.id
  ORDER BY l.last_heartbeat_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_user_sessions() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_user_sessions() TO authenticated;
