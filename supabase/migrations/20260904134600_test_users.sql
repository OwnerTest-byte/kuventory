-- Create test admin and staff users for testing live

-- Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
BEGIN
  -- Insert ADMIN user
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@kuventory.com') THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'admin@kuventory.com',
      extensions.crypt('Admin123!', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"role":"ADMIN","first_name":"Admin","last_name":"User"}',
      now(),
      now()
    );
  END IF;

  -- Insert STAFF user
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'staff@kuventory.com') THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'staff@kuventory.com',
      extensions.crypt('Staff123!', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"role":"STAFF","first_name":"Staff","last_name":"User"}',
      now(),
      now()
    );
  END IF;
END $$;
