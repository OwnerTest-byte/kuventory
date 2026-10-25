-- ============================================================================
-- MIGRATION: 20261026150000_strict_roles_and_grants_repair.sql
-- PURPOSE:
--   PART A1 — STRICT ROLES: the system has exactly three roles from now on:
--   STAFF, ADMIN, SUPER_ADMIN. All existing 'USER' rows become 'STAFF', the
--   constraint makes anything else impossible, and every RPC allowlist that
--   referenced 'USER' is re-defined for the canonical set.
--   PART A2 — GRANTS REPAIR: the live database ACL for inventory_stock_view
--   diverged from migration history (live-probe: "permission denied for view
--   inventory_stock_view" on an authenticated dashboard), breaking the
--   dashboard, catalog, analytics, reports, command palette, and super-admin
--   console at once. Healed idempotently, with a new admin-only inspection
--   RPC so this class of divergence is detectable from now on.
-- Forward-only. RLS policies are untouched here (Part B owns them); grants
-- cannot over-expose rows because RLS still governs every table.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DATA: normalize every USER row to STAFF (legacy 'STAFF' rows already match)
-- ----------------------------------------------------------------------------
UPDATE public.profiles SET role = 'STAFF' WHERE role = 'USER';

-- ----------------------------------------------------------------------------
-- 2. SCHEMA: exactly three roles, forever
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('STAFF', 'ADMIN', 'SUPER_ADMIN'));

-- ----------------------------------------------------------------------------
-- 3. handle_new_user — default role STAFF (first bootstrap account stays ADMIN)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_first_name TEXT := new.raw_user_meta_data->>'first_name';
  v_last_name TEXT := new.raw_user_meta_data->>'last_name';
  v_role TEXT := 'STAFF'; -- Unconditionally default to STAFF; ignore client metadata
  v_display_name TEXT;
BEGIN
  v_display_name := TRIM(COALESCE(v_first_name, '') || ' ' || COALESCE(v_last_name, ''));
  IF v_display_name = '' THEN
    v_display_name := split_part(new.email, '@', 1);
  END IF;

  -- First account created during fresh initial bootstrap becomes initial ADMIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) THEN
    v_role := 'ADMIN';
  END IF;

  INSERT INTO public.profiles (id, role, display_name, first_name, last_name, updated_at)
  VALUES (new.id, v_role, v_display_name, v_first_name, v_last_name, NOW())
  ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      updated_at = NOW();

  RETURN new;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. admin_create_user — canonical role allowlist
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'STAFF'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_display_name TEXT;
  v_clean_role TEXT;
  v_clean_email TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized. Admin access required.';
  END IF;

  v_clean_email := LOWER(TRIM(p_email));
  IF v_clean_email = '' OR v_clean_email NOT LIKE '%_@__%.__%' THEN
    RAISE EXCEPTION 'Invalid email address.';
  END IF;

  IF p_password IS NULL OR LENGTH(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters long.';
  END IF;

  v_clean_role := UPPER(TRIM(COALESCE(p_role, 'STAFF')));
  IF v_clean_role NOT IN ('STAFF', 'ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Invalid role. Role must be STAFF, ADMIN, or SUPER_ADMIN.';
  END IF;

  IF v_clean_role = 'SUPER_ADMIN' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only a Super Administrator can create a Super Administrator user.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_clean_email) THEN
    RAISE EXCEPTION 'User already exists with this email address.';
  END IF;

  v_user_id := gen_random_uuid();
  v_display_name := TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, ''));
  IF v_display_name = '' THEN
    v_display_name := split_part(v_clean_email, '@', 1);
  END IF;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    invited_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at,
    is_sso_user,
    deleted_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    v_user_id,
    'authenticated',
    'authenticated',
    v_clean_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    NULL,
    '',
    NULL,
    '',
    NULL,
    '',
    '',
    NULL,
    NULL,
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('first_name', p_first_name, 'last_name', p_last_name, 'role', v_clean_role),
    FALSE,
    now(),
    now(),
    NULL,
    NULL,
    '',
    '',
    NULL,
    '',
    0,
    NULL,
    '',
    NULL,
    FALSE,
    NULL
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_clean_email),
    'email',
    v_clean_email,
    now(),
    now(),
    now()
  );

  INSERT INTO public.profiles (id, role, display_name, first_name, last_name, updated_at)
  VALUES (v_user_id, v_clean_role, v_display_name, p_first_name, p_last_name, now())
  ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      display_name = EXCLUDED.display_name,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      updated_at = now();

  RETURN v_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. admin_update_user_role — canonical allowlist STAFF/ADMIN
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  p_user_id UUID,
  p_role TEXT
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_is_admin BOOLEAN := public.is_admin();
  v_current_role TEXT;
  v_admin_count INT;
