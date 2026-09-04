-- 20260904142000_seed_all_business_items.sql
-- Safely populate all business categories, items, and batches if not already present

DO $$
DECLARE
    v_grilled_id UUID;
    v_portion_id UUID;
    v_case_id UUID;
    v_item_id UUID;
BEGIN
    -- 1. Ensure Categories
    INSERT INTO public.categories (name) VALUES ('GRILLED STOCK') 
      ON CONFLICT (name) DO NOTHING;
    SELECT id INTO v_grilled_id FROM public.categories WHERE name = 'GRILLED STOCK';

    INSERT INTO public.categories (name) VALUES ('PORTION STOCK') 
      ON CONFLICT (name) DO NOTHING;
    SELECT id INTO v_portion_id FROM public.categories WHERE name = 'PORTION STOCK';

    INSERT INTO public.categories (name) VALUES ('PER CASES') 
      ON CONFLICT (name) DO NOTHING;
    SELECT id INTO v_case_id FROM public.categories WHERE name = 'PER CASES';

    -- Helper macro pattern: insert item if not exists and create initial batch

    -- GRILLED STOCK
    -- Betamax
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'BETAMAX') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_grilled_id, 'BETAMAX', 'pcs', 10, 20) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 50, '2026-12-31');
    END IF;

    -- Adidas
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'ADIDAS') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_grilled_id, 'ADIDAS', 'pcs', 15, 20) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 13, '2026-12-31');
    END IF;

    -- Chicken Neck
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'CHICKEN NECK') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_grilled_id, 'CHICKEN NECK', 'pcs', 15, 20) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 15, '2026-12-31');
    END IF;

    -- Pork BBQ
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'PORK BBQ') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_grilled_id, 'PORK BBQ', 'pcs', 20, 20) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 61, '2026-12-31');
    END IF;

    -- Hotdog
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'HOTDOG') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_grilled_id, 'HOTDOG', 'pcs', 15, 20) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 10, '2026-12-31');
    END IF;

    -- Pork Tenga
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'PORK TENGA') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_grilled_id, 'PORK TENGA', 'pcs', 15, 20) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 15, '2026-12-31');
    END IF;

    -- Isaw
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'ISAW') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_grilled_id, 'ISAW', 'pcs', 15, 20) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 34, '2026-12-31');
    END IF;

    -- Chicken-Inasal
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'CHICKEN-INASAL') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_grilled_id, 'CHICKEN-INASAL', 'pcs', 120, 10) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 6, '2026-12-31');
    END IF;

    -- Chicken-BBQ
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'CHICKEN-BBQ') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_grilled_id, 'CHICKEN-BBQ', 'pcs', 100, 10) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 8, '2026-12-31');
    END IF;

    -- Grilled Liempo
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'GRILLED LIEMPO') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_grilled_id, 'GRILLED LIEMPO', 'pcs', 150, 10) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 8, '2026-12-31');
    END IF;

    -- Bangus
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'BANGUS') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_grilled_id, 'BANGUS', 'pcs', 150, 10) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 5, '2026-12-31');
    END IF;

    -- Tilapia
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'TILAPIA') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_grilled_id, 'TILAPIA', 'pcs', 120, 10) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 7, '2026-12-31');
    END IF;

    -- PORTION STOCK
    -- Pale Pilsen
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'PALE PILSEN') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_portion_id, 'PALE PILSEN', 'pcs', 60, 24) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 83, '2026-12-31');
    END IF;

    -- Stallion Red Horse
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'STALLION RED HORSE') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_portion_id, 'STALLION RED HORSE', 'pcs', 65, 24) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 74, '2026-12-31');
    END IF;

    -- SML
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'SML') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_portion_id, 'SML', 'pcs', 60, 24) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 90, '2026-12-31');
    END IF;

    -- SMA
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'SMA') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_portion_id, 'SMA', 'pcs', 60, 24) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 35, '2026-12-31');
    END IF;

    -- Cerveza
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'CERVEZA') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_portion_id, 'CERVEZA', 'pcs', 70, 24) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 6, '2026-12-31');
    END IF;

    -- Premuim
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'PREMUIM') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_portion_id, 'PREMUIM', 'pcs', 70, 24) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 6, '2026-12-31');
    END IF;

    -- Coke in Can
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'COKE IN CAN') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_portion_id, 'COKE IN CAN', 'can', 40, 24) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 22, '2026-12-31');
    END IF;

    -- Coke Zero
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'COKE ZERO') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_portion_id, 'COKE ZERO', 'can', 40, 24) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 26, '2026-12-31');
    END IF;

    -- Sprite In Can
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'SPRITE IN CAN') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_portion_id, 'SPRITE IN CAN', 'can', 40, 24) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 18, '2026-12-31');
    END IF;

    -- Coke Mismo
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'COKE MISMO') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_portion_id, 'COKE MISMO', 'pcs', 25, 24) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 24, '2026-12-31');
    END IF;

    -- Sprite Mismo
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'SPRITE MISMO') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_portion_id, 'SPRITE MISMO', 'pcs', 25, 24) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 43, '2026-12-31');
    END IF;

    -- Royal Mismo
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'ROYAL MISMO') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_portion_id, 'ROYAL MISMO', 'pcs', 25, 24) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 43, '2026-12-31');
    END IF;

    -- Bot. Water
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'BOT. WATER') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_portion_id, 'BOT. WATER', 'pcs', 20, 24) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 60, '2026-12-31');
    END IF;

    -- PER CASES
    -- Pale Pilsen Case
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'PALE PILSEN CASE') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_case_id, 'PALE PILSEN CASE', 'case', 1200, 5) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 3, '2026-12-31');
    END IF;

    -- Stallion Red Horse Case
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'STALLION RED HORSE CASE') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_case_id, 'STALLION RED HORSE CASE', 'case', 1300, 5) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 2, '2026-12-31');
    END IF;

    -- SML Case
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'SML CASE') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_case_id, 'SML CASE', 'case', 1200, 5) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 3, '2026-12-31');
    END IF;

    -- SMA Case
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE name = 'SMA CASE') THEN
      INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
      VALUES (v_case_id, 'SMA CASE', 'case', 1200, 5) RETURNING id INTO v_item_id;
      INSERT INTO public.stock_batches (item_id, quantity, expiry_date) VALUES (v_item_id, 2, '2026-12-31');
    END IF;

END $$;
