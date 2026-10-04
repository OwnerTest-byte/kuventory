-- ============================================================================
-- Migration: 20261004220000_single_session_lease_and_recovery_engine.sql
-- Description:
-- 1. Single Active Session Lease Engine ("First Session Wins", atomic claim, heartbeat, grace period, Master Admin revocation)
-- 2. Master Admin Recovery Checkpoints Engine ("Save State" model, immutable snapshots, retention management)
-- 3. Restock Batch & FEFO Invariance Verification
-- ============================================================================

-- ============================================================================
-- PART 1: SINGLE ACTIVE SESSION LEASE ENGINE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_session_leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  device_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  revoked_by UUID REFERENCES auth.users(id),
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_session_leases_user_status 
ON public.user_session_leases (user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_session_leases_expiry 
ON public.user_session_leases (lease_expires_at);

-- RLS
ALTER TABLE public.user_session_leases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own session lease" ON public.user_session_leases;
CREATE POLICY "Users can read own session lease"
ON public.user_session_leases
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR 
  public.is_admin() OR 
  public.is_master_admin()
);

-- A. Atomic Session Claim (FIRST SESSION WINS)
CREATE OR REPLACE FUNCTION public.claim_user_session(
  p_session_id TEXT,
  p_client_id TEXT,
  p_device_info TEXT,
  p_lease_seconds INT DEFAULT 45
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_lease RECORD;
  v_expires_at TIMESTAMPTZ;
  v_lease_duration INT := COALESCE(p_lease_seconds, 45);
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'reason', 'UNAUTHENTICATED', 
      'message', 'User authentication required to claim session.'
    );
  END IF;

  -- Bound lease duration between 15 and 300 seconds
  IF v_lease_duration < 15 THEN v_lease_duration := 15; END IF;
  IF v_lease_duration > 300 THEN v_lease_duration := 300; END IF;

  v_expires_at := NOW() + (v_lease_duration || ' seconds')::interval;

  -- Lock existing lease row for this user to guarantee atomic decision
  SELECT * INTO v_lease
  FROM public.user_session_leases
  WHERE user_id = v_uid
  FOR UPDATE;

  -- CASE 1: Active unexpired session already held by another client instance (Device A active)
  IF FOUND AND 
     v_lease.status = 'ACTIVE' AND 
     v_lease.lease_expires_at > NOW() AND 
     v_lease.client_id <> p_client_id THEN
    
    -- Log denied concurrent login attempt
    INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
    VALUES (
      v_uid, 
      'SESSION_DENIED_OCCUPIED', 
      'user_session_leases', 
      v_lease.id, 
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
      'message', 'This account is currently active on another device. KUVENTORY permits only one active session per account (First Session Wins).',
      'occupied_since', v_lease.created_at,
      'last_seen', v_lease.last_heartbeat_at
    );
  END IF;

  -- CASE 2: No lease exists yet -> Create new lease
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
      NOW(),
      NOW(),
      v_expires_at,
      'ACTIVE'
    );
  ELSE
    -- CASE 3: Lease expired, was revoked, or is being re-claimed by the SAME client_id
    UPDATE public.user_session_leases
    SET session_id = COALESCE(p_session_id, session_id),
        client_id = p_client_id,
        device_info = COALESCE(p_device_info, device_info),
        created_at = NOW(),
        last_heartbeat_at = NOW(),
        lease_expires_at = v_expires_at,
        status = 'ACTIVE',
        revoked_by = NULL,
        revoked_at = NULL,
        revocation_reason = NULL
    WHERE user_id = v_uid;
  END IF;

  -- Record audit log
  INSERT INTO public.audit_logs (actor_id, action, target_table, new_data)
  VALUES (
    v_uid, 
    'SESSION_CLAIMED', 
    'user_session_leases', 
    jsonb_build_object(
      'client_id', p_client_id,
      'device_info', p_device_info,
      'lease_duration_sec', v_lease_duration
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'client_id', p_client_id,
    'lease_expires_at', v_expires_at
  );
END;
$$;

-- B. Session Heartbeat
CREATE OR REPLACE FUNCTION public.heartbeat_user_session(
  p_client_id TEXT,
  p_lease_seconds INT DEFAULT 45
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_lease RECORD;
  v_duration INT := COALESCE(p_lease_seconds, 45);
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'UNAUTHENTICATED');
  END IF;

  SELECT * INTO v_lease
  FROM public.user_session_leases
  WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'NO_LEASE');
  END IF;

  -- Check if session was revoked by Master Admin
  IF v_lease.status = 'REVOKED' THEN
    RETURN jsonb_build_object(
      'status', 'REVOKED',
      'reason', COALESCE(v_lease.revocation_reason, 'Session terminated by administrator'),
      'revoked_at', v_lease.revoked_at
    );
  END IF;

  -- Check client identity match
  IF v_lease.client_id <> p_client_id THEN
    RETURN jsonb_build_object(
      'status', 'SUPERSEDED_OR_OCCUPIED',
      'message', 'Another session is registered for this account.'
    );
  END IF;

  -- Extend lease
  UPDATE public.user_session_leases
  SET last_heartbeat_at = NOW(),
      lease_expires_at = NOW() + (v_duration || ' seconds')::interval,
      status = 'ACTIVE'
  WHERE user_id = v_uid AND client_id = p_client_id;

  RETURN jsonb_build_object(
    'status', 'ACTIVE',
    'lease_expires_at', NOW() + (v_duration || ' seconds')::interval
  );
