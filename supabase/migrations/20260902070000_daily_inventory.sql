-- 1. Create Daily Inventory Draft
CREATE OR REPLACE FUNCTION public.create_daily_inventory_draft(
  p_target_date DATE,
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_daily_id UUID;
BEGIN
  -- Check if record already exists for this date
  SELECT id INTO v_daily_id FROM public.daily_inventory 
  WHERE inventory_date = p_target_date;

  -- If not, create a new draft
  IF NOT FOUND THEN
    INSERT INTO public.daily_inventory (inventory_date, state, created_by)
    VALUES (p_target_date, 'DRAFT', p_user_id)
    RETURNING id INTO v_daily_id;
  END IF;

  -- Populate daily_inventory_items for all active items
  -- using the current physical stock as the BEGINNING stock (beg)
  INSERT INTO public.daily_inventory_items (daily_inventory_id, item_id, beg)
  SELECT 
    v_daily_id, 
    i.id,
    COALESCE(s.total_quantity, 0)
  FROM public.inventory_items i
  LEFT JOIN (
    SELECT item_id, COALESCE(SUM(quantity), 0) as total_quantity
    FROM public.stock_batches
    GROUP BY item_id
  ) s ON i.id = s.item_id
  WHERE i.is_active = true
  ON CONFLICT (daily_inventory_id, item_id) DO NOTHING;

  RETURN v_daily_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Ensure finalize_daily_inventory handles am + pm properly.
-- We've verified it already exists in 20260902050400_fefo_and_functions.sql
-- However, we must ensure it doesn't double-consume if run twice. It's protected by the state check.

-- 3. RLS for daily_inventory
ALTER TABLE public.daily_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all daily inventory"
  ON public.daily_inventory FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can view all daily inventory items"
  ON public.daily_inventory_items FOR SELECT
  TO authenticated
  USING (true);

-- Users can only modify daily inventory if it's in DRAFT state
-- But we can't easily check state in an UPDATE policy if they change the state.
-- So we use a function or rely on the application to only update DRAFTs, but RLS adds safety.
CREATE POLICY "Users can update daily inventory items in DRAFT"
  ON public.daily_inventory_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.daily_inventory
      WHERE id = daily_inventory_items.daily_inventory_id
      AND state = 'DRAFT'
    )
  );

-- Only Admin can force update a finalized one (if needed), but we leave that to future phases.
