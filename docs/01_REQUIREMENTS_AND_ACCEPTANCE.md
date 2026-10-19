# KUVENTORY — Requirements, Business Rules & Traceability Matrix

```
Document:               docs/01_REQUIREMENTS_AND_ACCEPTANCE.md
Audience:               Technical Examiners, Software Architects, Quality Assurance Engineers, Business Analysts
Purpose:                Definitive catalog of functional requirements (FR), non-functional requirements (NFR),
                        business rules, acceptance criteria, and comprehensive code-to-test traceability matrix.
Verification Status:    Verified against repository source code, SQL migrations, and automated Vitest suites
Audit Date:             2026-10-19
Authoritative HEAD SHA: 135f10b807fedec368383c9e34895566da3d69fc
Primary References:     src/features/, supabase/migrations/, vitest test suites
```

---

## 1. Functional Requirements (FR)

### FR-01: Authentication & Single-Session Lease Management
* **Description:** The system must provide secure email/password authentication via Supabase GoTrue. Each authenticated account must be restricted to a single active device lease. If an account logs in from another terminal, all previous session leases must be invalidated.
* **Acceptance Criteria:**
  1. Login with valid credentials returns a signed JWT and user profile containing the assigned role (`USER`, `ADMIN`, or `SUPER_ADMIN`).
  2. Submitting an active session from a secondary device invokes `renew_session_lease` with a fresh `device_id`, causing the primary device's 30s heartbeat to fail and redirecting the user to `/login` with an informative banner.
  3. Session heartbeat fires every 30 seconds to maintain the active lease timestamp in `public.system_sessions`.

### FR-02: Inventory Catalog & Item Management
* **Description:** Authorized managers must be able to create, view, edit, archive, and delete inventory items, associating each item with a unit of measure, minimum threshold, station category, and preferred supplier.
* **Acceptance Criteria:**
  1. Items can be marked as archived (`is_archived = true`), removing them from active daily inventory selection while preserving historical movement ledgers.
  2. Direct item deletion is blocked if active stock batches or movement history exists, preventing broken foreign key relationships.
  3. Image URLs or Supabase storage paths are normalized and rendered with local fallback placeholders if the external asset fails to load.

### FR-03: Batch Receiving & Expiration Tracking
* **Description:** Receiving incoming inventory shipments must create distinct batch records (`stock_batches`) with an explicit expiration date, received date, and unit cost.
* **Acceptance Criteria:**
  1. A restock receipt must capture quantity and a mandatory expiration date.
  2. Batches with expiration dates in the past cannot be received.
  3. Receiving stock creates an audit movement record in `stock_movements` with `action_type = 'ADD'`.

### FR-04: Deterministic FEFO Stock Consumption
* **Description:** When inventory is consumed—either via manual deduction or shift finalization—the system must deduct stock from the earliest expiring batch that is not past its expiration date (First-Expired, First-Out).
* **Acceptance Criteria:**
  1. Stock deduction executes via the PostgreSQL stored procedure `consume_stock(p_item_id, p_quantity, p_reason)`.
  2. Batches are selected via `ORDER BY expiry_date ASC, created_at ASC FOR UPDATE`.
  3. Batches with `expiry_date < CURRENT_DATE` are excluded from consumption.
  4. If total available non-expired stock is less than the requested deduction, the transaction rolls back with an exception.

### FR-05: Non-Negative Stock Invariant
* **Description:** The system must never permit stock levels to become negative under any circumstance.
* **Acceptance Criteria:**
  1. If entered sales consumption exceeds available stock during daily worksheet editing, the ending stock must clamp to 0.
  2. Database check constraints and generated columns (`GREATEST(0, (beginning_stock + added_stock) - (am_usage + pm_usage))`) strictly enforce non-negative ending balances.
  3. Discrepancies between physical count and computed ending stock are flagged immediately for managerial review.

### FR-06: Daily Shift Inventory Worksheets
* **Description:** The system must manage daily inventory sheets organized by Philippine Standard Time business date (`Asia/Manila`, UTC+8). Staff must record morning (AM) usage, evening (PM) usage, and end-of-day physical counts.
* **Acceptance Criteria:**
  1. Navigating to `/daily-inventory` automatically opens or initializes a draft sheet for the current business date.
  2. Edits to row usage trigger debounced autosave (`UPSERT` on `daily_inventory_items`).
  3. Worksheet calculations dynamically update:
     $$\text{Total Stock} = \text{Beginning Stock} + \text{Added Stock}$$
     $$\text{Ending Stock} = \max\left(0, \text{Total Stock} - (\text{AM Usage} + \text{PM Usage})\right)$$
     $$\text{Discrepancy} = \text{Physical Count} - \text{Ending Stock}$$

