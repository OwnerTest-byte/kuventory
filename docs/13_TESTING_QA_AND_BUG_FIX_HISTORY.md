# KUVENTORY — Testing Architecture, QA Audits & Bug-Fix Chronology

```
Document:               docs/13_TESTING_QA_AND_BUG_FIX_HISTORY.md
Audience:               QA Leads, Technical Examiners, Software Architects, Security Engineers
Purpose:                Test execution commands, actual automated test verification results, test suite directory map,
                        detailed bug-fix chronology with root-cause analysis, and release gate criteria.
Verification Status:    Verified against actual test execution results on 2026-10-19 at HEAD 135f10b
Audit Date:             2026-10-19
Authoritative HEAD SHA: 135f10b807fedec368383c9e34895566da3d69fc
Primary References:     vitest run, tsc --noEmit, oxlint, e2e/, src/**/__tests__/
```

---

## 1. Automated Test Execution Results (Authoritative Audit)

The following test suites were executed directly against the current repository HEAD (`135f10b807fedec368383c9e34895566da3d69fc`) on **2026-10-19**:

### 1.1 Vitest Unit & Integration Test Suite
* **Command Executed:** `npm test` (`vitest run`)
* **Test Runner:** Vitest v4.1.11 with Node.js v22
* **Execution Timestamp:** 2026-10-19 08:44:55 UTC+8
* **Duration:** 8.15 seconds
* **Outcome:** **16 test files passed (16/16), 107 tests passed (107/107), 0 failures**

```
Test Files  16 passed (16)
     Tests  107 passed (107)
  Duration  8.15s (tests 502ms, transform 2.88s, import 25.73s)

 ✓ src/features/daily-inventory/__tests__/stationGrouping.test.ts (3 tests)
 ✓ src/features/inventory/__tests__/concurrencyAndLocking.test.ts (5 tests)
 ✓ src/features/inventory/__tests__/batchFilterAndFefoQueue.test.ts (10 tests)
 ✓ src/features/reports/__tests__/reportsGroupingIntegration.test.ts (1 test)
 ✓ src/__tests__/seoAssets.test.ts (4 tests)
 ✓ src/features/daily-inventory/__tests__/dailyInventoryIntegration.test.ts (4 tests)
 ✓ src/features/inventory/__tests__/notificationRouter.test.ts (9 tests)
 ✓ src/features/daily-inventory/__tests__/inventoryCalculations.test.ts (12 tests)
 ✓ src/__tests__/businessDate.test.ts (5 tests)
 ✓ src/__tests__/serverSecurity.test.ts (10 tests)
 ✓ src/features/inventory/__tests__/concurrentStockDeductionIntegration.test.ts (2 tests)
 ✓ src/__tests__/csvSecurity.test.ts (3 tests)
 ✓ src/features/inventory/__tests__/fefoPriority.test.ts (5 tests)
 ✓ src/features/admin/__tests__/superAdminOperationsConsole.test.ts (19 tests)
 ✓ src/features/inventory/__tests__/imageNormalization.test.ts (10 tests)
 ✓ src/features/auth/__tests__/authValidation.test.ts (5 tests)
```

### 1.2 TypeScript Static Typecheck
* **Command Executed:** `npm run typecheck` (`tsc --noEmit`)
* **TypeScript Compiler:** Version 6.0.3 (strict mode enabled)
* **Outcome:** **0 errors**. Full static type conformity across all 140 source files.

### 1.3 Code Quality & Linter
* **Command Executed:** `npm run lint` (`oxlint`)
* **Linter Engine:** Oxlint v1.81.0 (Rust-based)
* **Outcome:** **0 errors**, 24 React Compiler advisory warnings (set-state-in-effect optimization suggestions).

### 1.4 Production Bundle Compilation
* **Command Executed:** `npm run build` (`tsc -b && vite build`)
* **Duration:** 3.30 seconds
* **Outcome:** **0 errors**. Production bundle successfully compiled in `dist/` with optimized chunk splitting.

---

## 2. Test Suite Directory Map

```
├── e2e/                                                    # Playwright End-to-End Test Specs
│   ├── comprehensive_audit_verification.spec.ts           # Audit workflows and security headers
│   ├── critical_workflow_repairs.spec.ts                  # Post-finalization sheet corrections
│   ├── kuventory_directive_verification.spec.ts           # Core architectural directives
│   ├── master_admin_flow.spec.ts                          # Manager operations and user CRUD
│   ├── negative_stock_prevention.spec.ts                  # Clamping ending stock to zero
│   ├── notification_popup.spec.ts                         # Realtime popover and click-through
│   ├── qa_frontend.spec.ts                                # General UI responsiveness and layout
│   ├── responsive_multi_device.spec.ts                    # Mobile (375px), Tablet, Desktop tests
│   ├── security_and_reports_audit_fixes.spec.ts           # CSV formula injection and report safety
│   ├── single_session_and_fefo_directive.spec.ts          # Single session lease and FEFO priority
│   ├── super_admin_operations_console.spec.ts             # 10 Super Admin tabs verification
│   ├── user_audit_fixes_verification.spec.ts              # Staff daily worksheet workflows
│   └── user_requested_improvements.spec.ts                # Station pills and filter polish
└── src/
    ├── __tests__/                                         # Root System & Security Unit Tests
    │   ├── businessDate.test.ts                           # Asia/Manila timezone formatting (5 tests)
    │   ├── csvSecurity.test.ts                            # CSV formula injection defense (3 tests)
    │   ├── seoAssets.test.ts                              # Favicon, sitemaps, robots.txt (4 tests)
    │   └── serverSecurity.test.ts                         # Helmet, rate limits, CORS (10 tests)
    └── features/
        ├── admin/__tests__/
        │   └── superAdminOperationsConsole.test.ts        # Super Admin tab services & health (19 tests)
        ├── auth/__tests__/
        │   └── authValidation.test.ts                     # Password, email, role validation (5 tests)
        ├── daily-inventory/__tests__/
        │   ├── dailyInventoryIntegration.test.ts          # Shift sheet lifecycle (4 tests)
        │   ├── inventoryCalculations.test.ts              # Total, ending, discrepancy math (12 tests)
        │   └── stationGrouping.test.ts                    # Station category aggregation (3 tests)
        ├── inventory/__tests__/
        │   ├── batchFilterAndFefoQueue.test.ts            # Batch filtering and ordering (10 tests)
        │   ├── concurrencyAndLocking.test.ts              # Concurrency clamp & invariants (5 tests)
        │   ├── concurrentStockDeductionIntegration.test.ts # Simulated concurrent deductions (2 tests)
        │   ├── fefoPriority.test.ts                       # Expiry date sorting & tie-breaking (5 tests)
        │   ├── imageNormalization.test.ts                 # Product image link handling (10 tests)
        │   └── notificationRouter.test.ts                 # Notification deduplication & routing (9 tests)
        └── reports/__tests__/
            └── reportsGroupingIntegration.test.ts         # Report snapshot compilation (1 test)
```

