-- Add `id` alias to inventory_stock_view so the frontend InventoryStock.id is populated.
-- The primary key column `item_id` is preserved for existing foreign-key references.
DROP VIEW IF EXISTS public.inventory_stock_view;

CREATE VIEW public.inventory_stock_view
WITH (security_invoker = true)
AS
SELECT 
  i.id AS item_id,
  i.id,
  i.category_id,
  i.name,
  i.description,
  i.unit,
  i.unit_cost,
  i.min_quantity,
  i.is_active,
  COALESCE(SUM(b.quantity), 0) AS total_quantity
FROM public.inventory_items i
LEFT JOIN public.stock_batches b ON i.id = b.item_id
GROUP BY i.id;
