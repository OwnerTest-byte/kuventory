# KUVENTORY — Quick Project Defense Cheat Sheet

```
Document:               docs/17_QUICK_DEFENSE_CHEAT_SHEET.md
Audience:               Project Owner, Student Presenter, Quick Revision
Purpose:                One-page rapid reference card: 1-line definitions, verbal elevator pitches,
                        essential formulas, chart cheat sheet, and honest boundaries for quick recall.
Verification Status:    Verified against repository HEAD 135f10b
Audit Date:             2026-10-19
```

---

## 1. 30-Second Elevator Pitch

> *"KUVENTORY is a specialized web-based inventory and daily shift audit system built specifically for Kape Uno Bistro using React 19, TypeScript, and Supabase PostgreSQL. It eliminates perishable ingredient spoilage through automated First-Expired, First-Out (FEFO) stock rotation, synchronizes shift worksheets across counter tablets in real time using WebSockets, and protects financial and stock ledgers with database row-level locking and strict non-negative stock invariants."*

---

## 2. One-Line Technology Definitions

* **React 19:** Our frontend UI library that updates table cells and numbers instantly without page reloads.
* **TypeScript 6:** A statically typed superset of JavaScript that prevents data type errors and bugs during compilation.
* **Vite 8:** Our high-speed development server and production Rollup-based chunk bundler.
* **Tailwind CSS 4:** Our utility-first styling engine providing responsive layouts, dark themes, and design tokens.
* **Supabase:** Our cloud backend providing PostgreSQL 15, GoTrue authentication, REST APIs, and Realtime WebSockets.
* **PostgreSQL 15:** Our relational database engine enforcing ACID transactions, row-level locks, and generated columns.
* **TanStack Query 5:** Our browser caching layer that synchronizes remote database state with UI components.
* **Recharts 3:** Our declarative SVG charting library rendering analytics and telemetry visualizations.
* **jsPDF & ExcelJS:** Our client-side document compilers generating styled PDF and Excel exports in the browser.
* **Netlify:** Our edge hosting CDN providing global SSL, SPA 200 rewrites, and HTTP security headers.
* **Vitest 4:** Our fast unit and integration test runner (107 tests passing in 8.15s).
* **Playwright 1.62:** Our browser automation tool running end-to-end multi-viewport tests.

---

## 3. Essential Shift Formulas (Say Aloud)

1. **Total Stock Available:**
   $$\text{Total} = \text{Beginning Stock} + \text{Added Deliveries}$$
   *(Verbal: "Beginning stock carried over from yesterday plus any restock received today.")*
2. **Non-Negative Ending Stock:**
   $$\text{Ending Stock} = \max\left(0, \text{Total} - (\text{AM Usage} + \text{PM Usage})\right)$$
   *(Verbal: "Total stock minus morning and evening usage, clamped to zero to prevent negative numbers.")*
3. **Closing Discrepancy:**
   $$\text{Discrepancy} = \text{Physical Count} - \text{Ending Stock}$$
   *(Verbal: "The variance between what staff physically counted and what the computer computed.")*

---

## 4. Charts Quick-Reference Card

| Chart Name | Type | Location | What It Shows (Say Aloud) | Data Source |
| :--- | :--- | :--- | :--- | :--- |
| **Stock by Category** | Donut / Pie | `/analytics` | *"Proportion of total inventory units and monetary value held in each prep station."* | Live computed state from `inventory_items`. |
| **Weekly Movements** | Grouped Bar | `/analytics` | *"Comparison of daily stock received (blue) versus consumed (red) over the trailing 7 days."* | Historical transactional truth from `stock_movements`. |
| **Latency Telemetry** | Area Curve | `/super-admin` | *"Operational database roundtrip ping latency across 24-hour, 7-day, and 30-day windows."* | Operational trend scaled from live measured ping. |

---

## 5. Schedulers vs. Triggers Quick-Reference

* **`pg_cron` (Postgres):** Runs time-based tasks inside PostgreSQL at midnight (`0 0 * * *`) to flag expired batches.
* **Database Triggers (Postgres):** Run synchronously inside PostgreSQL the millisecond stock updates to insert low-stock alerts.
* **GitHub Actions (Cloud):** Runs every 2 days on GitHub runners (`0 0 */2 * *`) to ping Supabase and prevent 7-day free tier dormancy.
* **Browser Timers (Client):** Ephemeral 30s heartbeat intervals running only while the staff browser tab is active.
* **Realtime (WebSocket):** Event-driven push stream broadcasting database WAL commits to browsers in under 100ms.

---

## 6. Honest Operational Boundaries (If Asked About Limitations)

* **No Offline Writing:** The app caches pages for fast loads, but stock cannot be deducted offline because PostgreSQL row locks require live network connectivity.
* **Browser Restore Disabled:** Checkpoint restoration from the browser is safely disabled in read-only mode to prevent partial restore corruption. Restores must be performed via Supabase PITR or `psql` dumps.
* **`node-cron` Hosting:** The backup script runs locally or on a dedicated server; it does not run inside Netlify's static CDN.
* **Telemetry Fallback:** Disconnected telemetry displays `0` / `'Unavailable'`; we do not show fake healthy mock data.
