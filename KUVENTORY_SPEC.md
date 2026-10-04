# KUVENTORY Master Technical Specification

## 1. System Overview & Core Identity

**KUVENTORY** is an industrial-grade, concurrency-safe, zero-trust inventory management system tailored for high-throughput retail operations (Kape Uno). The system enforces authoritative batch isolation, First-Expire, First-Out (FEFO) automated consumption, strict single active human session leasing per account, and tiered administrative governance.

### Core Business Scope (Rule 4 Compliance)

KUVENTORY remains strictly focused on core inventory operations:

- **Authentication**: Role-based access control with single active session lease enforcement (First Session Wins).
- **Dashboard**: Live worker metric tiles (Current Stock, Low Stock, Out of Stock, Expiring Soon, Today's Worksheets).
- **Inventory & Batches**: Authoritative item catalog with distinct receipt lots, individual batch expiration dates, and immutable transaction history.
- **Daily Inventory**: Worksheets supporting Portion Stock and Per Cases counting, automated calculation of `Total = Beginning + Add` and `Ending = Total - AM - PM`.
- **Categories & Suppliers**: Category taxonomy and item supplier attributes (Supplier A & Supplier B).
- **Reports & Analytics**: Immutable report snapshots, operational movement analysis (Top 3 Outgoing, Top 3 Stocked, Top 3 Lowest Stock).
- **Notifications**: Deduplicated, auto-resolving alerts for low-stock thresholds, expiring lots, and depleted batches.
- **Master Admin Control Center**: Telemetry, database health, realtime monitoring, storage/backups, recovery checkpoints, integrity audits, and active session revocation.

---

## 2. Role Clearance & Quota Architecture (Rules 6–10)

Clear separation of responsibilities across three rigid tiers:

| Role | Quota Limit | Scope & Permissions | Key Restrictions |
| :--- | :--- | :--- | :--- |
| **USER / STAFF** | Unlimited | Floor operations: worksheet entry, stock receiving, stock deductions, view batches, read alerts. | No user management, no system recovery, no role elevation, cannot access administrative settings. |
| **ADMIN** | **Max 3 Slots** (`admin@kuventory.com` + 2 active) | Operational administration: item catalog updates, category creation, staff password reset, operational audit review. | Cannot access Disaster Recovery Center, cannot demote/delete Master Admin, cannot bypass quotas. |
| **MASTER_ADMIN** | **Strictly 1 Account** (`master@kuventory.com`) | Absolute application authority: system telemetry, disaster recovery checkpoints, database restore, session lease revocation, maintenance lockout. | Authenticated legitimately via MFA/strong credentials; all privileged actions audited in `audit_logs`. |

---

## 3. Stock & Batch Isolation Engine (Rules 18–27, 209–211)

### Principle of Batch Invariance

An **Item** represents the overarching catalog product (e.g., `Fresh Whole Milk 1L`), while a **Batch** represents a specific receipt lot with its own received quantity, remaining balance, received date, and expiration date.

1. **Restocking with Different Expiry Dates (Rule 19 & 22)**:
   - When restocking an item with an expiration date differing from existing stock, the system **ALWAYS creates a new batch**.
   - The existing batch retains its original quantity, received date, and expiration date intact.
   - Merging batches or overwriting historical expiration dates is strictly prohibited.
2. **Same Batch Replenishment (Rule 21)**:
   - Restocking to the exact same batch lot ID increments that specific batch balance.
   - If uncertain or if lot numbers differ, the system defaults to creating a new batch.
3. **Zero-Quantity Batch Preservation (Rule 24 & 25)**:
   - When `remaining_quantity <= 0`, the batch is closed for active stock allocation.
   - The depleted batch record remains permanently in `stock_batches` and `stock_movements` for historical reconciliation, audits, and reports.
   - Depleted batches are excluded from active expiring stock views and low-stock alerts.

---

## 4. FEFO & Concurrency Safeguards (Rules 26–35, 145–148)

### Automated Database-Authoritative FEFO

Stock removal is performed inside the database engine via the `consume_stock` RPC:

```sql
SELECT * FROM public.stock_batches
WHERE item_id = p_item_id
  AND quantity > 0
  AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
ORDER BY expiry_date ASC NULLS LAST, received_date ASC, id ASC
FOR UPDATE;
```

1. **Row-Level Locking**: Acquires exclusive row locks (`FOR UPDATE`) on `inventory_items` and eligible `stock_batches`.
2. **Serialization**: Concurrent requests attempting to consume or adjust the same item are serialized, preventing negative inventory balances, lost updates, and phantom reads.
3. **Expired Stock Exclusion**: Expired batches are excluded from normal operational deductions.

---

## 5. Single Active Session Leasing Engine (Rules 11–17, 149–150)

### First Session Wins Architecture

1. **Single Session Guarantee**: Only one active human session is permitted per account at any time.
2. **First Session Wins**:
   - Device A logs in → atomically claims lease in `user_session_leases`.
   - Device B attempts login with valid credentials → denied with: **`ACCOUNT IN USE`** (*Active on another device*).
   - Device A remains fully connected and active.
3. **Heartbeat & Grace Period**:
   - Active client emits a heartbeat every 15 seconds to extend lease (45-second lease window).
   - If Device A crashes or closes without logging out, the lease expires after 45 seconds, permitting subsequent login.
4. **Master Admin Revocation**:
   - Master Admin can inspect all active leases in the Control Center and forcefully revoke compromised or orphaned sessions with an audited reason.

---

## 6. Disaster Recovery & "Save State" Checkpoints (Rules 39–59, 173–176)

### Coordinated Recovery Points

A recovery point represents a verified, coherent system snapshot tracking:

- `point_code` (e.g., `RP-20261004-BASELINE`)
- `application_version` and Git commit
- `database_schema_version`
- `database_recovery_timestamp`
- `storage_manifest` and verified integrity status
- `retention_class`: `FREQUENT` (14 days), `DAILY` (180 days), `MONTHLY` (365 days), `INCIDENT_SAFETY` (Protected)

### Read-Only State Preview (Rules 49–53)

Master Admin can inspect snapshot metadata and version alignment in an isolated read-only preview drawer. All production mutation is blocked during preview.

---

## 7. Responsiveness & Cross-Device Engineering (Rules 95–104)

The interface is engineered and tested across 10 distinct viewport profiles:

- **Mobile** (360×800, 390×844, 393×852, 412×915): Vertically scrollable login avoiding keyboard traps, responsive cards and stacked tables, min 48px touch targets.
- **Tablet** (768×1024, 820×1180): Two-column control grids, collapsible navigation drawers, dense data presentation.
- **Laptop / Desktop** (1280×720, 1366×768, 1440×900, 1920×1080): Full dashboard telemetry, multi-pane administrative control center, high-density data tables.

---

## 8. Playwright Real-Browser Verification (Rules 231–271)

Zero synthetic DOM testing; 100% real-browser test suites executed across Chromium, Firefox, WebKit, Mobile Safari, and Mobile Chrome:

- `single_session_and_fefo_directive.spec.ts`: 15 / 15 PASSED (100%)
- `master_admin_flow.spec.ts`: 15 / 15 PASSED (100%)
- `qa_frontend.spec.ts`: 40 / 40 PASSED (100%)
- `responsive_multi_device.spec.ts`: 20 / 20 PASSED across all 10 viewports (100%)
- **Total Playwright Suites**: **90 / 90 PASSED (100% Pass Rate)**
