-- 20260904134500_rls_policies.sql
-- Corrected RLS Policies matching the actual schema

-- 1. Helper Function to get the current user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. Categories Policies
CREATE POLICY "Enable read access for authenticated users" ON categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for admins" ON categories FOR INSERT TO authenticated WITH CHECK (public.get_user_role() = 'ADMIN');
CREATE POLICY "Enable update for admins" ON categories FOR UPDATE TO authenticated USING (public.get_user_role() = 'ADMIN');
CREATE POLICY "Enable delete for admins" ON categories FOR DELETE TO authenticated USING (public.get_user_role() = 'ADMIN');

-- 3. Inventory Items Policies
CREATE POLICY "Enable read access for authenticated users" ON inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for admins" ON inventory_items FOR INSERT TO authenticated WITH CHECK (public.get_user_role() = 'ADMIN');
CREATE POLICY "Enable update for admins" ON inventory_items FOR UPDATE TO authenticated USING (public.get_user_role() = 'ADMIN');
CREATE POLICY "Enable delete for admins" ON inventory_items FOR DELETE TO authenticated USING (public.get_user_role() = 'ADMIN');

-- 4. Stock Batches Policies
CREATE POLICY "Enable read access for authenticated users" ON stock_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON stock_batches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON stock_batches FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for admins" ON stock_batches FOR DELETE TO authenticated USING (public.get_user_role() = 'ADMIN');

-- 5. Stock Movements Policies
CREATE POLICY "Enable read access for authenticated users" ON stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON stock_movements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable delete for admins" ON stock_movements FOR DELETE TO authenticated USING (public.get_user_role() = 'ADMIN');

-- 6. Daily Inventory Policies
CREATE POLICY "Enable read access for authenticated users" ON daily_inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON daily_inventory FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON daily_inventory FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for admins" ON daily_inventory FOR DELETE TO authenticated USING (public.get_user_role() = 'ADMIN');

-- 7. Daily Inventory Items Policies
CREATE POLICY "Enable read access for authenticated users" ON daily_inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON daily_inventory_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON daily_inventory_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for admins" ON daily_inventory_items FOR DELETE TO authenticated USING (public.get_user_role() = 'ADMIN');

-- 8. Notifications Policies
CREATE POLICY "Enable read access for authenticated users" ON notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON notifications FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for admins" ON notifications FOR DELETE TO authenticated USING (public.get_user_role() = 'ADMIN');

-- 9. Reports Policies
CREATE POLICY "Enable read access for authenticated users" ON reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable delete for admins" ON reports FOR DELETE TO authenticated USING (public.get_user_role() = 'ADMIN');

-- 10. Report Items Policies
CREATE POLICY "Enable read access for authenticated users" ON report_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON report_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable delete for admins" ON report_items FOR DELETE TO authenticated USING (public.get_user_role() = 'ADMIN');
