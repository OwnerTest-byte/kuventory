-- 20260904134500_rls_policies.sql

-- Drop the old open policies
DROP POLICY IF EXISTS "Enable all for authenticated users" ON categories;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON items;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON stock_batches;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON stock_transactions;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON daily_inventory_sessions;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON daily_inventory_entries;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON notifications;

-- 1. Helper Function to get the current user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. Categories Policies
-- Everyone can read
CREATE POLICY "Enable read access for authenticated users" ON categories FOR SELECT TO authenticated USING (true);
-- Only ADMIN can insert/update/delete
CREATE POLICY "Enable insert for admins" ON categories FOR INSERT TO authenticated WITH CHECK (public.get_user_role() = 'ADMIN');
CREATE POLICY "Enable update for admins" ON categories FOR UPDATE TO authenticated USING (public.get_user_role() = 'ADMIN');
CREATE POLICY "Enable delete for admins" ON categories FOR DELETE TO authenticated USING (public.get_user_role() = 'ADMIN');

-- 3. Items Policies
CREATE POLICY "Enable read access for authenticated users" ON items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for admins" ON items FOR INSERT TO authenticated WITH CHECK (public.get_user_role() = 'ADMIN');
CREATE POLICY "Enable update for admins" ON items FOR UPDATE TO authenticated USING (public.get_user_role() = 'ADMIN');
CREATE POLICY "Enable delete for admins" ON items FOR DELETE TO authenticated USING (public.get_user_role() = 'ADMIN');

-- 4. Stock Batches Policies
-- Everyone can read
CREATE POLICY "Enable read access for authenticated users" ON stock_batches FOR SELECT TO authenticated USING (true);
-- Everyone can insert (when adjusting stock)
CREATE POLICY "Enable insert for authenticated users" ON stock_batches FOR INSERT TO authenticated WITH CHECK (true);
-- Everyone can update (when adjusting stock / FEFO)
CREATE POLICY "Enable update for authenticated users" ON stock_batches FOR UPDATE TO authenticated USING (true);
-- Only ADMIN can delete
CREATE POLICY "Enable delete for admins" ON stock_batches FOR DELETE TO authenticated USING (public.get_user_role() = 'ADMIN');

-- 5. Stock Transactions Policies
CREATE POLICY "Enable read access for authenticated users" ON stock_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON stock_transactions FOR INSERT TO authenticated WITH CHECK (true);
-- Nobody should update or delete transactions, but let's allow ADMIN just in case
CREATE POLICY "Enable delete for admins" ON stock_transactions FOR DELETE TO authenticated USING (public.get_user_role() = 'ADMIN');

-- 6. Daily Inventory Sessions
CREATE POLICY "Enable read access for authenticated users" ON daily_inventory_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON daily_inventory_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON daily_inventory_sessions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for admins" ON daily_inventory_sessions FOR DELETE TO authenticated USING (public.get_user_role() = 'ADMIN');

-- 7. Daily Inventory Entries
CREATE POLICY "Enable read access for authenticated users" ON daily_inventory_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON daily_inventory_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON daily_inventory_entries FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for admins" ON daily_inventory_entries FOR DELETE TO authenticated USING (public.get_user_role() = 'ADMIN');

-- 8. Notifications
CREATE POLICY "Enable read access for authenticated users" ON notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON notifications FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for admins" ON notifications FOR DELETE TO authenticated USING (public.get_user_role() = 'ADMIN');
