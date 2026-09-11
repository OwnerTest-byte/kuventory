-- 20260912030000_fix_security_definer_views.sql
-- Fix Supabase Linter ERROR: Views defined with SECURITY DEFINER property
-- Configures security_invoker = true so PostgreSQL enforces Row Level Security (RLS)
-- and permissions based on the querying user (least-privilege model).

ALTER VIEW IF EXISTS public.inventory_stock_view SET (security_invoker = true);
ALTER VIEW IF EXISTS public.stock_history_view SET (security_invoker = true);

-- Re-confirm explicit grants for client roles
GRANT SELECT ON public.inventory_stock_view TO authenticated, anon;
GRANT SELECT ON public.stock_history_view TO authenticated;