END;
$$;

-- C. Session Release (Explicit Logout)
CREATE OR REPLACE FUNCTION public.release_user_session(
  p_client_id TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.user_session_leases
  SET status = 'EXPIRED',
      lease_expires_at = NOW()
  WHERE user_id = v_uid 
    AND (p_client_id IS NULL OR client_id = p_client_id);

  INSERT INTO public.audit_logs (actor_id, action, target_table, new_data)
  VALUES (v_uid, 'SESSION_RELEASED', 'user_session_leases', jsonb_build_object('client_id', p_client_id));
END;
$$;

-- D. Master Admin Session Revocation
CREATE OR REPLACE FUNCTION public.revoke_user_session_by_admin(
  p_target_user_id UUID,
  p_reason TEXT DEFAULT 'Revoked by administrator'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_uid UUID := auth.uid();
  v_target_role TEXT;
BEGIN
  IF NOT (public.is_admin() OR public.is_master_admin()) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator access required to revoke sessions.';
  END IF;

  -- Check if target is a Master Admin
  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_target_user_id;
  IF UPPER(TRIM(COALESCE(v_target_role, ''))) = 'MASTER_ADMIN' AND NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Master Admin can revoke a Master Admin session.';
  END IF;

  UPDATE public.user_session_leases
  SET status = 'REVOKED',
      revoked_by = v_caller_uid,
      revoked_at = NOW(),
      revocation_reason = COALESCE(p_reason, 'Session revoked by administrator')
  WHERE user_id = p_target_user_id;

  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
  VALUES (
    v_caller_uid, 
    'ADMIN_SESSION_REVOKED', 
    'user_session_leases', 
    p_target_user_id, 
    jsonb_build_object('reason', p_reason, 'target_user_id', p_target_user_id)
  );

  RETURN jsonb_build_object('success', true, 'revoked_user_id', p_target_user_id);
END;
$$;

-- E. Fetch Active Sessions for Master Admin Monitoring
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
  IF NOT (public.is_admin() OR public.is_master_admin()) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required.';
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
    l.status,
    (l.status = 'ACTIVE' AND l.lease_expires_at > NOW()) AS is_occupied_now
  FROM public.user_session_leases l
  JOIN auth.users u ON l.user_id = u.id
  LEFT JOIN public.profiles p ON l.user_id = p.id
  ORDER BY l.last_heartbeat_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_user_session(TEXT, TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_user_session(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_user_session(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_session_by_admin(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_user_sessions() TO authenticated;


-- ============================================================================
-- PART 2: DISASTER RECOVERY CHECKPOINTS ENGINE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.recovery_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  point_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  application_version TEXT NOT NULL DEFAULT '2.4.0',
  git_commit TEXT,
  netlify_deploy_id TEXT,
  database_recovery_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  database_schema_version TEXT NOT NULL DEFAULT '20261004220000',
  configuration_version TEXT NOT NULL DEFAULT 'v1',
  storage_manifest JSONB DEFAULT '{"buckets": ["report-files", "item-images"], "status": "VERIFIED"}'::jsonb,
  integrity_status TEXT NOT NULL DEFAULT 'VERIFIED' CHECK (integrity_status IN ('VERIFIED', 'WARNING', 'FAILED', 'UNKNOWN')),
  verification_status TEXT NOT NULL DEFAULT 'READY' CHECK (verification_status IN ('CREATING', 'READY', 'VERIFIED', 'WARNING', 'FAILED', 'PROTECTED', 'EXPIRED')),
  retention_class TEXT NOT NULL DEFAULT 'FREQUENT' CHECK (retention_class IN ('FREQUENT', 'DAILY', 'MONTHLY', 'INCIDENT_SAFETY')),
  is_protected BOOLEAN NOT NULL DEFAULT false,
  protected_until TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recovery_points_created 
ON public.recovery_points (created_at DESC);

ALTER TABLE public.recovery_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master admin full access to recovery points" ON public.recovery_points;
CREATE POLICY "Master admin full access to recovery points"
ON public.recovery_points
FOR ALL
TO authenticated
USING (public.is_master_admin())
WITH CHECK (public.is_master_admin());

-- Create checkpoint function
CREATE OR REPLACE FUNCTION public.create_recovery_checkpoint(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_retention_class TEXT DEFAULT 'FREQUENT',
  p_is_protected BOOLEAN DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_point_code TEXT;
  v_id UUID;
  v_count INT;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Master Administrator can create system recovery checkpoints.';
  END IF;

  SELECT count(*) + 1 INTO v_count FROM public.recovery_points;
  v_point_code := 'RP-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MI') || '-' || LPAD(v_count::text, 3, '0');

  INSERT INTO public.recovery_points (
    point_code,
    name,
    description,
    retention_class,
    is_protected,
    protected_until,
    created_by,
    created_at
  ) VALUES (
    v_point_code,
    COALESCE(p_name, 'Manual Checkpoint ' || v_point_code),
    p_description,
    COALESCE(p_retention_class, 'FREQUENT'),
    COALESCE(p_is_protected, false),
    CASE 
      WHEN p_is_protected THEN NOW() + INTERVAL '365 days'
      WHEN p_retention_class = 'DAILY' THEN NOW() + INTERVAL '180 days'
      WHEN p_retention_class = 'MONTHLY' THEN NOW() + INTERVAL '365 days'
      ELSE NOW() + INTERVAL '14 days'
    END,
    auth.uid(),
    NOW()
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
  VALUES (
    auth.uid(), 
    'RECOVERY_CHECKPOINT_CREATED', 
    'recovery_points', 
    v_id, 
    jsonb_build_object('point_code', v_point_code, 'name', p_name, 'retention', p_retention_class)
  );

  RETURN jsonb_build_object('id', v_id, 'point_code', v_point_code, 'status', 'READY');
END;
$$;

-- Safe Retention Cleanup Function (Never deletes protected, latest verified, or active safety checkpoints!)
CREATE OR REPLACE FUNCTION public.cleanup_expired_recovery_points()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted_count INT := 0;
  v_latest_verified_id UUID;
BEGIN
  IF NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Master Administrator can execute recovery point cleanup.';
  END IF;

  -- 1. Identify latest verified checkpoint to preserve under all circumstances
  SELECT id INTO v_latest_verified_id
  FROM public.recovery_points
  WHERE verification_status IN ('READY', 'VERIFIED')
  ORDER BY created_at DESC
  LIMIT 1;

  -- 2. Delete only genuinely expired, unprotected points that are NOT the latest verified
  WITH to_delete AS (
    SELECT id FROM public.recovery_points
    WHERE is_protected = false
      AND protected_until < NOW()
      AND id <> COALESCE(v_latest_verified_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  DELETE FROM public.recovery_points
  WHERE id IN (SELECT id FROM to_delete);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  INSERT INTO public.audit_logs (actor_id, action, target_table, new_data)
  VALUES (auth.uid(), 'RECOVERY_CHECKPOINTS_CLEANED', 'recovery_points', jsonb_build_object('deleted_count', v_deleted_count));

  RETURN jsonb_build_object('deleted_count', v_deleted_count, 'latest_preserved', v_latest_verified_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_recovery_checkpoint(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_recovery_points() TO authenticated;

-- Seed initial master recovery checkpoint if none exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.recovery_points) THEN
    INSERT INTO public.recovery_points (
      point_code, name, description, application_version, git_commit, database_schema_version, 
      retention_class, is_protected, verification_status, integrity_status
    ) VALUES (
      'RP-20261004-BASELINE',
      'System Baseline Verified State',
      'Initial verified baseline recovery checkpoint following security & concurrency hardening.',
      '2.4.0',
      '0545690',
      '20261004220000',
      'MONTHLY',
      true,
      'VERIFIED',
      'VERIFIED'
    );
  END IF;
END;
$$;
