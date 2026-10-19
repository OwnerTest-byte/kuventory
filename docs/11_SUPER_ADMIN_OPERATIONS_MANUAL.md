# KUVENTORY — Super Admin Operations Console Runbook

```
Document:               docs/11_SUPER_ADMIN_OPERATIONS_MANUAL.md
Audience:               Business Owners, System Administrators, DevOps Engineers, Technical Evaluators
Purpose:                Standard operating procedures, input specifications, backend execution paths,
                        audit trails, and safety limitations across all 10 Super Admin Control Center tabs.
Verification Status:    Verified against src/features/admin/pages/SuperAdminPage.tsx and 10 tab components
Audit Date:             2026-10-19
Authoritative HEAD SHA: 135f10b807fedec368383c9e34895566da3d69fc
Primary References:     src/features/admin/components/super/*.tsx, superAdminService.ts
```

---

## 1. Operations Console Navigation & Access Control

The Super Admin Operations Console is hosted at `/super-admin`. Access is strictly restricted by the route guard [RequireSuperAdmin](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/auth/components/RequireAuth.tsx#L61-L89), which permits only accounts with `role IN ('SUPER_ADMIN', 'MASTER_ADMIN')`. The link is hidden from standard staff and managers in the navigation sidebar.

```mermaid
flowchart TD
    SuperAdminEntry["Super Admin Enters /super-admin"] --> Hub["Operations Console Hub"]
    Hub --> Tab1["1. Console Overview"]
    Hub --> Tab2["2. Audit Logs"]
    Hub --> Tab3["3. Security & Access"]
    Hub --> Tab4["4. Incident Center"]
    Hub --> Tab5["5. System Settings"]
    Hub --> Tab6["6. Storage & Assets"]
    Hub --> Tab7["7. Database Health"]
    Hub --> Tab8["8. Telemetry & Logs"]
    Hub --> Tab9["9. Recovery & Backup"]
    Hub --> Tab10["10. Deployments"]
```

*(See full source diagram: [docs/diagrams/super_admin_operations_flow.mmd](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/diagrams/super_admin_operations_flow.mmd))*

---

## 2. Comprehensive 10-Tab Operations Catalog

### Tab 1: Console Overview (`SuperOverviewTab.tsx`)
* **Purpose:** High-level dashboard presenting live system health, ping latency area chart, verified recent deployments, and latest recovery checkpoints.
* **Key Metrics Displayed:** Application Status (`Healthy` / `Degraded`), Active Sessions count, PostgreSQL Ping Latency, Storage Gateway state, Active Schedulers count.
* **Latency Chart:** SVG Area Chart plotting measured round-trip response times across 24h, 7d, and 30d timeframes.
* **Backend Path:** Aggregates via `getSystemTelemetry()` and queries `public.recovery_points`.
* **Verification Status:** **Verified in current source**.

### Tab 2: Audit Logs (`SuperAuditLogsTab.tsx`)
* **Purpose:** Searchable, filterable audit ledger of all security, administrative, and inventory operations.
* **Inputs & Filters:** Text search (filters by action, actor, or entity), date range filter, action type selector (`AUTH`, `INVENTORY`, `SECURITY`, `SYSTEM`).
* **Table Columns:** Timestamp (PHT), Actor ID / Name, Action Name, Entity Target, Status Badge (`SUCCESS` / `FAILED`), JSON Metadata Inspect modal.
* **Backend Path:** Direct PostgREST query on `public.audit_logs` ordered by `created_at DESC`.
* **Immutability:** `UPDATE` and `DELETE` on `audit_logs` are disabled by PostgreSQL RLS.
* **Verification Status:** **Verified in current source**.

### Tab 3: Security & Access (`SuperSecurityTab.tsx`)
* **Purpose:** Centralized session governance and emergency maintenance lockdown control.
* **Operational Controls:**
  1. **Emergency Maintenance Lockdown Toggle:**
     * *Inputs:* Toggle switch with mandatory confirmation prompt.
     * *Effect:* Sets `maintenance_mode = 'true'` in `public.system_settings`. Immediately locks out all `USER` and `ADMIN` accounts to `EmergencyMaintenanceScreen`.
     * *Audit:* Inserts record into `public.audit_logs`.
  2. **Active Device Session Terminate:**
     * *Inputs:* Click "Revoke Session" on any active device row in `public.system_sessions`.
     * *Effect:* Deletes the target session row. On the affected device's next 30s heartbeat, the client receives `{ valid: false }` and immediately ejects to `/login`.
* **Verification Status:** **Verified in current source**.

### Tab 4: Incident Center (`SuperIncidentTab.tsx`)
* **Purpose:** Records and tracks unexpected operational outages, stock discrepancies, and infrastructure incidents.
* **Inputs:** "Log Incident" button opens modal requiring Title, Severity (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), Affected Subsystem (`DATABASE`, `STORAGE`, `AUTH`, `NETWORK`), and Root Cause Description.
* **Lifecycle:** Incidents transition across `OPEN` $\rightarrow$ `INVESTIGATING` $\rightarrow$ `RESOLVED`.
* **Backend Path:** CRUD on `public.system_incidents`.
* **Verification Status:** **Verified in current source**.

### Tab 5: System Settings (`SuperSettingsTab.tsx`)
* **Purpose:** Configures global operational thresholds, retention periods, and restaurant parameters.
* **Settings Controlled:**
  * `backup_retention_days`: Retention period for database dumps (default: `30`).
  * `low_stock_default_threshold`: Default reorder threshold for newly created catalog items.
  * `session_lease_timeout_minutes`: Inactivity window before abandoned leases expire (default: `2`).
  * `business_timezone`: Standard operating timezone (locked to `Asia/Manila`).
* **Backend Path:** `UPSERT` on `public.system_settings`.
* **Verification Status:** **Verified in current source**.

### Tab 6: Storage & Assets (`SuperStorageTab.tsx`)
* **Purpose:** Inspects Supabase Object Storage bucket health, item photo asset delivery, and broken link diagnostics.
* **Controls:**
  * "Run Asset Health Check": Probes image URLs stored in `inventory_items.image_path`, reporting missing, unresolvable, or oversized image files.
* **Backend Path:** Supabase Storage API (`supabase.storage.from('item-images')`).
* **Verification Status:** **Verified in current source**.

### Tab 7: Database Health (`SuperDatabaseTab.tsx`)
* **Purpose:** Analyzes database synchronization, verifies foreign key integrity, and detects drift between physical batches and catalog item quantities.
* **Controls:**
  1. **"Run Stock Drift Analysis":** Invokes RPC `execute_inventory_drift_analysis` to compare `SUM(stock_batches.quantity)` against `inventory_items.current_qty`.
  2. **"Preview Repairs":** Generates an in-memory diff of items requiring synchronization without committing changes.
  3. **"Apply Repairs":** Atomically reconciles catalog quantities to match verified batch totals, logging the repair in `audit_logs`.
* **Verification Status:** **Verified in current source & tests**.

### Tab 8: Telemetry & Logs (`SuperTelemetryTab.tsx`)
* **Purpose:** Real-time observability dashboard displaying database ping latency, API error counts, and server status.
* **Audited Ground Truth:** Realtime roundtrip ping is measured every 10 seconds via PostgREST `select=key&limit=1`. Fallback values default to `0 / 'Unavailable'` when disconnected.
* **Verification Status:** **Verified in current source**.

### Tab 9: Recovery & Backup (`SuperRecoveryTab.tsx`)
* **Purpose:** Manages system recovery checkpoints and app-level data exports.
* **Operational Controls:**
  1. **"Create Recovery Checkpoint":**
     * *Inputs:* Checkpoint Name and Scope (`FULL_SYSTEM`, `INVENTORY_ONLY`, `DAILY_SHEETS`).
     * *Effect:* Inserts a verified metadata manifest record into `public.recovery_points` with a unique point code (e.g., `CP-20261019-XXXX`).
  2. **"Export System Data (JSON)":**
     * *Effect:* Generates a downloadable client-side JSON export of all core tables.
  3. **"Restore from Checkpoint" (Safety Status):**
     * *Status:* **Held in safe disabled mode**. Browser-side multi-table insertion lacks transactional guarantees. Production database restores must be executed via Supabase Point-in-Time Recovery (PITR) or `pg_dump` SQL restores.
* **Verification Status:** **Verified in current source**.

### Tab 10: Deployments & Releases (`SuperDeploymentsTab.tsx`)
* **Purpose:** Displays verified production deployment commit history and operational release verification checklists.
* **Operational Controls:**
  * Inspects deployed commit SHAs, release version tags, and verification statuses.
  * *Safety Notice on Rollbacks:* Client-side triggers for Netlify build hooks have been deprecated to prevent unauthorized deployments from compromised browser sessions. Rollback procedures provide safe guidance commands for Git and Netlify CLI.
* **Verification Status:** **Verified in current source**.
