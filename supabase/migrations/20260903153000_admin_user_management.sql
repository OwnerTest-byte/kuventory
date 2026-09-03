-- Create extension if not exists
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Function to delete user (Admin Only)
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

  -- Delete from auth.users (this cascades to public.profiles)
  DELETE FROM auth.users WHERE id = p_user_id;
  
  RETURN TRUE;
END;
$$;

-- 2. Function to create user (Admin Only)
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
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Not authorized. Admin access required.';
  END IF;

  v_user_id := gen_random_uuid();

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
    jsonb_build_object('first_name', p_first_name, 'last_name', p_last_name),
    now(),
    now()
  );

  -- Ensure profile role is updated (profile is likely auto-created via trigger, so we update it)
  UPDATE public.profiles 
  SET role = p_role, first_name = p_first_name, last_name = p_last_name
  WHERE id = v_user_id;

  RETURN v_user_id;
END;
$$;
