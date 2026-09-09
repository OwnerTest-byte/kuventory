-- 20260909130000_add_item_image_path.sql
-- Adds image_path column to inventory_items and updates inventory_stock_view

-- 1. Add image_path column if not exists
ALTER TABLE public.inventory_items 
ADD COLUMN IF NOT EXISTS image_path TEXT;

-- 2. Update inventory_stock_view by appending image_path at the end (PostgreSQL requires new columns at the end)
CREATE OR REPLACE VIEW public.inventory_stock_view AS
 SELECT 
    i.id,
    i.category_id,
    COALESCE(c.name, 'Uncategorized') AS category_name,
    i.name,
    COALESCE(i.description, '') AS description,
    COALESCE(i.supplier_a, '') AS supplier_a,
    COALESCE(i.supplier_b, '') AS supplier_b,
    COALESCE(i.unit, 'pcs') AS unit,
    i.unit_cost,
    i.min_quantity,
    COALESCE(i.is_active, true) AS is_active,
    COALESCE(i.is_archived, false) AS is_archived,
    COALESCE(sum(b.quantity), (0)::numeric) AS total_quantity,
    COALESCE(i.image_path, '') AS image_path
   FROM public.inventory_items i
     LEFT JOIN public.categories c ON i.category_id = c.id
     LEFT JOIN public.stock_batches b ON i.id = b.item_id
  GROUP BY i.id, c.name;

-- 3. Ensure permissions
GRANT SELECT ON public.inventory_stock_view TO authenticated, anon;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
