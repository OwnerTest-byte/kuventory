-- ==============================================================================
-- KUVENTORY Phase 12 Security Hardening
-- Remediates:
-- 1. Identity Spoofing in SECURITY DEFINER RPCs (by asserting/using auth.uid())
-- 2. Search Path Injection (by adding SET search_path = '')
-- 3. RLS Bypass on daily_inventory state
-- 4. Unsafe Notification Updates
-- ==============================================================================

---------------------------------------------------------------------------------
-- 1. SECURE RPCs & ADD SEARCH PATH
---------------------------------------------------------------------------------

-- A. is_admin()
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN AS $$
BEGIN
  RETURN (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- B. audit_trigger_func()
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- C. trigger_check_inventory_thresholds()
CREATE OR REPLACE FUNCTION public.trigger_check_inventory_thresholds()
RETURNS TRIGGER AS $$
DECLARE
  v_item_id UUID;
  v_total NUMERIC;
  v_min NUMERIC;
  v_name TEXT;
BEGIN
  -- Determine the item_id based on the table and operation
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'inventory_items' THEN
      RETURN NULL; -- Deleting an item cascades to everything anyway, skip threshold
    END IF;
    v_item_id := OLD.item_id;
  ELSIF TG_TABLE_NAME = 'inventory_items' THEN
    v_item_id := NEW.id;
  ELSE
    v_item_id := NEW.item_id;
  END IF;

  -- Get total stock across all batches
  SELECT COALESCE(SUM(quantity), 0) INTO v_total
  FROM public.stock_batches
  WHERE item_id = v_item_id;

  -- Get min_quantity and name from item
  SELECT min_quantity, name INTO v_min, v_name
  FROM public.inventory_items
  WHERE id = v_item_id;

  IF v_total = 0 THEN
    -- Out of Stock
    INSERT INTO public.notifications (type, title, message, item_id, dedup_key)
    VALUES ('OOS', 'Out of Stock: ' || v_name, v_name || ' has completely run out of stock.', v_item_id, 'OOS_' || v_item_id)
    ON CONFLICT (dedup_key) DO NOTHING;
  ELSIF v_total <= v_min THEN
    -- Low Stock
    INSERT INTO public.notifications (type, title, message, item_id, dedup_key)
    VALUES ('LOW_STOCK', 'Low Stock: ' || v_name, v_name || ' is below the minimum threshold of ' || v_min || ' (Current: ' || v_total || ').', v_item_id, 'LOW_' || v_item_id)
    ON CONFLICT (dedup_key) DO NOTHING;
  ELSE
    -- Stock is fine, clear pending notifications of this type
    UPDATE public.notifications
    SET is_read = true, read_at = NOW()
    WHERE dedup_key IN ('OOS_' || v_item_id, 'LOW_' || v_item_id);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- D. consume_stock()
-- Note: We REMOVED p_user_id and use auth.uid() directly
DROP FUNCTION IF EXISTS public.consume_stock(UUID, NUMERIC, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.consume_stock(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_remaining NUMERIC := p_quantity;
  v_batch RECORD;
  v_deduct NUMERIC;
  v_auth_uid UUID := auth.uid();
BEGIN
  IF p_quantity <= 0 THEN
    RETURN;
  END IF;

  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
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
      p_item_id, v_batch.id, 'REMOVE', v_batch.quantity, -v_deduct, v_batch.quantity - v_deduct, v_auth_uid, p_reason
    );

    v_remaining := v_remaining - v_deduct;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient valid stock for item % to consume %', p_item_id, p_quantity;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- E. finalize_daily_inventory()
-- Removed p_user_id from signature to prevent impersonation
DROP FUNCTION IF EXISTS public.finalize_daily_inventory(UUID, UUID);
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

  SELECT * INTO v_inventory_record FROM public.daily_inventory WHERE id = p_daily_inventory_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Daily inventory not found'; END IF;
  IF v_inventory_record.state != 'DRAFT' THEN RAISE EXCEPTION 'Daily inventory is not in DRAFT state'; END IF;

  UPDATE public.daily_inventory SET state = 'FINALIZED', finalized_by = v_auth_uid, finalized_at = NOW() WHERE id = p_daily_inventory_id;

  INSERT INTO public.reports (daily_inventory_id, report_date, generated_by) VALUES (p_daily_inventory_id, v_inventory_record.inventory_date, v_auth_uid) RETURNING id INTO v_report_id;

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

    IF v_item.pm IS NOT NULL THEN
      v_consumption := v_item.total - v_item.pm;
    ELSE
      v_consumption := v_item.total - v_item.ending;
    END IF;

    IF v_consumption > 0 THEN
      PERFORM public.consume_stock(v_item.item_id, v_consumption, 'Daily Inventory Finalization');
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- F. create_daily_inventory_draft()
-- Removed p_user_id
DROP FUNCTION IF EXISTS public.create_daily_inventory_draft(DATE, UUID);
CREATE OR REPLACE FUNCTION public.create_daily_inventory_draft(
  p_target_date DATE
) RETURNS UUID AS $$
DECLARE
  v_daily_id UUID;
  v_auth_uid UUID := auth.uid();
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_daily_id FROM public.daily_inventory 
  WHERE inventory_date = p_target_date;

  IF NOT FOUND THEN
    INSERT INTO public.daily_inventory (inventory_date, state, created_by)
    VALUES (p_target_date, 'DRAFT', v_auth_uid)
    RETURNING id INTO v_daily_id;
  END IF;

  INSERT INTO public.daily_inventory_items (daily_inventory_id, item_id, beg)
  SELECT v_daily_id, i.id, COALESCE(s.total_quantity, 0)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- G. handle_new_user()
-- (Trigger function doesn't rely on auth.uid() directly for session, but best practice dictates search_path)
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) THEN
    INSERT INTO public.profiles (id, role, display_name) VALUES (new.id, 'ADMIN', new.email);
  ELSE
    INSERT INTO public.profiles (id, role, display_name) VALUES (new.id, 'USER', new.email);
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


---------------------------------------------------------------------------------
-- 2. TIGHTEN RLS ON daily_inventory
---------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can update daily_inventory" ON public.daily_inventory;
CREATE POLICY "Users can update daily_inventory if DRAFT" 
  ON public.daily_inventory FOR UPDATE
  TO authenticated
  USING (state = 'DRAFT')
  WITH CHECK (state = 'DRAFT');
  
-- Admins can update finalized if they absolutely need to
CREATE POLICY "Admins can update daily_inventory"
  ON public.daily_inventory FOR UPDATE
  TO authenticated
  USING (public.is_admin());

---------------------------------------------------------------------------------
-- 3. SECURE NOTIFICATIONS
---------------------------------------------------------------------------------
-- Prevent arbitrary UPDATE on notifications to prevent modifying text
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

-- Create RPC to mark as read securely
CREATE OR REPLACE FUNCTION public.mark_notification_as_read(p_notification_id UUID)
RETURNS VOID AS $$
DECLARE
  v_auth_uid UUID := auth.uid();
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- We allow users to mark global notifications (user_id IS NULL) or their own
  UPDATE public.notifications
  SET is_read = true, read_at = NOW()
  WHERE id = p_notification_id
  AND (user_id = v_auth_uid OR user_id IS NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.mark_all_notifications_as_read()
RETURNS VOID AS $$
DECLARE
  v_auth_uid UUID := auth.uid();
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  UPDATE public.notifications
  SET is_read = true, read_at = NOW()
  WHERE (user_id = v_auth_uid OR user_id IS NULL)
  AND is_read = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
