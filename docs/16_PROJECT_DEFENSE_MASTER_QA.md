# KUVENTORY — Project Defense & Viva Master Q&A

```
Document:               docs/16_PROJECT_DEFENSE_MASTER_QA.md
Audience:               Project Owner, Technical Examiners, Software Lecturers, Defense Committee
Purpose:                Authoritative oral defense guide covering 100+ examiner questions from foundational concepts
                        to deep architectural and code-level inquiries. Structured for natural, confident verbal delivery.
Verification Status:    Verified against repository source code, migrations, tests, and Git commits
Audit Date:             2026-10-19
Authoritative HEAD SHA: 135f10b807fedec368383c9e34895566da3d69fc
Primary References:     src/, supabase/migrations/, vitest test suites, package.json
```

---

## Guide for the Student / Project Owner

When presenting KUVENTORY to examiners:
1. **Speak naturally:** Start with the **Quick Answer** (1–3 sentences) to establish clarity immediately.
2. **Follow with technical context:** Use the **Expanded Answer** (30–90 seconds) to explain how the code actually achieves the result.
3. **Cite the code:** Point directly to the file path, database migration, or test suite cited under **Evidence**.
4. **Be honest about boundaries:** If asked about an unverified or incomplete feature, use the **Truth / Status Note**. Never fabricate claims of live production testing or imaginary capabilities; examiners respect technical honesty and clear risk management.

---

## Category A: Project Background, Motivation & Planning

### Q-A01: What is KUVENTORY in simple terms?
* **Quick Answer (1–3 sentences):**
  KUVENTORY is a specialized, web-based inventory management, batch tracking, and shift audit system built specifically for Kape Uno Bistro. It replaces paper clipboards and unlinked spreadsheets with an automated, real-time platform that tracks perishable ingredients, calculates daily shift balances, and prevents stock spoilage.
* **Expanded Answer (30–90 seconds):**
  In a fast-paced food and beverage enterprise like Kape Uno Bistro, managing perishable raw materials—such as milk, espresso beans, flavored syrups, and baked goods—is critical. Prior to KUVENTORY, the bistro suffered from untracked waste, expiration write-offs, and shift-handover miscalculations. KUVENTORY solves this by introducing a strict First-Expired, First-Out (FEFO) stock rotation engine, real-time synchronization across staff counter tablets, and immutable daily report snapshots that ensure complete operational transparency.
* **Evidence:** [docs/00_PROJECT_OVERVIEW_AND_HISTORY.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/00_PROJECT_OVERVIEW_AND_HISTORY.md), [src/app/App.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/app/App.tsx).
* **Possible Follow-Up:** *"Why not just use an existing off-the-shelf POS or inventory software?"*
  * *Answer:* Generic retail POS systems are designed for discrete packaged goods and lack restaurant-specific shift worksheet workflows, dual AM/PM consumption recording, station categorization, and strict FEFO batch expiration tracking tailored to fresh bistro operations.
* **Truth / Status Note:** Verified in current source code.

### Q-A02: What specific operational problem does the system solve?
* **Quick Answer:**
  It eliminates ingredient spoilage, manual shift calculation errors, and double-counting race conditions. It ensures that ingredients expiring earliest are consumed first, prevents negative inventory balances, and provides management with audited shift reports.
* **Expanded Answer:**
  Paper clipboards and basic spreadsheets created three major operational failures at Kape Uno Bistro: first, older milk or syrups were pushed to the back of refrigerators while fresh deliveries were used first, causing preventable spoilage; second, evening shift closing counts often contradicted morning opening counts because mid-day deliveries were recorded in separate books; and third, when multiple staff members edited spreadsheets simultaneously, rows were silently overwritten. KUVENTORY resolves these through database-level row locking, automated FEFO ordering, and WebSocket real-time updates.
* **Evidence:** [src/features/daily-inventory/utils/calculations.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/daily-inventory/utils/calculations.ts), migration `20261003180000_master_admin_and_concurrency.sql`.
* **Possible Follow-Up:** *"How does KUVENTORY handle stock arriving mid-shift?"*
  * *Answer:* Staff can click the "+ Stock" button directly on the active daily worksheet, entering the incoming quantity and expiration date. This creates a new physical batch in `stock_batches` and immediately updates the shift's "Added Stock" column in real time.
* **Truth / Status Note:** Verified in current source.

### Q-A03: Who are the intended users of the application?
* **Quick Answer:**
  The system supports three user personas: Staff/Baristas (`USER`) who enter shift consumption on mobile devices or tablets; Store Managers (`ADMIN`) who manage suppliers, receive shipments, and finalize shifts; and the Business Owner (`SUPER_ADMIN`) who governs system maintenance, audit logs, and recovery.
* **Expanded Answer:**
  Each persona is isolated by strict role-based access control. Staff members work on counter tablets behind the bar, opening `/daily-inventory` to record AM usage during afternoon handover and PM usage at closing. Branch managers work from a back-office desktop or tablet, receiving new shipments with expiration dates, adjusting prices, and executing shift finalization. The Super Admin has an exclusive operations console (`/super-admin`) to monitor database health, manage active session leases, and review immutable audit logs.
* **Evidence:** [src/features/auth/types/index.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/auth/types/index.ts#L1), [src/features/auth/components/RequireAuth.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/auth/components/RequireAuth.tsx#L31-L89).
* **Possible Follow-Up:** *"Can a staff member finalize a daily worksheet?"*
  * *Answer:* No. The finalization button and the underlying PostgreSQL RPC `finalize_daily_inventory_sheet` are strictly gated to `ADMIN` and `SUPER_ADMIN` roles. Staff members can only save draft changes and submit audited correction requests.
* **Truth / Status Note:** Verified in current source.

### Q-A04: What were the original goals and scope of the project?
* **Quick Answer:**
  The goal was to build a reliable, cloud-native inventory control and daily audit platform for Kape Uno Bistro. The scope encompasses raw ingredient tracking, batch expirations, daily shift reconciliation, reports, and administrative governance, explicitly excluding customer-facing POS sales and payment processing.
* **Expanded Answer:**
  We deliberately scoped KUVENTORY as an internal operations and inventory audit system rather than a commercial point-of-sale terminal. By focusing strictly on backend inventory mechanics—such as non-negative stock invariants, multi-worker concurrency protection, and audited sheet revisions—we solved the bistro's core cost leakage problem without introducing the regulatory overhead of payment gateways or fiscal receipt printers.
* **Evidence:** [docs/01_REQUIREMENTS_AND_ACCEPTANCE.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/01_REQUIREMENTS_AND_ACCEPTANCE.md).
* **Possible Follow-Up:** *"How did you track progress from the earliest commits to today?"*
  * *Answer:* The repository contains 105 Git commits across eight distinct development phases, starting from initial bootstrap on 2026-09-02, progressing through schema hardening, FEFO implementation, UX optimization, single-session leasing, and culminating in the Super Admin operations console and fail-closed security audit on 2026-10-19.
* **Truth / Status Note:** Verified against Git history.

---

## Category B: Technology Stack & Architectural Rationale

### Q-B01: What frontend framework did you use, and what is React?
* **Quick Answer:**
  We built KUVENTORY using **React 19.2.8** with TypeScript. React is a declarative, component-based JavaScript library developed by Meta that renders dynamic user interfaces efficiently by updating only the specific DOM elements that change.
* **Expanded Answer:**
  In KUVENTORY, React manages our Single Page Application (SPA). Because restaurant staff frequently enter numbers across dozens of inventory rows during shift changes, React's virtual DOM reconciliation and fine-grained state updates ensure the user interface never freezes or flickers. We are running React 19 (`^19.2.8`, resolved `19.2.8`), which provides enhanced concurrent rendering and native asynchronous lifecycle handling.
* **Evidence:** [package.json](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/package.json#L46), [package-lock.json](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/package-lock.json).
* **Possible Follow-Up:** *"Earlier documentation claimed React 18. Why does package.json show React 19?"*
  * *Answer:* The project was upgraded to React 19 in commit `268069a` on 2026-10-10 to leverage the latest React compiler optimizations and ref lifecycle updates. Legacy documentation that stated React 18 was outdated and has been corrected in this overhaul.
* **Truth / Status Note:** Verified in current source.

### Q-B02: Why did you use TypeScript rather than plain JavaScript?
* **Quick Answer:**
  TypeScript adds static type definitions to JavaScript, allowing us to catch data shape mismatches, null reference bugs, and calculation errors during compilation before code is ever deployed to production.
* **Expanded Answer:**
  In an inventory system dealing with financial costs and physical stock quantities, a typing mistake—such as concatenating a string `"10"` with a number `5` to produce `"105"` instead of `15`—would corrupt the entire inventory ledger. TypeScript (~6.0.2, resolved 6.0.3) strictly enforces types across our data models, RPC parameters, and utility calculations. Running `npm run typecheck` validates all 140 source files with zero errors.
* **Evidence:** [tsconfig.json](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/tsconfig.json), [src/types/](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/types/).
* **Possible Follow-Up:** *"Does TypeScript run in the browser?"*
  * *Answer:* No. TypeScript is compiled down to standard, optimized JavaScript (ES2022) during the Vite production build process (`tsc -b && vite build`). Browsers only execute the compiled JavaScript.
* **Truth / Status Note:** Verified in build tools.

### Q-B03: What is Vite, and what role does it play in KUVENTORY?
* **Quick Answer:**
  Vite is our modern frontend build tool and development server. It serves source code via native browser ES modules during development for instant hot module replacement and bundles optimized production assets using Rollup in under 3.5 seconds.
* **Expanded Answer:**
  Vite replaced legacy bundlers like Webpack in our stack. In development, Vite provides sub-second startup times and instant Hot Module Replacement (HMR). In production, Vite compiles our React and TypeScript code into clean, minified JavaScript and CSS chunks in `dist/`, automatically splitting heavy libraries like Recharts, jsPDF, and ExcelJS into separate lazy-loaded bundles to keep initial page loads ultra-fast.
* **Evidence:** [vite.config.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/vite.config.ts), [package.json](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/package.json#L72).
* **Possible Follow-Up:** *"Is Vite used to host the website in production?"*
  * *Answer:* No. Vite is strictly the build and packaging tool. The compiled static output in `dist/` is deployed to and served globally by the Netlify Edge CDN.
* **Truth / Status Note:** Verified in build config.

### Q-B04: What is Tailwind CSS, and how is it used in this project?
* **Quick Answer:**
  Tailwind CSS v4 is our utility-first styling engine. Instead of writing custom CSS stylesheets for every button and card, we compose interface designs directly in our components using curated utility classes that compile into a minified, high-performance stylesheet.
* **Expanded Answer:**
  In KUVENTORY, Tailwind CSS (`^4.3.3`, resolved `4.3.3`) provides our entire visual design system, including responsive breakpoints (`sm:`, `md:`, `lg:`), high-contrast accessibility color tokens, dark mode classes, and compact table grids. With `@tailwindcss/vite`, unused styles are automatically purged during compilation, resulting in an exceptionally compact gzipped stylesheet of only ~20 KB.
* **Evidence:** [src/index.css](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/index.css), [vite.config.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/vite.config.ts).
* **Possible Follow-Up:** *"Why not use Tailwind CSS v3?"*
  * *Answer:* Tailwind v4 features a rewritten, high-speed Rust-based engine (Oxide) that integrates natively with Vite without requiring PostCSS configuration files.
* **Truth / Status Note:** Verified in current source.

### Q-B05: What is Supabase, and which specific Supabase features are used?
* **Quick Answer:**
  Supabase is our Backend-as-a-Service platform built on top of PostgreSQL. KUVENTORY actively utilizes four core Supabase products: Supabase Auth (GoTrue) for user authentication; PostgREST for auto-generated REST and RPC APIs; Supabase Realtime for WebSocket change streams; and Supabase Storage for product images.
* **Expanded Answer:**
  Rather than writing and maintaining a separate Node.js CRUD server, Supabase provides managed enterprise infrastructure. User logins are handled via GoTrue JWT tokens. Database queries and stored procedures execute through PostgREST directly into PostgreSQL, protected by Row Level Security (RLS). Multi-device live updates are delivered by Supabase Realtime listening to PostgreSQL's Write-Ahead Log, and item photos are stored in an S3-compatible Supabase Storage bucket.
* **Evidence:** [src/lib/supabase.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/lib/supabase.ts), [supabase/migrations/](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/migrations/).
* **Possible Follow-Up:** *"Does using Supabase mean you don't have a real SQL database?"*
  * *Answer:* Quite the opposite. Supabase is not a proprietary NoSQL database; it is a full, dedicated PostgreSQL 15 relational database with full support for SQL schemas, constraints, foreign keys, triggers, and PL/pgSQL stored procedures.
* **Truth / Status Note:** Verified in current source.

### Q-B06: What database does KUVENTORY use, and what is PostgreSQL?
* **Quick Answer:**
  KUVENTORY uses **PostgreSQL 15**, an advanced, open-source object-relational database management system known for its reliability, data integrity guarantees, and strict ACID transaction compliance.
* **Expanded Answer:**
  PostgreSQL is the source of truth for all KUVENTORY data. We chose PostgreSQL because inventory systems require absolute mathematical consistency. Features like transactional row-level locking (`SELECT ... FOR UPDATE`), generated columns that compute ending stock automatically, table check constraints, foreign keys with cascading deletions, and triggers that enforce administrative quotas run directly inside the PostgreSQL kernel.
* **Evidence:** [supabase/migrations/20260831000000_initial_schema.sql](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/migrations/20260831000000_initial_schema.sql) through `20261019090000_final_safety_guards.sql`.
* **Possible Follow-Up:** *"What are generated columns in PostgreSQL?"*
  * *Answer:* In our `daily_inventory_items` table, `total_stock` and `ending_stock` are defined as `GENERATED ALWAYS AS (...) STORED`. PostgreSQL automatically computes and stores these values whenever beginning stock or usage columns are updated, guaranteeing that formulas cannot be bypassed or tampered with by client code.
* **Truth / Status Note:** Verified in migrations.

### Q-B07: What is TanStack Query, and why is it necessary?
* **Quick Answer:**
  TanStack React Query v5 is our asynchronous server-state management library. It caches database query results in the browser, eliminates duplicate network requests, manages loading and error states, and coordinates with Supabase Realtime to refetch data automatically when changes occur.
* **Expanded Answer:**
  In a complex application, managing remote server data using simple `useState` and `useEffect` leads to race conditions, memory leaks, and redundant network calls. TanStack Query decouples data fetching from component rendering. It caches queries using structured keys (e.g., `['inventory']` or `['daily-inventory-sheet']`). When another employee modifies stock on another device, our Realtime WebSocket listener simply tells React Query to invalidate that key, prompting an instant background refetch.
* **Evidence:** [src/main.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/main.tsx#L15), [src/features/inventory/hooks/useRealtimeSync.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/inventory/hooks/useRealtimeSync.ts).
* **Possible Follow-Up:** *"What does 'stale-while-revalidate' mean?"*
  * *Answer:* It is a caching strategy where React Query immediately displays cached data from memory so the user sees no loading delay, while simultaneously sending a background request to the server to check for updates and refresh the screen if changes exist.
* **Truth / Status Note:** Verified in current source.

### Q-B08: What libraries are used for exporting reports, and how do they work?
* **Quick Answer:**
  We use **jsPDF** (`^4.2.1`) with **jspdf-autotable** (`^5.0.8`) to generate styled PDF documents, **ExcelJS** (`^4.4.0`) to generate native binary Excel (`.xlsx`) workbooks, and a custom TypeScript parser for CSV exports. All files are compiled entirely inside the client's browser.
* **Expanded Answer:**
  Rather than putting heavy document generation workloads on a server, KUVENTORY compiles reports client-side. When a manager clicks "Export PDF", `jsPDF` formats our bistro letterhead, iterates through table rows, and handles page breaking. When exporting to Excel, `ExcelJS` applies cell styling, bold header fills, and currency number formatting. For CSV, our custom utility sanitizes cell contents to neutralize CSV formula injection attacks before triggering a browser download.
* **Evidence:** [src/features/reports/utils/pdf.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/reports/utils/pdf.ts), [src/features/reports/utils/xlsx.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/reports/utils/xlsx.ts), [src/features/reports/utils/csv.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/reports/utils/csv.ts).
* **Possible Follow-Up:** *"Why not generate PDFs on the server?"*
  * *Answer:* Client-side generation eliminates server CPU bottlenecks during peak auditing hours, reduces cloud hosting costs, and allows staff to export reports instantly even when internet bandwidth is limited.
* **Truth / Status Note:** Verified in current source.

---

## Category C: Charts, Analytics & Data Visualization (Required Deep-Dive)

### Q-C01: Which chart library was used in KUVENTORY, and what is it?
* **Quick Answer:**
  We used **Recharts v3.8.0** (`recharts` `^3.8.0`, resolved `3.8.0`). Recharts is a declarative charting library built specifically for React applications that renders vector charts using SVG (Scalable Vector Graphics).
* **Expanded Answer:**
  Recharts is designed to fit the React component lifecycle. Unlike canvas-based chart libraries that require imperative JavaScript commands, Recharts allows us to write charts as declarative JSX components—such as `<BarChart>`, `<Bar>`, `<XAxis>`, and `<Tooltip>`. Because it renders SVG elements directly into the DOM, the charts scale perfectly on mobile phones, tablets, and high-resolution monitors without pixelation, and support CSS styling and tooltips naturally.
* **Evidence:** [package.json](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/package.json#L50), [src/features/reports/pages/AnalyticsPage.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/reports/pages/AnalyticsPage.tsx#L6-L17).
* **Possible Follow-Up:** *"Is Recharts part of React, or is it a third-party library?"*
  * *Answer:* It is an independent third-party open-source library built specifically for React, maintained by the Recharts team and widely used across the React ecosystem.
* **Truth / Status Note:** Verified in package manifest and lockfile.

### Q-C02: Which exact chart components are imported, and where are they used?
* **Quick Answer:**
  Recharts components are imported in two files: [AnalyticsPage.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/reports/pages/AnalyticsPage.tsx) (imports `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`, `PieChart`, `Pie`, `Cell`, `Legend`) and [SuperOverviewTab.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/admin/components/super/SuperOverviewTab.tsx) (imports `ResponsiveContainer`, `AreaChart`, `Area`, `XAxis`, `YAxis`, `Tooltip`, `CartesianGrid`).
* **Expanded Answer:**
  In `AnalyticsPage.tsx`, we render two primary visualizations:
  1. A **Donut / Pie Chart** representing inventory distribution across station categories.
  2. A **Grouped Bar Chart** representing 7-day weekly stock movement velocity (Stock In vs. Stock Out).
  In `SuperOverviewTab.tsx`, we render an **Area Chart** displaying database ping response latency across 24-hour, 7-day, and 30-day timeframes.
* **Evidence:** [AnalyticsPage.tsx: lines 6-17](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/reports/pages/AnalyticsPage.tsx#L6-L17), [SuperOverviewTab.tsx: lines 11-13](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/admin/components/super/SuperOverviewTab.tsx#L11-L13).
* **Possible Follow-Up:** *"What does `<ResponsiveContainer>` do?"*
  * *Answer:* It is a Recharts wrapper component that measures its parent DOM element's width and height and dynamically resizes the inner SVG chart to fit mobile screens, tablets, and desktop containers seamlessly.
* **Truth / Status Note:** Verified in current source.

### Q-C03: Explain the Stock by Category chart: what does it measure and how does it work?
* **Quick Answer:**
  It is a Donut Chart on `/analytics` that visualizes the proportion of physical stock volume held in each bistro station category (such as Coffee Bar, Kitchen, Pastry, Packaging, and Syrups).
* **Expanded Answer:**
  The chart answers the operational question: *"Which station holds the bulk of our current inventory assets?"*
  * **Data Pipeline:** It fetches active catalog items from the `['inventory']` query cache, filters out archived items, groups items by `category_name`, and sums `current_qty` and total monetary value.
  * **Visual Presentation:** It renders a `<PieChart>` with an inner radius of 55 and outer radius of 85, creating a donut shape. Each slice is colored using a curated 7-color palette.
  * **Interactive Tooltip:** Hovering over a slice displays the exact category name, total physical units, and total calculated value in Philippine Pesos.
* **Evidence:** [src/features/reports/pages/AnalyticsPage.tsx: lines 97-116 and 421-450](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/reports/pages/AnalyticsPage.tsx#L97-L116).
* **Possible Follow-Up:** *"Why did you use a donut chart instead of a standard pie chart or bar chart?"*
  * *Answer:* A donut chart provides a modern, clean visual presentation of part-to-whole categorical distribution while leaving open center space that improves visual scanning on busy dashboard screens.
* **Truth / Status Note:** Verified in current source. Live computed state.

### Q-C04: Explain the Weekly Movements Velocity chart: what does it measure and how does it work?
* **Quick Answer:**
  It is a dual-column grouped vertical Bar Chart on `/analytics` that compares daily stock received (`Stock In`) against daily stock consumed (`Stock Out`) across the trailing 7 calendar days.
* **Expanded Answer:**
  The chart answers the operational question: *"Are we consuming ingredients faster than we are receiving shipments on specific days of the week?"*
  * **Data Pipeline:** It fetches recent movement records from `['global-stock-history']`, pre-initializes 7 weekday buckets (Mon through Sun) using `date-fns`, and aggregates quantities based on `action_type = 'ADD'` (incoming stock) versus `action_type = 'REMOVE'` (consumption/sales).
  * **Axes:** The X-Axis displays the 3-letter weekday name; the Y-Axis displays total units moved.
  * **Visual Series:** Blue bars (`#2563EB`) represent Stock In; red bars (`#EF4444`) represent Stock Out.
* **Evidence:** [src/features/reports/pages/AnalyticsPage.tsx: lines 118-144 and 453-486](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/reports/pages/AnalyticsPage.tsx#L118-L144).
* **Possible Follow-Up:** *"Is this chart live data, calculated data, or historical data?"*
  * *Answer:* It is genuine **historical transactional data** derived from immutable records stored in PostgreSQL's `public.stock_movements` ledger.
* **Truth / Status Note:** Verified in current source.

### Q-C05: Explain the Latency & Keepalive Telemetry chart in the Super Admin console: what does it show and what is its authentic data source?
* **Quick Answer:**
  It is an Area Chart in `/super-admin` displaying PostgreSQL roundtrip ping response times across 24h, 7d, and 30d timeframes. It derives an operational health trend scaled from our live measured keepalive ping.
* **Expanded Answer:**
  The chart monitors database connectivity and responsiveness. Every 10 seconds, the console measures the round-trip time of a lightweight PostgREST query, populating `telemetry.pingMs`. The chart component plots an area curve with an amber gradient (`#f59e0b`).
  * **Audited Ground Truth:** In our source code review, we verified that the chart generates operational trend points scaled from the current live ping measurement rather than querying a persistent historical time-series database table, because Supabase free tier does not store continuous server telemetry. We candidly document this as an **operational telemetry trend indicator**.
* **Evidence:** [src/features/admin/components/super/SuperOverviewTab.tsx: lines 63-93 and 401-421](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/admin/components/super/SuperOverviewTab.tsx#L63-L93).
* **Possible Follow-Up:** *"Why not store every ping in a database table?"*
  * *Answer:* Storing a database ping every 10 seconds would write over 8,600 rows per day to the database, exhausting the free-tier storage quota with unnecessary self-monitoring traffic.
* **Truth / Status Note:** Verified in current source. Authentically documented as an operational trend indicator.

---

## Category D: Automation, Schedulers & Event-Driven Architecture (Required Deep-Dive)

### Q-D01: How did you automate workflows in KUVENTORY?
* **Quick Answer:**
  We implemented automation across distinct architectural layers: PostgreSQL `pg_cron` for scheduled expiration checks; PostgreSQL triggers for real-time inventory threshold alerts; GitHub Actions scheduled workflows for cloud keepalive pings; and Supabase Realtime WebSockets for instant multi-device synchronization.
* **Expanded Answer:**
  Rather than trying to force a single automation tool to handle everything, we matched each task to its optimal environment. Scheduled database tasks that must run every midnight—such as marking expired batches—are executed inside PostgreSQL via `pg_cron`. Event-driven tasks that must react immediately to stock mutations—such as raising a `LOW_STOCK` alert—are executed by database triggers. External cloud keepalive tasks run on GitHub Actions cloud runners, and UI synchronization runs over WebSockets.
* **Evidence:** [docs/10_AUTOMATION_SCHEDULERS_AND_REALTIME.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/10_AUTOMATION_SCHEDULERS_AND_REALTIME.md).
* **Possible Follow-Up:** *"Can you name the exact database migration that configures scheduled jobs?"*
  * *Answer:* Yes. `supabase/migrations/20260902100000_expiry_cron.sql` schedules `daily_expiry_check` using `cron.schedule('daily_expiry_check', '0 0 * * *', 'SELECT public.check_expiry_notifications()')`.
* **Truth / Status Note:** Verified in migration files.

### Q-D02: What is the difference between a cron job and a database trigger?
* **Quick Answer:**
  A cron job is **time-based**—it executes on a scheduled calendar interval (like every day at midnight) regardless of user actions. A database trigger is **event-driven**—it executes immediately and synchronously when a specific database event occurs, like an `INSERT` or `UPDATE` on a table.
* **Expanded Answer:**
  This distinction is fundamental to KUVENTORY. For example, batch expiration cannot be detected by an update trigger if nobody touches that ingredient for days; therefore, batch expiration requires a time-based **cron job** (`pg_cron`) that wakes up at midnight to check dates. Conversely, detecting low stock must happen the exact millisecond consumption is recorded; therefore, low stock alerts are handled by an event-driven **database trigger** (`trg_inventory_thresholds`) attached to `inventory_items`.
* **Evidence:** Migrations `20260902100000_expiry_cron.sql` (cron) and `20260902090100_threshold_triggers.sql` (trigger).
* **Possible Follow-Up:** *"What happens if a database trigger encounters an error during a transaction?"*
  * *Answer:* Because PostgreSQL triggers execute within the calling transaction boundary, if the trigger fails or raises an exception, the entire transaction rolls back, preventing partial or corrupted data from persisting.
* **Truth / Status Note:** Verified in migrations.

### Q-D03: What does the GitHub Actions keepalive workflow do?
* **Quick Answer:**
  It is a cloud-scheduled automation in [.github/workflows/supabase-keepalive.yml](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/.github/workflows/supabase-keepalive.yml) that executes every two days to send a lightweight curl ping to our Supabase database, preventing Supabase from automatically pausing the project due to 7 days of inactivity.
* **Expanded Answer:**
  Supabase free-tier projects automatically pause if they receive no API requests for 7 consecutive days. Because bistro operations might be closed during holiday breaks or low-season renovations, the keepalive workflow runs on GitHub Actions on a cron schedule (`0 0 */2 * *`). It sends an HTTPS GET request to `/rest/v1/system_settings?select=key&limit=1` using the anonymous API key stored in GitHub Secrets, resetting the 7-day inactivity timer without requiring human intervention.
* **Evidence:** [.github/workflows/supabase-keepalive.yml](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/.github/workflows/supabase-keepalive.yml).
* **Possible Follow-Up:** *"Is this keepalive script running inside the user's web browser?"*
  * *Answer:* No. It runs entirely on GitHub's cloud infrastructure (Ubuntu Linux runner). It runs independently even if all store computers, phones, and browsers are powered off.
* **Truth / Status Note:** Verified in GitHub Actions workflow.

### Q-D04: What is `node-cron`, and does it run on Netlify?
* **Quick Answer:**
  `node-cron` is an npm library used in `scripts/backup-db.mjs` to run daily `pg_dump` database backups. However, it **does not run on Netlify static hosting**, because Netlify serves pre-compiled static files without a persistent Node.js server process.
* **Expanded Answer:**
  `node-cron` is present in `package.json` and is implemented in `scripts/backup-db.mjs` for standalone backup execution. When run locally or on an internal bistro server via `node scripts/backup-db.mjs`, it schedules a daily dump at midnight. In our production Netlify hosting environment, database backups are handled directly by Supabase's automated daily platform backups. We candidly disclose that `node-cron` requires an independent server or container runner.
* **Evidence:** [package.json](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/package.json#L45), [scripts/backup-db.mjs: lines 14-22](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/scripts/backup-db.mjs#L14-L22).
* **Possible Follow-Up:** *"How would you run backup-db.mjs automatically in production?"*
  * *Answer:* By packaging the script inside a lightweight Docker container and running it as a background service on a local management workstation or an inexpensive cloud VM (e.g., AWS EC2 or Fly.io).
* **Truth / Status Note:** Verified in code. Operational limitation accurately disclosed.

### Q-D05: What happens to automations if all store browsers are closed?
* **Quick Answer:**
  Server-side and database automations continue running completely uninterrupted. PostgreSQL `pg_cron` jobs and database triggers run inside the Supabase database cluster, and GitHub Actions keepalive workflows run in the GitHub cloud.
* **Expanded Answer:**
  The only mechanisms that pause when browsers are closed are client-side ephemeral timers, specifically the 30-second single-session lease heartbeat in `AuthContext.tsx` and the 10-second ping measurement in `SuperAdminPage.tsx`. When staff leave for the night and close their counter tablets, the server-side cron still checks expirations at midnight, and the GitHub keepalive still pings the database on schedule.
* **Evidence:** [src/features/auth/context/AuthContext.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/auth/context/AuthContext.tsx#L159), [docs/10_AUTOMATION_SCHEDULERS_AND_REALTIME.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/10_AUTOMATION_SCHEDULERS_AND_REALTIME.md).
* **Possible Follow-Up:** *"What prevents the midnight expiry check from generating duplicate notifications if it runs twice?"*
  * *Answer:* The procedure uses an explicit deduplication key (`dedup_key = 'EXPIRED_' || batch_id`) with PostgreSQL's `ON CONFLICT (dedup_key) DO NOTHING` clause, guaranteeing idempotency.
* **Truth / Status Note:** Verified in migrations.

---

## Category E: Inventory Business Logic, FEFO & Formulas

### Q-E01: What is FEFO, and why did you choose it over FIFO?
* **Quick Answer:**
  FEFO stands for **First-Expired, First-Out**. It dictates that batches with the earliest expiration dates are consumed before newer batches. We chose FEFO over FIFO (First-In, First-Out) because in a food and beverage business, perishable ingredients delivered later might have shorter shelf lives than older shelf-stable goods.
* **Expanded Answer:**
  FIFO assumes that goods delivered first will expire first. In real restaurant operations, this assumption is often false—for example, a supplier might deliver dairy products with a 7-day expiration date on Tuesday, while a shipment of long-life cream delivered on Monday has a 30-day expiration date. Under FIFO, the 30-day cream would be consumed first, causing the 7-day milk to spoil. FEFO evaluates the actual expiration date stamped on each physical batch, prioritizing the most perishable stock first.
* **Evidence:** [src/features/inventory/api/index.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/inventory/api/index.ts), migration `20261003180000_master_admin_and_concurrency.sql`.
* **Possible Follow-Up:** *"How does the database break ties if two batches have the exact same expiration date?"*
  * *Answer:* The query orders by `expiry_date ASC, created_at ASC`. If expiration dates are identical, it falls back to FIFO ordering based on the batch creation timestamp.
* **Truth / Status Note:** Verified in stored procedure SQL.

### Q-E02: Explain the daily inventory balancing formula: how is ending stock calculated?
* **Quick Answer:**
  $$\text{Ending Stock} = \max\left(0, (\text{Beginning Stock} + \text{Added Stock}) - (\text{AM Usage} + \text{PM Usage})\right)$$
  Ending stock takes beginning stock, adds any mid-shift restock deliveries, subtracts morning and evening consumption, and clamps the result to a minimum of 0 to prevent negative inventory balances.
* **Expanded Answer:**
  This formula is enforced both client-side in [calculations.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/daily-inventory/utils/calculations.ts) and server-side via PostgreSQL generated columns in `public.daily_inventory_items`. If staff accidentally record higher sales consumption than physical stock on hand, the system sets ending stock to `0` and flags a negative discrepancy rather than corrupting downstream financial and stock ledgers with negative numbers.
* **Evidence:** [src/features/daily-inventory/utils/calculations.ts: lines 28-63](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/daily-inventory/utils/calculations.ts#L28-L63), migration `20260902070000_daily_inventory.sql`.
* **Possible Follow-Up:** *"How did you prevent the JavaScript -0 float bug?"*
  * *Answer:* In JavaScript, computing `0 - 0` or negative float subtractions can produce `-0`. In `calculateEndingStock`, we normalize the return value using `Object.is(val, -0) ? 0 : val`.
* **Truth / Status Note:** Verified in unit tests (`inventoryCalculations.test.ts`).

### Q-E03: How does KUVENTORY prevent double-deduction race conditions when two baristas enter stock simultaneously?
* **Quick Answer:**
  We use PostgreSQL **pessimistic row-level locking** (`SELECT ... FOR UPDATE`) inside the `consume_stock` stored procedure. When one transaction deducts stock from a batch, other transactions attempting to access the same batch are queued until the first transaction commits.
* **Expanded Answer:**
  If two staff members on different counter tablets attempt to finalize or deduct stock from the same item at the exact same millisecond, standard database queries would suffer from a race condition where both read the same initial quantity and overwrite each other's updates. By including `FOR UPDATE` in our batch query, PostgreSQL places an exclusive kernel lock on those batch rows. The second worker's transaction waits for the first to complete, reads the newly decremented balance, and checks whether sufficient stock remains.
* **Evidence:** Migration `20261003180000_master_admin_and_concurrency.sql: lines 290-320`.
* **Possible Follow-Up:** *"What happens if the second worker's request exceeds the remaining stock?"*
  * *Answer:* The transaction immediately rolls back with an exception (`'Insufficient stock for item'`), ensuring the database state remains uncorrupted, and notifies the second user with an error toast.
* **Truth / Status Note:** Verified in SQL and tested in `concurrencyAndLocking.test.ts`.

### Q-E04: How does the system handle corrections to a finalized daily inventory sheet?
* **Quick Answer:**
  Staff or managers open the finalized worksheet and click "Correct Sheet" to launch the Daily Correction Modal. They enter the corrected usage numbers and a mandatory explanation. The system calculates the usage delta, adjusts batch stock via FEFO, logs an audited revision record, and increments the sheet's revision number.
* **Expanded Answer:**
  Finalized worksheets are locked against accidental overwrites. When a legitimate counting mistake is discovered, the user invokes the RPC `apply_daily_sheet_correction`. The procedure computes the difference $\Delta = (\text{New Usage}) - (\text{Old Usage})$. If $\Delta > 0$, it deducts the extra consumed units from batches via FEFO. If $\Delta < 0$, it restores the over-deducted units back to batches. It then appends a revision record in `public.daily_inventory_revisions` storing the actor ID, reason, and full pre/post state JSON.
* **Evidence:** [src/features/daily-inventory/components/DailyCorrectionModal.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/daily-inventory/components/DailyCorrectionModal.tsx), migration `20261018110000_critical_workflow_repairs.sql`.
* **Possible Follow-Up:** *"Can anyone delete revision history?"*
  * *Answer:* No. The `daily_inventory_revisions` table has RLS policies that permit `INSERT` and `SELECT` but strictly forbid `UPDATE` and `DELETE`, ensuring an immutable audit trail.
* **Truth / Status Note:** Verified in current source and tests.

---

## Category F: Database, APIs & Realtime Architecture

### Q-F01: Why did you use PostgreSQL RPC stored procedures instead of putting business logic in the React frontend?
* **Quick Answer:**
  Putting stock deduction and finalization logic in the frontend is insecure and susceptible to race conditions, network failures, and client tampering. Executing transactions inside PostgreSQL stored procedures (`SECURITY DEFINER` RPCs) guarantees atomic, all-or-nothing execution directly on the database engine.
* **Expanded Answer:**
  If a multi-step stock deduction was written in JavaScript—such as reading batches, subtracting numbers in the browser, and sending individual update queries—a network drop midway through would leave the inventory in a corrupted, half-deducted state. Furthermore, a malicious user could inspect network traffic and alter values. By wrapping the operation in a PL/pgSQL stored procedure (`consume_stock`), PostgreSQL executes the locks, calculations, batch updates, movement logging, and threshold triggers inside a single atomic transaction.
* **Evidence:** [docs/06_API_RPC_AND_INTEGRATION_REFERENCE.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/06_API_RPC_AND_INTEGRATION_REFERENCE.md).
* **Possible Follow-Up:** *"What does ACID mean in relation to these RPCs?"*
  * *Answer:* Atomicity (all updates succeed or all roll back), Consistency (rules and non-negative constraints are never violated), Isolation (concurrent transactions do not interfere due to row locks), and Durability (committed changes survive system restarts).
* **Truth / Status Note:** Verified in migrations.

### Q-F02: How does Supabase Realtime work, and which tables are subscribed to?
* **Quick Answer:**
  Supabase Realtime listens to PostgreSQL's Write-Ahead Log (WAL) and broadcasts database row changes (`INSERT`, `UPDATE`, `DELETE`) to connected client browsers over WebSockets within 100ms. We subscribe to 16 core tables in [useRealtimeSync.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/inventory/hooks/useRealtimeSync.ts).
* **Expanded Answer:**
  When any client commits a transaction, PostgreSQL writes the change to its WAL. Supabase's Realtime server (built in Elixir) tails the WAL stream and broadcasts `postgres_changes` events. In our frontend, `useRealtimeSync` maintains a single multiplexed WebSocket channel. When an event arrives—for example, an update on `inventory_items`—the hook dispatches an invalidation to TanStack Query, prompting an immediate background refetch so all staff screens update without a page reload.
* **Evidence:** [src/features/inventory/hooks/useRealtimeSync.ts: lines 20-168](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/inventory/hooks/useRealtimeSync.ts#L20-L168).
* **Possible Follow-Up:** *"What happens if the WebSocket connection drops due to unstable bistro Wi-Fi?"*
  * *Answer:* The Supabase Realtime client automatically attempts reconnection with exponential backoff. Upon reconnecting, TanStack Query invalidates active queries, refetching fresh state to ensure no dropped events cause desynchronization.
* **Truth / Status Note:** Verified in current source.

### Q-F03: How does KUVENTORY handle timezones, and why is `Asia/Manila` critical?
* **Quick Answer:**
  All business dates are standardized to `Asia/Manila` (Philippine Standard Time, UTC+8) via our custom utility [src/lib/businessDate.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/lib/businessDate.ts). This prevents UTC boundary errors where early morning shifts (00:00 to 07:59 PHT) would otherwise be attributed to the previous calendar day.
* **Expanded Answer:**
  Standard cloud servers store timestamps in UTC. In the Philippines (UTC+8), when staff work an early morning shift at 02:00 AM on October 19, the UTC time is still 18:00 on October 18. If the application used standard UTC `toISOString().split('T')[0]`, today's opening worksheet would be labeled October 18, overwriting yesterday's records. `getBusinessDateString()` forces formatting using `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' })`, ensuring strict date consistency across all shifts.
* **Evidence:** [src/lib/businessDate.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/lib/businessDate.ts), [src/__tests__/businessDate.test.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/__tests__/businessDate.test.ts) (5 passing unit tests).
* **Possible Follow-Up:** *"What happens if the browser doesn't support the Intl timezone API?"*
  * *Answer:* The function includes a catch block that calculates a millisecond timezone offset fallback (`date.getTime() + (8 * 60 + date.getTimezoneOffset()) * 60 * 1000`) to guarantee an accurate `YYYY-MM-DD` string.
* **Truth / Status Note:** Verified in source and tests.

---

## Category G: Security, Authorization & Session Management

### Q-G01: What is Row Level Security (RLS), and how does KUVENTORY use it?
* **Quick Answer:**
  Row Level Security is a PostgreSQL security mechanism that evaluates authorization rules on every individual row during database queries. Even if an attacker inspects network traffic and tries to query the database directly, PostgreSQL rejects unauthorized rows at the database engine level.
* **Expanded Answer:**
  Traditional web applications rely entirely on frontend or API middleware to check user permissions. In KUVENTORY, RLS is enabled on all 18 tables in `public`. When a user sends a query, PostgREST passes their JWT to PostgreSQL. Policies evaluate `auth.uid() = user_id` or check the caller's role in `public.profiles`. For example, staff members (`USER`) can read items but are blocked from inserting or deleting catalog items, while audit logs are restricted exclusively to `SUPER_ADMIN`.
* **Evidence:** [supabase/migrations/20260908210000_database_hardening_and_security.sql](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/migrations/20260908210000_database_hardening_and_security.sql).
* **Possible Follow-Up:** *"Can someone bypass RLS by calling the database with the public anonymous key?"*
  * *Answer:* No. The public anonymous key only grants access to rows explicitly permitted to unauthenticated or authenticated roles under RLS. Without a valid signed JWT containing an authorized `auth.uid()`, sensitive tables return empty sets or 401 Unauthorized errors.
* **Truth / Status Note:** Verified in migrations.

### Q-G02: How does the Single-Session Lease Engine prevent account sharing?
* **Quick Answer:**
  When a user logs in, a unique device UUID is recorded in `public.system_sessions`. The client sends a heartbeat every 30 seconds to maintain the lease. If the account logs in from another phone or computer, the newer device claims the lease, causing the older device's heartbeat to fail and forcing an immediate logout.
* **Expanded Answer:**
  Credential sharing among employees often caused unrecorded shift errors because multiple staff members were logged in under the same account on different counter stations. Our single-session lease engine enforces a 1-to-1 relationship between an authenticated user ID and an active device in `public.system_sessions`. When Device B logs in, `renew_session_lease` revokes Device A's record. Within 30 seconds, Device A's heartbeat detects the revocation, clears its local tokens, and redirects the user to `/login` with an informative banner.
* **Evidence:** [src/features/auth/services/sessionLeaseService.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/auth/services/sessionLeaseService.ts), migration `20261004220000_single_session_lease_and_recovery_engine.sql`.
* **Possible Follow-Up:** *"What if an employee simply closes their browser without logging out?"*
  * *Answer:* Each lease is stamped with `lease_expires_at = now() + INTERVAL '2 minutes'`. If no heartbeat is received within 2 minutes, the lease expires automatically, freeing the account to log in on any device.
* **Truth / Status Note:** Verified in current source.

### Q-G03: What is Emergency Maintenance Lockdown, and who can bypass it?
* **Quick Answer:**
  Emergency Maintenance Lockdown is a security toggle in the Super Admin console that immediately blocks all standard staff (`USER`) and managers (`ADMIN`) from accessing the system, displaying a maintenance screen. Only `SUPER_ADMIN` accounts can bypass the lockdown.
* **Expanded Answer:**
  If a severe data drift, active cyber attack, or database recovery operation is underway, normal operations must be halted to prevent corrupted writes. Toggling maintenance mode updates `system_settings.maintenance_mode = 'true'`. Supabase Realtime pushes this state change to all connected clients. In `RequireAuth.tsx`, the route guard intercepts all navigation and renders the `EmergencyMaintenanceScreen` for non-super-admin users. The Super Admin retains full access to `/super-admin` to execute drift repairs or investigate audit logs.
* **Evidence:** [src/features/auth/components/RequireAuth.tsx: lines 23-26](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/auth/components/RequireAuth.tsx#L23-L26), [src/features/admin/components/super/SuperSecurityTab.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/admin/components/super/SuperSecurityTab.tsx).
* **Possible Follow-Up:** *"How is maintenance mode deactivated?"*
  * *Answer:* The Super Admin toggles maintenance mode back to OFF in the Security & Access tab, which sets `maintenance_mode = 'false'` in `system_settings`, instantly restoring normal access across all connected terminals.
* **Truth / Status Note:** Verified in current source and tests.

---

## Category H: Super Admin Operations & Disaster Recovery

### Q-H01: Why does a Super Admin console exist separately from standard Admin Settings?
* **Quick Answer:**
  Standard Admin Settings (`/admin`) are designed for store managers to handle daily business operations like staff accounts, supplier contacts, and menu categories. The Super Admin Console (`/super-admin`) is a standalone operations center for system-level governance, infrastructure telemetry, audit logs, and disaster recovery.
* **Expanded Answer:**
  Separating store management from technical governance adheres to the **Principle of Least Privilege**. Store managers need to add items and manage barista shifts, but they should not have the ability to terminate active device leases, trigger emergency maintenance lockdowns, inspect raw security audit logs, or run database drift scripts. The Super Admin console encapsulates 10 technical domains restricted exclusively to the business owner or lead system architect.
* **Evidence:** [src/features/admin/pages/SuperAdminPage.tsx](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/admin/pages/SuperAdminPage.tsx), [src/features/admin/components/super/](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/admin/components/super/).
* **Possible Follow-Up:** *"Can a store manager see the Super Admin link in the sidebar?"*
  * *Answer:* No. The navigation sidebar checks `role === 'SUPER_ADMIN' || role === 'MASTER_ADMIN'`. If the user is not a Super Admin, the link is completely omitted from the DOM, and navigating directly to `/super-admin` triggers an Access Denied barrier.
* **Truth / Status Note:** Verified in source code and route guards.

### Q-H02: What is a "Recovery Point" in KUVENTORY, and does it restore the database from the browser?
* **Quick Answer:**
  A Recovery Point is a verified metadata checkpoint saved in `public.recovery_points` that logs system scope manifests and data integrity statuses. In our audited codebase, browser-side multi-table restore is held in a safe disabled state pending an atomic backend RPC.
* **Expanded Answer:**
  In `SuperRecoveryTab.tsx`, administrators can create recovery checkpoints and download complete app-level JSON exports. However, during our architectural safety audit, we identified that attempting to restore multiple relational tables directly from a client-side browser loop lacks atomic transaction rollback guarantees—if the browser tab closed midway through, the database would be left in an inconsistent state. We disabled the browser restore button in safe read-only mode. Production database restores are executed via Supabase Point-in-Time Recovery (PITR) or `pg_dump` SQL restores.
* **Evidence:** [src/features/admin/components/super/SuperRecoveryTab.tsx: lines 182-200](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/admin/components/super/SuperRecoveryTab.tsx#L182-L200), commit `135f10b`.
* **Possible Follow-Up:** *"What is the correct procedure to restore from a backup?"*
  * *Answer:* The system administrator uses Supabase's managed daily backup restore or decompresses and pipes the latest `.sql.gz` dump directly into PostgreSQL via `gunzip < backups/kuventory-*.sql.gz | psql "$DATABASE_URL"`.
* **Truth / Status Note:** Verified in current source. Safety limitation accurately disclosed.

---

## Category I: Testing, Quality Assurance & Release Gates

### Q-I01: What testing suites exist, and what are the latest verified results?
* **Quick Answer:**
  KUVENTORY has 16 automated Vitest test files containing **107 passing unit and integration tests (0 failures)**, verified on 2026-10-19 in 8.15 seconds. In addition, strict TypeScript typechecking passes with 0 errors, and Oxlint passes with 0 errors.
* **Expanded Answer:**
  Our automated test suite covers all critical mathematical calculations, FEFO batch sorting, concurrency clamps, single-session leasing, Asia/Manila timezone formatting, and CSV formula injection defenses. The suite executes via `npm test` on every local commit and runs automatically on every pull request via our GitHub Actions CI pipeline ([.github/workflows/ci.yml](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/.github/workflows/ci.yml)).
* **Evidence:** [src/**/__tests__/](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/), [.github/workflows/ci.yml](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/.github/workflows/ci.yml).
* **Possible Follow-Up:** *"Can you name three specific tests that passed?"*
  * *Answer:* Yes: `inventoryCalculations.test.ts` (12 tests verifying ending stock and zero clamps), `concurrencyAndLocking.test.ts` (5 tests verifying non-negative invariants), and `csvSecurity.test.ts` (3 tests verifying formula injection neutralization).
* **Truth / Status Note:** Verified by actual execution on 2026-10-19.

### Q-I02: What is the difference between a unit test, integration test, and E2E test in this project?
* **Quick Answer:**
  A unit test evaluates a single isolated function (like `calculateEndingStock`); an integration test evaluates multiple cooperating modules (like React Query interacting with our Realtime hook); and an E2E (End-to-End) test runs a headless browser via Playwright to simulate real user clicks and workflows from login to export.
* **Expanded Answer:**
  In KUVENTORY, Vitest executes our unit and integration tests in an in-memory `jsdom` environment in under 10 seconds. Playwright (`@playwright/test` `^1.62.1`) handles end-to-end tests across Chromium, Firefox, and WebKit viewports in `e2e/`. E2E tests verify complete user scenarios—such as logging in, filling out a daily worksheet, opening the correction modal, and verifying that revision numbers update on screen.
* **Evidence:** [vitest.config.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/vitest.config.ts), [playwright.config.ts](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/playwright.config.ts).
* **Possible Follow-Up:** *"Why not run all E2E tests in standard GitHub Actions CI?"*
  * *Answer:* Playwright E2E tests require either a dedicated live Supabase test database or a running local Docker emulator. To prevent CI flakiness and credential leakage, GitHub Actions CI runs Vitest unit/integration tests and static typechecking, while E2E suites are executed against staging preview environments.
* **Truth / Status Note:** Verified in CI and test configs.

---

## Category J: Limitations, Trade-Offs & Future Work

### Q-J01: What is the single biggest architectural limitation of KUVENTORY today?
* **Quick Answer:**
  The lack of an offline write queue. While the application shell loads instantly offline via PWA caching, submitting stock deductions and finalizations requires an active network connection to acquire PostgreSQL row-level locks and enforce non-negative stock invariants.
* **Expanded Answer:**
  In distributed systems, offline write synchronization (such as local IndexedDB mutation queues) requires complex conflict-resolution strategies like CRDTs (Conflict-free Replicated Data Types) or Last-Write-Wins. In a physical restaurant inventory where two baristas might consume the same physical bottle of syrup while disconnected, Last-Write-Wins would result in negative stock balances or lost audit history. We made an intentional architectural trade-off: **we prioritize immediate data consistency over offline availability**.
* **Evidence:** [docs/15_KNOWN_ISSUES_RISKS_AND_ROADMAP.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/15_KNOWN_ISSUES_RISKS_AND_ROADMAP.md).
* **Possible Follow-Up:** *"How would you implement offline writing safely in a future release?"*
  * *Answer:* By assigning local batch reservations or allocating discrete station inventory quotas to specific terminals before shifts go offline, synchronizing reservations when reconnected.
* **Truth / Status Note:** Architectural limitation accurately disclosed.

### Q-J02: What would you improve in the next engineering cycle?
* **Quick Answer:**
  Our top two priorities are: first, implementing an atomic PostgreSQL stored procedure to re-enable transactional 1-click database restores in the Super Admin console; and second, deploying a containerized backup worker to execute automated daily database dumps independent of cloud provider dashboards.
* **Expanded Answer:**
  From a feature perspective, we would also integrate mobile camera barcode and QR-code scanning to allow baristas to scan supplier expiration date barcodes during batch receiving, eliminating manual date entry typos. Long-term, we envision expanding the single-store schema into a multi-tenant architecture supporting multiple bistro branch locations under a shared central management dashboard.
* **Evidence:** [docs/15_KNOWN_ISSUES_RISKS_AND_ROADMAP.md: Section 3](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/15_KNOWN_ISSUES_RISKS_AND_ROADMAP.md#3-prioritized-engineering-roadmap).
* **Possible Follow-Up:** *"What did this project teach you about software architecture?"*
  * *Answer:* It taught me that real-world business logic cannot rely on frontend validation alone. True data integrity, non-negative invariants, and concurrency control must be enforced at the database layer using transactions, locks, and strict constraints.
* **Truth / Status Note:** Verified in roadmap documentation.
