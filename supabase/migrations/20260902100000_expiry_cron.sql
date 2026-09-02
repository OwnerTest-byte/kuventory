-- 1. Enable pg_cron (ensure it exists)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Create the expiry checking function
CREATE OR REPLACE FUNCTION public.check_expiry_notifications()
RETURNS VOID AS $$
DECLARE
  v_batch RECORD;
BEGIN
  -- 1. EXPIRED
  FOR v_batch IN
    SELECT sb.id, sb.item_id, i.name
    FROM public.stock_batches sb
    JOIN public.inventory_items i ON sb.item_id = i.id
    WHERE sb.quantity > 0
      AND sb.expiry_date < CURRENT_DATE
  LOOP
    INSERT INTO public.notifications (type, title, message, item_id, batch_id, dedup_key)
    VALUES (
      'EXPIRED',
      'Expired Batch: ' || v_batch.name,
      v_batch.name || ' has an expired batch and is no longer valid for allocation.',
      v_batch.item_id,
      v_batch.id,
      'EXPIRED_' || v_batch.id
    ) ON CONFLICT (dedup_key) DO NOTHING;
    
    -- Clear EXPIRING_SOON dedup key since it is now fully expired
    UPDATE public.notifications 
    SET dedup_key = NULL 
    WHERE dedup_key = 'EXPIRING_' || v_batch.id;
  END LOOP;

  -- 2. EXPIRING SOON
  FOR v_batch IN
    SELECT sb.id, sb.item_id, i.name, sb.expiry_date
    FROM public.stock_batches sb
    JOIN public.inventory_items i ON sb.item_id = i.id
    WHERE sb.quantity > 0
      AND sb.expiry_date >= CURRENT_DATE
      AND sb.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
  LOOP
    INSERT INTO public.notifications (type, title, message, item_id, batch_id, dedup_key)
    VALUES (
      'EXPIRING_SOON',
      'Expiring Soon: ' || v_batch.name,
      v_batch.name || ' has a batch expiring on ' || v_batch.expiry_date || '.',
      v_batch.item_id,
      v_batch.id,
      'EXPIRING_' || v_batch.id
    ) ON CONFLICT (dedup_key) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Schedule the job
-- Use a DO block to unschedule safely if it already exists, then schedule it.
DO $$
BEGIN
  -- Suppress errors if it doesn't exist
  BEGIN
    PERFORM cron.unschedule('daily_expiry_check');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'daily_expiry_check',
    '0 0 * * *', -- Run daily at midnight
    'SELECT public.check_expiry_notifications()'
  );
END;
$$;
