# Database Schema Audit & Hardening Report

## 1. Authoritative Public Tables

| Table Name | Primary Purpose | Key Constraints & Indexes |
| :--- | :--- | :--- |
| `inventory_items` | Master catalog of stock items | `id UUID PK`, `name UNIQUE`, `min_quantity`, `version INT DEFAULT 1` |
| `stock_batches` | Individual receipt lots with independent expiration dates | `id UUID PK`, `item_id FK`, `quantity NUMERIC >= 0`, `expiry_date DATE`, `received_date DATE`, `version INT` |
| `stock_movements` | Immutable audit ledger of all inventory transactions | `id UUID PK`, `item_id FK`, `batch_id FK`, `type (ADD/REMOVE/ADJUST)`, `quantity_change`, `quantity_after`, `user_id FK` |
| `daily_inventory` | Daily worksheet headers for Portion & Case stock | `id UUID PK`, `date DATE`, `state (DRAFT/FINALIZED)`, `finalized_by FK`, `UNIQUE(date)` |
| `daily_inventory_items` | Line items for daily worksheets | `id UUID PK`, `daily_inventory_id FK`, `item_id FK`, `stock_beg`, `add_stock`, `total_stock`, `sales_am`, `sales_pm`, `ending` |
| `categories` | Category taxonomy classification | `id UUID PK`, `name TEXT UNIQUE` |
| `profiles` | User profiles with rigid role assignment | `id UUID PK REFERENCES auth.users`, `role ('MASTER_ADMIN', 'ADMIN', 'USER')` |
| `user_session_leases` | Active single-session leases enforcing "First Session Wins" | `id UUID PK`, `user_id UNIQUE FK`, `session_id`, `client_id`, `lease_expires_at`, `status` |
| `recovery_points` | Verified system recovery checkpoints ("Save States") | `id UUID PK`, `point_code UNIQUE`, `application_version`, `schema_version`, `retention_class`, `is_protected` |
| `notifications` | Deduplicated operational alerts | `id UUID PK`, `type`, `dedup_key UNIQUE`, `is_read`, `batch_id FK` |
| `audit_logs` | Security and operational event ledger | `id UUID PK`, `user_id FK`, `action`, `target_table`, `details JSONB`, `created_at` |
| `reports` | Finalized weekly/monthly report manifests | `id UUID PK`, `title`, `period_start`, `period_end`, `state`, `file_path` |
| `report_items` | Immutable line-item snapshots for finalized reports | `id UUID PK`, `report_id FK`, `item_id FK`, `stock_beg`, `add_stock`, `consumed`, `stock_end` |
| `system_settings` | Global operational flags (maintenance lock) | `key TEXT PK`, `value JSONB` |
| `visitor_logs` | Authentication telemetry and audit pings | `id UUID PK`, `user_id FK`, `ip_address`, `visited_at` |

---

## 2. Integrity Triggers & Quota Enforcement

### 1. `check_admin_quotas()` Trigger
- **Fires On**: `BEFORE INSERT OR UPDATE OF role ON public.profiles`
- **Rule Enforced**:
  - `COUNT(role = 'MASTER_ADMIN') <= 1`: Strictly 1 Master Admin allowed.
  - `COUNT(role = 'ADMIN') <= 3`: Max 3 Store Administrators allowed.
  - Throws PostgreSQL error `23514` (check_violation) upon any breach.

### 2. `protect_profile_role()` Trigger
- **Fires On**: `BEFORE UPDATE OF role ON public.profiles`
- **Rule Enforced**:
  - Privilege escalation protection: only administrators can change roles.
  - Only Master Admin can elevate a user to `MASTER_ADMIN`.
  - Master Admin account cannot be deleted or demoted by standard Admins.

### 3. `trg_batch_quantity_cleanup` Trigger
- **Fires On**: `AFTER UPDATE OF quantity ON public.stock_batches`
- **Rule Enforced**:
  - If a batch quantity drops to `0`, active `EXPIRED` and `EXPIRING_SOON` notifications targeting that batch are automatically marked as read and resolved.

---

## 3. Atomic RPC Functions & Search Path Security

All functions are marked `SECURITY DEFINER` and explicitly declare `SET search_path = public, auth, pg_temp` to prevent search path hijacking.

1. **`claim_user_session(p_session_id, p_client_id, p_device_info, p_lease_seconds)`**:
   - Acquires `FOR UPDATE` lock on `user_session_leases`.
   - Denies new login attempt if an active unexpired lease is held by another client.
2. **`heartbeat_user_session(p_client_id, p_lease_seconds)`**:
   - Extends active lease for matching client ID; returns `REVOKED` if an administrator has terminated the lease.
3. **`add_stock(p_item_id, p_quantity, p_expiry_date, p_received_date, p_reason)`**:
   - Acquires `FOR UPDATE` lock on `inventory_items`.
   - Inserts distinct row in `stock_batches` (never mutates existing batch expiration dates).
4. **`consume_stock(p_item_id, p_quantity, p_reason)`**:
   - Acquires exclusive row locks on `inventory_items` and eligible `stock_batches`.
   - Evaluates FEFO allocation; updates batch quantities and inserts `stock_movements`.
5. **`create_recovery_checkpoint(p_name, p_description, p_retention_class, p_is_protected)`**:
   - Restricted to `is_master_admin()`.
   - Records coherent checkpoint snapshot in `recovery_points`.
6. **`cleanup_expired_recovery_points()`**:
   - Safely cleans expired unprotected recovery points while strictly preserving protected points and the latest verified checkpoint.
