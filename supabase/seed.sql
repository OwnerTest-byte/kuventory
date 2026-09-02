-- Seed data for KUVENTORY development

-- 1. Create Users
-- The `on_auth_user_created` trigger will automatically populate `public.profiles`.
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'admin@kuventory.local', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), 'authenticated', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'user@kuventory.local', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), 'authenticated', '', '', '', '');

-- Note: The trigger creates the first user as ADMIN and subsequent as USER.

-- 2. Categories
INSERT INTO public.categories (id, name, description) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Beverages', 'All drinks'),
  ('c0000000-0000-0000-0000-000000000002', 'Snacks', 'Chips and snacks');

-- 3. Inventory Items
INSERT INTO public.inventory_items (id, category_id, name, unit, unit_cost, min_quantity) VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Pale Pilsen', 'Bottle', 50.00, 20),
  ('10000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Red Horse', 'Bottle', 60.00, 10),
  ('10000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'Potato Chips', 'Bag', 30.00, 5);

-- 4. Stock Batches
INSERT INTO public.stock_batches (id, item_id, quantity, expiry_date, received_date) VALUES
  -- Pale Pilsen has multiple batches to test FEFO.
  -- Older expiry should be consumed first.
  ('b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 50, CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE - INTERVAL '2 days'),
  ('b0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 100, CURRENT_DATE + INTERVAL '30 days', CURRENT_DATE),
  
  -- Red Horse has low stock
  ('b0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 5, CURRENT_DATE + INTERVAL '20 days', CURRENT_DATE);
  -- Potato Chips has 0 stock (no batches)
