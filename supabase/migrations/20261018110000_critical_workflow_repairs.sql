-- 20261018110000_critical_workflow_repairs.sql
-- KUVENTORY Critical Workflow Repair Migration
-- 1. Password Reset Request Log Table & Workflow
-- 2. Finalized Daily Inventory Revision History Table & Atomic Correction Engine
-- 3. Emergency Maintenance Backend Lockdown Enforcement

-- ============================================================================
-- 1. PASSWORD RESET REQUESTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  user_id UUID,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'NOTIFIED', 'IN REVIEW', 'RESOLVED', 'EXPIRED', 'FAILED')),
  notification_status TEXT NOT NULL DEFAULT 'DELIVERED',
  review_notes TEXT,
  reviewed_by UUID,
  ip_address TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view password reset requests" ON public.password_reset_requests;
CREATE POLICY "Admins can view password reset requests" ON public.password_reset_requests
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update password reset requests" ON public.password_reset_requests;
CREATE POLICY "Admins can update password reset requests" ON public.password_reset_requests
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Allow anon and auth to insert password reset requests" ON public.password_reset_requests;
CREATE POLICY "Allow anon and auth to insert password reset requests" ON public.password_reset_requests
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pwd_reset_email_status ON public.password_reset_requests(email, status);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_created ON public.password_reset_requests(created_at DESC);

