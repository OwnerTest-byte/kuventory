-- Fix: Grant usage on public schema so PostgREST can access it after reset
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