### FR-07: Worksheet Finalization & Immutable Snapshots
* **Description:** Authorized managers must be able to finalize a draft worksheet, atomically deducting consumed quantities from physical batches and creating an immutable report snapshot.
* **Acceptance Criteria:**
  1. Finalization transitions sheet status from `DRAFT` to `FINALIZED`.
  2. For every item with positive consumption, `consume_stock` is executed in a single database transaction.
  3. An immutable JSON record is saved into `public.report_snapshots` containing the finalized item states.

### FR-08: Audited Post-Finalization Sheet Corrections
* **Description:** Staff and managers must be able to submit audited corrections to finalized worksheets to rectify inadvertent shift counting errors.
* **Acceptance Criteria:**
  1. A correction requires a mandatory explanation string (minimum 5 characters).
  2. Submitting a correction calculates the delta between new and old usage. If delta is positive, additional stock is deducted via FEFO; if delta is negative, stock is restored.
  3. A new record is inserted into `public.daily_inventory_revisions` storing the actor ID, reason, and complete pre/post state JSON.
  4. The worksheet's `revision_number` increments by 1.

### FR-09: Realtime Operational Notifications
* **Description:** The system must notify staff of critical inventory conditions: low stock, out of stock, expiring batches, and expired batches.
* **Acceptance Criteria:**
  1. Database triggers on `stock_batches` and `inventory_items` insert alerts into `public.notifications` using unique deduplication keys (`LOW_STOCK_<id>`, `EXPIRED_<id>`).
  2. Notifications are pushed to all connected client browsers in real time via Supabase Realtime WebSocket change streams.
  3. Clicking a notification redirects the user directly to the affected item or batch modal.

### FR-10: Reports Library & Client-Side File Exports
* **Description:** The system must provide multi-tab reporting (Daily Summary, Catalog Valuation, Movement Ledger, Low Stock, Expiry Schedule, Archived Items) with export capabilities to PDF, XLSX, and CSV.
* **Acceptance Criteria:**
  1. PDF generation uses `jsPDF` and `jspdf-autotable`, rendering clean multi-page tabular reports with company branding.
  2. Excel workbooks are compiled client-side via `exceljs`.
  3. CSV exports include sanitization against CSV formula injection (prepending `'` to fields beginning with `=`, `+`, `-`, `@`, `\t`, or `\r`).

### FR-11: Interactive Analytics & Visualizations
* **Description:** The application must present interactive visual analytics to assist management in inventory planning and velocity tracking.
* **Acceptance Criteria:**
  1. Category Stock Distribution rendered via Recharts Donut (`PieChart` / `Pie`).
  2. Weekly Movements Velocity rendered via Recharts Grouped Bar (`BarChart` / `Bar`), plotting Stock In (`ADD`) versus Stock Out (`REMOVE`) across the trailing 7 days.
  3. Live keepalive ping roundtrip latency rendered via Recharts Area Chart (`AreaChart` / `Area`) across 24h, 7d, and 30d timeframes.

### FR-12: Super Admin Operations Console
* **Description:** A dedicated operations console (`/super-admin`) must provide system administrators with centralized controls across 10 functional domains.
* **Acceptance Criteria:**
  1. Console Overview: Live system health status, latency area chart, and verified deployment history.
  2. Audit Logs: Searchable, paginated trail of all administrative and inventory mutations.
  3. Security & Access: Active session lease inspection, manual lease termination, and emergency maintenance lockdown toggle.
  4. Incident Center: Incident logging, severity categorization (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), and status progression (`OPEN`, `INVESTIGATING`, `RESOLVED`).
  5. System Settings: System-wide retention window and stock threshold defaults.
  6. Storage & Assets: Supabase storage bucket health and image link verification.
  7. Database Health: Database drift analysis and RPC signature verification.
  8. Telemetry & Logs: Keepalive ping measurements and error rate indicators.
  9. Recovery & Backup: Manual recovery point checkpoint creation and app-level JSON export.
  10. Deployments: Read-only verified commit log and release verification checklists.

