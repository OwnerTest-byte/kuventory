-- 20260904140000_permanent_auth_and_schema_fix.sql
-- Fixes "Database error querying schema" by ensuring no NULL string tokens in auth.users
-- and granting schema access and reloading PostgREST schema cache.

-- 1. Coerce all NULL string columns in auth.users to empty strings
UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  email_change = COALESCE(email_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE 
  confirmation_token IS NULL OR
  recovery_token IS NULL OR
  email_change_token_new IS NULL OR
  email_change_token_current IS NULL OR
  email_change IS NULL OR
  phone_change_token IS NULL OR
  reauthentication_token IS NULL;

-- 2. Ensure profiles exist for all users in auth.users
INSERT INTO public.profiles (id, role, display_name)
SELECT 
  id, 
  CASE 
    WHEN (raw_user_meta_data->>'role') = 'ADMIN' THEN 'ADMIN'
    ELSE 'USER'
  END,
  COALESCE(raw_user_meta_data->>'first_name', email)
FROM auth.users
ON CONFLICT (id) DO UPDATE 
SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;

-- 3. Grant public schema usage and permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, postgres, PUBLIC;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- 4. Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
