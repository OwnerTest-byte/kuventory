# KUVENTORY Enterprise · Kape Uno Bistro

**KUVENTORY** is an artisanal bistro inventory management and operations system built with React 19, TypeScript, Tailwind CSS, Vite, and Supabase PostgreSQL.

---

## ☕ Key Architectural Features

- **Artisanal Bistro Visual Language:** Refined Espresso `#1F1816`, Burgundy `#611A1F`, and Brushed Gold `#D4AF37` design system with authentic mathematical oval logo silhouette and capsule badge containers.
- **Worker-First Daily Worksheet:** High-contrast portion and per-case count inputs with auto-calculated expected balances, instant zero-stock real-time alerts, and warning badges.
- **FEFO Batch Allocation & Expiration Engine:** First-Expired, First-Out queueing with zero-quantity batch pruning and live threshold warnings.
- **Real-Time Notification Pop-Up Engine:** Replaced static bell icons with a high-visibility floating toast system with Supabase Realtime WebSocket listeners, instant out-of-stock triggers, and 1-click entity redirection.
- **Resilient Product Photography:** Direct upload and smart URL pasting (Google Drive, Imgur, Dropbox) with automated high-speed CDN conversion, `referrerPolicy="no-referrer"`, and proxy fallback.
- **Enterprise Session Exclusivity & Fast Teardown:** Single active session enforcement with a 30s lease, 10s heartbeat, browser `keepalive` beacon on exit (`pagehide`/`beforeunload`), and automatic logout detection on browser quit.
- **Tier 0 Master Admin Console:** Dedicated superuser console (`/settings?tab=master`) with live activity telemetry, fluid scrollable sub-tabs with chevrons, monthly automated save-state checkpointing, point-in-time rollback restore, and balance drift healing.
- **Immutable Audit Trails:** PostgreSQL-backed atomic inventory transactions, stock movement history, and staff visitor tracking.
- **Responsive Across All Form Factors:** Verified across 10 distinct viewports: mobile phones (360px–412px), tablets (768px/820px), laptops (1280px/1366px), and desktops (1440px/1920px).
- **Clean Architecture & Zero Dead Code:** Completely purged of orphaned components, unreferenced modules, and legacy artifacts.

---

## 👑 Role Architecture

| Role | Hierarchy | Access Scope |
| :--- | :--- | :--- |
| **`MASTER_ADMIN`** | **Tier 0 Root** | Full system authority, monthly automated save-states, point-in-time disaster recovery restore, live system telemetry stream, balance drift healing, role assignments (`master@kapeuno.com`, `master@kuventory.com`) |
| **`ADMIN`** | **Tier 1 Manager** | Store catalog management, batch adjustments, daily sheet finalization, reporting, staff accounts |
| **`USER`** | **Tier 2 Staff** | Daily worksheet counts, stock level visibility, personal password updates |

---

## 🚀 Setup & Local Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create `.env.local` using `.env.example`:

```bash
cp .env.example .env.local
```

Provide your Supabase URL and Anon Key:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Database Migrations

```bash
npx supabase start
npx supabase db push
```

### 4. Run Development Server

```bash
npm run dev
```

---

## 🧪 Quality & Verification Suite

- **TypeScript Typecheck:** `npm run typecheck`
- **Unit & Integration Tests:** `npm test -- --run`
- **Playwright Real-Browser E2E:** `npx playwright test` (100 / 100 scenarios passed across Chromium, Firefox, WebKit, Mobile Safari, Mobile Chrome, and 10 viewports with zero DOM mocks)

---

## 🌐 Netlify Deployment

KUVENTORY is pre-configured for automated deployment to Netlify via `netlify.toml`:

1. Build Command: `npm run build`
2. Publish Directory: `dist`
3. SPA Redirects: `/*` -> `/index.html` (HTTP 200)
4. Environment Variables Required on Netlify:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

---

## 📚 Consolidated Documentation Library

The documentation is organized into 5 clearly labeled master manuals under [`docs/`](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/README.md):

1. **[01_USER_OPERATIONS_MANUAL.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/01_USER_OPERATIONS_MANUAL.md)** — Daily inventory shift routines, Beginning/Add/AM/PM calculations, FEFO batch receipts, and exports. *(Companion Word document: [`KUVENTORY_USER_GUIDE.docx`](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/KUVENTORY_USER_GUIDE.docx))*
2. **[02_MASTER_ADMIN_AND_SECURITY_GOVERNANCE.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/02_MASTER_ADMIN_AND_SECURITY_GOVERNANCE.md)** — Master Admin Tier 0 absolute authority, credentials, zero-trust barrier, 1-click snapshots, and disaster recovery.
3. **[03_SYSTEM_ARCHITECTURE_AND_TECHNICAL_SPEC.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/03_SYSTEM_ARCHITECTURE_AND_TECHNICAL_SPEC.md)** — Full-stack React + Supabase PostgreSQL architecture, database schema, concurrency, and design tokens.
4. **[04_DEPLOYMENT_OPERATIONS_AND_DISASTER_RECOVERY.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/04_DEPLOYMENT_OPERATIONS_AND_DISASTER_RECOVERY.md)** — Local setup, Netlify CI/CD, disaster recovery continuity plan, and contingency playbooks.
5. **[05_QA_TESTING_AUDIT_AND_RELEASE_REPORT.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/05_QA_TESTING_AUDIT_AND_RELEASE_REPORT.md)** — Playwright real-browser test suites (90/90 passed across all 5 browser profiles and 10 viewports), multi-device responsive audit, and PRIDE deliverables.
6. **[SOFTWARE_DESIGN_PROJECT_DOCUMENTATION.md](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/SOFTWARE_DESIGN_PROJECT_DOCUMENTATION.md)** — Exhaustive capstone software design project documentation.
