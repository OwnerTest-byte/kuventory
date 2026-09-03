-- Recreate inventory_stock_view to include category_name

DROP VIEW IF EXISTS public.inventory_stock_view;

CREATE OR REPLACE VIEW public.inventory_stock_view
WITH (security_invoker = true)
AS
SELECT 
  i.id,
  i.category_id,
  c.name AS category_name,
  i.name,
  i.description,
  i.supplier_a,
  i.supplier_b,
  i.unit,
  i.unit_cost,
  i.min_quantity,
  i.is_active,
  i.is_archived,
  COALESCE(SUM(b.quantity), 0) AS total_quantity
FROM public.inventory_items i
LEFT JOIN public.categories c ON i.category_id = c.id
LEFT JOIN public.stock_batches b ON i.id = b.item_id
GROUP BY i.id, c.name;
