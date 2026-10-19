# KUVENTORY — Features & Module Catalog

```text
Document:               docs/04_FEATURES_AND_MODULE_CATALOG.md
Audience:               Technical Examiners, Software Architects, Operations Managers, Quality Assurance
Purpose:                Exhaustive inventory of every user-visible screen, sub-module, route path,
                        permission gate, core operations, data sources, and verified implementation status.
Verification Status:    Verified against src/app/App.tsx, router configuration, and component code
Audit Date:             2026-10-19
Authoritative HEAD SHA: 135f10b807fedec368383c9e34895566da3d69fc
Primary References:     src/app/App.tsx, src/features/, src/components/layout/Sidebar.tsx
```

---

## 1. Complete Route & Permission Matrix

The table below catalogs every route path defined in [src/app/App.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/app/App.tsx), its associated component, route protection gate, required user roles, and implementation status:

| Route Path | Component Symbol | Route Guard Gate | Allowed Roles | Navigation Visibility | Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/login` | `LoginPage` | Public (Unauthenticated) | All / Public | None (Direct URL) | **Verified in current source** |
| `/reset-password` | `ResetPasswordPage` | Public (Unauthenticated) | All / Public | None (Direct URL / Link) | **Verified in current source** |
| `/inventory` | `InventoryLandingPage` | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Top Bar / Sidebar ("Dashboard") | **Verified in current source** |
| `/daily-inventory` | `DailyInventoryPage` | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Sidebar ("Daily Inventory") | **Verified in current source** |
| `/items` | `ItemsCatalogPage` | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Sidebar ("Items") | **Verified in current source** |
| `/items/:id` | `ItemDetailsPage` | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Item Click from Catalog | **Verified in current source** |
| `/categories` | *Redirect to `/items?tab=categories`* | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Direct Route Alias | **Verified in current source** |
| `/stock` | *Redirect to `/items?tab=batches`* | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Direct Route Alias | **Verified in current source** |
| `/history` | *Redirect to `/items?tab=history`* | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Direct Route Alias | **Verified in current source** |
| `/reports` | `ReportsLibraryPage` | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Sidebar ("Reports") | **Verified in current source** |
| `/reports/:id` | `ReportViewPage` | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Report Snapshot Click | **Verified in current source** |
| `/reports/inventory` | `ReportsLibraryPage` | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Reports Tab Link | **Verified in current source** |
| `/reports/movement` | `ReportsLibraryPage` | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Reports Tab Link | **Verified in current source** |
| `/reports/low-stock` | `ReportsLibraryPage` | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Reports Tab Link | **Verified in current source** |
| `/reports/expiry` | `ReportsLibraryPage` | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Reports Tab Link | **Verified in current source** |
| `/reports/archived` | `ReportsLibraryPage` | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Reports Tab Link | **Verified in current source** |
| `/notifications` | `NotificationCenter` | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Header Bell Popover / Full Page | **Verified in current source** |
| `/notification-center` | `NotificationCenter` | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Route Alias | **Verified in current source** |
| `/analytics` | `AnalyticsPage` | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Reports Sub-Tab | **Verified in current source** |
| `/settings` | `AdminPage` | `RequireAuth` | `USER`, `ADMIN`, `SUPER_ADMIN` | Header Avatar Menu | **Verified in current source** |
| `/admin` | `AdminPage` | `RequireAuth` | `ADMIN`, `SUPER_ADMIN` (Adaptive UI) | Sidebar ("Admin") | **Verified in current source** |
| `/super-admin` | `SuperAdminPage` | `RequireSuperAdmin` | `SUPER_ADMIN`, `MASTER_ADMIN` | Sidebar ("Super Admin", hidden from others) | **Verified in current source** |

---

## 2. Feature & Module Breakdown

### 2.1 Authentication & Session Management Module

* **Directory:** `src/features/auth/`
* **Purpose:** Manages user identity verification, single-session device leases, password resets, and emergency maintenance lockouts.
* **Key Components:**
  * `LoginPage.tsx`: High-contrast form with email/password validation, show/hide password toggle, and error banner.
  * `ResetPasswordPage.tsx`: Password recovery submission via Supabase Auth email recovery tokens.
  * `RequireAuth.tsx`: Root route guard ensuring authenticated session; gates access when maintenance lockdown is active.
  * `RequireSuperAdmin.tsx`: Restricts `/super-admin` strictly to `SUPER_ADMIN` and `MASTER_ADMIN` roles.
  * `AuthContext.tsx`: Manages active user session, user profile, and executes the 30-second heartbeat calling `renew_session_lease`.
* **Database Objects:** `public.profiles`, `public.system_sessions`, RPC `renew_session_lease`.
* **Implementation Status:** Verified in current source and test suite.

### 2.2 Inventory Catalog & Item Management Module

* **Directory:** `src/features/inventory/`
* **Purpose:** Complete master catalog management for bistro raw materials, packaging, and supplies.
* **Key Components:**
  * `ItemsCatalogPage.tsx`: Searchable catalog with station category filter pills (Bar, Kitchen, Packaging, Other Supplies), stock level badges (`Adequate`, `Low Stock`, `Out of Stock`), and sort controls.
  * `ItemDetailsPage.tsx`: Detailed item breakdown displaying active batches, expiration dates, unit costs, and movement ledger.
  * `ItemModal.tsx`: Creation and editing modal for item metadata, unit of measure, minimum threshold, station, and photo uploads.
  * `StockUpdateModal.tsx`: Receiving restock shipments; captures quantity, received date, and mandatory expiration date.
* **Database Objects:** `public.inventory_items`, `public.categories`, `public.stock_batches`, `public.stock_movements`.
* **Implementation Status:** Verified in current source and test suite.

### 2.3 Daily Shift Inventory & Worksheet Engine

* **Directory:** `src/features/daily-inventory/`
* **Purpose:** Core operational daily worksheet for shift handovers, usage calculation, draft autosave, and shift finalization.
* **Key Components:**
  * `DailyInventoryPage.tsx`: Date picker restricted to Philippine business date (`Asia/Manila`), status header (`DRAFT` / `FINALIZED`), and finalize action button.
  * `InventorySheet.tsx`: Station-grouped tables (Coffee Bar, Kitchen, Pastry, etc.) with aggregate station totals.
  * `InventoryRow.tsx`: Real-time calculation row evaluating beginning stock, additions, AM usage, PM usage, ending stock, physical count, and discrepancy with debounced autosaving.
  * `DailyCorrectionModal.tsx`: Audited correction workflow for finalized worksheets; records delta adjustments, updates stock ledgers via FEFO, and logs revisions.
* **Database Objects:** `public.daily_inventory_sheets`, `public.daily_inventory_items`, `public.daily_inventory_revisions`, RPC `finalize_daily_inventory_sheet`, RPC `apply_daily_sheet_correction`.
* **Implementation Status:** Verified in current source and test suite.

### 2.4 Reports, Analytics & Export Hub

* **Directory:** `src/features/reports/`
* **Purpose:** Multi-dimensional reporting, immutable snapshot archiving, visual analytics, and client-side document exports.
* **Key Components:**
  * `ReportsLibraryPage.tsx`: Tabbed reports hub (Daily Summaries, Catalog Valuation, Movement Ledger, Low Stock, Expiry Schedule, Archived Items).
  * `ReportViewPage.tsx`: Displays frozen immutable historical report snapshots with revision history badges.
  * `AnalyticsPage.tsx`: Visual analytics dashboard containing Recharts Donut (Category Stock Distribution), Grouped Bar (Weekly Movements Velocity), and operational top 3 decision cards (Most Stocked, Lowest Stock, Outflow).
  * `pdf.ts` & `xlsx.ts` & `csv.ts`: Client-side compilers generating styled PDF documents, Excel spreadsheets, and injection-sanitized CSV files.
* **Database Objects:** `public.report_snapshots`, PostgREST views `v_inventory_summary`, `v_active_batches`.
* **Implementation Status:** Verified in current source and test suite.

### 2.5 Realtime Notification & Event Center

* **Directory:** `src/features/inventory/components/NotificationPopup.tsx`, `src/features/inventory/pages/NotificationCenter.tsx`
* **Purpose:** Instant delivery of operational warnings to all connected staff terminals.
* **Key Components:**
  * `NotificationPopup.tsx`: Popover menu in the global header displaying unread alerts with category icons and direct click-through links.
  * `NotificationCenter.tsx`: Dedicated page displaying full notification history with read/unread filtering.
  * Database triggers automatically populate alerts for:
    * `LOW_STOCK`: Current quantity falls below item minimum threshold.
    * `OUT_OF_STOCK`: Current quantity reaches zero.
    * `EXPIRING_SOON`: Active batch within 30 days of expiration.
    * `EXPIRED`: Active batch has passed its expiration date.
* **Database Objects:** `public.notifications`, trigger `trg_inventory_thresholds`.
* **Implementation Status:** Verified in current source and test suite.

### 2.6 Manager Administration Module

* **Directory:** `src/features/admin/pages/AdminPage.tsx`
* **Purpose:** Store supervisor tools for user account creation, password resets, supplier records, and restaurant settings.
* **Key Components:**
  * User Management Tab: Lists branch staff; allows managers to create new user accounts and trigger password reset links.
  * Categories & Stations Tab: Creates and renames preparation stations and category tags.
  * Suppliers Directory Tab: Manages vendor contacts, phone numbers, and lead times.
  * Restaurant Info Tab: Updates operating hours, receipt details, and notification thresholds.
* **Database Objects:** `public.profiles`, `public.suppliers`, `public.categories`, `public.system_settings`.
* **Implementation Status:** Verified in current source and test suite.

### 2.7 Super Admin Operations Console Module

* **Directory:** `src/features/admin/pages/SuperAdminPage.tsx`, `src/features/admin/components/super/`
* **Purpose:** Centralized, standalone governance console providing system administrators with 10 operational management domains.
* **Sub-Tabs Inventory:**
  1. **Console Overview (`SuperOverviewTab.tsx`):** System health badge, latency area chart, verified recent deployments, and quick actions.
  2. **Audit Logs (`SuperAuditLogsTab.tsx`):** Searchable, paginated trail of all security and inventory events.
  3. **Security & Access (`SuperSecurityTab.tsx`):** Active device sessions, manual lease revocation, and emergency maintenance lockdown toggle.
  4. **Incident Center (`SuperIncidentTab.tsx`):** Incident logging, severity tags, and resolution workflows.
  5. **System Settings (`SuperSettingsTab.tsx`):** System-wide retention window and stock threshold defaults.
  6. **Storage & Assets (`SuperStorageTab.tsx`):** Supabase storage bucket health and image link verification.
  7. **Database Health (`SuperDatabaseTab.tsx`):** Drift analysis diagnostics, sync preview, and RPC signature verification.
  8. **Telemetry & Logs (`SuperTelemetryTab.tsx`):** Keepalive ping measurements and error rate indicators.
  9. **Recovery & Backup (`SuperRecoveryTab.tsx`):** Manual recovery point checkpoint creation and app-level JSON export.
  10. **Deployments (`SuperDeploymentsTab.tsx`):** Read-only verified commit log and release verification checklists.
* **Database Objects:** `public.audit_logs`, `public.system_sessions`, `public.system_incidents`, `public.system_settings`, `public.recovery_points`, `public.system_deployments`.
* **Implementation Status:** Verified in current source and 19 unit tests in `superAdminOperationsConsole.test.ts`.
