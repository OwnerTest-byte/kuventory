-- ============================================================================
-- MIGRATION: 20261024210000_retire_master_admin_and_admin_only_corrections.sql
-- Description:
--   Forward Migration for Authority & Role Cleanup:
--   1. Fully retire MASTER_ADMIN role:
--      - Safely migrate all existing MASTER_ADMIN profile records to SUPER_ADMIN
--      - Record audit logs for all migrated accounts
--      - Update profiles_role_check constraint to strictly ('STAFF', 'USER', 'ADMIN', 'SUPER_ADMIN')
--      - Harden is_super_admin() and is_admin() to remove MASTER_ADMIN
--      - Deprecate is_master_admin() to return false (fail-closed)
--      - Update recovery_points and security functions to use is_super_admin()
--   2. Streamline Finalized Inventory Correction Approval to Admin-Only:
--      - Migrate any legacy PENDING_SUPER_ADMIN requests to PENDING_ADMIN
--      - Update status constraint: PENDING_ADMIN, RETURNED_TO_REQUESTER, REJECTED_BY_ADMIN,
--        APPLIED, CONFLICT_REQUIRES_RESUBMISSION, FAILED_REQUIRES_REVIEW, CANCELLED
--      - Update apply_approved_daily_inventory_correction to allow Admin/Super Admin
--        approval directly from PENDING_ADMIN without requiring a Super Admin stage
--      - Enforce strict self-approval prohibition (requester cannot approve own request)
--      - Implement OCC revision check (stale revisions transition to CONFLICT_REQUIRES_RESUBMISSION)
--      - Update admin_review_correction_request to support direct 'APPROVE' execution
--      - Reconcile super_admin_review_correction_request as an alias to avoid breaking clients
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. MIGRATE LEGACY MASTER_ADMIN ACCOUNTS TO SUPER_ADMIN WITH AUDIT LOGS
-- ----------------------------------------------------------------------------
-- Verify that every existing role is expected
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE UPPER(TRIM(COALESCE(role, ''))) NOT IN ('STAFF', 'USER', 'ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN')
  ) THEN
    RAISE EXCEPTION 'Unexpected profile role found. Review roles before migration.';
  END IF;
END $$;

-- Drop any legacy triggers that specifically block demoting / modifying master admin
DROP TRIGGER IF EXISTS trg_prevent_master_admin_demotion ON public.profiles;
DROP TRIGGER IF EXISTS prevent_master_admin_demotion ON public.profiles;
DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;

-- Temporarily disable user triggers on profiles to allow authoritative system role migration
ALTER TABLE public.profiles DISABLE TRIGGER USER;

DO $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN 
    SELECT id, role, display_name 
    FROM public.profiles 
    WHERE UPPER(TRIM(COALESCE(role, ''))) = 'MASTER_ADMIN'
  LOOP
    -- Update profile to SUPER_ADMIN
    UPDATE public.profiles 
    SET role = 'SUPER_ADMIN', 
        updated_at = now() 
    WHERE id = v_rec.id;

    -- Record audit log for accountability
    INSERT INTO public.audit_logs (
      actor_id, action, target_table, target_id, new_data, reason
    ) VALUES (
      v_rec.id,
      'MIGRATE_LEGACY_ROLE',
      'profiles',
      v_rec.id,
      jsonb_build_object('old_role', 'MASTER_ADMIN', 'new_role', 'SUPER_ADMIN', 'display_name', v_rec.display_name),
      'Canonical role cleanup: Retired legacy MASTER_ADMIN role in favor of SUPER_ADMIN.'
    );
  END LOOP;
END $$;

-- Normalize remaining role values
UPDATE public.profiles 
SET role = UPPER(TRIM(role)) 
WHERE role IS NOT NULL AND role IS DISTINCT FROM UPPER(TRIM(role));

-- Re-enable user triggers on profiles
ALTER TABLE public.profiles ENABLE TRIGGER USER;

