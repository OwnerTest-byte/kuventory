-- ============================================================================
-- MIGRATION: 20261026170000_notification_role_scoping.sql
-- PURPOSE (owner decision, 2026-10-25):
--   Explicit per-role notification scoping. Every role receives exactly what
--   its work needs — nothing more, nothing less:
--     STAFF:        floor-relevant operational alerts (LOW_STOCK, OUT_OF_STOCK,
--                   EXPIRING_SOON, EXPIRED, BATCH_DEPLETED, DAILY_SHEET) plus
--                   anything targeted to them (their request decisions).
--     ADMIN:        everything STAFF receives + inventory-investigation and
--                   workflow types (STOCK_DISCREPANCY, SHEET_CORRECTION) + the
--                   administrative queue types (PASSWORD_RESET, RECOVERY_,
--                   ASSISTED_RECOVERY_REQUEST, ACCOUNT_LOCKOUT, SECURITY_ALERT,
--                   SYSTEM, MAINTENANCE, STAFF_CHANGE_REQUEST) + targeted.
--     SUPER_ADMIN:  same visibility as ADMIN.
--   Targeted rows (user_id set) remain recipient-only in every case.
-- The client-side zero-trust filter (notificationSecurity.ts) mirrors these
-- lists. Forward-only; INSERT/DELETE policies untouched.
-- ============================================================================

DROP POLICY IF EXISTS "notifications_select_policy" ON public.notifications;
CREATE POLICY "notifications_select_policy"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    -- 1. Targeted recipient (request decisions, personal alerts)
    auth.uid() = user_id
    -- 2. STAFF tier: floor-relevant operational alerts, every authenticated role
    OR (
      type IN (
        'LOW_STOCK',
        'OUT_OF_STOCK',
        'EXPIRING_SOON',
        'EXPIRED',
        'BATCH_DEPLETED',
        'DAILY_SHEET'
      )
    )
    -- 3. ADMIN tier: investigation + administrative queue types
    OR (
      type IN (
        'STOCK_DISCREPANCY',
        'SHEET_CORRECTION',
        'PASSWORD_RESET',
        'RECOVERY_REQUEST',
        'ASSISTED_RECOVERY_REQUEST',
        'ACCOUNT_LOCKOUT',
        'SECURITY_ALERT',
        'SYSTEM',
        'MAINTENANCE',
        'STAFF_CHANGE_REQUEST'
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role IN ('ADMIN', 'SUPER_ADMIN')
      )
    )
  );

DROP POLICY IF EXISTS "notifications_update_policy" ON public.notifications;
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
        'DAILY_SHEET'
      )
    )
    OR (
      type IN (
        'STOCK_DISCREPANCY',
        'SHEET_CORRECTION',
        'PASSWORD_RESET',
        'RECOVERY_REQUEST',
        'ASSISTED_RECOVERY_REQUEST',
        'ACCOUNT_LOCKOUT',
        'SECURITY_ALERT',
        'SYSTEM',
        'MAINTENANCE',
        'STAFF_CHANGE_REQUEST'
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
        'DAILY_SHEET'
      )
    )
    OR (
      type IN (
        'STOCK_DISCREPANCY',
        'SHEET_CORRECTION',
        'PASSWORD_RESET',
        'RECOVERY_REQUEST',
        'ASSISTED_RECOVERY_REQUEST',
        'ACCOUNT_LOCKOUT',
        'SECURITY_ALERT',
        'SYSTEM',
        'MAINTENANCE',
        'STAFF_CHANGE_REQUEST'
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role IN ('ADMIN', 'SUPER_ADMIN')
      )
    )
  );

-- Reload schema cache so PostgREST applies the replaced policies immediately.
NOTIFY pgrst, 'reload schema';
