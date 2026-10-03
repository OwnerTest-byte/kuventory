# Master Administrator Guide & System Authority Runbook

**KUVENTORY Enterprise · Kape Uno Bistro**  
**Version:** 2.0.0  
**Authority Tier:** Tier 0 (Root Superuser)

---

## 1. Executive Overview

The **Master Administrator (`MASTER_ADMIN`)** possesses absolute authority over the KUVENTORY system. This role is strictly differentiated from operational Store Administrators (`ADMIN`) and floor Staff (`USER`).

While Store Administrators manage daily operations and staff accounts, only the Master Administrator has access to disaster recovery tools, full database snapshots, PostgreSQL concurrency overrides, and emergency locks.

---

## 2. Master Admin Access Information

| Attribute | Specification |
| :--- | :--- |
| **Default Root Identifier** | `master@kapeuno.com` |
| **System Role** | `MASTER_ADMIN` |
| **Security Mechanism** | Enforced via PostgreSQL `is_master_admin()` RLS & Security Definer trigger |
| **Console Route** | `/settings?tab=master` (Accessible via Sidebar Crown Icon) |
| **Session Lifetime** | Persistent encrypted Supabase JWT session with automatic token refresh |

> [!IMPORTANT]
> A Master Admin account cannot be demoted, altered, or deleted by a regular Store Administrator (`ADMIN`). Any attempt by non-master roles to modify a `MASTER_ADMIN` profile is rejected at the database engine level via `protect_profile_role()`.

---

## 3. Tier Differentiation & Permissions Matrix

| Functional Capability | Floor Staff (`USER`) | Store Admin (`ADMIN`) | Master Admin (`MASTER_ADMIN`) |
| :--- | :---: | :---: | :---: |
| **Daily Worksheet Counting** | ✅ | ✅ | ✅ |
| **Item Catalog Management** | ❌ | ✅ | ✅ |
| **FEFO Batch Receipts & Adjustments** | ❌ | ✅ | ✅ |
| **Finalize Daily Inventory Sheet** | ❌ | ✅ | ✅ |
| **View Audit Trails & Security Logs** | ❌ | ✅ | ✅ |
| **Create & Reset Staff Accounts** | ❌ | ✅ | ✅ |
| **Promote Staff to Store Admin** | ❌ | ❌ | ✅ |
| **Promote/Demote Master Admin** | ❌ | ❌ | ✅ |
| **One-Click Full Database Backup** | ❌ | ❌ | ✅ |
| **Disaster Recovery & Dry-Run Validator** | ❌ | ❌ | ✅ |
| **Force Override Finalized Daily Sheet** | ❌ | ❌ | ✅ |
| **Global System Cache Invalidation** | ❌ | ❌ | ✅ |
| **Database Keepalive Daemon Testing** | ❌ | ✅ | ✅ |

---

## 4. Core Master Admin Features

### 4.1 One-Click Full Database Backup (.json Snapshot)
- Accessible from the **Master Console** (`/settings?tab=master`).
- Bundles complete point-in-time state across 7 mission-critical tables:
  1. `items` (SKUs, categories, unit costs, storage conditions)
  2. `inventory_batches` (FEFO lots, expiration dates, remaining quantities)
  3. `daily_inventory_sheets` (Historical closing sheets and shift records)
  4. `daily_inventory_items` (Item-level counted quantities and computed variances)
  5. `stock_movements` (Immutable FIFO/FEFO transaction history)
  6. `system_settings` (Branch details, operational hours, low-stock thresholds)
  7. `profiles` (Staff authorization credentials and role metadata)
- Output format: `kuventory_master_backup_YYYY-MM-DD_HHmmss.json`.
- Includes checksum, record count metadata, and application signature.

### 4.2 Disaster Recovery & Dry-Run Restoration Validator
- Allows validating an existing `.json` backup file without mutating database state.
- **Verification Criteria:**
  - Presence of valid `KUVENTORY` application signature.
  - Integrity of core relational tables.
  - Verification of non-null SKU records and batch associations.
- Displays immediate visual status report (Green checkmark badge with record counts or Red warning with validation errors).

### 4.3 Finalized Daily Sheet Force Override
- **Business Rule:** Under standard operations, once a daily inventory sheet is marked `FINALIZED`, it is immutable to prevent reconciliation tampering.
- **Master Privilege:** In cases of severe counting error or physical recount variance, the Master Administrator can invoke:
  ```sql
  SELECT force_override_daily_inventory(
    p_sheet_id := 'uuid-here',
    p_status := 'DRAFT', -- or 'VOID'
    p_reason := 'Physical count misentry authorized by Owner'
  );
  ```
- **Mandatory Justification:** Every override requires an audit reason which is permanently recorded in PostgreSQL audit logs.

### 4.4 User Privilege Governance
- Only `MASTER_ADMIN` can assign the `ADMIN` or `MASTER_ADMIN` role to user accounts.
- Prevents administrative escalation and rogue account takeover.

---

## 5. Emergency Recovery Workflow

If the production database experiences a partial outage or corrupt record state:

1. Log into the system using the Master Admin credentials.
2. Navigate to **Master Console** via the sidebar icon (`👑 Master Console`) or URL `/settings?tab=master`.
3. Check the **Real-Time Keepalive & Latency Monitor** to verify PostgREST connectivity.
4. In the **Disaster Recovery Center**, upload the latest valid snapshot file.
5. Review the **Dry-Run Inspection Report** to ensure zero schema discrepancies.
6. Click **Flush Cache** to force all client connections to synchronize with fresh database state.
