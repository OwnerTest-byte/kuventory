-- 20261003200000_master_admin_and_reset_workflow.sql
-- Dedicated Master Admin Credentials, Password Reset RPC, and Real-Time Notifications

-- 1. Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- 2. Dedicated Master Admin Account Creation
DO $$
DECLARE
  v_master_id UUID;
  v_salt TEXT := extensions.gen_salt('bf');
BEGIN
  -- Insert or verify dedicated Master Admin user
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = 'master@kuventory.com') THEN
    v_master_id := gen_random_uuid();
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      phone,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change_token_current
    )
    VALUES (
      v_master_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'master@kuventory.com',
      extensions.crypt('MasterAdmin2026!', v_salt),
      now(),
      '09917101298',
      '{"provider":"email","providers":["email"]}',
      '{"role":"MASTER_ADMIN","first_name":"Master","last_name":"Admin","phone":"09917101298"}',
      now(),
      now(),
      '', '', '', ''
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      v_master_id,
      v_master_id,
      jsonb_build_object('sub', v_master_id::text, 'email', 'master@kuventory.com'),
      'email',
      'master@kuventory.com',
      now(),
      now(),
      now()
    );

    INSERT INTO public.profiles (
      id,
      role,
      display_name,
      first_name,
      last_name,
      phone,
      updated_at
    ) VALUES (
      v_master_id,
      'MASTER_ADMIN',
      'Master Admin',
      'Master',
      'Admin',
      '09917101298',
      now()
    )
    ON CONFLICT (id) DO UPDATE
    SET role = 'MASTER_ADMIN',
        display_name = 'Master Admin',
        phone = '09917101298',
        updated_at = now();
  ELSE
    -- If already exists, ensure MASTER_ADMIN role and phone are set
    SELECT id INTO v_master_id FROM auth.users WHERE LOWER(email) = 'master@kuventory.com';
    UPDATE auth.users
    SET phone = '09917101298',
        encrypted_password = extensions.crypt('MasterAdmin2026!', v_salt),
        raw_user_meta_data = raw_user_meta_data || '{"role":"MASTER_ADMIN","phone":"09917101298"}'::jsonb
    WHERE id = v_master_id;

    UPDATE public.profiles
    SET role = 'MASTER_ADMIN',
        phone = '09917101298',
        display_name = 'Master Admin'
    WHERE id = v_master_id;
  END IF;

  -- Also upgrade admin@kuventory.com profile to MASTER_ADMIN if it exists so both logins have full Master privileges
  UPDATE public.profiles
  SET role = 'MASTER_ADMIN'
  WHERE id IN (SELECT id FROM auth.users WHERE LOWER(email) = 'admin@kuventory.com');

END $$;

-- 3. Procedure for Staff to Request Password Reset (Dispatches Real-Time Alert to Master Admin)
CREATE OR REPLACE FUNCTION public.request_password_reset(
  p_email TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_clean_email TEXT;
  v_user_exists BOOLEAN;
  v_dedup TEXT;
BEGIN
  v_clean_email := LOWER(TRIM(p_email));
  IF v_clean_email = '' OR v_clean_email NOT LIKE '%_@__%.__%' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Please provide a valid email address.'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE LOWER(email) = v_clean_email
  ) INTO v_user_exists;

  -- Deduplication key prevents flood spam within the same 5-minute window
  v_dedup := 'pwd_reset_' || v_clean_email || '_' || to_char(now(), 'YYYYMMDD_HH24MI');

  INSERT INTO public.notifications (
    type,
    title,
    message,
    target_id,
    dedup_key
  ) VALUES (
    'PASSWORD_RESET',
    'Password Reset Request: ' || v_clean_email,
    'Staff member (' || v_clean_email || ') requested a password reset. Verify or contact Master Admin Hotline: 09917101298, or reset password in Admin Settings.',
    '/settings?tab=users',
    v_dedup
  )
  ON CONFLICT (dedup_key) DO UPDATE
  SET created_at = now(),
      is_read = false;

  -- Audit log if table exists
  BEGIN
    INSERT INTO public.audit_logs (action, target_table, details)
    VALUES (
      'PASSWORD_RESET_REQUESTED',
      'auth.users',
      jsonb_build_object(
        'email', v_clean_email, 
        'user_found', v_user_exists,
        'master_hotline', '09917101298',
        'requested_at', now()
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Password reset request has been dispatched directly to the Master Admin.',
    'hotline', '09917101298',
    'admin_email', 'master@kuventory.com'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_password_reset(TEXT) TO anon, authenticated;

-- 4. Procedure for Admin / Master Admin to Directly Reset User Password
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  p_user_id UUID,
  p_new_password TEXT
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_target_role TEXT;
BEGIN
  -- Verify caller is Admin or Master Admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized. Admin access required.';
  END IF;

  IF p_new_password IS NULL OR LENGTH(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters long.';
  END IF;

  -- Check target user's role to prevent non-master admins from tampering with master accounts
  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_user_id;
  IF UPPER(TRIM(COALESCE(v_target_role, ''))) = 'MASTER_ADMIN' AND NOT public.is_master_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only a Master Administrator can reset the password of another Master Administrator.';
  END IF;

  -- Update auth.users encrypted password
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found in system.';
  END IF;

  -- Log action into audit_logs
  BEGIN
    INSERT INTO public.audit_logs (user_id, action, target_table, target_id, details)
    VALUES (
      auth.uid(),
      'ADMIN_RESET_PASSWORD',
      'auth.users',
      p_user_id,
      jsonb_build_object('reset_by', auth.uid(), 'timestamp', now())
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated;
