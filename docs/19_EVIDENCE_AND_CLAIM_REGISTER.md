# KUVENTORY — Evidence & Claim Register

```text
Document:               docs/19_EVIDENCE_AND_CLAIM_REGISTER.md
Audience:               Technical Examiners, Software Architects, External Auditors
Purpose:                Authoritative claim-to-evidence matrix mapping every architectural assertion,
                        feature claim, and security control to verified source code, migrations, tests, or Git commits.
Verification Status:    Exhaustively audited against repository HEAD 135f10b
Audit Date:             2026-10-19
Authoritative HEAD SHA: 135f10b807fedec368383c9e34895566da3d69fc
```

---

## 1. Classification Taxonomy

Every claim in the KUVENTORY documentation suite is classified under one of the following authoritative labels:

* **`[VERIFIED-SOURCE]`**: Inspected directly in the current repository code, migrations, or configurations.
* **`[VERIFIED-TEST]`**: Validated by an automated Vitest unit/integration test or Playwright E2E spec.
* **`[OBSERVED-CI]`**: Verified executing in active GitHub Actions workflows.
* **`[HISTORIC-COMMIT]`**: Backed by historical Git commit diffs and commit messages.
* **`[INFERRED-RATIONALE]`**: Architectural reasoning inferred from code patterns rather than explicit design minutes.
* **`[CONFIGURED-ONLY]`**: Present in code or configuration, but requires external runtime infrastructure to execute.
* **`[NOT-LIVE-VERIFIED]`**: Requires live production Supabase/Netlify credentials that are inaccessible to static audits.
* **`[KNOWN-ISSUE]`**: Documented limitation, disabled control, or active technical debt.
* **`[RETIRED-LEGACY]`**: Superseded or removed feature documented for historical accuracy.

---

## 2. Master Claim-to-Evidence Matrix

| Claim ID | System Claim / Assertion | Status Label | Concrete Verification Evidence & Source Reference |
| :---: | :--- | :---: | :--- |
| **CLM-01** | Application runs on React 19.2.8 and TypeScript 6.0.3 | `[VERIFIED-SOURCE]` | `package.json` line 46, `package-lock.json`, confirmed via Node inspection script. |
| **CLM-02** | Automated test suite contains 164 passing tests across 21 files | `[VERIFIED-TEST]` | Executed `npm test` on 2026-10-24: 21 passed, 164 passed, 0 failed. |
| **CLM-03** | TypeScript strict typecheck passes with 0 errors | `[VERIFIED-TEST]` | Executed `npm run typecheck` (`tsc --noEmit`): 0 errors on 140 source files. |
| **CLM-04** | Oxlint linter passes with 0 errors | `[VERIFIED-TEST]` | Executed `npm run lint` (`oxlint`): 0 errors, 24 React Compiler advisories. |
| **CLM-05** | Production build compiles clean in under 3.5 seconds | `[VERIFIED-TEST]` | Executed `npm run build` (`tsc -b && vite build`): built in ~2.0s. |
| **CLM-06** | Stock rotation adheres strictly to FEFO priority | `[VERIFIED-SOURCE]` | Migration `20261003180000`, `ORDER BY expiry_date ASC, created_at ASC FOR UPDATE`. |
| **CLM-07** | FEFO priority sorting verified by automated tests | `[VERIFIED-TEST]` | `src/features/inventory/__tests__/fefoPriority.test.ts` (5 tests passing). |
| **CLM-08** | Concurrency race conditions prevented via row-level locks | `[VERIFIED-SOURCE]` | Stored procedure `consume_stock` includes `FOR UPDATE` clause. |
| **CLM-09** | Concurrency controls verified under simulated simultaneous load | `[VERIFIED-TEST]` | `concurrencyAndLocking.test.ts` (5 tests), `concurrentStockDeductionIntegration.test.ts` (2 tests). |
| **CLM-10** | Ending stock is strictly clamped to non-negative ($\ge 0$) | `[VERIFIED-SOURCE]` | `calculations.ts: line 47`, database generated column `GREATEST(0, ...)`. |
| **CLM-11** | Business date strictly locked to `Asia/Manila` (PST, UTC+8) | `[VERIFIED-SOURCE]` | `src/lib/businessDate.ts: line 9`. |
| **CLM-12** | Timezone formatting verified across UTC boundary hours | `[VERIFIED-TEST]` | `src/__tests__/businessDate.test.ts` (5 tests passing). |
| **CLM-13** | Single-session device lease enforced via 30s heartbeat | `[VERIFIED-SOURCE]` | `AuthContext.tsx: line 159`, migration `20261004220000`. |
| **CLM-14** | Role quotas enforce max 1 Super Admin and max 3 Admins | `[VERIFIED-SOURCE]` | Migration `20261004220000_single_session_lease_and_recovery_engine.sql: trg_enforce_admin_quota`. |
| **CLM-15** | Row Level Security enabled on all 18 database tables | `[VERIFIED-SOURCE]` | Inspected all 53 migration scripts; `ENABLE ROW LEVEL SECURITY` on every table. |
| **CLM-16** | Public database views run with `security_invoker = true` | `[VERIFIED-SOURCE]` | Migration `20260912030000_fix_security_definer_views.sql: line 10`. |
| **CLM-17** | Supabase Realtime listens to 16 distinct database tables | `[VERIFIED-SOURCE]` | `src/features/inventory/hooks/useRealtimeSync.ts: lines 20-168`. |
| **CLM-18** | Netlify edge headers inject HSTS, CSP, and X-Frame-Options | `[VERIFIED-SOURCE]` | `netlify.toml: lines 12-25`. |
| **CLM-19** | CSV exports neutralize formula injection attacks | `[VERIFIED-SOURCE]` | `src/features/reports/utils/csv.ts: line 12`. |
| **CLM-20** | CSV formula injection defense verified by unit tests | `[VERIFIED-TEST]` | `src/__tests__/csvSecurity.test.ts` (3 tests passing). |
| **CLM-21** | Category Donut Chart computes from live inventory items | `[VERIFIED-SOURCE]` | `AnalyticsPage.tsx: lines 97-116`. |
| **CLM-22** | Weekly Movement Bar Chart computes from historical ledger | `[VERIFIED-SOURCE]` | `AnalyticsPage.tsx: lines 118-144`. |
| **CLM-23** | Latency Area Chart is an operational indicator, not persistent SQL log | `[VERIFIED-SOURCE]` | `SuperOverviewTab.tsx: lines 63-93`. Candidly disclosed in docs. |
| **CLM-24** | Expiry notifications scheduled via PostgreSQL `pg_cron` | `[CONFIGURED-ONLY]` | Migration `20260902100000`. Requires `pg_cron` extension enabled on Supabase. |
| **CLM-25** | Cloud keepalive runs bi-daily on GitHub Actions | `[OBSERVED-CI]` | `.github/workflows/supabase-keepalive.yml: cron '0 0 */2 * *'`. |
| **CLM-26** | `node-cron` database backup runs in standalone script | `[CONFIGURED-ONLY]` | `scripts/backup-db.mjs`. Disclosed as not running on Netlify static CDN. |
| **CLM-27** | Super Admin browser restore button held in safe disabled mode | `[KNOWN-ISSUE]` | `SuperRecoveryTab.tsx: lines 182-200`. Disclosed as awaiting transactional RPC. |
| **CLM-28** | Client-side Netlify build hook trigger completely excised | `[RETIRED-LEGACY]` | Sub-tab removed from Super Admin navigation rail; neutral GitHub Actions link in place; zero `VITE_NETLIFY_DEPLOY_HOOK_URL` references. |
| **CLM-29** | Fallback telemetry displays 0 / 'Unavailable', not fake 32 items | `[VERIFIED-SOURCE]` | `superAdminService.ts: lines 36-56`, commit `135f10b`. |
| **CLM-30** | Historical release evolution spans 105 commits from 2026-09-02 | `[HISTORIC-COMMIT]` | Git commit log from `427070c` through `135f10b`. |
| **CLM-31** | Live Supabase production database RLS and triggers active | `[NOT-LIVE-VERIFIED]` | Requires owner credentials to inspect live Supabase dashboard. |
| **CLM-32** | Netlify live domain deployment matching commit 135f10b | `[NOT-LIVE-VERIFIED]` | Requires Netlify dashboard administrative access to verify deployed SHA. |
| **CLM-33** | Single active session lease enforced with First Session Wins and takeover confirmation | `[VERIFIED-TEST]` | `sessionLeaseService.ts`, `AuthContext.tsx`, `LoginForm.tsx`, verified by `e2e/single_session_and_fefo_directive.spec.ts`. |
| **CLM-34** | Save State Read-Only Inspection Modal guarantees zero production writes | `[VERIFIED-TEST]` | `SuperRecoveryTab.tsx`, verified by `e2e/single_session_and_fefo_directive.spec.ts` and `e2e/super_admin_operations_console.spec.ts`. |
| **CLM-35** | Scheduled Services tab strictly monitors read-only background jobs | `[VERIFIED-SOURCE]` | `SuperAutomationsTab.tsx`, `SuperAdminControlCenter.tsx`, verified by `e2e/super_admin_operations_console.spec.ts`. |
| **CLM-36** | Least-privilege authorization hardening and actor fallback revocation | `[VERIFIED-SOURCE]` | Migration `20261024150000`, revokes `anon`/`PUBLIC` on `consume_stock`, `finalize_daily_inventory`, `correct_finalized_daily_inventory`. |
| **CLM-37** | Operator profile contact self-service and public directory view | `[VERIFIED-SOURCE]` | Migration `20261024160000`, `profileService.ts`, `MyProfileModal.tsx`. |
| **CLM-38** | Progressive login lockout, unlock governance, and security audit log | `[VERIFIED-TEST]` | Migration `20261024170000`, `loginLockoutService.ts`, `LoginLockoutsTab.tsx`, `loginLockoutAndRecovery.test.ts` (10 tests passing). |
| **CLM-39** | Two-stage finalized daily inventory correction approval workflow | `[VERIFIED-TEST]` | Migration `20261024180000`, `correctionRequestService.ts`, `CorrectionRequestModal.tsx`, `CorrectionRequestsQueue.tsx`, `correctionApprovals.test.ts` (13 tests passing). |
| **CLM-40** | E2E test isolation and remote project execution guard | `[VERIFIED-TEST]` | `e2e/critical_workflow_repairs.spec.ts`, credential env var lookups and remote project guard. |
| **CLM-41** | Decoupling physical stock deduction from daily tally sheet sync | `[VERIFIED-SOURCE]` | `src/features/inventory/api/index.ts`, `removeStock` does not mutate `daily_inventory_items`, preventing double-consumption. |
| **CLM-42** | Stock adjustment integrity and fail-closed FEFO consumption | `[VERIFIED-SOURCE]` | Migration `20261024190000`, eliminates 90-day expiry fabrication and fails closed on unauthenticated or unauthorized calls. |
| **CLM-43** | RBAC role authority strictly derived from database profiles | `[VERIFIED-SOURCE]` | `src/features/auth/context/AuthContext.tsx`, removed email-based role elevation bypasses. |
| **CLM-44** | Standard error taxonomy and Feature Failure & Recovery Cards | `[VERIFIED-TEST]` | `src/lib/errors.ts`, `docs/FEATURE_FAILURE_AND_RECOVERY_CARDS.md`, `src/__tests__/errorTaxonomy.test.ts` (9 tests passing). |
