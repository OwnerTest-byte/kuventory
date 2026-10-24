-- ============================================================================
-- MIGRATION: 20261025200000_notification_route_storage_and_realtime_repair.sql
-- PURPOSE:
--   1. P0 repair — notifications.target_id and audit_logs.target_id were
--      created as UUID columns, but every meaningful writer stores navigation
--      route strings ('/settings?tab=users', '/items/<uuid>', '/daily-inventory').
--      Each such INSERT fails with 22P02 'invalid input syntax for type uuid',
--      which silently broke: assisted-recovery ticket creation (and therefore
--      the entire account-recovery workflow), password-reset notifications,
--      low-stock/expiry cron alerts, maintenance broadcasts, correction
--      notifications, and out-of-stock upserts. The TypeScript types and the
--      notification router already treat target_id as TEXT — the column type
--      was the defect. Conversion preserves any existing UUID values as text.
--   2. Recreate the daily_inventory_correction_requests SELECT policy without
--      the retired MASTER_ADMIN role.
--   3. Publish account_recovery_requests and
--      daily_inventory_correction_requests to supabase_realtime so the private
--      administrator review queues can subscribe. RLS remains the authority:
--      only ADMIN / SUPER_ADMIN sessions can satisfy the SELECT policies, so
--      no event is ever delivered to any other client.
-- Forward-only. Idempotent guards on every block.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CONVERT target_id COLUMNS FROM UUID TO TEXT (guarded, idempotent)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'target_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE public.notifications ALTER COLUMN target_id TYPE TEXT USING target_id::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_logs'
      AND column_name = 'target_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE public.audit_logs ALTER COLUMN target_id TYPE TEXT USING target_id::text;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. CORRECTION REQUESTS RLS: DROP THE RETIRED MASTER_ADMIN REFERENCE
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Requesters can read own correction requests" ON public.daily_inventory_correction_requests;
CREATE POLICY "Requesters can read own correction requests"
  ON public.daily_inventory_correction_requests
  FOR SELECT
  TO authenticated
  USING (
    requested_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- ----------------------------------------------------------------------------
-- 3. REALTIME PUBLICATION FOR THE ADMIN REVIEW QUEUES
--    (RLS filters every event to authorized administrator sessions)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'account_recovery_requests'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.account_recovery_requests;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'daily_inventory_correction_requests'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_inventory_correction_requests;
    END IF;
  END IF;
END;
$$;

-- Reload schema cache so PostgREST reflects the column type change immediately.
NOTIFY pgrst, 'reload schema';
