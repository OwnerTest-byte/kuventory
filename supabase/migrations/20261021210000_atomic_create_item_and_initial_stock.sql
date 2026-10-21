-- 20261021210000_atomic_create_item_and_initial_stock.sql
-- KUVENTORY Inventory Integrity & Atomic Creation Migration
-- Workstream A: Mandatory positive opening stock, verified expiry, atomic RPC, item_code persistence

-- 1. PERSIST ITEM_CODE COLUMN ON INVENTORY_ITEMS
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS item_code TEXT;

-- Backfill existing inventory items with deterministic 8-character uppercase code from id
UPDATE public.inventory_items
SET item_code = UPPER(SUBSTRING(id::text, 1, 8))
WHERE item_code IS NULL OR TRIM(item_code) = '';

-- Create unique index on normalized item_code
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_item_code_unique
ON public.inventory_items (TRIM(UPPER(item_code)))
WHERE item_code IS NOT NULL AND is_archived = false;

-- 2. UPDATE INVENTORY_STOCK_VIEW TO EXPOSE ITEM_CODE (WITH SECURITY_INVOKER)
CREATE OR REPLACE VIEW public.inventory_stock_view 
WITH (security_invoker = true) AS
 SELECT 
    i.id,
    i.category_id,
    COALESCE(c.name, 'Uncategorized') AS category_name,
    i.name,
    COALESCE(i.description, '') AS description,
    COALESCE(i.supplier_a, '') AS supplier_a,
    COALESCE(i.supplier_b, '') AS supplier_b,
    COALESCE(i.unit, 'pcs') AS unit,
    i.unit_cost,
    i.min_quantity,
    COALESCE(i.is_active, true) AS is_active,
    COALESCE(i.is_archived, false) AS is_archived,
    COALESCE(sum(b.quantity), (0)::numeric) AS total_quantity,
    COALESCE(i.image_path, '') AS image_path,
    COALESCE(i.item_code, UPPER(SUBSTRING(i.id::text, 1, 8))) AS item_code
   FROM public.inventory_items i
     LEFT JOIN public.categories c ON i.category_id = c.id
     LEFT JOIN public.stock_batches b ON i.id = b.item_id
  GROUP BY i.id, c.name;

-- Strictly restrict view access to authenticated users only; revoke anon
REVOKE ALL ON public.inventory_stock_view FROM anon, public;
GRANT SELECT ON public.inventory_stock_view TO authenticated;

-- 3. ATOMIC CREATE ITEM WITH INITIAL STOCK RPC
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
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_uid UUID := auth.uid();
  v_item_id UUID;
  v_batch_id UUID;
  v_movement_id UUID;
  v_clean_code TEXT;
  v_trimmed_name TEXT;
  v_unit TEXT;
  v_result JSONB;
