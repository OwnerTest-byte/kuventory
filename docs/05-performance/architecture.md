# Performance Architecture

KUVENTORY is engineered to perform smoothly on older office PCs, budget Android devices, and intermittent networks.

## 1. Network & Payload Optimization
- **Data Minimization**: Supabase queries explicitly specify columns (`.select('id, name')`) instead of `SELECT *` to reduce payload size.
- **Debouncing**: Inputs that trigger searches or auto-saves (like the Daily Inventory draft fields) are debounced by 500ms to prevent overwhelming the network and database with sequential keystrokes.
- **No Heavy Libraries**: We use native standard browser APIs where possible. Date manipulation utilizes `Intl.DateTimeFormat` or native `Date` rather than shipping `moment.js` or `date-fns` if not strictly required.

## 2. Rendering & DOM Optimization
- **Virtualized Lists**: If the master inventory contains thousands of items, the daily inventory worksheet utilizes a virtualized list (e.g., `@tanstack/react-virtual`) to render only the visible rows in the DOM.
- **Memoization**: Heavy computational components are wrapped in `React.memo`, and expensive calculations use `useMemo`.
- **Form Performance**: `react-hook-form` is used specifically because it relies on uncontrolled inputs. This means typing in a quantity field does not trigger a re-render of the entire 1,000-row table.

## 3. Database Performance
- **Indexes**: Indexes are placed exclusively on foreign keys (e.g., `item_id`, `category_id`) and frequently queried columns (e.g., `inventory_date`, `expiry_date`).
- **Generated Columns**: Instead of calculating `TOTAL` and `ENDING` repeatedly via views or client-side logic, PostgreSQL generated columns calculate these at write-time, resulting in O(1) read operations.
- **Snapshot Isolation**: The `reports` table flattens and snapshots historical data. Querying past reports requires no complex JOINs on the live inventory, ensuring reports load instantly regardless of how large the live tables grow.

## 4. Bundle Strategy
- **Code Splitting**: The application is code-split by routes automatically via React Router and Vite's dynamic imports. Admin settings and PDF Generation libraries (if added) are not loaded for a standard USER doing a daily count.
