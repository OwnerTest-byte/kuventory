# KUVENTORY — Workflow Verification Register

```text
Document:   docs/WORKFLOW_VERIFICATION_REGISTER.md
Purpose:    Living map of every system workflow: what connects to what, the
            verified trace result, fixes applied, and the test guarding it.
Round:      2026-10-25 whole-system round (strict roles STAFF/ADMIN/SUPER_ADMIN,
            system-health repairs, staff request pipeline). Commit of record
            recorded in CHANGELOG.
Method:     every workflow traced end-to-end (UI button → handler → service →
            RPC → RLS/policy → UI state → realtime/refetch), verified by the
            test suites; live behavior verified via probe scripts + the manual
            smoke list at the bottom.
```

## Role model (strict)

| Role | Scope |
| :--- | :--- |
| **STAFF** | Daily Inventory workspace (sales AM/PM, ADD spinner, requests), Reports (view + export), Notifications, Account (own password). Everything else redirects to /daily-inventory. |
| **ADMIN** | Everything: catalog CRUD, stock, stations, finalize, corrections approval, staff request queue, users (quota 3), lockouts, thresholds, settings. |
| **SUPER_ADMIN** | Everything ADMIN has, plus the maintenance console (lockdown, force override, session revocation, checkpoints, diagnostics). |

Legacy `'USER'` rows are normalized to `'STAFF'` (migration 20261026150000); the constraint makes any other value impossible.

## Workflow map — verified