### FR-13: Emergency Maintenance Mode Lockdown
* **Description:** When maintenance mode is activated by a Super Admin, all standard users (`USER`, `ADMIN`) must be blocked from accessing protected routes and presented with an emergency maintenance screen.
* **Acceptance Criteria:**
  1. Maintenance mode state is stored in `public.system_settings` under the key `maintenance_mode`.
  2. Realtime change stream pushes maintenance state changes to all connected clients immediately.
  3. `RequireAuth` renders `EmergencyMaintenanceScreen` for all roles except `SUPER_ADMIN`.

---

## 2. Non-Functional Requirements (NFR)

| ID | Category | Requirement Specification | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **NFR-01** | **Performance** | Initial page load under 1.5 seconds on 4G connections; client-side route transitions under 100ms. Code-splitting of heavy export engines (`vendor-export`) and charting libraries (`vendor-charts`). | Vite bundle analyzer, chunk splitting in `vite.config.ts`, production build passing in 3.3s. |
| **NFR-02** | **Data Integrity** | Zero data corruption or negative inventory balances under concurrent multi-user load. Guaranteed ACID transactions for stock mutations. | PostgreSQL row-level locks (`FOR UPDATE`), unit test `concurrencyAndLocking.test.ts`. |
| **NFR-03** | **Security & RLS** | Zero-trust database authorization: public anonymous access strictly denied for all core tables. RLS enabled on all 18 tables with `SECURITY DEFINER` RPC validation. | Migration `20260908210000_database_hardening_and_security.sql`, Supabase linter clean. |
| **NFR-04** | **Timezone Strictness** | All business date computations and sheet groupings must resolve to `Asia/Manila` (PST, UTC+8) regardless of browser or server host timezone. | `src/lib/businessDate.ts`, 5 unit tests in `src/__tests__/businessDate.test.ts`. |
| **NFR-05** | **Responsive Design** | Full layout adaptability across mobile phones (375px+), station tablets (768px - 1024px), and desktop management workstations (1280px+). Minimum touch target size of 44x44px. | Tailwind responsive classes, Playwright suite `responsive_multi_device.spec.ts`. |
| **NFR-06** | **Realtime Latency** | WebSocket change events broadcast and processed within 100ms under standard network conditions. | Supabase Realtime channel multiplexing, `useRealtimeSync.ts`. |
| **NFR-07** | **CSV Injection Safety** | Exported CSV files must neutralize formula injection attacks (`=`, `+`, `-`, `@`, `\t`, `\r`) by prepending a single quote `'`. | `src/features/reports/utils/csv.ts`, unit test `src/__tests__/csvSecurity.test.ts`. |
| **NFR-08** | **Session Hygiene** | Automatic heartbeat every 30 seconds; stale leases older than 2 minutes expired automatically by database cleanup functions. | `src/features/auth/context/AuthContext.tsx`, migration `20261004220000`. |
| **NFR-09** | **Accessibility** | Semantic HTML5 structure, explicit `aria-label` tags on icon buttons, keyboard navigable modals, and high-contrast color ratios complying with WCAG AA. | Oxlint accessibility checks, Playwright accessibility audits. |
| **NFR-10** | **Build & Deploy Hygiene** | Automated CI pipeline executing linting (`oxlint`), strict TypeScript typechecking (`tsc --noEmit`), unit tests (`vitest run`), and production compilation on every commit. | [.github/workflows/ci.yml](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/.github/workflows/ci.yml). |

---

## 3. Comprehensive Traceability Matrix

The following matrix maps every functional requirement directly to its implementation files, database objects, automated verification tests, and current verification status:

