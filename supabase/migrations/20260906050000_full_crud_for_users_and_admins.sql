-- 20260906050000_full_crud_for_users_and_admins.sql
-- Enables complete CRUD (Add, Edit, Update, Remove/Archive) for both Staff and Admin users.

-- 1. Inventory Items RLS Policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON inventory_items;
DROP POLICY IF EXISTS "Enable insert for admins" ON inventory_items;
DROP POLICY IF EXISTS "Enable update for admins" ON inventory_items;
DROP POLICY IF EXISTS "Enable delete for admins" ON inventory_items;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON inventory_items;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON inventory_items;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON inventory_items;

CREATE POLICY "Enable read access for authenticated users" ON inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON inventory_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON inventory_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated users" ON inventory_items FOR DELETE TO authenticated USING (true);

-- 2. Categories RLS Policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON categories;
DROP POLICY IF EXISTS "Enable insert for admins" ON categories;
DROP POLICY IF EXISTS "Enable update for admins" ON categories;
DROP POLICY IF EXISTS "Enable delete for admins" ON categories;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON categories;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON categories;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON categories;

CREATE POLICY "Enable read access for authenticated users" ON categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated users" ON categories FOR DELETE TO authenticated USING (true);

-- 3. Stock Batches & Stock Movements RLS Policies
DROP POLICY IF EXISTS "Enable delete for admins" ON stock_batches;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON stock_batches;
CREATE POLICY "Enable delete for authenticated users" ON stock_batches FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable delete for admins" ON stock_movements;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON stock_movements;
CREATE POLICY "Enable delete for authenticated users" ON stock_movements FOR DELETE TO authenticated USING (true);

-- 4. Daily Inventory & Items RLS Policies
DROP POLICY IF EXISTS "Enable delete for admins" ON daily_inventory;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON daily_inventory;
CREATE POLICY "Enable delete for authenticated users" ON daily_inventory FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable delete for admins" ON daily_inventory_items;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON daily_inventory_items;
CREATE POLICY "Enable delete for authenticated users" ON daily_inventory_items FOR DELETE TO authenticated USING (true);

-- 5. Atomic Item Removal Function (Cleanly deletes all dependent records)
CREATE OR REPLACE FUNCTION public.remove_inventory_item(p_item_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.daily_inventory_items WHERE item_id = p_item_id;
  DELETE FROM public.stock_batches WHERE item_id = p_item_id;
  DELETE FROM public.stock_movements WHERE item_id = p_item_id;
  DELETE FROM public.notifications WHERE item_id = p_item_id;
  DELETE FROM public.inventory_items WHERE id = p_item_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_inventory_item(UUID) TO anon, authenticated, service_role;

-- 6. Atomic Item Archive Function
CREATE OR REPLACE FUNCTION public.archive_inventory_item(p_item_id UUID, p_archived BOOLEAN)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.inventory_items
  SET is_archived = p_archived,
      is_active = NOT p_archived,
      updated_at = NOW()
  WHERE id = p_item_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_inventory_item(UUID, BOOLEAN) TO anon, authenticated, service_role;

-- 7. Grant Schema Privileges
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- 8. Refresh PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
