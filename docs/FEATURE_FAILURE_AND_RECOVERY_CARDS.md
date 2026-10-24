# KUVENTORY — Feature Failure & Recovery Cards (FFRC)

```text
Document:            docs/FEATURE_FAILURE_AND_RECOVERY_CARDS.md
Standard:            Mandated by Section 18 of KUVENTORY_TOTAL_SYSTEM_AUDIT_AND_REMEDIATION_BLUEPRINT.md
Branch:              feat/security-recovery-and-correction-approvals
Status:              Authoritative Design & Verification Register
Audit Date:          2026-10-24
```

---

## Master Register of Feature Failure & Recovery Cards

| Card ID | Target Domain | Core Focus & Invariants Protected | Migration / Code Path | Verification Suite |
| :---: | :--- | :--- | :--- | :--- |
| **FFRC-01** | E2E Isolation | Never execute tests against live production Supabase; zero hardcoded secrets. | `e2e/critical_workflow_repairs.spec.ts` | Playwright remote guard test |
| **FFRC-02** | DB Least Privilege | Revoke `anon`/`PUBLIC` on all mutation RPCs; fail closed without actor fallbacks. | `20261024150000_release_a_authorization_and_grants_hardening.sql` | SQL security tests & Vitest |
| **FFRC-03** | Finalized Corrections | Two-stage approval workflow; zero fake success on RPC cache miss; atomic rollback. | `20261024180000_release_d_finalized_correction_approvals.sql` | `correctionApprovals.test.ts` (13 tests) |
| **FFRC-04** | Inventory Decoupling | Decouple ad-hoc physical deductions from daily tally sheet sync; no 90d fabricated expiries. | `src/features/inventory/api/index.ts`, `20261024190000_blueprint_remediation_p0_and_p1.sql` | Concurrency & FEFO test suites |
| **FFRC-05** | Auth & Session Integrity | Roles derived strictly from DB profile; single session lease checks before takeover. | `AuthContext.tsx`, `LoginForm.tsx`, `20261024170000_release_c_login_lockout_and_account_security.sql` | `sessionLeaseReliability.test.ts`, `loginLockoutAndRecovery.test.ts` |
| **FFRC-06** | Cross-Device & Responsive | Universal viewport adaptation (320px–1440px), table horizontal scroll, WCAG 2.2 touch targets. | Modals, Queues, Data Tables | Chromium, Firefox, WebKit, Mobile viewport checks |

---

### FFRC-01: E2E Test Isolation & Production Guard

* **Problem & User Outcome:** E2E specs previously contained hardcoded passwords and a remote Supabase project URL, risking accidental production mutation or test-induced maintenance locks. The user outcome is complete isolation: tests run only on dedicated local/disposable environments and immediately halt if a remote URL is detected without explicit authorization.
* **Current-State Trace:** `e2e/critical_workflow_repairs.spec.ts` $\to$ `assertSafeE2EEnvironment()` $\to$ `process.env.E2E_ALLOW_REMOTE`.
* **Invariants:** Automated test runners can NEVER mutate a remote `*.supabase.co` instance without explicit `E2E_ALLOW_REMOTE=true`; no hardcoded passwords in test files.
* **Failure Modes & Safe Behavior:**
  * *Remote URL configured without override:* Test suite throws `SecurityError: ABORTING E2E TEST: Attempted to run Playwright E2E suite against a remote Supabase project`.
  * *Missing credentials in environment:* Halts with actionable error asking for `E2E_SUPER_ADMIN_EMAIL` and `E2E_SUPER_ADMIN_PASSWORD`.
* **Observability & Recovery:** Test runner emits high-visibility security alert to console.

---

### FFRC-02: Database Authorization & Least-Privilege Grants Hardening

* **Problem & User Outcome:** Privileged mutation RPCs (`consume_stock`, `finalize_daily_inventory`, `correct_finalized_daily_inventory`, `adjust_stock_to_target`) granted `EXECUTE` to `anon` and contained identity fallback logic `(SELECT id FROM profiles ... LIMIT 1)`. User outcome: only authenticated users with verified roles (`STAFF`, `ADMIN`, `SUPER_ADMIN`) can execute mutations.
* **Current-State Trace:** PostgreSQL RPCs $\to$ `auth.uid()` $\to$ `profiles.role` verification.
* **Invariants:** Missing authenticated identity always raises exception; no anonymous caller can execute stock mutations or report finalizations.
* **Failure Modes & Safe Behavior:**
  * *Unauthenticated call (`auth.uid() IS NULL`):* `RAISE EXCEPTION 'Authentication required: caller has no active Supabase Auth session'`.
  * *Unauthorized role:* `RAISE EXCEPTION 'Access denied: insufficient privileges'`.
  * *Direct SQL bypass:* Blocked by revoked `PUBLIC`/`anon` grants and strict RLS policies.
* **Recovery:** Rollback entire transaction; return standard `UNAUTHENTICATED` or `FORBIDDEN` error.

---

