# API and Database Documentation

## 1. Database Schema & Tables

### 1.1 `public.inventory_items`
Master catalog table containing all inventory items.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique item identifier |
| `item_code` | `TEXT` | `UNIQUE NOT NULL` | Stock Keeping Unit (e.g., `SKU-001`) |
| `item_name` | `TEXT` | `NOT NULL` | Display name (e.g., `Chicken Breast`) |
| `category_id` | `UUID` | `REFERENCES categories(id)` | Category classification |
| `inventory_type` | `TEXT` | `NOT NULL` | Section: `GRILLED STOCK`, `PORTION STOCK`, `PER CASES` |
| `unit` | `TEXT` | `NOT NULL DEFAULT 'pcs'` | Unit of measure (`kg`, `pcs`, `pack`, `box`) |
| `unit_cost` | `NUMERIC(10,2)` | `DEFAULT 0.00` | Purchase cost per unit in PHP |
| `min_qty` | `NUMERIC(10,2)` | `DEFAULT 0.00` | Reorder / Low stock threshold |
| `supplier_a` | `TEXT` | `NULL` | Primary supplier name |
| `supplier_b` | `TEXT` | `NULL` | Secondary supplier name |
| `image_path` | `TEXT` | `NULL` | Image data URL or public HTTPS URL |
| `is_archived` | `BOOLEAN` | `DEFAULT FALSE` | Soft delete / archive flag |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Last updated timestamp |

---

### 1.2 `public.stock_batches`
Individual stock intake lots tracked for FEFO expiry and aging.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Batch ID |
| `item_id` | `UUID` | `REFERENCES inventory_items(id) ON DELETE CASCADE` | Item reference |
| `batch_code` | `TEXT` | `NOT NULL` | Batch identifier (`BATCH-XXXXXX`) |
| `quantity` | `NUMERIC(10,2)` | `NOT NULL CHECK (quantity >= 0)` | Remaining unconsumed quantity |
| `initial_quantity`| `NUMERIC(10,2)` | `NOT NULL CHECK (initial_quantity >= 0)`| Quantity when initially received |
| `expiry_date` | `DATE` | `NULL` | Perishable expiration date |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Intake timestamp |

---

### 1.3 `public.stock_movements`
Immutable audit ledger recording every balance addition, deduction, or adjustment.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Transaction ID |
| `item_id` | `UUID` | `REFERENCES inventory_items(id)` | Item affected |
| `batch_id` | `UUID` | `REFERENCES stock_batches(id) NULL` | Specific batch deducted from |
| `action_type` | `TEXT` | `CHECK (action_type IN ('ADD', 'REMOVE', 'ADJUST'))` | Movement direction |
| `quantity` | `NUMERIC(10,2)` | `NOT NULL` | Delta quantity |
| `previous_balance`| `NUMERIC(10,2)` | `NOT NULL` | Balance before movement |
| `new_balance` | `NUMERIC(10,2)` | `NOT NULL` | Balance after movement |
| `reason` | `TEXT` | `NOT NULL` | Movement narrative/audit trail |
| `user_id` | `UUID` | `REFERENCES auth.users(id) NULL` | Operating user ID |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Movement timestamp |

---

### 1.4 `public.daily_inventory_sessions` & `daily_inventory_entries`
Daily worksheet headers and item-by-item shift recording tables.

---

### 1.5 Database Views: `public.inventory_stock_view`
Consolidates catalog details with active batch quantities into a performant query target:
```sql
CREATE OR REPLACE VIEW public.inventory_stock_view AS
SELECT
    i.id,
    i.item_code,
    i.item_name,
    i.description,
    i.category_id,
    c.name AS category_name,
    i.inventory_type,
    i.unit,
    i.unit_cost,
    i.supplier_a,
    i.supplier_b,
    i.min_qty,
    COALESCE(SUM(b.quantity), 0) AS current_qty,
    i.is_archived,
    i.created_at,
    i.updated_at,
    COALESCE(i.image_path, '') AS image_path
FROM public.inventory_items i
LEFT JOIN public.categories c ON c.id = i.category_id
LEFT JOIN public.stock_batches b ON b.item_id = i.id
GROUP BY i.id, c.name;
```

---

## 2. Stored Procedures & PL/pgSQL Functions (RPC)

### `consume_stock_fefo(p_item_id UUID, p_quantity NUMERIC, p_reason TEXT)`
- **Security**: `SECURITY DEFINER SET search_path = public, pg_temp;`
- **Purpose**: Atomically consumes stock by allocating from batches ordered by `expiry_date ASC NULLS LAST, created_at ASC`.
- **Returns**: JSON array of deducted batches and remaining quantities.

### `finalize_daily_inventory(p_session_id UUID)`
- **Security**: `SECURITY DEFINER SET search_path = public, pg_temp;`
- **Purpose**: Validates totals, updates session status to `FINALIZED`, calls FEFO deduction for all recorded AM/PM sales, and generates the immutable snapshot.

### `admin_reset_user_password(p_user_id UUID, p_new_password TEXT)`
- **Security**: `SECURITY DEFINER SET search_path = public, auth, pg_temp;`
- **Purpose**: Allows authorized Administrators to reset a user's password directly via secure Postgres hashing.
