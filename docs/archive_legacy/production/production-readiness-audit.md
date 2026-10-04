# KUVENTORY Production Readiness Audit

## Environment Separation
The project requires a clear distinction between development and production environments.
Currently, Kuventory relies on environment variables (`.env`) for its Supabase configuration (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`).
**Recommendation**: Maintain a separate Supabase Project for Production. Ensure the frontend deployment (e.g., GitHub Pages) is injected with the production environment variables, and local development uses `.env.local` to point to a local Supabase instance or a staging remote instance.

## Authentication & Authorization
- **Authentication**: Handled purely via Supabase Auth (JWT). Session tokens are managed by Supabase client libraries automatically.
- **Authorization**: Row Level Security (RLS) is implemented on critical tables. Roles are managed in `user_roles` and resolved dynamically.
- **RPCs**: Security definer functions (`process_sale`, `create_purchase`, `create_expense`) ensure that complex or multi-table updates are atomic and role-validated within Postgres.

## Database & RLS
- RLS policies exist on all core tables.
- Reporting Views use `security_invoker = true` to inherit RLS from the calling user's context.

## Business Logic & Transactions
- Atomicity is enforced using Pl/pgSQL RPCs for all financial and inventory transactions (Sales, Purchases, Cash Sessions).
- **Status**: Verified in Phase 6/7. No partial transactions are permitted in the database.

## Exports & Reporting
- Client-side extraction to PDF, CSV, and XLSX formats via `ExportDialog`. 
- Data mapped straight from Supabase SQL Views.

## Caching & Performance
- `TanStack Query` and `useEffect` state is utilized heavily in the frontend. 
- Needs check to ensure sensitive data is not indefinitely kept in local storage and is cleared on logout.
