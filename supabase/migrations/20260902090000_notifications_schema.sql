-- 1. Add required columns to notifications table
ALTER TABLE public.notifications ADD COLUMN title TEXT;
UPDATE public.notifications SET title = type WHERE title IS NULL;
ALTER TABLE public.notifications ALTER COLUMN title SET NOT NULL;

ALTER TABLE public.notifications ADD COLUMN dedup_key TEXT UNIQUE;
ALTER TABLE public.notifications ADD COLUMN item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN batch_id UUID REFERENCES public.stock_batches(id) ON DELETE CASCADE;

-- 2. Create index on dedup_key for fast conflict resolution
CREATE INDEX IF NOT EXISTS idx_notifications_dedup_key ON public.notifications(dedup_key);
