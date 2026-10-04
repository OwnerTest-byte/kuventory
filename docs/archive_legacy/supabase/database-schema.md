# Supabase Database Schema

## Core Principles
- Primary Keys: `UUID` generated via `gen_random_uuid()`
- Timestamps: `timestamptz`, managed automatically by standard `handle_updated_at()` trigger.
- Financial Values: `NUMERIC(15, 2)` to prevent floating point inaccuracies.
- Deletions: Archive approach (`archived_at` or `is_active = FALSE`) instead of `CASCADE` deletions, except for relational joins like `user_roles`.

## Schema Definitions

### 1. Profiles & Roles
- **roles**: Contains system roles (`name` is unique).
- **profiles**: Corresponds to `auth.users(id)`. Has `is_active` flag.
- **user_roles**: Join table linking `profiles` to `roles`. Enforces `UNIQUE(profile_id, role_id)`.

### 2. Categories & Units
- **categories**: `name` is unique among active categories via partial unique index.
- **units_of_measure**: Represents measurable quantities (e.g., kg, pcs). `code` is unique.

### 3. Inventory & Stock
- **stock_items**: The main catalog item. Links to `categories` and `units_of_measure`. Has `stock_code` (unique).
- **inventory_locations**: Physical locations (Bodega, Kiosk). `code` is unique.
- **inventory_balances**: Quantity of `stock_items` per `inventory_locations`. Enforces `UNIQUE(stock_item_id, location_id)`.

### 4. Daily Inventory & Movements
- **daily_inventory_periods**: Snapshot state per location and date. `UNIQUE(business_date, location_id)`.
- **daily_inventory_lines**: Individual item tracking for a daily period. `UNIQUE(daily_inventory_period_id, stock_item_id)`.
- **stock_movements**: Immutable audit log of stock changes.
- **stock_transfers** / **stock_transfer_lines**: Location to location transfers.

### 5. Procurement & Sales
- **suppliers** / **supplier_discount_policies**: Manage vendors and default discount rules.
- **purchases** / **purchase_lines**: Stock acquisitions from suppliers.
- **sales** / **sale_lines**: Processed orders.
- **discounts**: Unified discount definitions (e.g. Senior, PWD).

### 6. Expenses & Cash
- **expense_categories** / **expenses**: Operational costs tracking.
- **cash_sessions** / **cash_transactions**: Till management and session reconciliation.

### 7. System Tracking
- **audit_logs**: Immutable logs for sensitive actions.
- **notifications**: User alerts.
