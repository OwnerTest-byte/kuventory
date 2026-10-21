-- 20261022000000_fix_stock_batches_initial_quantity.sql
-- KUVENTORY Database Fix: stock_batches.initial_quantity & Real-Time Threshold Alerts
-- 
-- 1. Adds public.stock_batches.initial_quantity NUMERIC(10,2) idempotently.
-- 2. Backfills existing rows without overwriting already-recorded positive values.
-- 3. Sets non-negative check, NOT NULL, and default 0.
-- 4. Adds BEFORE INSERT trigger so any RPC or direct insert omitting initial_quantity
--    automatically records the incoming quantity as the initial_quantity.
-- 5. Hardens real-time threshold triggers on stock_batches and inventory_items to ensure
--    instant LOW_STOCK / OUT_OF_STOCK notifications when stock is at or below min_quantity.
-- 6. Verifies column, constraints, data invariants, and triggers.

BEGIN;

-- 1. ADD INITIAL_QUANTITY COLUMN IDEMPOTENTLY
ALTER TABLE public.stock_batches 
ADD COLUMN IF NOT EXISTS initial_quantity NUMERIC(10, 2) DEFAULT 0;

-- 2. BACKFILL EXISTING ROWS
-- Preserve already recorded positive values; backfill missing/zero values from quantity
UPDATE public.stock_batches
SET initial_quantity = GREATEST(quantity, 0)
WHERE initial_quantity IS NULL OR initial_quantity = 0;

-- Ensure no residual NULLs remain
UPDATE public.stock_batches
SET initial_quantity = 0
WHERE initial_quantity IS NULL;

-- 3. ENFORCE DEFAULT, NOT NULL, AND NON-NEGATIVE CHECK
ALTER TABLE public.stock_batches 
ALTER COLUMN initial_quantity SET DEFAULT 0;

ALTER TABLE public.stock_batches 
ALTER COLUMN initial_quantity SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_stock_batches_initial_quantity_non_negative'
  ) THEN
    ALTER TABLE public.stock_batches
    ADD CONSTRAINT chk_stock_batches_initial_quantity_non_negative
    CHECK (initial_quantity >= 0);
  END IF;
END $$;

-- 4. BEFORE INSERT TRIGGER FOR AUTOMATIC INITIAL_QUANTITY CAPTURE
CREATE OR REPLACE FUNCTION public.trg_fn_stock_batches_set_initial_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If initial_quantity is omitted (NULL) or passed as 0 when quantity > 0, default to quantity
  IF NEW.initial_quantity IS NULL OR (NEW.initial_quantity = 0 AND NEW.quantity > 0) THEN
    NEW.initial_quantity := GREATEST(0, COALESCE(NEW.quantity, 0));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_batches_set_initial_quantity ON public.stock_batches;
CREATE TRIGGER trg_stock_batches_set_initial_quantity
BEFORE INSERT ON public.stock_batches
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_stock_batches_set_initial_quantity();

