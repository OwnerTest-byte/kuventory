-- 20260923234500_fix_admin_create_user_and_auth_schema.sql
-- Fixes "Database error querying schema" by ensuring all string token columns in auth.users
-- are initialized to empty strings '' rather than NULL (preventing GoTrue scanner crash),
-- creating corresponding auth.identities records, and hardening admin_create_user.

-- 1. REPAIR EXISTING AUTH.USERS WITH NULL STRING TOKENS
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

-- 2. ENSURE IDENTITIES EXIST IN AUTH.IDENTITIES FOR ALL USERS
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT 
  id,
  id,
  jsonb_build_object('sub', id::text, 'email', email),
  'email',
  email,
  now(),
  now(),
  now()
FROM auth.users
ON CONFLICT (provider, provider_id) DO NOTHING;

-- 3. HARDEN ADMIN_CREATE_USER WITH EXPLICIT STRING TOKENS AND AUTH.IDENTITIES
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
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_display_name TEXT;
  v_clean_role TEXT;
  v_clean_email TEXT;
BEGIN
  -- Strict administrator authorization
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized. Admin access required.';
  END IF;

  -- Email sanitization and validation
  v_clean_email := LOWER(TRIM(p_email));
  IF v_clean_email = '' OR v_clean_email NOT LIKE '%_@__%.__%' THEN
    RAISE EXCEPTION 'Invalid email address.';
  END IF;

  -- Password policy validation
  IF p_password IS NULL OR LENGTH(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters long.';
  END IF;

  -- Role normalization
  v_clean_role := UPPER(TRIM(COALESCE(p_role, 'USER')));
  IF v_clean_role NOT IN ('ADMIN', 'USER') THEN
    RAISE EXCEPTION 'Invalid role. Role must be ADMIN or USER.';
  END IF;

  -- Duplicate email prevention
  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_clean_email) THEN
    RAISE EXCEPTION 'User already exists with this email address.';
  END IF;

  v_user_id := gen_random_uuid();
  v_display_name := TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, ''));
  IF v_display_name = '' THEN
    v_display_name := split_part(v_clean_email, '@', 1);
  END IF;

  -- Insert into auth.users with ALL required GoTrue string columns defaulted to empty strings ''
  -- to prevent GoTrue database scanner crash ("Database error querying schema")
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
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change_token_current,
    email_change,
    phone_change_token,
    reauthentication_token,
    phone,
    is_super_admin,
    is_sso_user
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_clean_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('first_name', p_first_name, 'last_name', p_last_name, 'role', v_clean_role),
    now(),
    now(),
    '', '', '', '', '', '', '',
    NULL,
    false,
    false
  );

  -- Insert into auth.identities so Supabase GoTrue recognizes the email identity for password authentication
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_clean_email),
    'email',
    v_clean_email,
    now(),
    now(),
    now()
  )
  ON CONFLICT (provider, provider_id) DO NOTHING;

  -- Upsert into public.profiles
  INSERT INTO public.profiles (id, role, display_name, first_name, last_name, updated_at)
  VALUES (v_user_id, v_clean_role, v_display_name, p_first_name, p_last_name, now())
  ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      display_name = EXCLUDED.display_name,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      updated_at = now();

  -- Record audit trail
  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, new_data)
  VALUES (auth.uid(), 'USER_CREATE', 'profiles', v_user_id, jsonb_build_object('email', v_clean_email, 'role', v_clean_role));

  RETURN v_user_id;
END;
$$;

-- 4. GRANT PERMISSIONS AND NOTIFY SCHEMA RELOAD
REVOKE EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