BEGIN
  -- 1. Verify caller authorization
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Access denied. Administrative privileges required to manage roles.';
  END IF;

  -- 2. Validate role against strict allowlist
  IF p_role NOT IN ('STAFF', 'ADMIN') THEN
    RAISE EXCEPTION 'Invalid role: % - only STAFF or ADMIN can be assigned.', p_role;
  END IF;

  -- 3. Retrieve target user's current role
  SELECT role INTO v_current_role
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found.';
  END IF;

  -- 4. Guard against demoting the sole remaining administrator
  IF v_current_role = 'ADMIN' AND p_role = 'STAFF' THEN
    SELECT count(*) INTO v_admin_count FROM public.profiles WHERE role = 'ADMIN';
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the sole remaining system administrator.';
    END IF;
  END IF;

  -- 5. Guard admin quota (maximum 3 administrators)
  IF p_role = 'ADMIN' AND v_current_role != 'ADMIN' THEN
    SELECT count(*) INTO v_admin_count FROM public.profiles WHERE role = 'ADMIN';
    IF v_admin_count >= 3 THEN
      RAISE EXCEPTION 'Administrator quota full: maximum 3 administrators permitted.';
    END IF;
  END IF;

  -- 6. Apply role update
  UPDATE public.profiles
  SET role = p_role,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- 7. Audit log the security role change
  INSERT INTO public.audit_logs (
    actor_id,
    action,
    target_table,
    target_id,
    new_data
  ) VALUES (
    auth.uid(),
    'ROLE_UPDATE',
    'profiles',
    p_user_id,
    jsonb_build_object('previous_role', v_current_role, 'new_role', p_role)
  );

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_user_role(UUID, TEXT) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. receive_daily_inventory_stock — staff-role allowlist (ADD spinner stays
--    available to STAFF; body otherwise unchanged)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_daily_inventory_stock(
  p_daily_inventory_item_id UUID,
  p_quantity NUMERIC,
  p_expiry_date DATE,
  p_user_id UUID DEFAULT NULL::uuid,
  p_reason TEXT DEFAULT 'Daily Inventory Receiving'::text
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_item_id UUID;
  v_daily_id UUID;
  v_state TEXT;
  v_current_total NUMERIC;
  v_batch_id UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to receive inventory stock.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('STAFF', 'ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: invalid role for receiving inventory.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity received must be greater than zero.';
  END IF;

  IF p_expiry_date IS NULL THEN
    RAISE EXCEPTION 'Expiration date is mandatory for receiving delivery.';
  END IF;

  IF p_expiry_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Expiration date cannot be in the past.';
  END IF;

  -- 1. Fetch and lock daily_inventory_item and parent daily_inventory
  SELECT dii.item_id, dii.daily_inventory_id, di.state
  INTO v_item_id, v_daily_id, v_state
  FROM public.daily_inventory_items dii
  JOIN public.daily_inventory di ON dii.daily_inventory_id = di.id
  WHERE dii.id = p_daily_inventory_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily inventory item not found.';
  END IF;

  IF v_state != 'DRAFT' THEN
    RAISE EXCEPTION 'Cannot receive stock on a finalized inventory worksheet.';
  END IF;

  -- 2. Calculate current total physical stock
  SELECT COALESCE(SUM(quantity), 0) INTO v_current_total
  FROM public.stock_batches
  WHERE item_id = v_item_id;

  -- 3. Create physical batch
  INSERT INTO public.stock_batches (
    item_id,
    quantity,
    initial_quantity,
    expiry_date,
    received_date
  ) VALUES (
    v_item_id,
    p_quantity,
    p_quantity,
    p_expiry_date,
    CURRENT_DATE
  ) RETURNING id INTO v_batch_id;

  -- 4. Record stock movement using authenticated caller identity
  INSERT INTO public.stock_movements (
    item_id,
    batch_id,
    type,
    quantity_before,
    quantity_change,
    quantity_after,
    user_id,
    reason
  ) VALUES (
    v_item_id,
    v_batch_id,
    'ADD',
    v_current_total,
    p_quantity,
    v_current_total + p_quantity,
    v_caller_id,
    COALESCE(p_reason, 'Daily Inventory Receiving')
  );

  -- 5. Atomically increment worksheet add column (total and ending are computed by PostgreSQL)
  UPDATE public.daily_inventory_items
  SET add = add + p_quantity
  WHERE id = p_daily_inventory_item_id;

  RETURN v_batch_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_daily_inventory_stock(UUID, NUMERIC, DATE, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. create_daily_inventory_draft — staff-role allowlist (draft creation stays
--    available to STAFF; body otherwise unchanged)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_daily_inventory_draft(p_target_date DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_daily_id UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to create daily inventory draft.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('STAFF', 'ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: invalid role for creating inventory drafts.';
  END IF;

  SELECT id INTO v_daily_id FROM public.daily_inventory
  WHERE inventory_date = p_target_date;

  IF NOT FOUND THEN
    INSERT INTO public.daily_inventory (inventory_date, state, created_by)
    VALUES (p_target_date, 'DRAFT', v_caller_id)
    RETURNING id INTO v_daily_id;
  END IF;

  INSERT INTO public.daily_inventory_items (daily_inventory_id, item_id, beg)
  SELECT v_daily_id, i.id, COALESCE(s.total_quantity, 0)
  FROM public.inventory_items i
  LEFT JOIN (
    SELECT item_id, COALESCE(SUM(quantity), 0) as total_quantity
    FROM public.stock_batches
    GROUP BY item_id
  ) s ON i.id = s.item_id
  WHERE i.is_active = true
  ON CONFLICT (daily_inventory_id, item_id) DO NOTHING;

  RETURN v_daily_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_daily_inventory_draft(DATE) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. unlock_account — hierarchy check uses the canonical STAFF role (body
--    otherwise identical to 20261026130000: verification requirement cleared,
--    last_lockout_at KEPT as the 6th-attempt anchor)
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

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
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
  -- Admin can only unlock Staff ('STAFF')
  -- Super Admin can unlock Staff ('STAFF') and Admin ('ADMIN')
  IF v_sec.user_id IS NOT NULL THEN
    SELECT * INTO v_target_profile
    FROM public.profiles
    WHERE id = v_sec.user_id;

    IF FOUND THEN
      IF v_caller_role = 'ADMIN' AND v_target_profile.role != 'STAFF' THEN
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
-- 9. review_assisted_recovery_request — hierarchical RBAC on the canonical
--    STAFF role (body otherwise identical to 20261026000000)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_assisted_recovery_request(
  p_request_id UUID,
  p_decision TEXT,
  p_notes TEXT DEFAULT NULL,
  p_new_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_caller_name TEXT;
  v_rec public.account_recovery_requests%ROWTYPE;
  v_target_user_id UUID;
  v_target_role TEXT;
  v_now TIMESTAMPTZ := now();
  v_masked TEXT;
  v_clean_notes TEXT := trim(COALESCE(p_notes, ''));
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to review recovery requests.';
  END IF;

  SELECT role, COALESCE(display_name, 'Administrator') INTO v_caller_role, v_caller_name
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only Administrators may review account recovery requests.';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('HUMAN_REVIEW', 'NEEDS_INFORMATION', 'REJECT', 'RESOLVE_RESET') THEN
    RAISE EXCEPTION 'Invalid decision. Allowed: HUMAN_REVIEW, NEEDS_INFORMATION, REJECT, RESOLVE_RESET.';
  END IF;

  SELECT * INTO v_rec
  FROM public.account_recovery_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recovery request % not found.', p_request_id;
  END IF;

  IF v_rec.status IN ('REJECTED', 'COMPLETED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Request % is already resolved (%); its decision is final.', v_rec.request_reference, v_rec.status;
  END IF;

  -- The requester must never be able to approve their own recovery. Check
  -- both the ticket's recorded user and the CURRENT account behind the
  -- identifier (tickets can predate the account linkage).
  IF v_rec.user_id IS NOT NULL AND v_rec.user_id = v_caller_id THEN
    RAISE EXCEPTION 'Permission Denied: you cannot review your own recovery request.';
  END IF;

  v_masked := public.mask_email(v_rec.email_lookup);

  -- Resolve the CURRENT account behind the ticket identifier.
  SELECT id INTO v_target_user_id
  FROM auth.users
  WHERE lower(email) = v_rec.email_lookup
  LIMIT 1;

  IF v_target_user_id IS NOT NULL AND v_target_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Permission Denied: you cannot review your own recovery request.';
  END IF;

  IF v_target_user_id IS NOT NULL THEN
    SELECT role INTO v_target_role FROM public.profiles WHERE id = v_target_user_id;
  END IF;

  -- Hierarchical RBAC (mirrors unlock_account / admin_reset_user_password):
  --   ADMIN          -> STAFF targets only
  --   SUPER_ADMIN    -> STAFF / ADMIN targets
  --   SUPER_ADMIN targets always require a SUPER_ADMIN reviewer
  IF COALESCE(v_target_role, 'STAFF') = 'SUPER_ADMIN' AND v_caller_role <> 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Permission Denied: only a Super Administrator may recover a Super Administrator account.';
  END IF;

  IF v_caller_role = 'ADMIN' AND COALESCE(v_target_role, 'STAFF') != 'STAFF' THEN
    RAISE EXCEPTION 'Permission Denied: Administrators may only review recovery requests for Staff accounts.';
  END IF;

  ------------------------------------------------------------------ REJECT --
  IF p_decision = 'REJECT' THEN
    IF v_clean_notes = '' THEN
      RAISE EXCEPTION 'A rejection reason is required.';
    END IF;

    UPDATE public.account_recovery_requests
    SET status = 'REJECTED',
        admin_reviewer_id = v_caller_id,
        admin_reviewed_at = v_now,
        admin_notes = v_clean_notes,
        decision_reason = v_clean_notes,
        resolved_at = v_now,
        updated_at = v_now
    WHERE id = v_rec.id;

    INSERT INTO public.security_events (
      event_type, email_masked, actor_id, details
    ) VALUES (
      'ASSISTED_RECOVERY_REJECTED', v_masked, v_caller_id,
      jsonb_build_object('request_reference', v_rec.request_reference)
    );

    INSERT INTO public.audit_logs (
      actor_id, action, target_table, target_id, new_data, reason
    ) VALUES (
      v_caller_id, 'ASSISTED_RECOVERY_REJECTED', 'account_recovery_requests', v_rec.id,
      jsonb_build_object('status', 'REJECTED', 'request_reference', v_rec.request_reference),
      v_clean_notes
    );

    RETURN jsonb_build_object(
      'success', true,
      'status', 'REJECTED',
      'message', format('Recovery request %s rejected by %s.', v_rec.request_reference, v_caller_name)
    );
  END IF;

  ------------------------------------------------------------- OPEN STATES --
  IF p_decision IN ('HUMAN_REVIEW', 'NEEDS_INFORMATION') THEN
    UPDATE public.account_recovery_requests
    SET status = p_decision,
        admin_reviewer_id = v_caller_id,
        admin_reviewed_at = v_now,
        admin_notes = NULLIF(v_clean_notes, ''),
        decision_reason = NULLIF(v_clean_notes, ''),
        updated_at = v_now
    WHERE id = v_rec.id;

    INSERT INTO public.audit_logs (
      actor_id, action, target_table, target_id, new_data
    ) VALUES (
      v_caller_id, 'ASSISTED_RECOVERY_REVIEW_STATE', 'account_recovery_requests', v_rec.id,
      jsonb_build_object('status', p_decision, 'request_reference', v_rec.request_reference)
    );

    RETURN jsonb_build_object(
      'success', true,
      'status', p_decision,
      'message', format('Recovery request %s marked %s.', v_rec.request_reference, p_decision)
    );
  END IF;

  -------------------------------------------------- RESOLVE_RESET (final) --
  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'No account currently exists for identifier of request %. Resolve cannot proceed.', v_rec.request_reference;
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RAISE EXCEPTION 'A new password of at least 8 characters is required to complete the authorized reset.';
  END IF;

  IF v_clean_notes = '' THEN
    RAISE EXCEPTION 'An identity-verification note is required to complete an authorized reset.';
  END IF;

  -- 1. The authorized password change itself
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = v_now
  WHERE id = v_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target account could not be updated; reset aborted.';
  END IF;

  -- 2. Revoke every existing session so a stolen password or live token
  --    cannot survive an identity-verified recovery.
  DELETE FROM auth.sessions WHERE user_id = v_target_user_id;

  -- 3. Clear any active login lockout AND the administrator-verification
  --    requirement for the recovered account (identity was just verified).
  UPDATE public.account_security_state
  SET failed_attempts = 0,
      window_started_at = NULL,
      last_failed_at = NULL,
      locked_until = NULL,
      lockout_status = 'UNLOCKED',
      lockout_token_hash = NULL,
      verification_required = false,
      last_lockout_at = NULL,
      unlocked_at = v_now,
      unlocked_by = v_caller_id,
      unlock_reason = 'Cleared by assisted-recovery password reset',
      updated_at = v_now
  WHERE email_lookup = v_rec.email_lookup;

  -- 3b. Clear the wrong-identifier escalation for this identifier as well.
  UPDATE public.account_recovery_attempt_state
  SET verification_required_until = NULL,
      updated_at = v_now
  WHERE identifier_hash = encode(digest(v_rec.email_lookup, 'sha256'), 'hex');

  -- 4. Close the ticket as COMPLETED with the actual outcome recorded
  UPDATE public.account_recovery_requests
  SET status = 'COMPLETED',
      user_id = v_target_user_id,
      admin_reviewer_id = v_caller_id,
      admin_reviewed_at = v_now,
      admin_notes = v_clean_notes,
      decision_reason = 'Identity verified by administrator; password reset completed and account unlocked.',
      resolved_at = v_now,
      updated_at = v_now
  WHERE id = v_rec.id;

  INSERT INTO public.security_events (
    event_type, email_masked, actor_id, details
  ) VALUES (
    'ASSISTED_RECOVERY_COMPLETED', v_masked, v_caller_id,
    jsonb_build_object(
      'request_reference', v_rec.request_reference,
      'password_reset', true,
      'lockout_cleared', true,
      'sessions_revoked', true
    )
  );

  INSERT INTO public.audit_logs (
    actor_id, action, target_table, target_id, new_data, reason
  ) VALUES (
    v_caller_id, 'ASSISTED_RECOVERY_RESET_COMPLETED', 'account_recovery_requests', v_rec.id,
    jsonb_build_object(
      'status', 'COMPLETED',
      'request_reference', v_rec.request_reference,
      'target_user_id', v_target_user_id,
      'password_reset', true,
      'lockout_cleared', true,
      'sessions_revoked', true
    ),
    v_clean_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', 'COMPLETED',
    'message', format('Identity verified. Password reset completed and account unlocked for request %s.', v_rec.request_reference)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_assisted_recovery_request(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 10. GRANTS REPAIR — heal any live-ACL divergence. RLS governs rows; these
--     grants only restore the ability to reach the objects at all.
-- ----------------------------------------------------------------------------
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON public.inventory_stock_view TO authenticated;
GRANT SELECT ON public.stock_history_view TO authenticated;
GRANT SELECT ON public.active_expiring_stock_view TO authenticated;

ALTER VIEW IF EXISTS public.inventory_stock_view SET (security_invoker = true);
ALTER VIEW IF EXISTS public.stock_history_view SET (security_invoker = true);
ALTER VIEW IF EXISTS public.active_expiring_stock_view SET (security_invoker = true);

-- ----------------------------------------------------------------------------
-- 11. inspect_authenticated_grants — admin-only visibility into the live ACL
--     (the previous inspection RPC audited anon only; this one watches the
--     role every real user actually uses)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inspect_authenticated_grants()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role TEXT;
  v_result JSONB;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: administrator access required.';
  END IF;

  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      g.table_name,
      g.privilege_type
    FROM information_schema.role_table_grants g
    WHERE g.grantee = 'authenticated'
      AND g.table_schema = 'public'
      AND g.table_name IN (
        'inventory_stock_view', 'stock_history_view', 'active_expiring_stock_view',
        'inventory_items', 'stock_batches', 'categories', 'daily_inventory',
        'daily_inventory_items', 'profiles', 'notifications'
      )
    ORDER BY g.table_name, g.privilege_type
  ) row_data;

  RETURN jsonb_build_object(
    'checked_at', now(),
    'grants', v_result,
    'note', 'Rows still governed by RLS; grants only control object reachability.'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.inspect_authenticated_grants() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.inspect_authenticated_grants() TO authenticated;

-- Reload schema cache so PostgREST exposes replaced functions immediately.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION BLOCK (run in the SQL editor after applying):
--   SELECT display_name, role FROM public.profiles ORDER BY role, display_name;
--   SELECT public.inspect_authenticated_grants();
--   SELECT * FROM information_schema.role_table_grants
--    WHERE table_name = 'inventory_stock_view' AND grantee = 'authenticated';
-- If your primary account resolves STAFF and it should be an administrator,
-- promote it (admin decision, audited if done via the app):
--   UPDATE public.profiles SET role = 'ADMIN' WHERE display_name = '<your admin name>';
-- ============================================================================
