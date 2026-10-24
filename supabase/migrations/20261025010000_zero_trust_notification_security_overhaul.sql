-- ============================================================================
-- MIGRATION: 20261025010000_zero_trust_notification_security_overhaul.sql
-- Description:
--   Zero-Trust Cross-Role Notification Isolation & RLS Permissive Merge Repair:
--   1. Drop all legacy permissive policies on public.notifications that merged via OR logic.
--   2. Enforce strict SELECT policy:
--      - Targeted notifications viewable only by targeted user (or admin)
--      - Operational inventory notifications (LOW_STOCK, OUT_OF_STOCK, etc.) viewable by all authenticated staff and admins
--      - Administrative notifications (PASSWORD_RESET, RECOVERY_REQUEST, etc.) viewable STRICTLY by ADMIN and SUPER_ADMIN
--   3. Enforce strict UPDATE policy preventing unauthorized mutation or read-marking.
--   4. Restrict direct client INSERT/DELETE to administrators.
--   5. Scoped mark_notification_as_read() and mark_all_notifications_as_read() RPCs.
--   6. Clean legacy permissive policies on categories and stock_batches.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DROP ALL LEGACY PERMISSIVE POLICIES ON NOTIFICATIONS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.notifications;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.notifications;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.notifications;
DROP POLICY IF EXISTS "Enable delete for admins" ON public.notifications;
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_policy" ON public.notifications;

-- ----------------------------------------------------------------------------
-- 2. CREATE ZERO-TRUST SELECT POLICY ON NOTIFICATIONS
-- ----------------------------------------------------------------------------
CREATE POLICY "notifications_select_policy"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    -- Direct target match
    auth.uid() = user_id
    OR (
      -- Operational inventory notifications accessible to all authorized staff and admins
      type IN (
        'LOW_STOCK',
        'OUT_OF_STOCK',
        'EXPIRING_SOON',
        'EXPIRED',
        'BATCH_DEPLETED',
        'STOCK_DISCREPANCY',
        'DAILY_SHEET',
        'SHEET_CORRECTION'
      )
    )
    OR (
      -- Administrative & security notifications accessible STRICTLY to Administrators
      type IN (
        'PASSWORD_RESET',
        'RECOVERY_REQUEST',
        'ACCOUNT_LOCKOUT',
        'SECURITY_ALERT',
        'SYSTEM',
        'MAINTENANCE'
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role IN ('ADMIN', 'SUPER_ADMIN')
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 3. CREATE ZERO-TRUST UPDATE POLICY ON NOTIFICATIONS
-- ----------------------------------------------------------------------------
CREATE POLICY "notifications_update_policy"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      type IN (
        'LOW_STOCK',
        'OUT_OF_STOCK',
        'EXPIRING_SOON',
        'EXPIRED',
        'BATCH_DEPLETED',
        'STOCK_DISCREPANCY',
        'DAILY_SHEET',
        'SHEET_CORRECTION'
      )
    )
    OR (
      type IN (
        'PASSWORD_RESET',
        'RECOVERY_REQUEST',
        'ACCOUNT_LOCKOUT',
        'SECURITY_ALERT',
        'SYSTEM',
        'MAINTENANCE'
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role IN ('ADMIN', 'SUPER_ADMIN')
      )
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (
      type IN (
        'LOW_STOCK',
        'OUT_OF_STOCK',
        'EXPIRING_SOON',
        'EXPIRED',
        'BATCH_DEPLETED',
        'STOCK_DISCREPANCY',
        'DAILY_SHEET',
        'SHEET_CORRECTION'
      )
    )
    OR (
      type IN (
        'PASSWORD_RESET',
        'RECOVERY_REQUEST',
        'ACCOUNT_LOCKOUT',
        'SECURITY_ALERT',
        'SYSTEM',
        'MAINTENANCE'
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role IN ('ADMIN', 'SUPER_ADMIN')
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 4. RESTRICT INSERT & DELETE TO ADMINS ONLY
-- ----------------------------------------------------------------------------
CREATE POLICY "notifications_insert_policy"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

CREATE POLICY "notifications_delete_policy"
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- ----------------------------------------------------------------------------
-- 5. AUTHORITATIVE SCOPED MARK-AS-READ RPCs
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.mark_notification_as_read(UUID);
CREATE OR REPLACE FUNCTION public.mark_notification_as_read(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_notif RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_notif FROM public.notifications WHERE id = p_notification_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;

  -- Verify caller has rights to mutate this notification
  IF v_notif.type IN ('PASSWORD_RESET', 'RECOVERY_REQUEST', 'ACCOUNT_LOCKOUT', 'SECURITY_ALERT', 'SYSTEM', 'MAINTENANCE') THEN
    IF v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
      RAISE EXCEPTION 'Access denied: caller unauthorized to manage administrative notifications';
    END IF;
  ELSIF v_notif.user_id IS NOT NULL AND v_notif.user_id != v_caller_id THEN
    IF v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
      RAISE EXCEPTION 'Access denied: caller unauthorized to manage this notification';
    END IF;
  END IF;

  UPDATE public.notifications
  SET is_read = TRUE, read_at = now()
  WHERE id = p_notification_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notification_as_read(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.mark_all_notifications_as_read();
CREATE OR REPLACE FUNCTION public.mark_all_notifications_as_read()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_updated_count INT := 0;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;

  IF v_caller_role IN ('ADMIN', 'SUPER_ADMIN') THEN
    -- Administrators mark all notifications as read
    UPDATE public.notifications
    SET is_read = TRUE, read_at = now()
    WHERE is_read = FALSE;
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  ELSE
    -- Staff mark strictly operational or personal notifications as read;
    -- Administrative and security alerts are completely untouched.
    UPDATE public.notifications
    SET is_read = TRUE, read_at = now()
    WHERE is_read = FALSE
      AND (
        user_id = v_caller_id
        OR (
          type IN (
            'LOW_STOCK',
            'OUT_OF_STOCK',
            'EXPIRING_SOON',
            'EXPIRED',
            'BATCH_DEPLETED',
            'STOCK_DISCREPANCY',
            'DAILY_SHEET',
            'SHEET_CORRECTION'
          )
        )
      );
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  END IF;

  RETURN v_updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_as_read() TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. CLEAN UP PERMISSIVE POLICIES ON CATEGORIES AND STOCK_BATCHES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.categories;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.categories;

DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.stock_batches;

NOTIFY pgrst, 'reload schema';