---

## 3. Notable Historical Bug-Fix Chronology

Below is the verified historical bug-fix ledger extracted from Git commits and code diffs across the project lifecycle:

| Bug ID | Date Observed & Commit | Symptom / Problem | Root Cause Analysis | Affected Area / Files | Fix Commit & Verification Evidence | Status at HEAD |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **BUG-01** | 2026-09-03<br/>`fd3e553` | Netlify production build fails on Linux CI runner. | Linux file system case-sensitivity mismatch in import statements (`@/components/Common/...`). | `src/` import paths | Fixed in commit `fd3e553`. Verified in CI. | **Fixed** |
| **BUG-02** | 2026-09-04<br/>`3574f29` | "Database error querying schema" on user creation. | Supabase GoTrue null token parsing bug when creating users without identities. | `admin_create_user` RPC, auth triggers | Fixed in `20260904112028_fix_auth_null_tokens.sql`. | **Fixed** |
| **BUG-03** | 2026-09-05<br/>`e7bde19` | Deleting a catalog item caused database notification trigger to throw foreign key violation. | Notification trigger attempted to reference deleted `item_id` in foreign key constraint. | `supabase/migrations/` trigger functions | Fixed in `20260905002500_...`. Added `ON DELETE CASCADE`. | **Fixed** |
| **BUG-04** | 2026-09-12<br/>`f8f9638` | Supabase linter warning: Public views running with security definer privileges. | Custom PostgreSQL views defaulted to `security_definer`, bypassing querying user's RLS. | `supabase/migrations/` views | Fixed in `20260912030000_fix_security_definer_views.sql`. Views set to `security_invoker = true`. | **Fixed** |
| **BUG-05** | 2026-09-12<br/>`fd432ce` | Ending stock displayed `-0` float glitch when sales equaled stock. | JavaScript IEEE 754 floating-point negation of zero (`-0`). | `src/features/daily-inventory/utils/calculations.ts` | Normalized zero via `Object.is(val, -0) ? 0 : val`. Tested in `inventoryCalculations.test.ts`. | **Fixed** |
| **BUG-06** | 2026-10-04<br/>`05900e0` | Credential sharing allowed multiple staff members to overwrite the same shift simultaneously. | Lack of single-session device lease enforcement. | `src/features/auth/` | Implemented `public.system_sessions` and 30s heartbeat. Migration `20261004220000`. | **Fixed** |
| **BUG-07** | 2026-10-10<br/>`4d38c45` | Excessive consumption allowed ending stock to become negative, corrupting balance ledger. | Lack of floor clamping on ending stock calculations. | `calculations.ts`, database generated column | Added `GREATEST(0, ...)` clamp. Tested in `concurrencyAndLocking.test.ts`. | **Fixed** |
| **BUG-08** | 2026-10-18<br/>`36d1c8e` | Finalized sheet correction edits failed to save row updates and revision number stayed at 0. | Frontend failed to increment revision number before saving and lacked audited delta handling. | `DailyInventoryPage.tsx`, `DailyCorrectionModal.tsx` | Fixed in commit `36d1c8e` and migration `20261018110000`. Verified in Playwright E2E. | **Fixed** |
| **BUG-09** | 2026-10-19<br/>`135f10b` | Fallback telemetry displayed fake "32 active items" and "99.9% uptime" when offline. | Hardcoded fallback sample data in `superAdminService.ts` masked service degradation. | `superAdminService.ts`, `SuperOverviewTab.tsx` | Fallbacks replaced with `0` and `'Unavailable'`. Verified in `superAdminOperationsConsole.test.ts`. | **Fixed** |
| **BUG-10** | 2026-10-19<br/>`135f10b` | Browser restore button exposed simulated 1-click restore without transactional RPC. | Frontend component simulated multi-table restore from client browser without ACID guarantees. | `SuperRecoveryTab.tsx` | Disabled restore button in safe read-only mode pending backend transactional RPC. | **Fixed** |

---

## 4. Known Testing Blind Spots

1. **Live Supabase PostgreSQL Verification:** Vitest tests execute in a mocked/simulated Supabase environment. Full end-to-end multi-worker concurrency tests require a dedicated live or local Supabase Docker instance.
2. **Netlify Edge Headers in Local Development:** Local Vite development (`npm run dev`) does not parse `netlify.toml` headers. Verification of HSTS, CSP, and X-Frame headers must be conducted against Netlify preview deployments or the local Express gateway.
