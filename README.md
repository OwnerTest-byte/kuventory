# KUVENTORY Enterprise · Kape Uno Bistro

**KUVENTORY** is an artisanal bistro inventory management, operational accounting, and supply-chain governance system built with React 19, TypeScript, Tailwind CSS, Vite, and Supabase PostgreSQL.

---

## ☕ Key Architectural Features

- **Artisanal Bistro Visual Language:** Refined Espresso `#1F1816`, Burgundy `#611A1F`, and Brushed Gold `#D4AF37` design system with authentic mathematical oval logo silhouette and capsule badge containers.
- **Worker-First Daily Worksheet & Finalized Sheet Correction:** High-contrast portion and per-case count inputs with auto-calculated expected balances. Authorized managers (`ADMIN`, `SUPER_ADMIN`) can correct finalized days via an auditable revision workflow with differential stock reconciliation (guaranteeing strictly zero duplicate stock deductions or double counts).
- **Standalone Super Admin Control Center (`/super-admin`):** Dedicated privileged control plane completely separated from ordinary Settings, featuring system health telemetry, automated checkpointing, point-in-time disaster recovery restore, active session revocation, and emergency lockdown controls.
- **Authoritative Emergency Maintenance Lockdown:** Full backend and database gate enforcement (`system_settings.maintenance_lock`). Blocks ordinary Staff and Admin logins, rejects direct API mutations, and displays an emergency maintenance lockdown screen, while Super Admin retains emergency access via the standalone control plane.
- **Logout Confirmation & Unsaved Work Protection:** Centralized logout workflow displaying a confirmation modal ("Log out? Are you sure you want to log out?") with unsaved changes detection. Security-enforced session revocations remain immediate.
- **Staff Password Reset Request Logging & Realtime Alerts:** Secure account recovery request workflow recording requests in `password_reset_requests` with lifecycle states (`NEW`, `NOTIFIED`, `IN REVIEW`, `RESOLVED`, `EXPIRED`, `FAILED`). Dispatches realtime admin alerts while returning safe, non-disclosing messages without leaking credentials or account existence.
- **FEFO Batch Allocation & Expiration Engine:** First-Expired, First-Out queueing with zero-quantity batch pruning and live threshold warnings.
- **Real-Time Notification Pop-Up Engine:** High-visibility floating toast system with Supabase Realtime WebSocket listeners, instant out-of-stock triggers, and 1-click entity redirection.
- **Enterprise Session Exclusivity & Fast Teardown:** Single active session enforcement with a 30s lease, 10s heartbeat, browser `keepalive` beacon on exit (`pagehide`/`beforeunload`), and automatic logout detection on browser quit.
- **Responsive Across All Form Factors:** Verified across 10 distinct viewports: mobile phones (360px–412px), tablets (768px/820px), laptops (1280px/1366px), and desktops (1440px/1920px).
- **Clean Architecture & Zero Dead Code:** Completely purged of orphaned components, unreferenced modules, and legacy artifacts.

---

## 👑 Role Architecture

| Role | Hierarchy | Access Scope |
| :--- | :--- | :--- |
| **`SUPER_ADMIN` / `MASTER_ADMIN`** | **Tier 0 Root** | Dedicated Standalone Control Center (`/super-admin`), emergency maintenance lockdown, disaster recovery checkpoints, point-in-time database restore, session lease revocation, audit trail management. |
| **`ADMIN`** | **Tier 1 Manager** | Store catalog management, batch adjustments, daily sheet finalization & correction, password reset request review, reporting, staff accounts. |
| **`USER` / `STAFF`** | **Tier 2 Staff** | Daily worksheet counts, stock level visibility, personal password updates. |

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
- **Unit & Integration Tests:** `npm test` (78 / 78 tests passed)
- **Playwright Real-Browser E2E:** `npx playwright test e2e/critical_workflow_repairs.spec.ts` (100% pass rate with zero DOM mocks across real Chromium, Firefox, WebKit, Mobile Safari, and 10 viewports)

---

## 🌐 Netlify Deployment

KUVENTORY is pre-configured for automated deployment to Netlify via `netlify.toml` with continuous deployment connected to the `main` branch.
