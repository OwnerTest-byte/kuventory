-- 1. Core Functions
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Auth & Profiles
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER handle_updated_at_profiles
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Auto-create profile on auth.user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (auth_user_id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Categories
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER handle_updated_at_categories
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- 4. Inventory Items
CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
    supplier_name TEXT,
    unit TEXT,
    cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (cost >= 0),
    current_stock NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (current_stock >= 0),
    minimum_stock NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (minimum_stock >= 0),
    status TEXT NOT NULL DEFAULT 'OUT_OF_STOCK' CHECK (status IN ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER handle_updated_at_inventory_items
    BEFORE UPDATE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- 5. Stock Movements
CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('ADD', 'REMOVE', 'ADJUST')),
    quantity NUMERIC(15, 2) NOT NULL,
    previous_stock NUMERIC(15, 2) NOT NULL,
    new_stock NUMERIC(15, 2) NOT NULL,
    reason TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('LOW_STOCK', 'OUT_OF_STOCK', 'SYSTEM')),
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Triggers and RPCs
-- RPC for updating stock atomically
CREATE OR REPLACE FUNCTION update_stock(
    p_item_id UUID,
    p_movement_type TEXT,
    p_quantity NUMERIC,
    p_reason TEXT,
    p_user_id UUID DEFAULT NULL
) RETURNS void AS $$
DECLARE
    v_previous_stock NUMERIC;
    v_new_stock NUMERIC;
    v_status TEXT;
    v_minimum_stock NUMERIC;
BEGIN
    -- Lock the row for update to prevent concurrent modification issues
    SELECT current_stock, minimum_stock INTO v_previous_stock, v_minimum_stock
    FROM inventory_items
    WHERE id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item not found';
    END IF;

    -- Calculate new stock based on movement type
    IF p_movement_type = 'ADD' THEN
        v_new_stock := v_previous_stock + p_quantity;
    ELSIF p_movement_type = 'REMOVE' THEN
        v_new_stock := v_previous_stock - p_quantity;
    ELSIF p_movement_type = 'ADJUST' THEN
        v_new_stock := p_quantity;
    ELSE
        RAISE EXCEPTION 'Invalid movement type';
    END IF;

    IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'Stock cannot be negative';
    END IF;

    -- Determine new status
    IF v_new_stock = 0 THEN
        v_status := 'OUT_OF_STOCK';
    ELSIF v_new_stock <= v_minimum_stock THEN
        v_status := 'LOW_STOCK';
    ELSE
        v_status := 'IN_STOCK';
    END IF;

    -- Update the inventory item
    UPDATE inventory_items
    SET current_stock = v_new_stock, status = v_status
    WHERE id = p_item_id;

    -- Insert the movement record
    INSERT INTO stock_movements (
        inventory_item_id, movement_type, quantity, previous_stock, new_stock, reason, created_by
    ) VALUES (
        p_item_id, p_movement_type, p_quantity, v_previous_stock, v_new_stock, p_reason, p_user_id
    );
END;
$$ LANGUAGE plpgsql;

-- Trigger for generating low stock/out of stock notifications automatically
CREATE OR REPLACE FUNCTION check_stock_levels()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if status changed to LOW_STOCK or OUT_OF_STOCK
    IF NEW.status != OLD.status THEN
        IF NEW.status = 'LOW_STOCK' THEN
            INSERT INTO notifications (inventory_item_id, type, message)
            VALUES (NEW.id, 'LOW_STOCK', 'Item ' || NEW.name || ' is low on stock (' || NEW.current_stock || ' left).');
        ELSIF NEW.status = 'OUT_OF_STOCK' THEN
            INSERT INTO notifications (inventory_item_id, type, message)
            VALUES (NEW.id, 'OUT_OF_STOCK', 'Item ' || NEW.name || ' is out of stock.');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_stock_levels
    AFTER UPDATE OF status ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION check_stock_levels();


-- 8. RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- For simplicity in this demo, granting full access to authenticated users. 
-- You can tighten these later.
CREATE POLICY "Enable read access for authenticated users" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable update for users based on id" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = auth_user_id);

CREATE POLICY "Enable all for authenticated users" ON categories FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable all for authenticated users" ON inventory_items FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable all for authenticated users" ON stock_movements FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable all for authenticated users" ON notifications FOR ALL TO authenticated USING (true);
