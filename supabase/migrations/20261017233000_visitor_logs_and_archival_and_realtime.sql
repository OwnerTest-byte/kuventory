-- 20261017233000_visitor_logs_and_archival_and_realtime.sql
-- Fix visitor_logs permissions for Super Admin / Admin, daily inventory 30-day archival, and Realtime publications

-- 1. Fix RLS policies on public.visitor_logs
DROP POLICY IF EXISTS "Admins can view visitor logs" ON public.visitor_logs;
CREATE POLICY "Admins can view visitor logs"
    ON public.visitor_logs FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('ADMIN', 'MASTER_ADMIN')
        )
    );

DROP POLICY IF EXISTS "Users can view own visitor logs" ON public.visitor_logs;
CREATE POLICY "Users can view own visitor logs"
    ON public.visitor_logs FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Ensure authenticated users can insert visitor logs
DROP POLICY IF EXISTS "Users can insert own visitor logs" ON public.visitor_logs;
CREATE POLICY "Users can insert own visitor logs"
    ON public.visitor_logs FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- 2. Daily Inventory 30-day auto-archival function
CREATE OR REPLACE FUNCTION public.archive_old_daily_inventory_sheets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.daily_inventory
  SET state = 'ARCHIVED'
  WHERE inventory_date < (CURRENT_DATE - INTERVAL '30 days')
    AND state != 'ARCHIVED';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_old_daily_inventory_sheets() TO authenticated, anon;

-- 3. Add tables to supabase_realtime publication for real-time synchronization
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.visitor_logs;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_inventory;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_inventory_items;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_movements;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;
