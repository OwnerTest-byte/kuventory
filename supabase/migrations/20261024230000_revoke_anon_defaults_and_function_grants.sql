-- ============================================================================
-- MIGRATION: 20261024230000_revoke_anon_defaults_and_function_grants.sql
-- Description:
--   Zero-Trust Security Hardening for Anon Role:
--   1. Revoke default privileges from anon on tables, functions, sequences, routines
--   2. Revoke execute on all existing functions/routines in public schema from anon
--   3. Revoke table/sequence grants in public schema from anon
--   4. Revoke CREATE on schema public from anon and PUBLIC
--   5. Explicitly grant only authorized public helpers (ping_keepalive, role checks)
-- ============================================================================

-- 1. REVOKE DEFAULT PRIVILEGES FROM anon IN SCHEMA public
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon;

-- 2. REVOKE SCHEMA LEVEL PRIVILEGES
REVOKE CREATE ON SCHEMA public FROM anon, PUBLIC;

-- 3. REVOKE ALL EXISTING TABLE AND SEQUENCE GRANTS FROM anon
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- 4. REVOKE ALL EXISTING FUNCTION AND ROUTINE GRANTS FROM anon
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- 5. EXPLICITLY GRANT ONLY REQUIRED PUBLIC/ANON HELPER ROUTINES
-- ping_keepalive: Safe server health status
GRANT EXECUTE ON FUNCTION public.ping_keepalive() TO anon, authenticated;

-- Role inspection functions (fail-closed if not authenticated)
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_master_admin() TO anon, authenticated;

-- Ensure authenticated role retains execution on authorized functions
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
