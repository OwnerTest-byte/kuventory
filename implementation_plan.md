# End-to-End Functional Integration

This plan outlines the removal of all mock data and the complete wiring of the frontend UI to the backend Supabase database, ensuring all tables, metrics, and workflows function robustly as intended by a production-ready inventory system.

## Proposed Changes

---

### Database Views

Update the SQL views to support the UI without relying on mock or hardcoded mapping.

#### [NEW] \supabase/migrations/20260904000000_real_data_views.sql\

- Modify \inventory_stock_view\ to join with the \categories\ table to expose \category_name\. This replaces the frontend mock logic determining categories based on item names.

---

### Dashboard (Landing Page)

Remove all static numbers and replace them with real-time aggregated data.

#### [MODIFY] \src/features/inventory/pages/InventoryLandingPage.tsx\

- **Metrics Row**:
  - Total Items: Use \inventory.length\ (excluding archived).
  - Low Stock: Calculate from \inventory\ where \ otal_quantity <= min_quantity\.
  - Out of Stock: Calculate from \inventory\ where \ otal_quantity = 0\.
  - Expiring Soon: Fetch from \stock_batches\ where \expiry_date\ is within the next 30 days.
- **Today's Inventory Summary**:
  - Calculate exact portion vs case items dynamically using the \unit\ and new \category_name\ from the updated view.
- **Recent Activity**:
  - Replace the static array with a real query to \stock_movements\, displaying the actual user, action, timestamp, and related item.

---

### Items Catalog & Stock Update

Wire the UI interactions to the actual inventory engine RPCs.

#### [MODIFY] \src/features/inventory/pages/ItemsCatalogPage.tsx\

- Remove the \mockCat\ logic and use the actual \item.category_name\ from the view.
- Hook up the "MoreVertical" (or an "Update Stock" button) to open the \StockUpdateModal\.
- Fetch the item's batches dynamically when opening the modal.

#### [MODIFY] \src/features/inventory/components/StockUpdateModal.tsx\

- Conditionally render an \Expiry Date\ input when the action is \ADD\.
- Pass the form submission securely to the \useStockMutations\ hook to call the Supabase RPCs (\dd_stock\, \consume_stock\, \djust_stock\).
- Ensure validation prevents invalid state (e.g., ADJUST requires a specific batch, not "Auto FEFO").

---

### Navigation & UX

Ensure notifications are accurate.

#### [MODIFY] \src/features/inventory/components/NotificationBell.tsx\

- Verify notifications reflect true Low Stock / Expired states from the database.

## Verification Plan

### Automated Tests

- \
  pm run build\ to ensure zero TypeScript errors caused by type mismatches in the new view.
- Push the SQL migration using \
  px supabase db push\.

### Manual Verification

- Deploy to Netlify.
- Create a new Item with a new Category. Ensure it appears in the Catalog with correct names.
- Update stock for the item (ADD) and verify the Dashboard metrics and Recent Activity immediately reflect the operation.
- Archive an item and verify it is removed from the active lists and metrics.
