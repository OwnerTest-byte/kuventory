-- 1. Alter public.report_items to add missing snapshot fields
ALTER TABLE public.report_items
ADD COLUMN description TEXT,
ADD COLUMN unit TEXT,
ADD COLUMN unit_cost NUMERIC(10, 2),
ADD COLUMN supplier_a TEXT,
ADD COLUMN supplier_b TEXT;

-- 2. Add UNIQUE constraint to reports to prevent duplicate finalizations mathematically
ALTER TABLE public.reports
ADD CONSTRAINT unique_report_daily_inventory_version UNIQUE (daily_inventory_id, version);

-- 3. Update finalize_daily_inventory to populate new snapshot fields
CREATE OR REPLACE FUNCTION public.finalize_daily_inventory(
  p_daily_inventory_id UUID,
  p_user_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_inventory_record public.daily_inventory%ROWTYPE;
  v_report_id UUID;
  v_item RECORD;
  v_consumption NUMERIC;
BEGIN
  -- Validate state
  SELECT * INTO v_inventory_record 
  FROM public.daily_inventory 
  WHERE id = p_daily_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily inventory not found';
  END IF;

  IF v_inventory_record.state != 'DRAFT' THEN
    RAISE EXCEPTION 'Daily inventory is not in DRAFT state';
  END IF;

  -- Update state
  UPDATE public.daily_inventory 
  SET state = 'FINALIZED', finalized_by = p_user_id, finalized_at = NOW()
  WHERE id = p_daily_inventory_id;

  -- Create Report Header
  INSERT INTO public.reports (daily_inventory_id, report_date, generated_by)
  VALUES (p_daily_inventory_id, v_inventory_record.inventory_date, p_user_id)
  RETURNING id INTO v_report_id;

  -- Process Items: Create Snapshot & Consume Stock
  FOR v_item IN 
    SELECT dii.*, ii.name AS item_name, c.name AS category_name,
           ii.description, ii.unit, ii.unit_cost, ii.supplier_a, ii.supplier_b
    FROM public.daily_inventory_items dii
    JOIN public.inventory_items ii ON dii.item_id = ii.id
    LEFT JOIN public.categories c ON ii.category_id = c.id
    WHERE dii.daily_inventory_id = p_daily_inventory_id
  LOOP
    -- 1. Create Immutable Snapshot Item
    INSERT INTO public.report_items (
      report_id, item_name, category_name, 
      description, unit, unit_cost, supplier_a, supplier_b,
      beg, add, total, am, pm, ending
    ) VALUES (
      v_report_id, v_item.item_name, COALESCE(v_item.category_name, 'Uncategorized'), 
      v_item.description, v_item.unit, v_item.unit_cost, v_item.supplier_a, v_item.supplier_b,
      v_item.beg, v_item.add, v_item.total, v_item.am, v_item.pm, v_item.ending
    );

    -- 2. FEFO Consumption (am + pm)
    v_consumption := v_item.am + v_item.pm;
    IF v_consumption > 0 THEN
      PERFORM public.consume_stock(v_item.item_id, v_consumption, p_user_id, 'Daily Inventory Finalization');
    END IF;
  END LOOP;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
