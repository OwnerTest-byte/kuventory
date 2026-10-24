-- ============================================================================
-- MIGRATION: 20261025000000_inspect_all_live_policies.sql
-- Description:
--   Exposes a secure inspection function to audit all active RLS policies
-- ============================================================================

CREATE OR REPLACE FUNCTION public.inspect_all_live_policies()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_policies JSONB;
BEGIN
  SELECT jsonb_agg(to_jsonb(p)) INTO v_policies
  FROM (
    SELECT 
      schemaname,
      tablename,
      policyname,
      permissive,
      roles::text[] AS roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  ) p;

  RETURN COALESCE(v_policies, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.inspect_all_live_policies() TO authenticated, anon;
NOTIFY pgrst, 'reload schema';
