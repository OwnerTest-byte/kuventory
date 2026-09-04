-- 1. Grant USAGE on the public schema to PUBLIC to restore standard PostgreSQL behavior.
-- When running `db reset`, the public schema is dropped and recreated, losing this default grant.
-- Without this, GoTrue (`supabase_auth_admin`) gets "permission denied for schema public" when it 
-- tries to check foreign key constraints (like `public.profiles` referencing `auth.users`) during login.
GRANT USAGE ON SCHEMA public TO PUBLIC;

-- 2. Ensure the auth trigger explicitly sets the search_path to public to prevent any potential 
-- resolution issues when executed by the auth service.
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Determine role: first user is ADMIN, rest are USER
  IF NOT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) THEN
    INSERT INTO public.profiles (id, role, display_name)
    VALUES (new.id, 'ADMIN', new.email);
  ELSE
    INSERT INTO public.profiles (id, role, display_name)
    VALUES (new.id, 'USER', new.email);
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql;
