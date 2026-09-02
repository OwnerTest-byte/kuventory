-- 1. FEFO Consumption Function (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.consume_stock(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_user_id UUID,
  p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_remaining NUMERIC := p_quantity;
  v_batch RECORD;
  v_deduct NUMERIC;
BEGIN
  IF p_quantity <= 0 THEN
    RETURN;
  END IF;

  -- Lock batches for this item to prevent concurrent modification
  FOR v_batch IN 
    SELECT * FROM public.stock_batches 
    WHERE item_id = p_item_id AND quantity > 0
    ORDER BY expiry_date ASC NULLS LAST, received_date ASC
    FOR UPDATE
  LOOP
    IF v_remaining <= 0 THEN
      EXIT;
    END IF;

    IF v_batch.quantity >= v_remaining THEN
      v_deduct := v_remaining;
    ELSE
      v_deduct := v_batch.quantity;
    END IF;

    -- Deduct from batch
    UPDATE public.stock_batches
    SET quantity = quantity - v_deduct
    WHERE id = v_batch.id;

    -- Record movement
    INSERT INTO public.stock_movements (
      item_id, batch_id, type, quantity_before, quantity_change, quantity_after, user_id, reason
    ) VALUES (
      p_item_id, v_batch.id, 'REMOVE', v_batch.quantity, -v_deduct, v_batch.quantity - v_deduct, p_user_id, p_reason
    );

    v_remaining := v_remaining - v_deduct;
  END LOOP;

  -- If we didn't have enough stock to fulfill the request, raise an exception.
  -- This ensures atomicity: if they try to consume more than exists, the whole transaction rolls back.
  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient stock for item % to consume %', p_item_id, p_quantity;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Finalize Daily Inventory
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
    SELECT dii.*, ii.name AS item_name, c.name AS category_name
    FROM public.daily_inventory_items dii
    JOIN public.inventory_items ii ON dii.item_id = ii.id
    LEFT JOIN public.categories c ON ii.category_id = c.id
    WHERE dii.daily_inventory_id = p_daily_inventory_id
  LOOP
    -- 1. Create Immutable Snapshot Item
    INSERT INTO public.report_items (
      report_id, item_name, category_name, beg, add, total, am, pm, ending
    ) VALUES (
      v_report_id, v_item.item_name, COALESCE(v_item.category_name, 'Uncategorized'), 
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


-- 3. Trigger: Automatically insert row into Profiles on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  -- Determine role: first user is ADMIN, rest are USER
  -- Since count can be slow at scale, we use a quick check
  IF NOT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) THEN
    INSERT INTO public.profiles (id, role, display_name)
    VALUES (new.id, 'ADMIN', new.email);
  ELSE
    INSERT INTO public.profiles (id, role, display_name)
    VALUES (new.id, 'USER', new.email);
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 4. Audit Log Trigger Function
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  v_old_data JSONB := NULL;
  v_new_data JSONB := NULL;
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, old_data, new_data)
    VALUES (auth.uid(), 'UPDATE', TG_TABLE_NAME, NEW.id, v_old_data, v_new_data);
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    v_old_data := to_jsonb(OLD);
    INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, old_data, new_data)
    VALUES (auth.uid(), 'DELETE', TG_TABLE_NAME, OLD.id, v_old_data, NULL);
    RETURN OLD;
  ELSIF (TG_OP = 'INSERT') THEN
    v_new_data := to_jsonb(NEW);
    INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, old_data, new_data)
    VALUES (auth.uid(), 'INSERT', TG_TABLE_NAME, NEW.id, NULL, v_new_data);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach Audit Log Trigger to critical master data tables
CREATE TRIGGER audit_inventory_items_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_items
FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger_func();

CREATE TRIGGER audit_categories_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.categories
FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger_func();

CREATE TRIGGER audit_reports_trigger
AFTER UPDATE OR DELETE ON public.reports
FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger_func();