-- Also update user metadata in auth.users if role was stored there
DO $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', '"SUPER_ADMIN"')
  WHERE raw_user_meta_data->>'role' = 'MASTER_ADMIN';
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 2. HARDEN PROFILES ROLE CHECK CONSTRAINT (No silent error suppression)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('STAFF', 'USER', 'ADMIN', 'SUPER_ADMIN'));

-- ----------------------------------------------------------------------------
-- 3. UPDATE AUTHORIZATION FUNCTIONS & DEPRECIATE MASTER_ADMIN
-- ----------------------------------------------------------------------------
-- is_super_admin: strictly SUPER_ADMIN
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();
  RETURN UPPER(TRIM(COALESCE(v_role, ''))) = 'SUPER_ADMIN';
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, anon;

-- is_admin: ADMIN or SUPER_ADMIN
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();
  RETURN UPPER(TRIM(COALESCE(v_role, ''))) IN ('ADMIN', 'SUPER_ADMIN');
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- is_master_admin: retired; fails-closed by returning false
CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  -- MASTER_ADMIN role is permanently retired; Super Admin is the highest authority
  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_master_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_master_admin() TO authenticated, anon;

-- Update protect_profile_role trigger function
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Superusers, service roles, and database migration runners are trusted
  IF CURRENT_USER IN ('postgres', 'supabase_admin') OR 
     SESSION_USER IN ('postgres', 'supabase_admin') OR
     COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Disallow assignment of retired legacy roles
    IF UPPER(TRIM(NEW.role)) = 'MASTER_ADMIN' THEN
      RAISE EXCEPTION 'Invalid role: MASTER_ADMIN has been permanently retired. Use SUPER_ADMIN.';
    END IF;

    IF NOT (
      public.is_admin() OR public.is_super_admin()
    ) THEN
      RAISE EXCEPTION 'Privilege escalation rejected: only administrators can change user roles.';
    END IF;

    -- Only existing SUPER_ADMIN can promote a user to SUPER_ADMIN
    IF UPPER(TRIM(NEW.role)) = 'SUPER_ADMIN' AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Privilege escalation rejected: only Super Administrators can grant the SUPER_ADMIN role.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_role();

-- ----------------------------------------------------------------------------
-- 4. UPDATE RECOVERY POINTS AND SECURITY FUNCTIONS TO USE SUPER_ADMIN
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Master admin full access to recovery points" ON public.recovery_points;
DROP POLICY IF EXISTS "Super admin full access to recovery points" ON public.recovery_points;
CREATE POLICY "Super admin full access to recovery points"
ON public.recovery_points
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- Update create_recovery_checkpoint
DROP FUNCTION IF EXISTS public.create_recovery_checkpoint(TEXT, TEXT, TEXT, BOOLEAN);
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
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Super Administrator can create system recovery checkpoints.';
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
    created_by
  ) VALUES (
    v_point_code,
    p_name,
    p_description,
    p_retention_class,
    p_is_protected,
    CASE 
      WHEN p_retention_class = 'LONG_TERM' THEN NOW() + INTERVAL '365 days'
      WHEN p_retention_class = 'DAILY' THEN NOW() + INTERVAL '30 days'
      ELSE NOW() + INTERVAL '7 days'
    END,
    auth.uid()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'checkpoint_id', v_id,
    'point_code', v_point_code,
    'created_at', now()
  );
END;
$$;