BEGIN
  -- 1. Authentication and authorization check
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create inventory items.';
  END IF;

  IF NOT (
    public.is_admin() OR 
    public.is_super_admin() OR 
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = v_auth_uid 
      AND UPPER(COALESCE(role, '')) IN ('STAFF', 'ADMIN', 'SUPER_ADMIN', 'MASTER_ADMIN')
    )
  ) THEN
    RAISE EXCEPTION 'Permission denied: Caller lacks inventory authoring privileges.';
  END IF;

  -- 2. Input validation
  v_trimmed_name := TRIM(COALESCE(p_name, ''));
  IF v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Item name is required and cannot be blank.';
  END IF;

  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'Category is required.';
  END IF;

  PERFORM 1 FROM public.categories WHERE id = p_category_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Category % does not exist.', p_category_id;
  END IF;

  v_unit := TRIM(COALESCE(p_unit, 'pcs'));
  IF v_unit = '' THEN
    v_unit := 'pcs';
  END IF;

  -- 3. Strict positive opening stock quantity validation
  IF p_initial_quantity IS NULL OR p_initial_quantity <= 0 THEN
    RAISE EXCEPTION 'Initial stock quantity must be a finite number greater than zero.';
  END IF;

  -- 4. Strict mandatory expiry date validation
  IF p_expiry_date IS NULL THEN
    RAISE EXCEPTION 'Expiration date is mandatory for new stocked items.';
  END IF;

  IF p_expiry_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Expiration date (%) cannot be in the past.', p_expiry_date;
  END IF;

  -- 5. Item code normalization and uniqueness
  IF p_item_code IS NOT NULL AND TRIM(p_item_code) <> '' THEN
    v_clean_code := UPPER(TRIM(p_item_code));
    IF EXISTS (
      SELECT 1 FROM public.inventory_items 
      WHERE TRIM(UPPER(item_code)) = v_clean_code AND is_archived = false
    ) THEN
      RAISE EXCEPTION 'Item code "%" is already in use by another item.', v_clean_code;
    END IF;
  ELSE
    -- Auto-generate clean 8-character unique alphanumeric code
    v_clean_code := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8));
  END IF;

  -- 6. Insert master item into inventory_items
  INSERT INTO public.inventory_items (
    category_id,
    item_code,
    name,
    description,
    unit,
    unit_cost,
    min_quantity,
    supplier_a,
    supplier_b,
    image_path,
    is_active,
    is_archived
  ) VALUES (
    p_category_id,
    v_clean_code,
    v_trimmed_name,
    COALESCE(p_description, ''),
    v_unit,
    GREATEST(0, COALESCE(p_unit_cost, 0)),
    GREATEST(0, COALESCE(p_min_quantity, 0)),
    COALESCE(p_supplier_a, ''),
    COALESCE(p_supplier_b, ''),
    p_image_path,
    true,
    false
  ) RETURNING id INTO v_item_id;

  -- 7. Insert opening stock batch
  INSERT INTO public.stock_batches (
    item_id,
    quantity,
    expiry_date,
    received_date
  ) VALUES (
    v_item_id,
    p_initial_quantity,
    p_expiry_date,
    CURRENT_DATE
  ) RETURNING id INTO v_batch_id;

  -- 8. Insert stock movement ledger event
  INSERT INTO public.stock_movements (
    item_id,
    batch_id,
    type,
    quantity_before,
    quantity_change,
    quantity_after,
    user_id,
    reason
  ) VALUES (
    v_item_id,
    v_batch_id,
    'ADD',
    0,
    p_initial_quantity,
    p_initial_quantity,
    v_auth_uid,
    'Initial Opening Stock Balance'
  ) RETURNING id INTO v_movement_id;

  -- 9. Construct and return verified result
  v_result := jsonb_build_object(
    'id', v_item_id,
    'item_code', v_clean_code,
    'item_name', v_trimmed_name,
    'category_id', p_category_id,
    'unit', v_unit,
    'unit_cost', GREATEST(0, COALESCE(p_unit_cost, 0)),
    'min_qty', GREATEST(0, COALESCE(p_min_quantity, 0)),
    'current_qty', p_initial_quantity,
    'batch_id', v_batch_id,
    'expiry_date', p_expiry_date,
    'movement_id', v_movement_id
  );

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_inventory_item_with_initial_stock FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_inventory_item_with_initial_stock TO authenticated;

