-- Database Reconstruction & Seed Data

-- 1. DROP EXISTING TABLES TO START FRESH
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS daily_inventory_entries CASCADE;
DROP TABLE IF EXISTS daily_inventory_sessions CASCADE;
DROP TABLE IF EXISTS stock_transactions CASCADE;
DROP TABLE IF EXISTS stock_batches CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 3. USERS & ROLES
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(30) DEFAULT 'Staff' CHECK (role IN ('Administrator', 'Staff')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. CATEGORIES
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. ITEMS MASTER TABLE
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_code VARCHAR(50) UNIQUE NOT NULL,
    item_name VARCHAR(150) NOT NULL,
    description TEXT,
    category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
    inventory_type VARCHAR(20) NOT NULL CHECK (inventory_type IN ('PORTION STOCK', 'PER CASES')),
    unit VARCHAR(50) NOT NULL,
    unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    supplier_a VARCHAR(150),
    supplier_b VARCHAR(150),
    min_qty INTEGER NOT NULL DEFAULT 20,
    current_qty INTEGER NOT NULL DEFAULT 0,
    image_path TEXT,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. STOCK BATCHES (FEFO TRACKING)
CREATE TABLE stock_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    batch_code VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    initial_quantity INTEGER NOT NULL,
    expiry_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. STOCK TRANSACTIONS / AUDIT LOG
CREATE TABLE stock_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('ADD', 'REMOVE', 'ADJUST')),
    quantity INTEGER NOT NULL,
    previous_balance INTEGER NOT NULL,
    new_balance INTEGER NOT NULL,
    batch_id UUID REFERENCES stock_batches(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. DAILY INVENTORY SESSIONS
CREATE TABLE daily_inventory_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_date DATE UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED')),
    prepared_by UUID REFERENCES users(id) ON DELETE SET NULL,
    finalized_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finalized_at TIMESTAMP WITH TIME ZONE
);

-- 9. DAILY INVENTORY ENTRIES
CREATE TABLE daily_inventory_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES daily_inventory_sessions(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    section VARCHAR(20) NOT NULL CHECK (section IN ('PORTION STOCK', 'PER CASES')),
    beginning_qty INTEGER NOT NULL DEFAULT 0,
    add_qty INTEGER NOT NULL DEFAULT 0,
    total_stock INTEGER GENERATED ALWAYS AS (beginning_qty + add_qty) STORED,
    sales_am INTEGER NOT NULL DEFAULT 0,
    sales_pm INTEGER NOT NULL DEFAULT 0,
    ending_qty INTEGER GENERATED ALWAYS AS ((beginning_qty + add_qty) - (sales_am + sales_pm)) STORED,
    CONSTRAINT unique_session_item_section UNIQUE (session_id, item_id, section)
);

