-- ============================================================================
-- MIGRATION: 20261024231000_live_db_privilege_inspection.sql
-- Description:
--   Creates a secure inspection RPC to run exact live-DB role & privilege queries
-- ============================================================================

CREATE OR REPLACE FUNCTION public.inspect_live_db_privileges()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_col_info JSONB;
  v_role_counts JSONB;
  v_constraints JSONB;
  v_anon_tables JSONB;
  v_anon_routines JSONB;
  v_default_privs JSONB;
BEGIN
  -- 1. Check actual column type for public.profiles.role
  SELECT jsonb_agg(to_jsonb(c)) INTO v_col_info
  FROM (
    SELECT table_schema, table_name, column_name, data_type, udt_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'role'
  ) c;

  -- 2. Check normalized roles currently stored
  SELECT jsonb_agg(to_jsonb(r)) INTO v_role_counts
  FROM (
    SELECT UPPER(TRIM(role)) AS normalized_role, COUNT(*)::int AS account_count 
    FROM public.profiles 
    GROUP BY UPPER(TRIM(role)) 
    ORDER BY normalized_role
  ) r;

  -- 3. Check current constraints on public.profiles
  SELECT jsonb_agg(to_jsonb(k)) INTO v_constraints
  FROM (
    SELECT conname, pg_get_constraintdef(oid) AS constraint_definition 
    FROM pg_constraint 
    WHERE conrelid = 'public.profiles'::regclass 
      AND contype = 'c'
  ) k;

  -- 4. Check tables accessible to anon
  SELECT jsonb_agg(to_jsonb(t)) INTO v_anon_tables
  FROM (
    SELECT table_name, privilege_type, grantee 
    FROM information_schema.table_privileges 
    WHERE table_schema = 'public' 
      AND grantee = 'anon'
    ORDER BY table_name, privilege_type
  ) t;

  -- 5. Check routines accessible to anon
  SELECT jsonb_agg(to_jsonb(p)) INTO v_anon_routines
  FROM (
    SELECT routine_name, privilege_type, grantee 
    FROM information_schema.routine_privileges 
    WHERE specific_schema = 'public' 
      AND grantee = 'anon'
    ORDER BY routine_name
  ) p;

  -- 6. Check default privileges in schema public
  SELECT jsonb_agg(to_jsonb(d)) INTO v_default_privs
  FROM (
    SELECT defaclrole::regrole::text AS role, 
           defaclnamespace::regnamespace::text AS schema_name, 
           defaclobjtype AS obj_type, 
           defaclacl::text AS privileges
    FROM pg_default_acl
    WHERE defaclnamespace = 'public'::regnamespace
  ) d;

  RETURN jsonb_build_object(
    'column_type', COALESCE(v_col_info, '[]'::jsonb),
    'roles_summary', COALESCE(v_role_counts, '[]'::jsonb),
    'constraints', COALESCE(v_constraints, '[]'::jsonb),
    'anon_table_privileges', COALESCE(v_anon_tables, '[]'::jsonb),
    'anon_routine_privileges', COALESCE(v_anon_routines, '[]'::jsonb),
    'default_privileges', COALESCE(v_default_privs, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.inspect_live_db_privileges() TO authenticated, anon;
NOTIFY pgrst, 'reload schema';