-- 4. HARDEN ADD_STOCK RPC: REJECT MISSING EXPIRY AND NON-POSITIVE QUANTITIES
CREATE OR REPLACE FUNCTION public.add_stock(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_expiry_date DATE,
  p_received_date DATE,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch_id UUID;
  v_auth_uid UUID := auth.uid();
  v_item RECORD;
  v_current_total NUMERIC;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.';
  END IF;

  IF p_expiry_date IS NULL THEN
    RAISE EXCEPTION 'Expiration date is mandatory for adding stock.';
  END IF;

  IF p_expiry_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Expiration date cannot be in the past.';
  END IF;

  -- Lock item row to serialize updates
  SELECT id INTO v_item 
  FROM public.inventory_items 
  WHERE id = p_item_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % does not exist.', p_item_id;
  END IF;

  -- Calculate current total stock before this addition
  SELECT COALESCE(SUM(quantity), 0) INTO v_current_total
  FROM public.stock_batches
  WHERE item_id = p_item_id;

  INSERT INTO public.stock_batches (
    item_id, quantity, expiry_date, received_date
  ) VALUES (
    p_item_id, p_quantity, p_expiry_date, COALESCE(p_received_date, CURRENT_DATE)
  ) RETURNING id INTO v_batch_id;

  INSERT INTO public.stock_movements (
    item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
  ) VALUES (
    p_item_id, v_batch_id, 'ADD', v_current_total, p_quantity, v_current_total + p_quantity, v_auth_uid, COALESCE(p_reason, 'Stock Received')
  );

  UPDATE public.inventory_items
  SET updated_at = NOW()
  WHERE id = p_item_id;

END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_stock FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_stock TO authenticated;

-- 5. HARDEN ADJUST_STOCK_TO_TARGET: DROP OBSOLETE OVERLOAD AND ENFORCE EXPIRY
-- Safely drop legacy 4-argument overload to eliminate ambiguity and bypass risk
DROP FUNCTION IF EXISTS public.adjust_stock_to_target(UUID, NUMERIC, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.adjust_stock_to_target(
  p_item_id UUID,
  p_target_quantity NUMERIC,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL,
  p_expiry_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_total NUMERIC;
  v_diff NUMERIC;
  v_effective_user UUID := auth.uid();
  v_safe_target NUMERIC;
  v_batch_id UUID;
  v_target_expiry DATE;
BEGIN
  IF v_effective_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT (public.is_admin() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Administrative privileges required to adjust stock counts.';
  END IF;

  IF p_target_quantity IS NULL OR p_target_quantity < 0 THEN
    RAISE EXCEPTION 'Target quantity must be a non-negative number.';
  END IF;

  v_safe_target := p_target_quantity;

  PERFORM 1 FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % does not exist.', p_item_id;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_current_total
  FROM public.stock_batches
  WHERE item_id = p_item_id;

  v_diff := v_safe_target - v_current_total;

  IF v_diff = 0 THEN
    RETURN 0;
  END IF;

  IF v_diff > 0 THEN
    -- For upward physical adjustment, require or derive verified expiry
    IF p_expiry_date IS NOT NULL THEN
      IF p_expiry_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'Adjustment expiry date cannot be in the past.';
      END IF;
      v_target_expiry := p_expiry_date;
    ELSE
      -- Check if there is an active unexpired batch to align with
      SELECT expiry_date INTO v_target_expiry
      FROM public.stock_batches
      WHERE item_id = p_item_id AND expiry_date >= CURRENT_DATE AND quantity > 0
      ORDER BY expiry_date ASC
      LIMIT 1;

      IF v_target_expiry IS NULL THEN
        RAISE EXCEPTION 'Physical stock increase requires an explicit, verified expiration date.';
      END IF;
    END IF;

    INSERT INTO public.stock_batches (
      item_id, quantity, initial_quantity, expiry_date, received_date
    ) VALUES (
      p_item_id, v_diff, v_diff, v_target_expiry, CURRENT_DATE
    ) RETURNING id INTO v_batch_id;

    INSERT INTO public.stock_movements (
      item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
    ) VALUES (
      p_item_id, v_batch_id, 'ADJUST', v_current_total, v_diff, v_safe_target, v_effective_user, COALESCE(p_reason, 'Physical Count Adjustment (Up)')
    );
  ELSE
    PERFORM public.consume_stock(
      p_item_id, ABS(v_diff), v_effective_user, COALESCE(p_reason, 'Physical Count Adjustment (Down)')
    );

    INSERT INTO public.stock_movements (
      item_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
    ) VALUES (
      p_item_id, 'ADJUST', v_current_total, v_diff, v_safe_target, v_effective_user, COALESCE(p_reason, 'Physical Count Adjustment (Down)')
    );
  END IF;

  RETURN v_diff;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adjust_stock_to_target FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_stock_to_target TO authenticated;

-- 6. READ-ONLY DATA INTEGRITY AUDIT RPC FOR SUPER ADMIN
CREATE OR REPLACE FUNCTION public.audit_inventory_data_quality()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_uid UUID := auth.uid();
  v_null_fake_expiry_count INT;
  v_zero_stock_items_count INT;
  v_depleted_batches_count INT;
  v_below_min_count INT;
  v_expired_positive_count INT;
  v_duplicate_codes_count INT;
  v_audit_summary JSONB;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT (public.is_admin() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Administrative privileges required to audit data quality.';
  END IF;

  -- Count active batches with null or 2099 fake expiry
  SELECT COUNT(*) INTO v_null_fake_expiry_count
  FROM public.stock_batches
  WHERE quantity > 0 AND (expiry_date IS NULL OR expiry_date >= '2099-01-01');

  -- Count expired batches with positive quantity
  SELECT COUNT(*) INTO v_expired_positive_count
  FROM public.stock_batches
  WHERE quantity > 0 AND expiry_date < CURRENT_DATE AND expiry_date < '2099-01-01';

  -- Count depleted batches (quantity = 0)
  SELECT COUNT(*) INTO v_depleted_batches_count
  FROM public.stock_batches
  WHERE quantity = 0;

  -- Count items out of stock (current_qty = 0)
  SELECT COUNT(*) INTO v_zero_stock_items_count
  FROM public.inventory_stock_view
  WHERE total_quantity <= 0;

  -- Count items below minimum stock threshold
  SELECT COUNT(*) INTO v_below_min_count
  FROM public.inventory_stock_view
  WHERE total_quantity > 0 AND total_quantity <= min_quantity;

  -- Count duplicate item codes (if any)
  SELECT COUNT(*) INTO v_duplicate_codes_count
  FROM (
    SELECT TRIM(UPPER(item_code))
    FROM public.inventory_items
    WHERE item_code IS NOT NULL AND is_archived = false
    GROUP BY TRIM(UPPER(item_code))
    HAVING COUNT(*) > 1
  ) dups;

  v_audit_summary := jsonb_build_object(
    'null_or_fake_expiry_batches', v_null_fake_expiry_count,
    'expired_positive_batches', v_expired_positive_count,
    'depleted_batches', v_depleted_batches_count,
    'zero_stock_items', v_zero_stock_items_count,
    'below_min_items', v_below_min_count,
    'duplicate_item_codes', v_duplicate_codes_count,
    'audited_at', NOW()
  );

  RETURN v_audit_summary;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_inventory_data_quality FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_inventory_data_quality TO authenticated;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