-- 10. NOTIFICATIONS & ALERTS
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('LOW_STOCK', 'EXPIRING_SOON', 'OUT_OF_STOCK', 'EXPIRED')),
    item_id UUID REFERENCES items(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ==========================================
-- SEED DATA
-- ==========================================

-- A. Categories
INSERT INTO categories (id, name) VALUES 
('11111111-1111-1111-1111-111111111111', 'Beverages'),
('22222222-2222-2222-2222-222222222222', 'Dairy'),
('33333333-3333-3333-3333-333333333333', 'Groceries')
ON CONFLICT (id) DO NOTHING;

-- B. Items (Portion Stock)
INSERT INTO items (id, item_code, item_name, description, category_id, inventory_type, unit, unit_cost, supplier_a, supplier_b, min_qty, current_qty) VALUES
('aaaa1111-aaaa-1111-aaaa-111111111111', 'BEV-001', 'Pale Pilsen', '', '11111111-1111-1111-1111-111111111111', 'PORTION STOCK', 'bottle', 40.00, 'ABC Trading', 'XYZ Distribution', 20, 75),
('aaaa2222-aaaa-2222-aaaa-222222222222', 'BEV-002', 'Stallion Red Horse', '', '11111111-1111-1111-1111-111111111111', 'PORTION STOCK', 'bottle', 45.00, 'ABC Trading', 'XYZ Distribution', 20, 63),
('aaaa3333-aaaa-3333-aaaa-333333333333', 'BEV-003', 'SML', '', '11111111-1111-1111-1111-111111111111', 'PORTION STOCK', 'bottle', 42.00, '', '', 20, 84),
('aaaa4444-aaaa-4444-aaaa-444444444444', 'BEV-004', 'SMA', '', '11111111-1111-1111-1111-111111111111', 'PORTION STOCK', 'bottle', 42.00, '', '', 20, 6),
('aaaa5555-aaaa-5555-aaaa-555555555555', 'BEV-005', 'Cerveza', '', '11111111-1111-1111-1111-111111111111', 'PORTION STOCK', 'bottle', 50.00, '', '', 20, 6),
('aaaa6666-aaaa-6666-aaaa-666666666666', 'BEV-006', 'Coke Zero', '', '11111111-1111-1111-1111-111111111111', 'PORTION STOCK', 'can', 35.00, '', '', 20, 0),
('aaaa7777-aaaa-7777-aaaa-777777777777', 'BEV-007', 'Sprite 1L Can', '', '11111111-1111-1111-1111-111111111111', 'PORTION STOCK', 'can', 35.00, '', '', 20, 21),
('bbbb1111-bbbb-1111-bbbb-111111111111', 'DAI-001', 'Milk', '', '22222222-2222-2222-2222-222222222222', 'PORTION STOCK', 'bottle', 85.00, '', '', 15, 17),
('bbbb2222-bbbb-2222-bbbb-222222222222', 'DAI-002', 'Cream', '', '22222222-2222-2222-2222-222222222222', 'PORTION STOCK', 'bottle', 95.00, '', '', 15, 8),
('cccc1111-cccc-1111-cccc-111111111111', 'GRO-001', 'Sugar', '', '33333333-3333-3333-3333-333333333333', 'PORTION STOCK', 'kg', 60.00, '', '', 10, 12);

-- C. Items (Per Cases)
INSERT INTO items (id, item_code, item_name, description, category_id, inventory_type, unit, min_qty, current_qty) VALUES
('dddd1111-dddd-1111-dddd-111111111111', 'CASE-001', 'Pale Pilsen (Cases)', '', '11111111-1111-1111-1111-111111111111', 'PER CASES', 'case', 5, 3),
('dddd2222-dddd-2222-dddd-222222222222', 'CASE-002', 'Stallion Red Horse (Cases)', '', '11111111-1111-1111-1111-111111111111', 'PER CASES', 'case', 5, 2),
('dddd3333-dddd-3333-dddd-333333333333', 'CASE-003', 'SML (Cases)', '', '11111111-1111-1111-1111-111111111111', 'PER CASES', 'case', 5, 3),
('dddd4444-dddd-4444-dddd-444444444444', 'CASE-004', 'SMA (Cases)', '', '11111111-1111-1111-1111-111111111111', 'PER CASES', 'case', 5, 2),
('dddd5555-dddd-5555-dddd-555555555555', 'CASE-005', 'Cerveza (Cases)', '', '11111111-1111-1111-1111-111111111111', 'PER CASES', 'case', 5, 1);

-- D. Stock Batches (Milk)
INSERT INTO stock_batches (id, item_id, batch_code, quantity, initial_quantity, expiry_date) VALUES
('eeee1111-eeee-1111-eeee-111111111111', 'bbbb1111-bbbb-1111-bbbb-111111111111', 'MLK-250524-A', 20, 20, '2025-05-28'),
('eeee2222-eeee-2222-eeee-222222222222', 'bbbb1111-bbbb-1111-bbbb-111111111111', 'MLK-250530-B', 25, 25, '2025-05-30'),
('eeee3333-eeee-3333-eeee-333333333333', 'bbbb1111-bbbb-1111-bbbb-111111111111', 'MLK-250605-C', 18, 18, '2025-06-05'),
('eeee4444-eeee-4444-eeee-444444444444', 'bbbb1111-bbbb-1111-bbbb-111111111111', 'MLK-250610-D', 30, 30, '2025-06-10');

-- E. Daily Inventory Session
INSERT INTO daily_inventory_sessions (id, inventory_date, status) VALUES
('ffff1111-ffff-1111-ffff-111111111111', '2025-05-24', 'DRAFT');

-- F. Daily Inventory Entries (Portion Stock)
INSERT INTO daily_inventory_entries (session_id, item_id, section, beginning_qty, add_qty, sales_am, sales_pm) VALUES
('ffff1111-ffff-1111-ffff-111111111111', 'aaaa1111-aaaa-1111-aaaa-111111111111', 'PORTION STOCK', 83, 12, 6, 14),
('ffff1111-ffff-1111-ffff-111111111111', 'aaaa2222-aaaa-2222-aaaa-222222222222', 'PORTION STOCK', 71, 0, 0, 8),
('ffff1111-ffff-1111-ffff-111111111111', 'aaaa3333-aaaa-3333-aaaa-333333333333', 'PORTION STOCK', 90, 0, 0, 6),
('ffff1111-ffff-1111-ffff-111111111111', 'aaaa4444-aaaa-4444-aaaa-444444444444', 'PORTION STOCK', 25, 0, 6, 13),
('ffff1111-ffff-1111-ffff-111111111111', 'aaaa5555-aaaa-5555-aaaa-555555555555', 'PORTION STOCK', 6, 0, 0, 0);

-- G. Daily Inventory Entries (Per Cases)
INSERT INTO daily_inventory_entries (session_id, item_id, section, beginning_qty, add_qty, sales_am, sales_pm) VALUES
('ffff1111-ffff-1111-ffff-111111111111', 'dddd1111-dddd-1111-dddd-111111111111', 'PER CASES', 3, 0, 0, 0),
('ffff1111-ffff-1111-ffff-111111111111', 'dddd2222-dddd-2222-dddd-222222222222', 'PER CASES', 2, 0, 0, 0),
('ffff1111-ffff-1111-ffff-111111111111', 'dddd3333-dddd-3333-dddd-333333333333', 'PER CASES', 3, 0, 0, 0),
('ffff1111-ffff-1111-ffff-111111111111', 'dddd4444-dddd-4444-dddd-444444444444', 'PER CASES', 2, 0, 0, 0),
('ffff1111-ffff-1111-ffff-111111111111', 'dddd5555-dddd-5555-dddd-555555555555', 'PER CASES', 1, 0, 0, 0);
