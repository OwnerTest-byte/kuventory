# KUVENTORY Enterprise · Kape Uno Bistro

**KUVENTORY** is an artisanal bistro inventory management and operations system built with React 19, TypeScript, Tailwind CSS, Vite, and Supabase PostgreSQL.

---

## ☕ Key Architectural Features

- **Artisanal Bistro Visual Language:** Refined Espresso `#1F1816`, Burgundy `#611A1F`, and Brushed Gold `#D4AF37` design system with `Playfair Display` and `Inter` typography.
- **Worker-First Daily Worksheet:** High-contrast portion and per-case count inputs with auto-calculated expected balances and variance tracking.
- **FEFO Batch Allocation & Expiration Engine:** First-Expired, First-Out queueing with zero-quantity batch pruning and live threshold warnings.
- **Tier 0 Master Admin Console:** Dedicated superuser console (`/settings?tab=master`) with full database exports, dry-run backup validators, and emergency sheet overrides.
- **Immutable Audit Trails:** PostgreSQL-backed atomic inventory transactions, stock movement history, and staff visitor tracking.
- **Responsive Across All Form Factors:** Optimized for mobile phones (390px/393px), tablets (768px/820px), laptops (1280px), and desktops (1920px).

---

## 👑 Role Architecture

| Role | Hierarchy | Access Scope |
| :--- | :--- | :--- |
| **`MASTER_ADMIN`** | **Tier 0 Root** | Full system authority, one-click database backups, dry-run disaster recovery, sheet force overrides, role assignments (`master@kapeuno.com`) |
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
- **Playwright Real-Browser E2E:** `npx playwright test` (90 / 90 tests passed across Chromium, Firefox, WebKit, Mobile Safari, Mobile Chrome, and 10 viewports)

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
