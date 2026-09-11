# Reporting Architecture

## 1. Overview
The Kuventory reporting architecture is designed to aggregate, filter, and export business data while respecting Row Level Security (RLS) and avoiding heavy client-side processing of large datasets.

## 2. Data Flow

1. **Supabase Database**: The source of truth containing transactional tables (`sales`, `purchases`, `inventory_balances`, etc.).
2. **Database Views & RPCs**: Custom SQL views (e.g., `view_sales_report`) and RPCs perform heavy joins and aggregations on the server.
3. **Supabase Client (Frontend)**: React hooks query the views/RPCs, passing necessary filters (date ranges, IDs) as parameters or PostgREST filters (`.gte()`, `.lte()`, `.eq()`).
4. **React Components**: Renders DataTables, Summary Cards, and Recharts using the structured responses.
5. **Export Engine**: Uses `jspdf`, `jspdf-autotable`, and `xlsx` to generate client-side files based directly on the fetched data, ensuring the export precisely matches the UI.

## 3. Database Views

Views are created with `WITH (security_invoker = true)` to ensure they execute under the context of the authenticated user, properly inheriting RLS policies applied to the underlying tables.

- `view_sales_report`: Joins `sales` with `profiles` (cashier).
- `view_inventory_report`: Joins `inventory_balances`, `stock_items`, `categories`, and `inventory_locations`.
- `view_purchase_report`: Joins `purchases` and `suppliers`.
- `view_expense_report`: Joins `expenses` and `expense_categories`.
- `view_cash_report`: Displays data from `cash_sessions`.

## 4. Aggregations & Performance

Where possible, aggregations (e.g., Total Sales, Average Purchase Value) are offloaded to Supabase either through PostgREST aggregate queries (if supported) or specialized RPCs (e.g., `get_sales_summary(start_date, end_date)`).

- **Pagination**: Server-side pagination using `.range(start, end)` is used for list views to prevent memory bloat.
- **Caching**: React Query (`@tanstack/react-query`) is used for client-side caching of report data to prevent redundant network requests during filter toggling or tab switching.

## 5. Security & Permissions

Reports strictly adhere to the RBAC matrix. A user without the `Administrator` or `Manager` role cannot fetch sensitive financial aggregates, as RLS policies on the underlying tables will reject or filter the rows before they even reach the View.

- **Export Security**: Since exports are generated client-side from the DataGrid's dataset, they intrinsically share the same security context and cannot bypass RLS.

## 6. Export Mechanisms

- **PDF Export**: Utilizes `jspdf`. Custom fonts may be embedded to ensure proper rendering of the Philippine Peso (₱) symbol.
- **Excel Export**: Utilizes `xlsx`. Exports are generated as clean, tabular sheets with proper column typing (dates, currencies).

## 7. Date Filtering Strategy
All date boundaries are computed client-side using `date-fns` (ensuring correct timezone offsets) and passed as absolute ISO-8601 strings to Supabase (`>= start_date` and `<= end_date`).
