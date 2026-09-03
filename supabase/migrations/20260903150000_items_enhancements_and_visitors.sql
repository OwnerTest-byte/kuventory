-- 1. Add new fields to public.inventory_items
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS supplier_a TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS supplier_b TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- 2. Create public.visitor_logs
CREATE TABLE IF NOT EXISTS public.visitor_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT NOT NULL,
    visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on visitor_logs
ALTER TABLE public.visitor_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to INSERT their own logs
DROP POLICY IF EXISTS "Users can insert own visitor logs" ON public.visitor_logs;
CREATE POLICY "Users can insert own visitor logs"
    ON public.visitor_logs FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Only ADMIN can SELECT visitor_logs
DROP POLICY IF EXISTS "Admins can view visitor logs" ON public.visitor_logs;
CREATE POLICY "Admins can view visitor logs"
    ON public.visitor_logs FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );
