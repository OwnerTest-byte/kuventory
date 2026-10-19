# KUVENTORY™ — Restaurant Inventory & Shift Audit System

[![CI Status](https://github.com/OwnerTest-byte/kuventory/actions/workflows/ci.yml/badge.svg)](https://github.com/OwnerTest-byte/kuventory/actions/workflows/ci.yml)
[![Tests Passing](https://img.shields.io/badge/Vitest-107%2F107%20Passed-brightgreen)](docs/13_TESTING_QA_AND_BUG_FIX_HISTORY.md)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-Strict%206.0.3-blue)](tsconfig.json)
[![React 19](https://img.shields.io/badge/React-19.2.8-61DAFB)](package.json)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4.3.3-38B2AC)](package.json)
[![Supabase Postgres](https://img.shields.io/badge/Supabase-PostgreSQL%2015-3ECF8E)](docs/05_DATABASE_AND_DATA_DICTIONARY.md)

**KUVENTORY** is an enterprise-grade, cloud-native inventory management, perishable batch-tracking, and daily shift audit platform built specifically for **Kape Uno Bistro** in the Philippines. It replaces fragmented paper logs and fragile spreadsheets with an automated, real-time reactive Single Page Application (SPA).

---

## Authoritative Documentation Set (`docs/`)

All project manuals have been unified into a single, source-verified documentation suite under [docs/](docs/README.md):

* **System Planning & History:** [00_PROJECT_OVERVIEW_AND_HISTORY.md](docs/00_PROJECT_OVERVIEW_AND_HISTORY.md)
* **Requirements & Traceability:** [01_REQUIREMENTS_AND_ACCEPTANCE.md](docs/01_REQUIREMENTS_AND_ACCEPTANCE.md)
* **System Architecture:** [02_SYSTEM_ARCHITECTURE.md](docs/02_SYSTEM_ARCHITECTURE.md)
* **Verified Technology Stack:** [03_TECH_STACK_AND_RATIONALE.md](docs/03_TECH_STACK_AND_RATIONALE.md)
* **Features & Route Catalog:** [04_FEATURES_AND_MODULE_CATALOG.md](docs/04_FEATURES_AND_MODULE_CATALOG.md)
* **Database Schema & Migrations:** [05_DATABASE_AND_DATA_DICTIONARY.md](docs/05_DATABASE_AND_DATA_DICTIONARY.md)
* **API, RPC & Realtime Reference:** [06_API_RPC_AND_INTEGRATION_REFERENCE.md](docs/06_API_RPC_AND_INTEGRATION_REFERENCE.md)
* **Auth, Security & RBAC:** [07_AUTH_SECURITY_AND_ROLES.md](docs/07_AUTH_SECURITY_AND_ROLES.md)
* **Inventory Balancing & FEFO Engine:** [08_INVENTORY_DAILY_WORKSHEETS_AND_FEFO.md](docs/08_INVENTORY_DAILY_WORKSHEETS_AND_FEFO.md)
* **Charts, Analytics & File Exports:** [09_REPORTS_CHARTS_AND_EXPORTS.md](docs/09_REPORTS_CHARTS_AND_EXPORTS.md)
* **Automation, Schedulers & Realtime:** [10_AUTOMATION_SCHEDULERS_AND_REALTIME.md](docs/10_AUTOMATION_SCHEDULERS_AND_REALTIME.md)
* **Super Admin Operations Console Runbook:** [11_SUPER_ADMIN_OPERATIONS_MANUAL.md](docs/11_SUPER_ADMIN_OPERATIONS_MANUAL.md)
* **Staff & Manager Operations Manual:** [12_USER_AND_ADMIN_OPERATIONS_MANUAL.md](docs/12_USER_AND_ADMIN_OPERATIONS_MANUAL.md)
* **Testing Architecture & Bug-Fix History:** [13_TESTING_QA_AND_BUG_FIX_HISTORY.md](docs/13_TESTING_QA_AND_BUG_FIX_HISTORY.md)
* **Deployment, Environment & Runbooks:** [14_DEPLOYMENT_ENVIRONMENT_AND_RUNBOOKS.md](docs/14_DEPLOYMENT_ENVIRONMENT_AND_RUNBOOKS.md)
* **Known Issues, Limitations & Roadmap:** [15_KNOWN_ISSUES_RISKS_AND_ROADMAP.md](docs/15_KNOWN_ISSUES_RISKS_AND_ROADMAP.md)
* **Project Defense & Viva Master Q&A (100+ Questions):** [16_PROJECT_DEFENSE_MASTER_QA.md](docs/16_PROJECT_DEFENSE_MASTER_QA.md)
* **Quick Defense Cheat Sheet:** [17_QUICK_DEFENSE_CHEAT_SHEET.md](docs/17_QUICK_DEFENSE_CHEAT_SHEET.md)
* **Glossary & Abbreviations:** [18_GLOSSARY_AND_ABBREVIATIONS.md](docs/18_GLOSSARY_AND_ABBREVIATIONS.md)
* **Evidence & Claim Register:** [19_EVIDENCE_AND_CLAIM_REGISTER.md](docs/19_EVIDENCE_AND_CLAIM_REGISTER.md)
* **Architecture Decision Records (ADRs):** [20_ARCHITECTURE_DECISIONS.md](docs/20_ARCHITECTURE_DECISIONS.md)
* **Document Generation Guide:** [GENERATING_DOCUMENTS.md](docs/GENERATING_DOCUMENTS.md)

---

## Core Engineering Capabilities

* **First-Expired, First-Out (FEFO) Rotation:** Automated stock consumption procedure (`consume_stock`) locks batches with PostgreSQL row-level locks (`SELECT ... FOR UPDATE`), strictly deducting from the earliest expiring batch that is not past its expiration date.
* **Strict Non-Negative Stock Invariant:** Ending inventory balances are mathematically clamped to $\ge 0$ at both the React computation layer and PostgreSQL generated column layer (`GREATEST(0, ...)`), preventing balance ledger corruption.
* **Standardized Operating Timezone:** All shift operations, sheet dates, and expiration calculations are pinned to `Asia/Manila` (PST, UTC+8), eliminating UTC date-truncation bugs during early morning shifts (00:00 - 07:59 PHT).
* **Single-Session Lease Engine:** Prevents concurrent credential sharing across multiple devices. A 30-second heartbeat validates active session leases in `public.system_sessions`, immediately revoking older device sessions upon new device sign-in.
* **Multi-Device Realtime Sync:** Connects to Supabase Realtime over WebSockets, listening to 16 database tables and invalidating TanStack Query caches to reflect changes across all staff terminals in under 100ms.
* **Client-Side Document Compilers:** Generates styled PDF reports (`jsPDF` + `jspdf-autotable`), native Excel workbooks (`exceljs`), and CSV files with active sanitization against CSV formula injection attacks (CWE-1236).
* **Super Admin Operations Console:** A dedicated 10-tab control center at `/super-admin` providing live keepalive ping telemetry, emergency maintenance mode lockdown, audit log inspection, and stock drift diagnostics.

---

## Verified Technology Stack

| Domain | Technology | Declared Version | Lockfile Resolved | Role |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend Framework** | React / React DOM | `^19.2.8` | `19.2.8` | Component rendering engine |
| **Language** | TypeScript | `~6.0.2` | `6.0.3` | Static type safety |
| **Build & Toolchain** | Vite | `^8.2.2` | `8.2.2` | ESM dev server & Rollup bundler |
| **Styling** | Tailwind CSS / Vite Plugin | `^4.3.3` | `4.3.3` | Design tokens & responsive styles |
| **Backend & Database** | Supabase JS / PostgreSQL | `^2.112.4` | `2.112.4` | PostgREST, RLS, Realtime WSS, Auth |
| **State Management** | TanStack React Query | `^5.102.8` | `5.102.8` | Server state caching & invalidation |
| **Client Routing** | React Router DOM | `^7.18.3` | `7.18.3` | SPA routing & role guards |
| **Visualizations** | Recharts | `^3.8.0` | `3.8.0` | SVG Donut, Bar, and Area charts |
| **Testing** | Vitest / Playwright | `^4.1.11` / `^1.62.1` | `4.1.11` / `1.62.1` | Unit, integration & E2E suites |
| **Hosting & CDN** | Netlify Edge CDN | Managed | Managed | SPA rewrites & security headers |

---

## Quick-Start Setup Guide

### Prerequisites

* **Node.js:** `>= 22.0.0` (Verify with `node -v`)
* **npm:** Version 10+ (bundled with Node 22)

### Installation

```bash
# 1. Clone repository
git clone https://github.com/OwnerTest-byte/kuventory.git
cd kuventory

# 2. Install exact locked dependencies
npm ci

# 3. Create local environment file (supply your Supabase keys)
cp .env.example .env.local

# 4. Run automated test suite
npm test

# 5. Start development server
npm run dev
```

### Common Developer Commands

```bash
npm run dev           # Starts local Vite development server at http://localhost:5173
npm run build         # Compiles strict TypeScript and builds production assets to dist/
npm run typecheck     # Executes TypeScript compiler without emitting files (strict check)
npm run lint          # Executes Oxlint linter enforcing code quality
npm test              # Runs Vitest automated test suite (107 tests passing)
npm run test:e2e      # Runs Playwright browser end-to-end test suite
npm run docs:dev-logs # Compiles master Word documentation handover (DEV_LOGS.docx)
```

---

## Project Verification Metadata

* **Authoritative Branch:** `main`
* **Audited Commit HEAD:** `135f10b807fedec368383c9e34895566da3d69fc`
* **Last Verified Date:** `2026-10-19`
* **Automated Test Results:** 16 test files passed, 107 tests passed, 0 failures (Vitest v4.1.11).
* **Typecheck Status:** 0 errors across 140 files (`tsc --noEmit`).
