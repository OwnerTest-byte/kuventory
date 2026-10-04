# Supabase Migrations Workflow

## Architecture
Kuventory uses the Supabase CLI to version-control all database schema changes. Migrations are executed locally, committed to Git, and then safely pushed to the cloud environment.

## Current Migration Files
1. `20260806055001_core_extensions.sql` - Core `updated_at` trigger.
2. `20260806055002_profiles_roles.sql` - Auth profiling and RBAC tables.
3. `20260806055003_categories_units.sql` - Taxonomy.
4. `20260806055004_stock_items.sql` - Core inventory items.
5. `20260806055005_inventory_locations.sql` - Locations and balances.
6. `20260806055006_daily_inventory.sql` - Daily snapshot and line tracking.
7. `20260806055007_stock_movements.sql` - Immutable movement log and transfers.
8. `20260806055008_suppliers_purchases.sql` - Vendor and procurement tracking.
9. `20260806055009_sales_discounts.sql` - Orders and discounts.
10. `20260806055010_expenses_cash.sql` - Cash till and OPEX tracking.
11. `20260806055011_audit_notifications.sql` - System logs and alerts.

## Workflow Commands
- **Create new migration**: `npx supabase migration new <descriptive_name>`
- **Apply migrations to local DB**: `npx supabase db reset` (resets and runs all migrations + seed)
- **Generate Types**: `npx supabase gen types typescript --local > frontend/src/types/database.types.ts`
- **Push to Remote**: `npx supabase db push` *(Do not use this until RLS policies are applied)*