| # | Workflow | Trace (source → authority → sync) | Result | Fix applied this round | Guard |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | Sign-in | LoginForm → `check_account_lockout` pre-check → `signInWithPassword` → lease claim | ✅ verified | role literals updated (strict roles) | `loginLockoutAndRecovery.test.ts`, `recoveryAndLockoutUi.test.tsx` |
| 2 | Two-stage lockout | 5 failures → 30-min timed cooldown (rose card, live countdown, EXPIRED self-release) → 6th attempt → no-timer Administrator Lockout + contact popup | ✅ verified | allowlist literals (`record_failed_login_attempt` STAFF) | `loginTwoStageCooldownMigrationContract.test.ts` |
| 3 | Administrator verification | amber card → popup (`AdminContactModal`) → admin unlock (anchor kept) → 10s poll auto-restores form | ✅ verified | RBAC literals | `signinEscalationMigrationContract.test.ts` |
| 4 | Assisted recovery | existence gate → attempts countdown → cooldown → ticket + one-time credential → 20s poll → RESOLVE_RESET single-transaction | ✅ verified | review RBAC literals (STAFF targets) | `recoveryAttemptStateMigrationContract.test.ts`, `signinEscalationMigrationContract.test.ts` |
| 5 | Remember-me & boot | flag settled before sign-in → localStorage vs sessionStorage → boot sweep discards legacy tokens | ✅ verified | — | `rememberAwareAuthStorage.test.ts` |
| 6 | Session lease & heartbeat | 20s heartbeat → ACTIVE/renew; UNKNOWN ×2 → banner; REVOKED → terminal; silent takeover on refresh | ✅ verified | banner now requires 2 consecutive UNKNOWN; stale `is_active` replay re-verifies before sign-out | `sessionLeaseReliability.test.ts` |
| 7 | Dashboard overview | InventoryLandingPage → `inventory_stock_view` (security_invoker) → RLS rows | ✅ fixed | **grants heal**: `GRANT SELECT … TO authenticated` + inspection RPC `inspect_authenticated_grants()` — root cause was live-ACL divergence | `strictRolesMigrationContract.test.ts` |
| 8 | Inventory catalog (ADMIN) | add/stock-in/consume/adjust/archive/delete → admin RPCs → realtime `inventory_items`/`stock_batches` invalidations | ✅ verified | Add Item button gated to admins (route also STAFF-redirected) | suite green + register smoke |
| 9 | Catalog (STAFF) | redirected to /daily-inventory; no mutation UI anywhere | ✅ fixed | `RequireStaffRedirect` route guard + header gate | `staffChangeRequestsMigrationContract.test.ts` (RLS layer) |
| 10 | Daily worksheet entry | STAFF/ADMIN type AM/PM → `daily_inventory_items` UPDATE (DRAFT policy) → autosave indicator; ADD spinner → `receive_daily_inventory_stock` | ✅ verified | receive/draft allowlists → STAFF; **trigger** restricts staff edits to add/sales_am/sales_pm (BEG read-only for staff) | `staffChangeRequestsMigrationContract.test.ts` |
| 11 | Worksheet structure (ADMIN) | Add Item / Add Station / Delete Table / Reassign / Remove → direct actions (admin-only UI + RLS) | ✅ fixed | direct paths gated `canEditStructure`; RLS: INSERT/DELETE admin on daily tables | `staffChangeRequestsMigrationContract.test.ts` |
| 12 | Worksheet structure (STAFF) | same actions become **requests** → `submit_staff_change_request` → My Requests panel (realtime + 30s) | ✅ new | StaffRequestModal + MyRequestsPanel + row "Request Reassign/Remove" | `staffChangeRequestsMigrationContract.test.ts` |
| 13 | Request review (ADMIN) | Settings → Staff Requests tab → review card with requested context → Approve & Apply (in-transaction) / Return / Reject → requester notified | ✅ new | StaffChangeRequestsQueue + RPC; FAILED-not-fake-success | `staffChangeRequestsMigrationContract.test.ts` |
| 14 | Finalize day | STAFF/ADMIN: Finalize → immutable + FEFO + snapshot (staff-level action restored by owner decision, 20261026180000); mistakes handled by the corrections flow (row 15) | ✅ fixed | Finalize button restored for all roles; RPC allowlist includes STAFF | `loginLockoutAndRecovery.test.ts` + register smoke |
| 15 | Finalized corrections | STAFF request → PENDING_ADMIN → admin Approve & Apply / Return / Reject (self-approval blocked) → auto-apply | ✅ verified (unchanged) | — | `roleCleanupAndCorrectionWorkflow.test.ts` |
| 16 | Reports & exports | ReportsLibrary/ReportView → RLS-scoped queries → client-side PDF/Excel/CSV — available to BOTH roles (read-only output) | ✅ verified | grants heal covers the report queries | suite green + register smoke |
| 17 | Notifications | per-type RLS visibility → realtime push + 30s refetch → mark-read (own) → click-through `target_id` routes (all resolve to real routes) | ✅ verified | new types target `/settings?tab=requests` (admins) and `/daily-inventory` (requester) | `notificationSecurityIsolation.test.ts` |
| 18 | User management (ADMIN) | create (role allowlist STAFF/ADMIN/SUPER_ADMIN, quota 3), role toggle, delete | ✅ fixed | `admin_create_user`/`admin_update_user_role` canonical allowlists | `strictRolesMigrationContract.test.ts` |
| 19 | Early unlock (ADMIN/SUPER) | unlock with reason → clears lock + verification (anchor kept) → user's card auto-restores | ✅ verified | hierarchy literal STAFF | `lockoutAdminUnlockOnlyMigrationContract.test.ts` |
| 20 | Maintenance console (SUPER) | lockdown lifecycle, force override, session revocation, checkpoints, diagnostics | ✅ verified (unchanged) | — | suite green + register smoke |
| 21 | Settings & account | STAFF: account (password) + about; ADMIN: + restaurant info, users, lockouts, corrections, requests, notifications, activity | ✅ fixed | staff tabs `['account','about']` (restaurant form removed — DB already admin-only) | register smoke |
| 22 | Profile ↔ recovery screens | My Profile opt-in + channels → `get_public_support_contacts` → one-card-per-admin directory on recovery dialog + lockout card + popup, live sync | ✅ verified | — | `SupportContactDirectory.test.tsx`, `MyProfileModal.test.tsx` |

## Manual smoke (10 minutes, after applying both migrations)

1. **STAFF account**: sign in → lands on Daily Inventory; nav shows only Daily Inventory / Reports / Notifications / Settings; typing AM/PM saves with ✓; BEG is read-only; row shows "Request Reassign"/"Request Remove" → submit one, see it in My Requests.
2. **STAFF blocked**: open `/items` directly → redirected to /daily-inventory; **Finalize Day works** (count, finalize, then corrections if wrong).
3. **STAFF Reports**: open a report, export CSV/PDF — works.
4. **ADMIN account**: sign in → full nav; Staff Requests tab shows the pending request with the requester + reason; **Approve & Apply** → the change appears in the system instantly; requester's My Requests shows "Approved & applied".
5. **ADMIN catalog**: Add Item / Update Stock / Edit / Archive all function; dashboard stat cards show real numbers (grants heal verified).
6. **Lockout drill (optional)**: 5 wrong passwords → rose cooldown card counts down; after expiry 1 more failure → amber verification card → popup lists admins; unlock from Settings → Login Lockouts → the form returns within ~10s.
7. **Refresh drill**: refresh mid-session on a remembered device — session restores (no login bounce); an unexpected sign-out lands on /login with the "You were signed out" note.