| Req ID | Requirement Summary | Implementation Source | Database Objects / Migrations | Automated Test / Verification Evidence | Current Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-01** | Auth & Session Leases | [AuthContext.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/auth/context/AuthContext.tsx), [sessionLeaseService.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/auth/services/sessionLeaseService.ts) | `public.system_sessions`, RPC `renew_session_lease`<br/>(20261004220000) | `src/features/auth/__tests__/authValidation.test.ts` | **Verified in current source & tests** |
| **FR-02** | Catalog & Items | [ItemsCatalogPage.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/inventory/pages/ItemsCatalogPage.tsx), [ItemModal.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/inventory/components/ItemModal.tsx) | `public.inventory_items`, `public.categories`<br/>(20260902050213) | `src/features/inventory/__tests__/imageNormalization.test.ts` | **Verified in current source & tests** |
| **FR-03** | Batch Receiving & Expiry | [StockUpdateModal.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/inventory/components/StockUpdateModal.tsx), [api/index.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/inventory/api/index.ts) | `public.stock_batches`, `public.stock_movements`<br/>(20260902060000) | `src/features/inventory/__tests__/batchFilterAndFefoQueue.test.ts` | **Verified in current source & tests** |
| **FR-04** | FEFO Consumption | [api/index.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/inventory/api/index.ts#L130), [calculations.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/daily-inventory/utils/calculations.ts) | RPC `consume_stock` with `FOR UPDATE`<br/>(20261003180000) | `src/features/inventory/__tests__/fefoPriority.test.ts` | **Verified in current source & tests** |
| **FR-05** | Non-Negative Stock | [calculations.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/daily-inventory/utils/calculations.ts), [InventoryRow.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/daily-inventory/components/InventoryRow.tsx) | Generated column `ending_stock`, check constraints<br/>(20260902070000) | `src/features/inventory/__tests__/concurrencyAndLocking.test.ts` | **Verified in current source & tests** |
| **FR-06** | Daily Worksheets | [DailyInventoryPage.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/daily-inventory/pages/DailyInventoryPage.tsx), [InventorySheet.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/daily-inventory/components/InventorySheet.tsx) | `public.daily_inventory_sheets`, `daily_inventory_items`<br/>(20260902070000) | `src/features/daily-inventory/__tests__/dailyInventoryIntegration.test.ts` | **Verified in current source & tests** |
| **FR-07** | Sheet Finalize & Snapshots | [api/index.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/daily-inventory/api/index.ts#L220) | RPC `finalize_daily_inventory_sheet`, `report_snapshots`<br/>(20260902094917) | `src/features/daily-inventory/__tests__/inventoryCalculations.test.ts` | **Verified in current source & tests** |
| **FR-08** | Finalized Corrections | [DailyCorrectionModal.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/daily-inventory/components/DailyCorrectionModal.tsx) | RPC `apply_daily_sheet_correction`, `daily_inventory_revisions`<br/>(20261018110000) | `e2e/critical_workflow_repairs.spec.ts` | **Verified in current source & tests** |
| **FR-09** | Notifications | [NotificationCenter.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/inventory/pages/NotificationCenter.tsx), [NotificationPopup.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/inventory/components/NotificationPopup.tsx) | `public.notifications`, triggers `trg_inventory_thresholds`<br/>(20260902090100) | `src/features/inventory/__tests__/notificationRouter.test.ts` | **Verified in current source & tests** |
| **FR-10** | Reports & Exports | [ReportsLibraryPage.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/reports/pages/ReportsLibraryPage.tsx), [pdf.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/reports/utils/pdf.ts), [csv.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/reports/utils/csv.ts) | `public.report_snapshots`, PostgREST views<br/>(20260904000000) | `src/__tests__/csvSecurity.test.ts` | **Verified in current source & tests** |
| **FR-11** | Analytics & Charts | [AnalyticsPage.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/reports/pages/AnalyticsPage.tsx), [SuperOverviewTab.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/admin/components/super/SuperOverviewTab.tsx) | Recharts components (Pie, Bar, Area), live query aggregation | `src/features/reports/__tests__/reportsGroupingIntegration.test.ts` | **Verified in current source & tests** |
| **FR-12** | Super Admin Console | [SuperAdminPage.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/admin/pages/SuperAdminPage.tsx), [superAdminService.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/admin/services/superAdminService.ts) | 10 Super Admin tables, audit triggers<br/>(20261018180000) | `src/features/admin/__tests__/superAdminOperationsConsole.test.ts` (19 tests) | **Verified in current source & tests** |
| **FR-13** | Maintenance Lockdown | [RequireAuth.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/auth/components/RequireAuth.tsx#L23), [useMaintenanceStatus.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/auth/hooks/useMaintenanceStatus.ts) | `public.system_settings` key `maintenance_mode`<br/>(20261018110000) | `src/features/admin/__tests__/superAdminOperationsConsole.test.ts` | **Verified in current source & tests** |
| **NFR-04** | Timezone Isolation | [businessDate.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/lib/businessDate.ts) | `Asia/Manila` standard formatting | `src/__tests__/businessDate.test.ts` (5 tests) | **Verified in current source & tests** |
| **NFR-07** | CSV Formula Injection | [csv.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/reports/utils/csv.ts) | Sanitization prepending `'` to special chars | `src/__tests__/csvSecurity.test.ts` (3 tests) | **Verified in current source & tests** |
