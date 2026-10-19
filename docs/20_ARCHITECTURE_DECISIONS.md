# KUVENTORY — Architecture Decision Records (ADRs)

```
Document:               docs/20_ARCHITECTURE_DECISIONS.md
Audience:               Software Architects, Technical Examiners, Engineering Leads
Purpose:                Formal records of architectural decisions, technical contexts, trade-off analyses,
                        and recorded consequences across the KUVENTORY engineering lifecycle.
Verification Status:    Verified against repository codebase and Git commit evidence
Audit Date:             2026-10-19
Authoritative HEAD SHA: 135f10b807fedec368383c9e34895566da3d69fc
```

---

## Index of Architecture Decision Records

* **ADR-01:** Adoption of React 19 SPA & Vite over Next.js SSR
* **ADR-02:** Direct Supabase BaaS (PostgREST + Realtime) over Custom Node Express Tier
* **ADR-03:** FEFO Stock Rotation with Database-Level Pessimistic Row Locking (`FOR UPDATE`)
* **ADR-04:** Strict Non-Negative Stock Invariant & Generated Column Enforcement
* **ADR-05:** Standard Operating Timezone Pinned to `Asia/Manila` (PST, UTC+8)
* **ADR-06:** Single-Session Device Lease & Heartbeat Architecture
* **ADR-07:** Client-Side Report Compilation (jsPDF, ExcelJS) over Server-Side Workers
* **ADR-08:** Safe Read-Only Mode for Browser Disaster Recovery Controls

---

### ADR-01: Adoption of React 19 SPA & Vite over Next.js SSR
* **Date:** 2026-09-02 (Reaffirmed 2026-10-10 in commit `268069a`)
* **Status:** Accepted & Implemented
* **Context:** The team needed to choose an application framework for Kape Uno Bistro's inventory management system. Next.js with Server-Side Rendering (SSR) was considered alongside a pure Single Page Application (SPA) using React and Vite.
* **Decision:** Build KUVENTORY as a pure Single Page Application using React 19 (`^19.2.8`) and Vite (`^8.2.2`), deploying static compiled assets to Netlify Edge CDN.
* **Consequences:**
  * *Positive:* Zero server cold-start latency during quiet hours; sub-second development HMR; minimal edge hosting costs; complete decoupling from server infrastructure.
  * *Negative:* Initial bundle must be downloaded on first load (mitigated by Rollup code splitting). SEO search engine pre-rendering is not supported (acceptable, as KUVENTORY is a private, authenticated internal tool).
* **Evidence:** [vite.config.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/vite.config.ts), [package.json](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/package.json).

---

### ADR-02: Direct Supabase BaaS over Custom Node Express Tier
* **Date:** 2026-09-04 (Commit `329c15e`)
* **Status:** Accepted & Implemented
* **Context:** The application required user authentication, relational database storage, and multi-device real-time updates. The team evaluated building a traditional custom Express/Node.js REST server versus utilizing Supabase's managed PostgreSQL, GoTrue, PostgREST, and Realtime platform.
* **Decision:** Utilize Supabase directly from the React SPA over HTTPS/WSS, securing data through PostgreSQL Row Level Security (RLS) and stored procedures. Retain Express solely as an optional local container gateway.
* **Consequences:**
  * *Positive:* Eliminates boilerplate CRUD endpoints; native WebSocket change streams for instant multi-device reactivity; authorization rules enforced directly at the database kernel level.
  * *Negative:* Couples data access patterns to PostgREST syntax; requires disciplined management of PostgreSQL RLS policies and database migration scripts.
* **Evidence:** [src/lib/supabase.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/lib/supabase.ts), [supabase/migrations/](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/migrations/).

---

### ADR-03: FEFO Stock Rotation with Database Pessimistic Locking
* **Date:** 2026-10-03 (Commit `756f828`, migration `20261003180000`)
* **Status:** Accepted & Implemented
* **Context:** Perishable ingredients suffered unrecorded expiration. Furthermore, concurrent deductions from multiple counter staff caused race conditions and double-deduction errors.
* **Decision:** Implement a First-Expired, First-Out (FEFO) stock consumption procedure in PL/pgSQL (`public.consume_stock`) utilizing PostgreSQL pessimistic row-level locking (`SELECT ... FOR UPDATE`).
* **Consequences:**
  * *Positive:* Guaranteed consumption of earliest-expiring ingredients; complete elimination of concurrent double-deduction anomalies; atomic rollback if stock is insufficient.
  * *Negative:* Concurrent deductions for the exact same item must wait for the active lock to release, introducing brief millisecond queuing under heavy contention (well within acceptable bistro throughput).
* **Evidence:** Migration `20261003180000_master_admin_and_concurrency.sql`, [src/features/inventory/api/index.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/inventory/api/index.ts).

---

