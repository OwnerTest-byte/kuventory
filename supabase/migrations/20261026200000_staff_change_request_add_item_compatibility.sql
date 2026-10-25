-- ============================================================================
-- MIGRATION: 20261026200000_staff_change_request_add_item_compatibility.sql
-- PURPOSE:
--   Provide overloaded create_inventory_item_with_initial_stock matching the
--   call site in review_staff_change_request (p_name, p_category_id, p_unit, ...).
--   Gracefully handles nullable category_id by falling back to the default category,
--   generates non-conflicting item_code, inserts initial stock batch and stock movement
--   when initial_quantity > 0, and returns the new item UUID.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_inventory_item_with_initial_stock(
  p_name TEXT,
  p_category_id UUID,
  p_unit TEXT,
  p_initial_quantity NUMERIC,
  p_expiry_date DATE,
  p_item_code TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_unit_cost NUMERIC DEFAULT 0,
  p_min_quantity NUMERIC DEFAULT 0,
  p_supplier_a TEXT DEFAULT NULL,
  p_supplier_b TEXT DEFAULT NULL,
  p_image_path TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_item_id UUID;
  v_batch_id UUID;
  v_clean_code TEXT;
  v_trimmed_name TEXT;
  v_unit TEXT;
  v_cat_id UUID := p_category_id;
  v_init_qty NUMERIC := COALESCE(p_initial_quantity, 0);
  v_exp_date DATE := p_expiry_date;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required to create inventory items.';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: only administrators can create inventory items.';
  END IF;

  v_trimmed_name := TRIM(COALESCE(p_name, ''));
  IF v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Item name is required and cannot be blank.';
  END IF;

  IF v_cat_id IS NULL THEN
    SELECT id INTO v_cat_id FROM public.categories ORDER BY name LIMIT 1;
  END IF;

  v_unit := TRIM(COALESCE(p_unit, 'pcs'));
  IF v_unit = '' THEN v_unit := 'pcs'; END IF;

  IF p_item_code IS NOT NULL AND TRIM(p_item_code) <> '' THEN
    v_clean_code := UPPER(TRIM(p_item_code));
    IF EXISTS (
      SELECT 1 FROM public.inventory_items 
      WHERE TRIM(UPPER(item_code)) = v_clean_code AND is_archived = false
    ) THEN
      v_clean_code := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8));
    END IF;
  ELSE
    v_clean_code := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8));
  END IF;

  INSERT INTO public.inventory_items (
    category_id, item_code, name, description, unit, unit_cost, min_quantity,
    supplier_a, supplier_b, image_path, is_active, is_archived
  ) VALUES (
    v_cat_id, v_clean_code, v_trimmed_name, COALESCE(p_description, ''),
    v_unit, GREATEST(0, COALESCE(p_unit_cost, 0)), GREATEST(0, COALESCE(p_min_quantity, 0)),
    COALESCE(p_supplier_a, ''), COALESCE(p_supplier_b, ''), p_image_path, true, false
  ) RETURNING id INTO v_item_id;

  IF v_init_qty > 0 THEN
    IF v_exp_date IS NULL OR v_exp_date < CURRENT_DATE THEN
      v_exp_date := CURRENT_DATE + INTERVAL '30 days';
    END IF;

    INSERT INTO public.stock_batches (
      item_id, quantity, initial_quantity, expiry_date, received_date
    ) VALUES (
      v_item_id, v_init_qty, v_init_qty, v_exp_date, CURRENT_DATE
    ) RETURNING id INTO v_batch_id;

    INSERT INTO public.stock_movements (
      item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
    ) VALUES (
      v_item_id, v_batch_id, 'ADD', 0, v_init_qty, v_init_qty, v_caller_id, 'Initial Opening Stock Balance'
    );
  END IF;

  RETURN v_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_inventory_item_with_initial_stock(TEXT, UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
