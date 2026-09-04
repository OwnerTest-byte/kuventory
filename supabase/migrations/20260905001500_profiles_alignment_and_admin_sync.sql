-- 20260905001500_profiles_alignment_and_admin_sync.sql
-- Synchronizes profiles schema with frontend Profile types, adds first_name, last_name, and updated_at,
-- and aligns admin user management RPC functions with full upsert and self-deletion safeguards.

-- 1. Add missing profile columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Backfill existing profile rows
UPDATE public.profiles 
SET first_name = split_part(display_name, ' ', 1),
    last_name = CASE 
      WHEN position(' ' in display_name) > 0 
      THEN substring(display_name from position(' ' in display_name) + 1) 
      ELSE '' 
    END
WHERE first_name IS NULL;

-- 3. Update admin_create_user to safely insert auth user and profile
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_first_name TEXT,
  p_last_name TEXT,
  p_role TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_display_name TEXT;
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Not authorized. Admin access required.';
  END IF;

  v_user_id := gen_random_uuid();
  v_display_name := TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, ''));
  IF v_display_name = '' THEN
    v_display_name := p_email;
  END IF;

  -- Insert into auth.users
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('first_name', p_first_name, 'last_name', p_last_name, 'role', p_role),
    now(),
    now()
  );

  -- Upsert into public.profiles
  INSERT INTO public.profiles (id, role, display_name, first_name, last_name, updated_at)
  VALUES (v_user_id, p_role, v_display_name, p_first_name, p_last_name, now())
  ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      display_name = EXCLUDED.display_name,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      updated_at = now();

  RETURN v_user_id;
END;
$$;

-- 4. Update admin_delete_user with self-deletion protection
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Not authorized. Admin access required.';
  END IF;

  -- Prevent deleting current logged-in admin
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete active logged-in administrator account.';
  END IF;

  -- Cascade delete
  DELETE FROM public.profiles WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
  
  RETURN TRUE;
END;
$$;

-- 5. Update handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_first_name TEXT := new.raw_user_meta_data->>'first_name';
  v_last_name TEXT := new.raw_user_meta_data->>'last_name';
  v_role TEXT := COALESCE(new.raw_user_meta_data->>'role', 'USER');
  v_display_name TEXT;
BEGIN
  v_display_name := TRIM(COALESCE(v_first_name, '') || ' ' || COALESCE(v_last_name, ''));
  IF v_display_name = '' THEN
    v_display_name := new.email;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) THEN
    v_role := 'ADMIN';
  END IF;

  INSERT INTO public.profiles (id, role, display_name, first_name, last_name, updated_at)
  VALUES (new.id, v_role, v_display_name, v_first_name, v_last_name, now())
  ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      display_name = EXCLUDED.display_name,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      updated_at = now();

  RETURN new;
END;
$$;

-- 6. Permissions
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