### ADR-04: Strict Non-Negative Stock Invariant & Generated Columns
* **Date:** 2026-10-10 (Commit `4d38c45`)
* **Status:** Accepted & Implemented
* **Context:** Shift usage entered by staff occasionally exceeded recorded physical stock, resulting in negative ending inventory balances that corrupted downstream financial reports.
* **Decision:** Enforce a strict non-negative stock invariant across both frontend utilities and database schema. Ending stock is clamped to $\ge 0$ using `max(0, ...)` and defined in PostgreSQL as a generated column: `GREATEST(0, (beginning_stock + added_stock) - (am_usage + pm_usage))`.
* **Consequences:**
  * *Positive:* Eliminates negative stock glitches; automatically surfaces discrepancies between physical inventory and recorded sales.
  * *Negative:* Requires staff to enter an audited correction revision if subsequent investigation reveals that an unrecorded delivery arrived earlier in the shift.
* **Evidence:** [src/features/daily-inventory/utils/calculations.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/daily-inventory/utils/calculations.ts), [src/features/inventory/__tests__/concurrencyAndLocking.test.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/inventory/__tests__/concurrencyAndLocking.test.ts).

---

### ADR-05: Standard Operating Timezone Pinned to `Asia/Manila`
* **Date:** 2026-10-18 (Commit `48a4ad1`)
* **Status:** Accepted & Implemented
* **Context:** Standard UTC timestamps caused operations occurring during early morning shifts (00:00 to 07:59 PHT) to resolve to the previous calendar day, splitting closing shift worksheets across multiple calendar dates.
* **Decision:** Centralize all business date logic in [src/lib/businessDate.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/lib/businessDate.ts), explicitly locking date formatting to `Asia/Manila` (PST, UTC+8) via `Intl.DateTimeFormat`.
* **Consequences:**
  * *Positive:* 100% consistent business date attribution across all shifts, worksheets, and reports regardless of client device timezone.
  * *Negative:* Any future expansion to international timezones will require parameterizing the business timezone constant.
* **Evidence:** [src/lib/businessDate.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/lib/businessDate.ts), [src/__tests__/businessDate.test.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/__tests__/businessDate.test.ts).

---

### ADR-06: Single-Session Device Lease & Heartbeat Architecture
* **Date:** 2026-10-04 (Commit `05900e0`, migration `20261004220000`)
* **Status:** Accepted & Implemented
* **Context:** Staff members frequently shared login credentials across multiple counter terminals, leading to simultaneous conflicting edits and untraceable shift discrepancies.
* **Decision:** Enforce a single active device lease per authenticated user in `public.system_sessions`. The client sends a heartbeat every 30 seconds via `renew_session_lease`. Logging in on a new device claims the lease and invalidates the previous session.
* **Consequences:**
  * *Positive:* Completely eliminates concurrent session hijacking and shared-credential conflicts; enforces distinct accountability per terminal.
  * *Negative:* Generates lightweight periodic network traffic (1 heartbeat per active client every 30 seconds).
* **Evidence:** [src/features/auth/services/sessionLeaseService.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/auth/services/sessionLeaseService.ts), [src/features/auth/context/AuthContext.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/auth/context/AuthContext.tsx#L159).

---

### ADR-07: Client-Side Report Compilation over Server-Side Workers
* **Date:** 2026-09-04 (Commit `cc588a7`)
* **Status:** Accepted & Implemented
* **Context:** The application needed to generate printable PDF documents, styled Excel workbooks, and CSV exports for store audits.
* **Decision:** Execute all document construction client-side using `jsPDF`, `jspdf-autotable`, and `exceljs`. Sanitize CSV exports against formula injection.
* **Consequences:**
  * *Positive:* Zero server load during heavy export generation; instant downloads without waiting for server render queues; offline export capability from cached query state.
  * *Negative:* Increases bundled asset size (mitigated by Vite code splitting into a separate `vendor-export` chunk).
* **Evidence:** [src/features/reports/utils/pdf.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/reports/utils/pdf.ts), [src/features/reports/utils/xlsx.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/reports/utils/xlsx.ts), [src/features/reports/utils/csv.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/reports/utils/csv.ts).

---

### ADR-08: Safe Read-Only Mode for Browser Disaster Recovery Controls
* **Date:** 2026-10-19 (Commit `135f10b`)
* **Status:** Accepted & Implemented
* **Context:** The Super Admin recovery tab included a UI button to "Restore from Checkpoint" that simulated client-side multi-table insertion. A browser crash midway would leave the production database in a corrupted state.
* **Decision:** Place the browser-side restore button in a safe disabled state pending development of an atomic backend RPC. Direct production database restores to Supabase Point-in-Time Recovery (PITR) or `pg_dump` SQL restores.
* **Consequences:**
  * *Positive:* Protects production data against catastrophic half-restored states; ensures zero false claims of untested in-browser database recovery.
  * *Negative:* Full database restoration requires access to Supabase management dashboard or command-line database tools.
* **Evidence:** [src/features/admin/components/super/SuperRecoveryTab.tsx: lines 182-200](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/admin/components/super/SuperRecoveryTab.tsx#L182-L200), commit `135f10b`.