-- Realtime Publication for password_reset_requests
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.password_reset_requests;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- 2. DAILY INVENTORY REVISIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.daily_inventory_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_inventory_id UUID NOT NULL REFERENCES public.daily_inventory(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL DEFAULT 1,
  inventory_date DATE NOT NULL,
  reason TEXT NOT NULL,
  corrected_by UUID NOT NULL,
  corrected_by_name TEXT,
  old_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  new_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  stock_adjustments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_inventory_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view daily inventory revisions" ON public.daily_inventory_revisions;
CREATE POLICY "Admins can view daily inventory revisions" ON public.daily_inventory_revisions
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert daily inventory revisions" ON public.daily_inventory_revisions;
CREATE POLICY "Admins can insert daily inventory revisions" ON public.daily_inventory_revisions
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_daily_inv_revisions_date ON public.daily_inventory_revisions(inventory_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_inv_revisions_sheet ON public.daily_inventory_revisions(daily_inventory_id, revision_number);

-- Realtime Publication for daily_inventory_revisions
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_inventory_revisions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- 3. MAINTENANCE LOCKDOWN HELPER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_maintenance_locked()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_val JSONB;
  v_locked BOOLEAN := false;
BEGIN
  -- Super admin is never locked out of backend operations
  IF public.is_super_admin() THEN
    RETURN false;
  END IF;

  SELECT value INTO v_val
  FROM public.system_settings
  WHERE key = 'maintenance_lock';

  IF v_val IS NOT NULL THEN
    v_locked := COALESCE((v_val->>'locked')::boolean, false) 
      OR UPPER(COALESCE(v_val->>'status', '')) IN ('MAINTENANCE', 'RECOVERY');
  END IF;

  RETURN v_locked;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_maintenance_locked() TO authenticated, anon;

-- ============================================================================
-- 4. HARDENED REQUEST_PASSWORD_RESET RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.request_password_reset(
  p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_clean_email TEXT;
  v_user_id UUID;
  v_recent_count INTEGER;
  v_req_code TEXT;
  v_req_id UUID;
  v_dedup TEXT;
BEGIN
  v_clean_email := LOWER(TRIM(p_email));
  IF v_clean_email = '' OR v_clean_email NOT LIKE '%_@__%.__%' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Please provide a valid email address.'
    );
  END IF;

  -- Rate limit check: max 3 requests per email in 15 minutes
  SELECT count(*) INTO v_recent_count
  FROM public.password_reset_requests
  WHERE email = v_clean_email 
    AND requested_at > (now() - interval '15 minutes');

  IF v_recent_count >= 3 THEN
    RETURN jsonb_build_object(
      'success', true,
      'rate_limited', true,
      'message', 'If an account is associated with this email, a reset request has been logged. Please wait a few minutes before submitting another request.'
    );
  END IF;

  -- Find associated user ID if exists (do NOT disclose to caller)
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE LOWER(email) = v_clean_email;

  -- Generate readable unique request code
  v_req_code := 'PR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) from 1 for 6));

  -- Insert into request log
  INSERT INTO public.password_reset_requests (
    request_code, email, user_id, status, notification_status, requested_at
  ) VALUES (
    v_req_code, v_clean_email, v_user_id, 'NEW', 'DELIVERED', now()
  )
  RETURNING id INTO v_req_id;

  -- Dispatch notification to Administrators
  v_dedup := 'pwd_reset_' || v_clean_email || '_' || to_char(now(), 'YYYYMMDD_HH24MI');
  INSERT INTO public.notifications (
    type,
    title,
    message,
    target_id,
    dedup_key
  ) VALUES (
    'PASSWORD_RESET',
    'Password Reset Requested: ' || v_clean_email,
    'User (' || v_clean_email || ') submitted password recovery request [' || v_req_code || ']. Review in Settings -> Users.',
    '/settings?tab=users',
    v_dedup
  )
  ON CONFLICT (dedup_key) DO UPDATE
  SET created_at = now(),
      is_read = false;

  -- Log in audit trail
  INSERT INTO public.audit_logs (action, target_table, details)
  VALUES (
    'PASSWORD_RESET_REQUESTED',
    'password_reset_requests',
    jsonb_build_object(
      'request_code', v_req_code,
      'email', v_clean_email,
      'user_found', (v_user_id IS NOT NULL),
      'requested_at', now()
    )
  );

  -- Generic non-disclosing safe response
  RETURN jsonb_build_object(
    'success', true,
    'request_code', v_req_code,
    'message', 'If an account is associated with this email, your password reset request has been logged and forwarded to administrators.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_password_reset(TEXT) TO anon, authenticated;

-- ============================================================================
-- 5. ATOMIC CORRECT_FINALIZED_DAILY_INVENTORY RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.correct_finalized_daily_inventory(
  p_daily_inventory_id UUID,
  p_items JSONB,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_auth_uid UUID := auth.uid();
  v_user_name TEXT := 'Administrator';
  v_sheet public.daily_inventory%ROWTYPE;
  v_report_id UUID;
  v_item_elem JSONB;
  v_item_id UUID;
  v_new_beg NUMERIC;
  v_new_add NUMERIC;
  v_new_am NUMERIC;
  v_new_pm NUMERIC;
  v_new_ending NUMERIC;
  v_existing_item RECORD;
  v_old_consumption NUMERIC;
  v_new_consumption NUMERIC;
  v_delta_consumption NUMERIC;
  v_old_add NUMERIC;
  v_delta_add NUMERIC;
  v_rev_count INTEGER;
  v_old_items_snapshot JSONB := '[]'::jsonb;
  v_stock_deltas JSONB := '[]'::jsonb;
BEGIN
  -- 1. Authorization check
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access Denied: Only Admin or Super Admin may correct finalized daily inventory sheets.';
  END IF;

  -- 2. Maintenance check
  IF public.is_maintenance_locked() THEN
    RAISE EXCEPTION 'System is currently under Emergency Maintenance Lockdown. All modifications are suspended.';
  END IF;

  -- 3. Lock daily inventory record
  SELECT * INTO v_sheet
  FROM public.daily_inventory
  WHERE id = p_daily_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily inventory worksheet not found.';
  END IF;

  IF v_sheet.state != 'FINALIZED' THEN
    RAISE EXCEPTION 'Worksheet is not in FINALIZED state. Corrections only apply to finalized sheets.';
  END IF;

  -- Fetch user display name
  SELECT COALESCE(display_name, first_name || ' ' || COALESCE(last_name, ''), email) INTO v_user_name
  FROM public.profiles
  WHERE id = v_auth_uid;

  -- Count existing revisions for this sheet
  SELECT count(*) + 1 INTO v_rev_count
  FROM public.daily_inventory_revisions
  WHERE daily_inventory_id = p_daily_inventory_id;

  -- Capture old snapshot
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', dii.id,
      'item_id', dii.item_id,
      'item_name', ii.name,
      'beg', dii.beg,
      'add', dii.add,
      'total', dii.total,
      'am', dii.am,
      'pm', dii.pm,
      'ending', dii.ending
    )
  ) INTO v_old_items_snapshot
  FROM public.daily_inventory_items dii
  JOIN public.inventory_items ii ON dii.item_id = ii.id
  WHERE dii.daily_inventory_id = p_daily_inventory_id;

  -- Find corresponding report
  SELECT id INTO v_report_id
  FROM public.reports
  WHERE daily_inventory_id = p_daily_inventory_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- 4. Process each corrected item and apply DIFFERENTIAL stock adjustments
  FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item_elem->>'item_id')::UUID;
    v_new_beg := COALESCE((v_item_elem->>'beg')::NUMERIC, 0);
    v_new_add := COALESCE((v_item_elem->>'add')::NUMERIC, 0);
    v_new_am := COALESCE((v_item_elem->>'am')::NUMERIC, 0);
    v_new_pm := COALESCE((v_item_elem->>'pm')::NUMERIC, 0);
    v_new_ending := COALESCE((v_item_elem->>'ending')::NUMERIC, (v_new_beg + v_new_add - v_new_am - v_new_pm));

    -- Fetch current recorded values
    SELECT * INTO v_existing_item
    FROM public.daily_inventory_items
    WHERE daily_inventory_id = p_daily_inventory_id AND item_id = v_item_id
    FOR UPDATE;

    IF FOUND THEN
      v_old_consumption := COALESCE(v_existing_item.am, 0) + COALESCE(v_existing_item.pm, 0);
      v_new_consumption := v_new_am + v_new_pm;
      v_delta_consumption := v_new_consumption - v_old_consumption;

      v_old_add := COALESCE(v_existing_item.add, 0);
      v_delta_add := v_new_add - v_old_add;

      -- If additional sales took place, consume the difference
      IF v_delta_consumption > 0 THEN
        PERFORM public.consume_stock(
          v_item_id, 
          v_delta_consumption, 
          format('Finalized Sheet Correction (Rev %s): +%s usage', v_rev_count, v_delta_consumption)
        );
      -- If sales were overestimated, add stock back to replenish
      ELSIF v_delta_consumption < 0 THEN
        PERFORM public.add_stock(
          v_item_id, 
          abs(v_delta_consumption), 
          (now() + interval '90 days')::DATE, 
          now()::DATE, 
          format('Finalized Sheet Correction (Rev %s): Returned %s overestimated sales', v_rev_count, abs(v_delta_consumption))
        );
      END IF;

      -- If receipts were adjusted
      IF v_delta_add > 0 THEN
        PERFORM public.add_stock(
          v_item_id, 
          v_delta_add, 
          (now() + interval '90 days')::DATE, 
          now()::DATE, 
          format('Finalized Sheet Correction (Rev %s): +%s receipts adjustment', v_rev_count, v_delta_add)
        );
      ELSIF v_delta_add < 0 THEN
        PERFORM public.consume_stock(
          v_item_id, 
          abs(v_delta_add), 
          format('Finalized Sheet Correction (Rev %s): -%s receipts reduction', v_rev_count, abs(v_delta_add))
        );
      END IF;

      -- Update daily_inventory_items
      UPDATE public.daily_inventory_items
      SET beg = v_new_beg,
          add = v_new_add,
          total = (v_new_beg + v_new_add),
          am = v_new_am,
          pm = v_new_pm,
          ending = v_new_ending
      WHERE id = v_existing_item.id;

      -- Record delta in stock adjustments log
      IF v_delta_consumption != 0 OR v_delta_add != 0 THEN
        v_stock_deltas := v_stock_deltas || jsonb_build_object(
          'item_id', v_item_id,
          'delta_consumption', v_delta_consumption,
          'delta_add', v_delta_add
        );
      END IF;

      -- Update report_items if corresponding report exists
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

  -- 5. Insert auditable revision record
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
    p_daily_inventory_id,
    v_rev_count,
    v_sheet.inventory_date,
    COALESCE(NULLIF(TRIM(p_reason), ''), 'Routine correction of finalized worksheet'),
    v_auth_uid,
    v_user_name,
    COALESCE(v_old_items_snapshot, '[]'::jsonb),
    p_items,
    v_stock_deltas,
    now()
  );

  -- 6. Insert audit log
  INSERT INTO public.audit_logs (
    user_id, user_name, role, action, target, details
  ) VALUES (
    v_auth_uid,
    v_user_name,
    'ADMIN',
    'CORRECT_FINALIZED_INVENTORY',
    v_sheet.inventory_date::TEXT,
    format('Revision #%s created. Reason: %s. Deltas: %s', v_rev_count, p_reason, v_stock_deltas::text)
  );

  RETURN jsonb_build_object(
    'success', true,
    'revision_number', v_rev_count,
    'inventory_date', v_sheet.inventory_date,
    'stock_deltas', v_stock_deltas,
    'message', format('Successfully applied Revision #%s to finalized inventory sheet.', v_rev_count)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.correct_finalized_daily_inventory(UUID, JSONB, TEXT) TO authenticated;
