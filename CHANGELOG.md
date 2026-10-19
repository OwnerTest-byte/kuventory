# KUVENTORY — System Changelog & Version Evolution

```text
Document:               CHANGELOG.md
Purpose:                Authoritative release and engineering phase chronology derived strictly from Git commit history.
Verification Status:    Verified against repository git log --reverse (105 commits)
Authoritative HEAD SHA: 135f10b807fedec368383c9e34895566da3d69fc
Last Audit Date:        2026-10-19
```

All entries below correspond to verified commits and milestones in the repository's Git history on branch `main`.

---

## [Phase 8] — Operations Console Conversion & Fail-Closed Security Hardening

**Date Range:** 2026-10-18 to 2026-10-19
**Primary Commits:** `4d71bb0` through `135f10b` (Authoritative HEAD)

* **fix(security):** Applied comprehensive main-branch audit safety guards and fail-closed integrity rules (`135f10b`):
  * Purged simulated fallback telemetry in `superAdminService.ts`, ensuring disconnected systems report `0 / 'Unavailable'` rather than misleading healthy metrics.
  * Placed browser-side multi-table restore in a safe disabled mode pending an atomic backend RPC.
  * Deprecated client-side Netlify build hook trigger in favor of safe read-only guidance commands.
  * Enforced strict non-negative quantity assertions during post-finalization sheet correction submissions.
  * Hardened single-session lease verification to fail closed if verification RPC fails.
* **feat(admin):** Converted Super Admin Control Center into an interactive, 10-tab operations console (`4d71bb0`): Overview, Audit Logs, Security & Access, Incident Center, System Settings, Storage & Assets, Database Health, Telemetry & Logs, Recovery & Backup, and Deployments.
* **feat(reliability):** Implemented atomic database repairs, live keepalive ping telemetry, and 19 automated unit tests for Super Admin services (`cae5ec1`).

---

## [Phase 7] — Super Admin Role Migration & Finalized Sheet Revisions

**Date Range:** 2026-10-17 to 2026-10-18
**Primary Commits:** `920bb59` through `36d1c8e`

* **fix(daily-inventory):** Resolved correction mode row edit save failures and fixed revision number incrementation across frontend, backend, and database (`36d1c8e`).
* **feat(daily-inventory):** Empowered staff and user roles to correct finalized daily shift worksheets with audited revision history and delta stock calculations (`e782039`).
* **feat(security):** Implemented emergency maintenance mode lockdown, password reset logging, and standalone super admin route (`88ab9ad`).
* **feat(admin):** Standardized administrative naming from "Master Admin" to "Super Admin" across all database tables, functions, and UI screens (`920bb59`, `ba5946e`, `573948d`).
* **feat(storage):** Implemented 30-day archival policy and resilient image link error handling.

---

## [Phase 6] — Realtime Synchronization, Non-Negative Stock & Concurrency Controls

**Date Range:** 2026-10-10 to 2026-10-11
**Primary Commits:** `29ad5c4` through `579932e`

* **fix(notifications):** Purged synthetic mock alerts from database and enabled direct 1-click navigation from alerts to referring items and batches (`579932e`).
* **feat(inventory):** Enforced strict non-negative stock invariant; auto-zeroed deficit sales and flagged discrepancies (`4d38c45`).
* **feat(sync):** Implemented comprehensive 8-domain real-time synchronization via Supabase Realtime WebSockets (`44a6c44`).
* **feat(sync):** Established 2-way live synchronization between Daily Inventory worksheets and Catalog with FEFO deduction (`a16daaa`).
* **fix(styles):** Polished component class utilities and ref lifecycles for React 19 compliance (`268069a`).

---

## [Phase 5] — Master Admin Architecture & Single-Session Lease Engine

**Date Range:** 2026-10-03 to 2026-10-05
**Primary Commits:** `756f828` through `eae5ec2`

* **feat(directive):** Implemented single-session lease engine with 30-second heartbeat in `public.system_sessions` to prevent concurrent account sharing (`05900e0`).
* **feat(security):** Enforced database quota of maximum 1 Master Admin and 3 Admins in database triggers and RPCs (`0545690`).
* **feat(master-admin):** Modularized 10 control center sub-tabs and implemented disaster recovery save-state checkpoints (`eb51512`, `754468d`).
* **fix(connectivity):** Harmonized all frontend API queries, table schemas, and RPC endpoints with Supabase PostgreSQL (`3f48aa7`).
* **docs:** Consolidated system specifications and architecture into unified `DEV_LOGS.docx` compilation script (`b928b54`).

---

## [Phase 4] — UX Laws, CI Test Automation & Supabase Keepalive

**Date Range:** 2026-09-12 to 2026-09-27
**Primary Commits:** `33a9456` through `2b036f5`

* **fix(qa):** Resolved WCAG accessibility findings, 44x44px touch targets, LCP image optimization, and COEP headers (`e08744e`, `3ab1a31`).
* **feat(qa-production):** Added automated Vitest and Playwright test suites, resolved sticky table hover bugs, and enforced security headers (`5f086ee`).
* **fix(security):** Converted public database views to `security_invoker = true` to remediate Supabase linter warning (`f8f9638`).
* **feat(automation):** Implemented Supabase inactivity keepalive workflow on GitHub Actions (`0 0 */2 * *`) to prevent 7-day project pausing (`33a9456`).
* **feat(ui):** Implemented fluid responsive header layout for mobile, tablet, and desktop viewports (`73d6dc2`).

---

## [Phase 3] — Inventory Engine Hardening, Autosave & FEFO Priority

**Date Range:** 2026-09-06 to 2026-09-09
**Primary Commits:** `7f1cd7e` through `a027dd6`

* **feat(database):** Full database hardening, immutable stock ledger, and frontend role boundaries (`18255c0`).
* **feat(inventory):** Consolidated FEFO priority sorting engine and supplier management modal (`ffaec3b`).
* **feat(daily-inventory):** Implemented real-time daily inventory debounced autosave (`7f1cd7e`).
* **feat(assets):** Added product image upload support to Supabase Storage with local fallbacks (`606b6cb`).

---

## [Phase 2] — Database Reconstruction & Full-Stack Supabase Integration

**Date Range:** 2026-09-04 to 2026-09-05
**Primary Commits:** `a898737` through `1b89c7d`

* **feat(backend):** Added `public.system_settings`, suppliers directory, and multi-layer audit tracking (`1b89c7d`).
* **fix(database):** Eliminated null fields, backfilled descriptions, and hardened views against missing columns (`e6349eb`).
* **fix(backend):** Fixed finalize inventory consumption RPC and prevented notification trigger errors on item deletion (`e7bde19`).
* **feat(ipo):** Completed stock details, item costs, suppliers directory, and multi-tab reports hub (`cc588a7`, `d0359cc`).
* **fix(auth):** Fixed "database error querying schema" caused by GoTrue null token parsing bug (`3574f29`).

---

## [Phase 1] — Bootstrap, Initial Scaffolding & 1.0.0 Release

**Date Range:** 2026-09-02 to 2026-09-03
**Primary Commits:** `427070c` through `03937d3`

* **chore:** KUVENTORY 1.0.0 Version Release with baseline Netlify configuration (`2199e66`).
* **fix(build):** Resolved Netlify Linux case-sensitivity build failures (`fd3e553`).
* **feat:** Finalized real data integration, purged initial mock data, and connected Supabase PostgreSQL (`532b872`).
* **feat(auth):** Completed Phase 03 authentication, role routing, and inventory engine scaffolding (`8545468`, `738b15b`).
* **chore:** Initial repository bootstrap (`427070c`).