### FFRC-03: Finalized Daily Inventory Correction Approval & Atomic Reconciliation

* **Problem & User Outcome:** Correcting a finalized daily sheet previously relied on client-side revision metadata saving with fake `success: true` even when the database RPC failed. User outcome: operator submits a formal correction request; Admin reviews; Super Admin approves; the database atomically reconciles batch stock, ledger movements, report versions, and audit logs within a single transaction.
* **Current-State Trace:** `CorrectionRequestModal.tsx` $\to$ `correctionRequestService.ts` $\to$ `submit_correction_request` RPC $\to$ `CorrectionRequestsQueue.tsx` $\to$ `apply_approved_daily_inventory_correction` RPC.
* **Invariants:**
  * A finalized worksheet is immutable; corrections create typed, sequential revisions.
  * Requester cannot self-approve their own request.
  * Every approved correction creates matching compensating `stock_movements` and adjusts `stock_batches` with row-level locks.
  * If any write fails, all writes roll back.
* **Failure Modes & Safe Behavior:**
  * *RPC missing from cache (PGRST202):* Service throws `SCHEMA_MISMATCH` with actionable correlation ID; zero fake success.
  * *Insufficient stock during downward reconciliation:* `apply_approved_daily_inventory_correction` aborts with `INSUFFICIENT_STOCK`.
  * *Concurrent revision submission:* Row lock on `daily_inventory_correction_requests` prevents duplicate applications.

---

### FFRC-04: Inventory Mutation Decoupling & Stock Adjustment Integrity

* **Problem & User Outcome:** `removeStock` previously called `consume_stock` and then added the quantity to the daily tally sheet's PM usage. When the daily sheet was finalized, `finalize_daily_inventory` consumed the stock a second time. Additionally, `adjust_stock_to_target` fabricated 90-day expiry dates. User outcome: physical deductions are recorded once; worksheets act as audit tallies; batch expiries must be genuine.
* **Current-State Trace:** `src/features/inventory/api/index.ts` $\to$ `consume_stock` RPC $\to$ `inventory_transactions`.
* **Invariants:**
  * One physical stock removal produces exactly one net ledger deduction.
  * Every batch has a verified expiration date or explicit non-expiring classification; zero fabricated 90-day dates.
  * Batch quantities are finite and non-negative ($\ge 0$).
* **Failure Modes & Safe Behavior:**
  * *Requested quantity > physical stock:* Throws explicit `INSUFFICIENT_STOCK` error; zero silent clamping.
  * *Missing batch expiry on upward adjustment:* Fails closed with `RAISE EXCEPTION 'Expiry date is required for batch creation'`.

---

### FFRC-05: RBAC Role Authority & Deterministic Session Claims

* **Problem & User Outcome:** Role elevation previously inferred `SUPER_ADMIN` from `user.email === 'superadmin@kuventory.com'`. Normal login unilaterally took over active device leases. User outcome: roles are governed strictly by the database; logging in from a second device prompts for takeover confirmation rather than silently evicting the active terminal.
* **Current-State Trace:** `AuthContext.tsx` $\to$ `profiles.role` $\to$ `sessionLeaseService.ts` $\to$ `claimSessionLease(userId, false)`.
* **Invariants:**
  * A user's role is determined exclusively by the database record verified by PostgreSQL triggers.
  * Normal login queries with `forceTakeover = false`; existing sessions are never evicted without explicit operator consent.
* **Failure Modes & Safe Behavior:**
  * *Active lease held elsewhere:* Login returns `status: OCCUPIED` and opens `TakeoverModal`.
  * *Transient heartbeat network loss:* Session state enters `UNKNOWN` without immediate eviction; attempts bounded reconnection.

---

### FFRC-06: Universal Responsive Layouts, Cross-Browser Compatibility & Accessibility

* **Problem & User Outcome:** Narrow mobile displays (320px–393px) could suffer from squished tables, overlapping modal buttons, or inaccessible touch controls. User outcome: seamless usability on any device (smartphones, tablets, laptops, desktops) across Chromium, Safari/WebKit, Firefox, and Edge.
* **Current-State Trace:** Modals, Data Tables, Forms, Layout Shell $\to$ Tailwind CSS utilities (`w-[95vw]`, `overflow-x-auto min-w-*`, `focus-visible:ring-2`, `min-h-[44px]`).
* **Invariants:**
  * Zero horizontal page clipping on viewport widths from 320px to 1440px.
  * All touch targets meet WCAG 2.2 AA minimum dimensions ($\ge 44\text{px}$).
  * Tabular data wraps in horizontal scroll containers with preserved column proportions.
* **Failure Modes & Safe Behavior:**
  * *320px smartphone screen:* Modals scale to `w-[95vw]`; tables scroll horizontally smoothly (`overflow-x-auto min-w-115`); buttons stack cleanly.
  * *Keyboard-only navigation:* Visible focus rings (`focus-visible:ring-2 focus-visible:ring-emerald-500`) and dialog focus trapping.