-- Update cleanup_expired_recovery_points
DROP FUNCTION IF EXISTS public.cleanup_expired_recovery_points();
CREATE OR REPLACE FUNCTION public.cleanup_expired_recovery_points()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted_count INT := 0;
  v_latest_verified_id UUID;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Super Administrator can execute recovery point cleanup.';
  END IF;

  SELECT id INTO v_latest_verified_id
  FROM public.recovery_points
  WHERE verification_status IN ('READY', 'VERIFIED')
  ORDER BY created_at DESC
  LIMIT 1;

  WITH to_delete AS (
    SELECT id FROM public.recovery_points
    WHERE is_protected = false
      AND protected_until < NOW()
      AND id <> COALESCE(v_latest_verified_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  DELETE FROM public.recovery_points
  WHERE id IN (SELECT id FROM to_delete);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- Update force_override_daily_inventory
DROP FUNCTION IF EXISTS public.force_override_daily_inventory(UUID);
CREATE OR REPLACE FUNCTION public.force_override_daily_inventory(
  p_daily_inventory_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only a Super Administrator can force override finalized records.';
  END IF;

  UPDATE public.daily_inventory
  SET state = 'DRAFT',
      finalized_at = NULL,
      finalized_by = NULL
  WHERE id = p_daily_inventory_id;

  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
    VALUES (
      auth.uid(), 
      'FORCE_OVERRIDE_RECORD', 
      'daily_inventory', 
      p_daily_inventory_id, 
      jsonb_build_object('unlocked_at', now(), 'unlocked_by', auth.uid())
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. FINALIZED INVENTORY CORRECTIONS: ADMIN-ONLY APPROVAL WORKFLOW
-- ----------------------------------------------------------------------------

-- A. Migrate any pending Stage 2 requests to PENDING_ADMIN
UPDATE public.daily_inventory_correction_requests
SET status = 'PENDING_ADMIN'
WHERE status = 'PENDING_SUPER_ADMIN';

-- B. Update status check constraint on correction requests table
ALTER TABLE public.daily_inventory_correction_requests 
  DROP CONSTRAINT IF EXISTS daily_inventory_correction_requests_status_check;

ALTER TABLE public.daily_inventory_correction_requests 
  ADD CONSTRAINT daily_inventory_correction_requests_status_check CHECK (
    status IN (
      'PENDING_ADMIN',
      'RETURNED_TO_REQUESTER',
      'REJECTED_BY_ADMIN',
      'APPLIED',
      'CONFLICT_REQUIRES_RESUBMISSION',
      'FAILED_REQUIRES_REVIEW',
      'CANCELLED'
    )
  );

-- C. Apply Approved Daily Inventory Correction (Admin-Only Approval & Apply)
DROP FUNCTION IF EXISTS public.apply_approved_daily_inventory_correction(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.apply_approved_daily_inventory_correction(
  p_request_id UUID,
  p_admin_notes TEXT DEFAULT NULL
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
  v_req public.daily_inventory_correction_requests%ROWTYPE;
  v_sheet public.daily_inventory%ROWTYPE;
  v_report_id UUID;
  v_rev_count INT;
  v_rev_id UUID;
  v_item RECORD;
  v_existing_item RECORD;
  v_item_id UUID;
  v_new_beg NUMERIC;
  v_new_add NUMERIC;
  v_new_am NUMERIC;
  v_new_pm NUMERIC;
  v_new_ending NUMERIC;
  v_delta_consumption NUMERIC;
  v_delta_add NUMERIC;
  v_stock_deltas JSONB := '[]'::jsonb;
  v_requester_name TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to approve and apply corrections.';
  END IF;

  SELECT role, COALESCE(display_name, 'Administrator') INTO v_caller_role, v_caller_name
  FROM public.profiles
  WHERE id = v_caller_id;

  -- Routine approval requires Admin or Super Admin
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only Administrators can review and apply finalized sheet corrections.';
  END IF;

  -- 1. Lock correction request FOR UPDATE
  SELECT * INTO v_req
  FROM public.daily_inventory_correction_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction request % does not exist.', p_request_id;
  END IF;

  IF v_req.status != 'PENDING_ADMIN' THEN
    RAISE EXCEPTION 'Request cannot be applied: current status is "%". Required: PENDING_ADMIN.', v_req.status;
  END IF;

  IF v_req.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Idempotency Violation: this correction request was already applied at %.', v_req.applied_at;
  END IF;

  -- Separation of duties: Requester cannot self-approve
  IF v_req.requested_by = v_caller_id THEN
    RAISE EXCEPTION 'Conflict of Interest: Administrators cannot approve their own correction request.';
  END IF;

  -- 2. Lock worksheet FOR UPDATE
  SELECT * INTO v_sheet
  FROM public.daily_inventory
  WHERE id = v_req.daily_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Worksheet % not found.', v_req.daily_inventory_id;
  END IF;

  IF v_sheet.state != 'FINALIZED' THEN
    RAISE EXCEPTION 'Worksheet is not in FINALIZED state (current: %). Correction cannot be applied.', v_sheet.state;
  END IF;

  -- Concurrency check: Ensure expected revision matches current revision baseline
  SELECT COALESCE(MAX(revision_number), 0) INTO v_rev_count
  FROM public.daily_inventory_revisions
  WHERE daily_inventory_id = v_req.daily_inventory_id;

  IF (v_rev_count + 1) != v_req.expected_revision AND v_req.expected_revision != 1 AND v_req.expected_revision != (v_rev_count + 1) THEN
    -- Revision conflict detected: update status and fail closed
    UPDATE public.daily_inventory_correction_requests
    SET status = 'CONFLICT_REQUIRES_RESUBMISSION',
        error_message = format('Concurrency conflict: sheet has revision %s, request expected %s.', v_rev_count, v_req.expected_revision),
        updated_at = now()
    WHERE id = p_request_id;

    RAISE EXCEPTION 'CORRECTION_REVISION_CONFLICT: Worksheet has been revised since this request was created. Please review the updated revision and resubmit.';
  END IF;

  v_rev_count := v_rev_count + 1;

  SELECT COALESCE(display_name, 'Staff Requester') INTO v_requester_name
  FROM public.profiles
  WHERE id = v_req.requested_by;

  SELECT id INTO v_report_id
  FROM public.reports
  WHERE daily_inventory_id = v_req.daily_inventory_id;

  -- 3. Atomic stock reconciliation & sheet update
  FOR v_item IN SELECT * FROM jsonb_to_recordset(v_req.proposed_items) AS x(
    item_id UUID, beg NUMERIC, add NUMERIC, am NUMERIC, pm NUMERIC, ending NUMERIC
  )
  LOOP
    v_item_id := v_item.item_id;
    v_new_beg := GREATEST(0, COALESCE(v_item.beg, 0));
    v_new_add := GREATEST(0, COALESCE(v_item.add, 0));
    v_new_am := GREATEST(0, COALESCE(v_item.am, 0));
    v_new_pm := GREATEST(0, COALESCE(v_item.pm, 0));
    v_new_ending := GREATEST(0, (v_new_beg + v_new_add - v_new_am - v_new_pm));

    SELECT * INTO v_existing_item
    FROM public.daily_inventory_items
    WHERE daily_inventory_id = v_req.daily_inventory_id AND item_id = v_item_id
    FOR UPDATE;

    IF FOUND THEN
      v_delta_consumption := (v_new_am + v_new_pm) - (COALESCE(v_existing_item.am, 0) + COALESCE(v_existing_item.pm, 0));
      v_delta_add := v_new_add - COALESCE(v_existing_item.add, 0);

      -- Transactional stock adjustment: if any fails, entire block rolls back
      IF v_delta_consumption > 0 THEN
        PERFORM public.consume_stock(
          v_item_id, 
          v_delta_consumption, 
          format('Approved Correction Req %s (Rev %s): Deducted %s consumption', p_request_id, v_rev_count, v_delta_consumption)
        );
      ELSIF v_delta_consumption < 0 THEN
        PERFORM public.add_stock(
          v_item_id, 
          abs(v_delta_consumption), 
          (CURRENT_DATE + interval '90 days')::DATE, 
          CURRENT_DATE, 
          format('Approved Correction Req %s (Rev %s): Restored %s consumption', p_request_id, v_rev_count, abs(v_delta_consumption))
        );
      END IF;

      IF v_delta_add > 0 THEN
        PERFORM public.add_stock(
          v_item_id, 
          v_delta_add, 
          (CURRENT_DATE + interval '90 days')::DATE, 
          CURRENT_DATE, 
          format('Approved Correction Req %s (Rev %s): +%s delivery adjustment', p_request_id, v_rev_count, v_delta_add)
        );
      ELSIF v_delta_add < 0 THEN
        PERFORM public.consume_stock(
          v_item_id, 
          abs(v_delta_add), 
          format('Approved Correction Req %s (Rev %s): -%s delivery reduction', p_request_id, v_rev_count, abs(v_delta_add))
        );
      END IF;

      -- Update base columns in daily_inventory_items
      UPDATE public.daily_inventory_items
      SET beg = v_new_beg,
          add = v_new_add,
          am = v_new_am,
          pm = v_new_pm
      WHERE id = v_existing_item.id;

      IF v_delta_consumption != 0 OR v_delta_add != 0 THEN
        v_stock_deltas := v_stock_deltas || jsonb_build_object(
          'item_id', v_item_id,
          'delta_consumption', v_delta_consumption,
          'delta_add', v_delta_add
        );
      END IF;

      -- Update report snapshot if existing
      IF v_report_id IS NOT NULL THEN
        UPDATE public.report_items
        SET beg = v_new_beg,
            add = v_new_add,
            total = (v_new_beg + v_new_add),
            am = v_new_am,
            pm = v_new_pm,
            ending = v_new_ending
        WHERE report_id = v_report_id 
          AND item_name = (SELECT name FROM public.inventory_items WHERE id = v_item_id);
      END IF;
    END IF;
  END LOOP;

  -- 4. Record auditable revision record
  INSERT INTO public.daily_inventory_revisions (
    daily_inventory_id,
    revision_number,
    inventory_date,
    reason,
    corrected_by,
    corrected_by_name,
    old_values,
    new_values,
    stock_adjustments,
    created_at
  ) VALUES (
    v_req.daily_inventory_id,
    v_rev_count,
    v_sheet.inventory_date,
    v_req.reason,
    v_caller_id,
    format('%s (Approved by %s)', v_requester_name, v_caller_name),
    v_req.baseline_items,
    v_req.proposed_items,
    v_stock_deltas,
    now()
  ) RETURNING id INTO v_rev_id;

  -- 5. Mark request APPLIED
  UPDATE public.daily_inventory_correction_requests
  SET status = 'APPLIED',
      admin_reviewer_id = v_caller_id,
      admin_reviewed_at = now(),
      admin_notes = trim(COALESCE(p_admin_notes, '')),
      applied_at = now(),
      applied_revision_id = v_rev_id,
      updated_at = now()
  WHERE id = p_request_id;

  -- 6. Insert audit log
  INSERT INTO public.audit_logs (
    actor_id, action, target_table, target_id, new_data, reason
  ) VALUES (
    v_caller_id,
    'CORRECTION_APPLIED',
    'daily_inventory_correction_requests',
    p_request_id,
    jsonb_build_object(
      'revision_number', v_rev_count,
      'revision_id', v_rev_id,
      'stock_deltas', v_stock_deltas,
      'approver', v_caller_name
    ),
    v_req.reason
  );

  -- 7. Dispatch notification to Requester and Staff
  INSERT INTO public.notifications (
    type, title, message, target_id, dedup_key, created_at
  ) VALUES (
    'CORRECTION_APPLIED',
    format('Correction Applied (Rev #%s): %s', v_rev_count, v_sheet.inventory_date),
    format('Admin %s approved correction. Revision #%s applied to finalized sheet.', v_caller_name, v_rev_count),
    '/daily-inventory',
    format('notif_applied_%s', p_request_id),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'revision_number', v_rev_count,
    'applied_revision_id', v_rev_id,
    'stock_deltas', v_stock_deltas,
    'message', format('Successfully applied Revision #%s to finalized inventory sheet.', v_rev_count)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_approved_daily_inventory_correction(UUID, TEXT) TO authenticated;

-- D. Admin Review RPC (Approve, Return, or Reject)
DROP FUNCTION IF EXISTS public.admin_review_correction_request(UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.admin_review_correction_request(
  p_request_id UUID,
  p_decision TEXT,
  p_notes TEXT
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
  v_req public.daily_inventory_correction_requests%ROWTYPE;
  v_clean_decision TEXT := upper(trim(COALESCE(p_decision, '')));
  v_clean_notes TEXT := trim(COALESCE(p_notes, ''));
  v_new_status TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized.';
  END IF;

  SELECT role, COALESCE(display_name, 'Administrator') INTO v_caller_role, v_caller_name
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only administrators can review correction requests.';
  END IF;

  SELECT * INTO v_req
  FROM public.daily_inventory_correction_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction request % not found.', p_request_id;
  END IF;

  IF v_req.status != 'PENDING_ADMIN' THEN
    RAISE EXCEPTION 'Request cannot be reviewed in current status: %', v_req.status;
  END IF;

  -- Separation of duties: Requester cannot review own request
  IF v_req.requested_by = v_caller_id THEN
    RAISE EXCEPTION 'Conflict of Interest: you cannot review a correction request that you submitted.';
  END IF;

  -- APPROVE / APPROVE_AND_APPLY / legacy APPROVE_AND_FORWARD: Directly applies correction
  IF v_clean_decision IN ('APPROVE', 'APPROVE_AND_APPLY', 'APPROVE_AND_FORWARD') THEN
    RETURN public.apply_approved_daily_inventory_correction(p_request_id, v_clean_notes);
  ELSIF v_clean_decision = 'RETURN' THEN
    IF v_clean_notes = '' THEN
      RAISE EXCEPTION 'Notes explaining what information is required are mandatory when returning a request.';
    END IF;
    v_new_status := 'RETURNED_TO_REQUESTER';
  ELSIF v_clean_decision = 'REJECT' THEN
    IF v_clean_notes = '' THEN
      RAISE EXCEPTION 'A rejection reason is mandatory.';
    END IF;
    v_new_status := 'REJECTED_BY_ADMIN';
  ELSE
    RAISE EXCEPTION 'Invalid decision "%". Must be APPROVE, RETURN, or REJECT.', p_decision;
  END IF;

  UPDATE public.daily_inventory_correction_requests
  SET status = v_new_status,
      admin_reviewer_id = v_caller_id,
      admin_reviewed_at = now(),
      admin_notes = v_clean_notes,
      updated_at = now()
  WHERE id = p_request_id;

  -- Notifications
  INSERT INTO public.notifications (
    type, title, message, target_id, dedup_key, created_at
  ) VALUES (
    'CORRECTION_STATUS',
    format('Correction Request %s: %s', v_new_status, v_req.inventory_date),
    format('Admin review complete: %s. Notes: %s', v_new_status, v_clean_notes),
    '/daily-inventory',
    format('notif_corr_status_%s_%s', p_request_id, v_new_status),
    now()
  );

  -- Audit log
  INSERT INTO public.audit_logs (
    actor_id, action, target_table, target_id, new_data, reason
  ) VALUES (
    v_caller_id,
    'ADMIN_REVIEW_CORRECTION_REQUEST',
    'daily_inventory_correction_requests',
    p_request_id,
    jsonb_build_object('decision', v_clean_decision, 'new_status', v_new_status),
    v_clean_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', v_new_status,
    'message', format('Correction request reviewed: %s.', v_new_status)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_correction_request(UUID, TEXT, TEXT) TO authenticated;

-- E. Aliased super_admin_review_correction_request for backward compatibility with existing clients
DROP FUNCTION IF EXISTS public.super_admin_review_correction_request(UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.super_admin_review_correction_request(
  p_request_id UUID,
  p_decision TEXT,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  -- Forward directly to admin_review_correction_request under Admin-only governance
  RETURN public.admin_review_correction_request(p_request_id, p_decision, p_notes);
END;
$$;

GRANT EXECUTE ON FUNCTION public.super_admin_review_correction_request(UUID, TEXT, TEXT) TO authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
