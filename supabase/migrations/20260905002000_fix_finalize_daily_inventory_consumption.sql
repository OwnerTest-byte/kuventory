-- 20260905002000_fix_finalize_daily_inventory_consumption.sql
-- FIX: Restore correct sales consumption calculation in finalize_daily_inventory().
-- In KUVENTORY, 'am' is morning sales and 'pm' is evening sales.
-- Total consumption for the session is (am + pm).
-- Security hardening previously erroneously calculated consumption as (total - pm),
-- which attempted to consume 100% of all stock when pm was 0, triggering 'Insufficient valid stock'.

CREATE OR REPLACE FUNCTION public.finalize_daily_inventory(
  p_daily_inventory_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_inventory_record public.daily_inventory%ROWTYPE;
  v_report_id UUID;
  v_item RECORD;
  v_consumption NUMERIC;
  v_auth_uid UUID := auth.uid();
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

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

  UPDATE public.daily_inventory 
  SET state = 'FINALIZED', finalized_by = v_auth_uid, finalized_at = NOW() 
  WHERE id = p_daily_inventory_id;

  INSERT INTO public.reports (daily_inventory_id, report_date, generated_by) 
  VALUES (p_daily_inventory_id, v_inventory_record.inventory_date, v_auth_uid) 
  RETURNING id INTO v_report_id;

  FOR v_item IN 
    SELECT dii.*, ii.name AS item_name, c.name AS category_name, ii.description, ii.unit, ii.unit_cost, ii.supplier_a, ii.supplier_b
    FROM public.daily_inventory_items dii
    JOIN public.inventory_items ii ON dii.item_id = ii.id
    LEFT JOIN public.categories c ON ii.category_id = c.id
    WHERE dii.daily_inventory_id = p_daily_inventory_id
  LOOP
    INSERT INTO public.report_items (
      report_id, item_name, category_name, description, unit, unit_cost, supplier_a, supplier_b, beg, add, total, am, pm, ending
    ) VALUES (
      v_report_id, v_item.item_name, COALESCE(v_item.category_name, 'Uncategorized'),
      v_item.description, v_item.unit, v_item.unit_cost, v_item.supplier_a, v_item.supplier_b,
      v_item.beg, v_item.add, v_item.total, v_item.am, v_item.pm, v_item.ending
    );

    -- Consumption is morning sales (am) + evening sales (pm)
    v_consumption := COALESCE(v_item.am, 0) + COALESCE(v_item.pm, 0);

    IF v_consumption > 0 THEN
      PERFORM public.consume_stock(v_item.item_id, v_consumption, 'Daily Inventory Finalization');
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

GRANT EXECUTE ON FUNCTION public.finalize_daily_inventory(UUID) TO authenticated;
