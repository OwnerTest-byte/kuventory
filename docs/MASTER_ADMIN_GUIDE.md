# Master Administrator Guide & System Authority Runbook

**KUVENTORY Enterprise · Kape Uno Bistro**  
**Version:** 2.0.0  
**Authority Tier:** Tier 0 (Root Superuser)

---

## 1. Executive Overview

The **Master Administrator (`MASTER_ADMIN`)** possesses absolute authority over the KUVENTORY system. This role is strictly differentiated from operational Store Administrators (`ADMIN`) and floor Staff (`USER`).

While Store Administrators manage daily operations and staff accounts, only the Master Administrator has access to disaster recovery tools, full database snapshots, PostgreSQL concurrency overrides, and emergency locks.

---

## 2. Master Admin Access & Emergency Dispatch Information

| Attribute | Dedicated Specification |
| :--- | :--- |
| **Dedicated Root Account** | `master@kuventory.com` |
| **Default Master Password** | `MasterAdmin2026!` |
| **Secondary Superuser** | `admin@kuventory.com` / `Admin123!` |
| **System Authority Tier** | `MASTER_ADMIN` |
| **Emergency Mobile Hotline** | **`09917101298`** (Direct Calling & SMS) |
| **Password Reset Dispatch** | In-app real-time notification routed directly to `/settings?tab=users` |
| **Security Mechanism** | Enforced via PostgreSQL `is_master_admin()` RLS & Security Definer trigger |
| **Console Route** | `/settings?tab=master` (Accessible via Sidebar Crown Icon) |
| **Session Lifetime** | Persistent encrypted Supabase JWT session with automatic token refresh |

> [!IMPORTANT]
> - When floor staff click "Forgot password?" on the login page, the system immediately dispatches a real-time `PASSWORD_RESET` notification to the Master Admin and displays the direct hotline: **09917101298** and **master@kuventory.com**.
> - Clicking the notification instantly redirects the Master Admin directly to the user management console (`/settings?tab=users`) to review or reset the user's password.
> - A Master Admin account cannot be demoted, altered, or deleted by a regular Store Administrator (`ADMIN`). Any attempt by non-master roles to modify a `MASTER_ADMIN` profile is rejected at the database engine level via `protect_profile_role()`.

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
- Bundles complete point-in-time state across 10 mission-critical tables:
  1. `categories` (All 7 standard store departments: Beverages, Snacks, Grilled Stock, Portion Stock, Per Cases, Per Bottle, Desserts)
  2. `inventory_items` (SKUs, categories, units, min threshold quantities, OCC versions)
  3. `stock_batches` (FEFO lots, expiration dates, remaining quantities, batch versions)
  4. `daily_inventory` (Daily closing sessions, shift records, finalization timestamps)
  5. `daily_inventory_items` (Item-level counted quantities, beginning, purchases, sales, computed variances)
  6. `stock_movements` (Immutable FIFO/FEFO transaction history ledger)
  7. `reports` & `report_items` (Historical end-of-day immutable snapshots)
  8. `system_settings` (Branch details, operational hours, maintenance locks)
  9. `profiles` (Staff authorization credentials and role metadata)
- Output format: `kuventory_master_backup_YYYY-MM-DD_HHmmss.json`.
- Includes checksum, record count metadata, and application signature.

### 4.2 Disaster Recovery & Point-in-Time Restoration
- Allows validating an existing `.json` backup file without mutating database state.
- **Verification Criteria:**
  - Presence of valid `KUVENTORY` application signature.
  - Integrity of core relational tables and foreign keys.
  - Verification of category structures and batch associations.
- **Automated 1-Click Restoration:**
  - Master Admin can confirm and execute a point-in-time restoration directly into the Supabase database.
  - Safely upserts categories, items, batches, ledger movements, and daily sheets in dependency order.

### 4.3 Live Real-Time Telemetry & System Activity Monitor
- **Active Supabase Realtime Channels:** Subscribes in real time to mutations across `audit_logs`, `stock_movements`, and `daily_inventory`.
- **Live Stream Indicator:** Real-time pulsating health indicator, WebSocket subscription state, and engine latency (ms).
- **Interactive Controls:** Master Admin can ping latency on demand, pause/resume the live stream, or clear the feed.

### 4.4 Emergency Operational Contingencies Command Center
1. **Emergency Maintenance Mode Lock:** Blocks floor staff from submitting worksheet counts or modifying stock during end-of-month audits.
2. **Stock Balance Drift Auto-Healing (Rebalancer):** Scans all inventory items against positive FEFO stock batches, updating OCC concurrency versions to heal any client-side drift.
3. **Depleted/Phantom Batch Purge:** Cleans zero or negative quantity batches that linger in the database.
4. **Clean-Slate Item Purge (Keep Categories & Users):** Allows wiping test/historical item records for a clean store launch while preserving all 7 category structures and staff accounts.
5. **Finalized Daily Sheet Force Reopening:** Invokes `force_override_daily_inventory(p_daily_inventory_id)` to reopen locked sheets back to `DRAFT` for correction.

---

## 5. Emergency Recovery Workflow

If the production database experiences a partial outage or corrupt record state:

1. Log into the system using the Master Admin credentials (`master@kuventory.com` or `admin@kuventory.com`).
2. Navigate to **Master Console** via the sidebar icon (`👑 Master Console`) or URL `/settings?tab=master`.
3. Check the **Real-Time Telemetry & Latency Monitor** to verify PostgREST and WebSocket connectivity.
4. In the **Disaster Recovery Center**, select the backup snapshot file (`kuventory_master_backup_*.json`).
5. Review the **Dry-Run Inspection Report** to ensure zero schema discrepancies.
6. Click **Execute Disaster Recovery Restore** to synchronize the database.
7. Click **Flush Cache** to force all client connections to synchronize with fresh state.
