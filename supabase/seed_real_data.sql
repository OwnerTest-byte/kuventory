-- seed_real_data.sql

DO $$
DECLARE
    v_grilled_id UUID;
    v_portion_id UUID;
    v_case_id UUID;
    v_item_id UUID;
BEGIN
    -- 1. Clear out old mock data
    DELETE FROM public.stock_movements;
    DELETE FROM public.stock_batches;
    DELETE FROM public.daily_inventory_items;
    DELETE FROM public.report_items;
    DELETE FROM public.reports;
    DELETE FROM public.daily_inventory;
    DELETE FROM public.inventory_items;
    DELETE FROM public.categories;
    
    -- 2. Insert Categories
    INSERT INTO public.categories (name) VALUES ('GRILLED STOCK') RETURNING id INTO v_grilled_id;
    INSERT INTO public.categories (name) VALUES ('PORTION STOCK') RETURNING id INTO v_portion_id;
    INSERT INTO public.categories (name) VALUES ('PER CASES') RETURNING id INTO v_case_id;

    -- 3. Insert Items and their initial stock (BEG balances from user's sheets)

    -- GRILLED STOCK (7/25/26)
    -- Betamax: 50
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_grilled_id, 'BETAMAX', 'pcs', 10, 20) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 50, '2026-12-31');
    
    -- Adidas: 13
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_grilled_id, 'ADIDAS', 'pcs', 15, 20) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 13, '2026-12-31');
    
    -- Chicken Neck: 15
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_grilled_id, 'CHICKEN NECK', 'pcs', 15, 20) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 15, '2026-12-31');

    -- Pork BBQ: 61
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_grilled_id, 'PORK BBQ', 'pcs', 20, 20) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 61, '2026-12-31');

    -- Hotdog: 0
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_grilled_id, 'HOTDOG', 'pcs', 15, 20);

    -- Pork Tenga: 0
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_grilled_id, 'PORK TENGA', 'pcs', 15, 20);

    -- Isaw: 34
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_grilled_id, 'ISAW', 'pcs', 15, 20) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 34, '2026-12-31');

    -- Chicken-Inasal: 6
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_grilled_id, 'CHICKEN-INASAL', 'pcs', 120, 10) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 6, '2026-12-31');

    -- Chicken-BBQ: 0
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_grilled_id, 'CHICKEN-BBQ', 'pcs', 100, 10);

    -- Grilled Liempo: 8
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_grilled_id, 'GRILLED LIEMPO', 'pcs', 150, 10) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 8, '2026-12-31');

    -- Bangus: 5
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_grilled_id, 'BANGUS', 'pcs', 150, 10) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 5, '2026-12-31');

    -- Tilapia: 7
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_grilled_id, 'TILAPIA', 'pcs', 120, 10) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 7, '2026-12-31');


    -- PORTION STOCK
    
    -- Pale Pilsen: 83
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_portion_id, 'PALE PILSEN', 'pcs', 60, 24) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 83, '2026-12-31');

    -- Stallion Red Horse: 74
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_portion_id, 'STALLION RED HORSE', 'pcs', 65, 24) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 74, '2026-12-31');

    -- SML: 90
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_portion_id, 'SML', 'pcs', 60, 24) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 90, '2026-12-31');

    -- SMA: 35
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_portion_id, 'SMA', 'pcs', 60, 24) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 35, '2026-12-31');
    
    -- Cerveza: 6
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_portion_id, 'CERVEZA', 'pcs', 70, 24) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 6, '2026-12-31');

    -- Premium: 6
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_portion_id, 'PREMUIM', 'pcs', 70, 24) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 6, '2026-12-31');

    -- Coke in Can: 22
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_portion_id, 'COKE IN CAN', 'can', 40, 24) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 22, '2026-12-31');

    -- Coke Zero: 26
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_portion_id, 'COKE ZERO', 'can', 40, 24) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 26, '2026-12-31');

    -- Sprite In Can: 18
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_portion_id, 'SPRITE IN CAN', 'can', 40, 24) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 18, '2026-12-31');

    -- Coke Mismo: 24
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_portion_id, 'COKE MISMO', 'pcs', 25, 24) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 24, '2026-12-31');

    -- Sprite Mismo: 43
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_portion_id, 'SPRITE MISMO', 'pcs', 25, 24) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 43, '2026-12-31');

    -- Royal Mismo: 43
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_portion_id, 'ROYAL MISMO', 'pcs', 25, 24) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 43, '2026-12-31');

    -- Bot. Water: 60
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_portion_id, 'BOT. WATER', 'pcs', 20, 24) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 60, '2026-12-31');

    -- PER CASES
    
    -- Pale Pilsen Case: 3
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_case_id, 'PALE PILSEN CASE', 'case', 1200, 5) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 3, '2026-12-31');

    -- Stallion Red Horse Case: 2
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_case_id, 'STALLION RED HORSE CASE', 'case', 1300, 5) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 2, '2026-12-31');

    -- SML Case: 3
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_case_id, 'SML CASE', 'case', 1200, 5) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 3, '2026-12-31');
    
    -- SMA Case: 2
    INSERT INTO public.inventory_items (category_id, name, unit, unit_cost, min_quantity) 
    VALUES (v_case_id, 'SMA CASE', 'case', 1200, 5) RETURNING id INTO v_item_id;
    INSERT INTO public.stock_batches (item_id, quantity, expiry_date) 
    VALUES (v_item_id, 2, '2026-12-31');

END $$;