-- 5. REAL-TIME INVENTORY THRESHOLD NOTIFICATION TRIGGER
-- Ensures that when an item is created or updated, or when stock is added/deducted,
-- if total stock is <= min_quantity, a real-time LOW_STOCK or OUT_OF_STOCK notification is generated.
CREATE OR REPLACE FUNCTION public.trigger_check_inventory_thresholds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_id UUID;
  v_total NUMERIC;
  v_min NUMERIC;
  v_name TEXT;
  v_is_archived BOOLEAN;
  v_is_active BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'inventory_items' THEN
      RETURN NULL;
    END IF;
    v_item_id := OLD.item_id;
  ELSIF TG_TABLE_NAME = 'inventory_items' THEN
    v_item_id := NEW.id;
  ELSE
    v_item_id := NEW.item_id;
  END IF;

  IF v_item_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT min_quantity, name, is_archived, is_active 
  INTO v_min, v_name, v_is_archived, v_is_active
  FROM public.inventory_items
  WHERE id = v_item_id;

  -- If item was deleted, does not exist, or is archived/inactive, exit cleanly
  IF NOT FOUND OR v_name IS NULL OR v_is_archived = TRUE OR v_is_active = FALSE THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_total
  FROM public.stock_batches
  WHERE item_id = v_item_id;

  v_min := GREATEST(0, COALESCE(v_min, 0));

  IF v_total = 0 THEN
    -- Out of Stock alert
    INSERT INTO public.notifications (type, title, message, item_id, dedup_key, is_read, created_at)
    VALUES (
      'OUT_OF_STOCK', 
      'Out of Stock: ' || v_name, 
      v_name || ' has completely run out of stock.', 
      v_item_id, 
      'OOS_' || v_item_id,
      false,
      NOW()
    )
    ON CONFLICT (dedup_key) DO UPDATE
    SET is_read = false, created_at = NOW();
  ELSIF v_total <= v_min THEN
    -- Low Stock warning
    INSERT INTO public.notifications (type, title, message, item_id, dedup_key, is_read, created_at)
    VALUES (
      'LOW_STOCK', 
      'Low Stock: ' || v_name, 
      v_name || ' is below the minimum threshold of ' || v_min || ' (Current: ' || v_total || ').', 
      v_item_id, 
      'LOW_' || v_item_id,
      false,
      NOW()
    )
    ON CONFLICT (dedup_key) DO UPDATE
    SET is_read = false, created_at = NOW();
  ELSE
    -- Stock is above minimum threshold, clear pending threshold alerts
    UPDATE public.notifications
    SET is_read = true, read_at = NOW()
    WHERE dedup_key IN ('OOS_' || v_item_id, 'LOW_' || v_item_id);
  END IF;

  RETURN NULL;
END;
$$;

-- Bind trigger to stock_batches (fires on all stock changes)
DROP TRIGGER IF EXISTS on_batch_change_check_thresholds ON public.stock_batches;
CREATE TRIGGER on_batch_change_check_thresholds
AFTER INSERT OR UPDATE OF quantity OR DELETE ON public.stock_batches
FOR EACH ROW EXECUTE FUNCTION public.trigger_check_inventory_thresholds();

-- Bind trigger to inventory_items (fires on insert of new items or update of threshold/status)
DROP TRIGGER IF EXISTS on_item_change_check_thresholds ON public.inventory_items;
CREATE TRIGGER on_item_change_check_thresholds
AFTER INSERT OR UPDATE OF min_quantity, is_active, is_archived ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.trigger_check_inventory_thresholds();

-- 6. ENSURE NOTIFICATIONS ARE IN REALTIME PUBLICATION
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_batches;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 7. VERIFICATION ASSERTIONS
DO $$
DECLARE
  v_col_exists BOOLEAN;
  v_is_nullable TEXT;
  v_invalid_count INTEGER;
  v_trigger_exists BOOLEAN;
BEGIN
  -- Verify column exists and is NOT NULL
  SELECT true, is_nullable INTO v_col_exists, v_is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' 
    AND table_name = 'stock_batches' 
    AND column_name = 'initial_quantity';

  IF NOT COALESCE(v_col_exists, false) THEN
    RAISE EXCEPTION 'Verification failed: initial_quantity column does not exist on stock_batches.';
  END IF;

  IF v_is_nullable <> 'NO' THEN
    RAISE EXCEPTION 'Verification failed: initial_quantity column must be NOT NULL, found %', v_is_nullable;
  END IF;

  -- Verify data invariant: no negative or NULL initial_quantity values
  SELECT COUNT(*) INTO v_invalid_count
  FROM public.stock_batches
  WHERE initial_quantity IS NULL OR initial_quantity < 0;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Verification failed: found % rows with invalid initial_quantity.', v_invalid_count;
  END IF;

  -- Verify BEFORE INSERT trigger exists
  SELECT true INTO v_trigger_exists
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND event_object_table = 'stock_batches'
    AND trigger_name = 'trg_stock_batches_set_initial_quantity';

  IF NOT COALESCE(v_trigger_exists, false) THEN
    RAISE EXCEPTION 'Verification failed: trg_stock_batches_set_initial_quantity trigger does not exist.';
  END IF;

  RAISE NOTICE 'SUCCESS: stock_batches.initial_quantity verified, backfilled, and guarded by trigger.';
END $$;

COMMIT;
