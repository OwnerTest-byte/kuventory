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
| **FFRC-07** | Synthetic Email & Account Recovery | `@kuventory.com` addresses are technical login IDs, not mailboxes; recovery via phone OTP/assisted tickets; zero fake success. | `LoginForm.tsx`, `passwordResetService.ts`, `ResetPasswordPage.tsx` | Vitest & E2E recovery specs |
| **FFRC-08** | Client Untrusted Parameter Boundary | Eliminate caller-supplied `p_success`; lockout tracking strictly server-enforced; separate failed counter from authenticated reset. | `loginLockoutService.ts`, `20261024200000_comprehensive_auth_and_trust_boundary_repair.sql` | `loginLockoutAndRecovery.test.ts` (10 tests) |
| **FFRC-09** | Modal Geometry System | Configurable `DialogSize` prop (`sm` to `5xl`, `full`); prevent mobile clipping and vertical blowout. | `src/components/ui/dialog.tsx`, `MyProfileModal.tsx`, `CorrectionRequestModal.tsx` | `responsive_multi_device.spec.ts` |
| **FFRC-10** | Notification Route Storage & Live Recovery | `target_id` TEXT storage; one-time status credential; live admin-review status on the login screen. | `20261025200000_notification_route_storage_and_realtime_repair.sql`, `LoginForm.tsx`, `recoveryTicketStore.ts` | `routeStorageMigrationContract.test.ts`, `recoveryAndLockoutUi.test.tsx` |
| **FFRC-11** | Actionable Error Standard | Every failure: plain title + meaning + next step; no raw internals; no blind retries on unknown outcomes. | `src/lib/errors.ts`, `ErrorState.tsx`, stock/report/admin surfaces | `errors.test.ts`, `ErrorState.test.tsx` |
| **FFRC-12** | Wrong-Identifier Attempt Cooldown | 5 unknown-identifier submissions per identifier/15 min → 2-minute cooldown (NOT a lockout); exact-identifier hashed state resets the allowance; correct identifiers never blocked. | `20261025230000` + `20261025240000_recovery_attempt_state_exact_identifier.sql`, `passwordResetService.ts`, `LoginForm.tsx` | `recoveryAttemptStateMigrationContract.test.ts`, `loginLockoutAndRecovery.test.ts`, `recoveryAndLockoutUi.test.tsx` |
| **FFRC-13** | 6th-Attempt Administrator Verification | Two-stage lockout mirroring recovery: 5 failures → 30-min timed cooldown (self-releasing); the 6th attempt → no-timer Administrator Lockout with a contact pop-up; cleared only by admin unlock, successful sign-in, or verified RESOLVE_RESET. | `20261026000000` + `20261026120000` + `20261026130000_login_two_stage_cooldown_admin_lockout.sql`, `AdminContactModal.tsx`, `LoginForm.tsx`, `LoginLockoutsTab.tsx` | `loginTwoStageCooldownMigrationContract.test.ts`, `signinEscalationMigrationContract.test.ts`, `recoveryAndLockoutUi.test.tsx` |
| **FFRC-14** | Staff Change Request Pipeline | STAFF cannot add/remove/edit/adjust/reassign/archive anything directly — every structural change is a request (7 types) reviewed by admins with the requested context; Approve & Apply executes server-side in-transaction; Return/Reject require notes; FAILED never reports success. Direct writes blocked by RLS + trigger. | `20261026160000_staff_change_requests_and_role_boundary.sql`, `StaffRequestModal.tsx`, `MyRequestsPanel.tsx`, `StaffChangeRequestsQueue.tsx` | `staffChangeRequestsMigrationContract.test.ts` |
| **FFRC-15** | Strict Roles & System Health | Exactly three roles (STAFF/ADMIN/SUPER_ADMIN) — legacy USER normalized, constraint enforced, every RPC allowlist canonical; live view-ACL divergence (dashboard permission-denied) healed with idempotent grants + `inspect_authenticated_grants()`; session banner requires 2 consecutive UNKNOWN heartbeats; stale deactivation replays re-verify before sign-out. | `20261026150000_strict_roles_and_grants_repair.sql`, `AuthContext.tsx`, `utils.ts`, `RequireAuth.tsx` | `strictRolesMigrationContract.test.ts`, `sessionLeaseReliability.test.ts` |

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

---

### FFRC-07: Synthetic Login Identifier & Password Recovery Trust Boundary

* **Problem & User Outcome:** Synthetic addresses such as `staff@kuventory.com` are internal system login identifiers and do not have deliverable email inboxes. Prompting users to check an inbox they cannot access produces support deadlock and false success impressions. User outcome: clear notification that generated addresses are login identifiers; password reset directs users to verified SMS OTP or assisted administrator recovery with out-of-band identity verification.
* **Current-State Trace:** `LoginForm.tsx` $\to$ `passwordResetService.ts` $\to$ `account_recovery_factors` / `account_recovery_requests` $\to$ `ResetPasswordPage.tsx`.
* **Invariants:**
  * Never claim a reset email was delivered to an inaccessible `@kuventory.com` account.
  * An arbitrary requester cannot type a phone number and receive an OTP to reset someone else's account.
  * Password reset requires an authenticated recovery grant (`type=recovery` hash or `PASSWORD_RECOVERY` event); regular signed-in sessions cannot access the reset page directly.
* **Failure Modes & Safe Behavior:**
  * *No verified phone on file:* System guides operator to submit an assisted recovery request with an opaque reference ID.
  * *Network/RPC failure on reset request:* Fails visibly with support contact instructions; never shows a false green "Reset Link Sent" card.
  * *Direct navigation to `/reset-password` without token:* Redirects to `/login` with an informative notification.

---

### FFRC-08: Client Untrusted Parameter Boundary & Login Lockout Security

* **Problem & User Outcome:** The previous lockout implementation accepted a client-supplied `p_success` boolean via public RPC `record_login_attempt`, allowing a malicious actor to manipulate attempt counters or lock arbitrary users out. User outcome: client code calls `record_failed_login_attempt` (which only increments failure counters) and authenticated users call `reset_my_login_lockout` (which resets counters using `auth.uid()`).
* **Current-State Trace:** `loginLockoutService.ts` $\to$ `record_failed_login_attempt` / `reset_my_login_lockout` $\to$ `login_attempts` table.
* **Invariants:**
  * Unauthenticated clients cannot reset failed attempt counters.
  * Authentication success claims are never accepted from unauthenticated browser parameters.
  * Accounts lock server-side after 5 consecutive failures for a 30-minute cooldown window.
* **Failure Modes & Safe Behavior:**
  * *Malicious client sends fake success:* Blocked; `record_failed_login_attempt` only increments failures.
  * *Brute force attack:* Server locks the account on the 5th attempt — **no timer: release is administrator-unlock-only** (20261026120000); opaque lockout tokens prevent user enumeration.

---

### FFRC-09: Responsive Modal Geometry & Dialog Sizing System

* **Problem & User Outcome:** Fixed `sm:max-w-sm` styles caused profile and inventory correction modals to squish inputs, clip tables, and overflow viewports vertically on laptops and mobile devices. User outcome: modals adapt cleanly to content with configurable `DialogSize` (`sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, `4xl`, `5xl`, `full`) and enforce `max-h-[calc(100dvh-2rem)] overflow-y-auto`.
* **Current-State Trace:** `src/components/ui/dialog.tsx` $\to$ `DialogContent` $\to$ `MyProfileModal.tsx`, `CorrectionRequestModal.tsx`.
* **Invariants:**
  * Modals must never clip or overflow beyond the browser viewport on any screen width from 320px to 1920px.
  * Wide tabular content inside modals scrolls horizontally within its container without breaking modal borders.
* **Failure Modes & Safe Behavior:**
  * *Small viewport (320px–412px):* Dialog automatically shrinks to `w-[95vw]` with vertical scroll.
  * *Large data table in modal:* Container applies `overflow-x-auto` while title wraps cleanly with `wrap-break-word`.

### FFRC-10: Notification Route Storage & Live Recovery Status

* **Problem & User Outcome:** `notifications.target_id` and `audit_logs.target_id` were UUID columns while every writer stored navigation route strings (`/settings?tab=users`, `/items/<id>`), so every such INSERT failed with `22P02 invalid input syntax for type uuid` — silently breaking assisted-recovery ticket creation, password-reset notifications, low-stock/expiry cron alerts, maintenance broadcasts, and correction notifications. User outcome: route strings are the documented storage format (TEXT), and the login screen now shows a live "Administrators are reviewing your recovery request" state that survives reloads (sessionStorage cache, credential never on disk) and resolves to an honest completed/rejected outcome.
* **Current-State Trace:** `submit_assisted_recovery_request` $\to$ `notifications(target_id TEXT)` $\to$ `AssistedRecoveryQueue` (realtime refetch) $\to$ `review_assisted_recovery_request` decision $\to$ `check_assisted_recovery_status` $\to$ `LoginForm` RecoveryPendingCard.
* **Invariants:**
  * `target_id` accepts any route string; existing UUID values preserved as text.
  * The requester's status credential is returned exactly once and never written to disk (sessionStorage only, cleared on outcome).
  * Ticket status only reaches `COMPLETED` inside the same transaction that performs the authorized password reset.
  * Anonymous clients learn ticket state only through the reference+credential RPC — never a realtime broadcast.
* **Failure Modes & Safe Behavior:**
  * *Status check transport failure:* pending card stays with "Status check unavailable — retrying automatically"; storage is not cleared.
  * *Invalid reference/credential pair:* tracking stops silently; no state is fabricated.
  * *Realtime subscription drop (admin queue):* badge falls back to "Polling" and the 15s bounded poll remains authoritative-fallback.
* **Observability & Recovery:** `security_events` rows for submission/throttle/decision; admin queue Live/Polling indicator; migration contract test `routeStorageMigrationContract.test.ts` + component suites in `recoveryAndLockoutUi.test.tsx`.

### FFRC-11: Actionable Error Handling Standard

* **Problem & User Outcome:** Failures surfaced as raw `error.message` passthrough, silent empty tables on query error, and blocking `alert()`s (sometimes while the open modal showed nothing). User outcome: every failure states what happened, what it means, and the next step — with input preserved and a real recovery action.
* **Current-State Trace:** thrown value / Supabase error $\to$ `normalizeUserError` (`src/lib/errors.ts`, builds on `ErrorClass` taxonomy) $\to$ `ErrorState` component $\to$ surface-specific recovery action (Retry / Refresh Data / adjust input / official support channel).
* **Invariants:**
  * RPC-authored human messages pass through; machine noise (fetch failed, timeouts, unknown outcomes) and internal jargon (SQL, schema names, tokens) are replaced with curated copy.
  * `retrySafe` marks which failures can be retried without duplicating effects — `OUTCOME_UNKNOWN` never blind-retries.
  * Errors clear or update only after authoritative recovery, never on a local countdown.
* **Failure Modes & Safe Behavior:**
  * *Stock update failure:* modal stays open with entered values and an inline explanation.
  * *Query failure on landing/reports:* ErrorState with Refresh Data instead of a silent empty screen.
  * *Admin role-toggle failure:* inline ErrorState instead of `alert()`.
* **Observability & Recovery:** `src/lib/__tests__/errors.test.ts` (classification + normalization + pass-through/jargon rules) and `ErrorState.test.tsx` (rendering + retry wiring).

### FFRC-12: Wrong-Identifier Attempt Cooldown on Recovery Requests

* **Problem & User Outcome:** The recovery existence gate stopped ghost tickets, but nothing bounded repeated submissions for identifiers that match no account — an abusive or confused client could probe identifiers forever. User outcome: five wrong submissions per identifier within 15 minutes show an honest countdown ("N attempts remaining before a short cooldown"); the fifth starts a **2-minute cooldown — explicitly not a lockout** — with the same live button countdown as the ticket cooldown, and the allowance fully resets once the cooldown expires.
* **Current-State Trace:** `submit_assisted_recovery_request` v5 (advisory lock `kuventory_recovery_unknown:` $\to$ exact-identifier state read in `account_recovery_attempt_state` keyed by sha256 of the identifier $\to$ cooldown/window reset rules $\to$ structured `attempts_remaining` / `unknown_identifier_cooldown` payload) $\to$ `submitAssistedRecoveryTicket` (structured resolution, no throw) $\to$ `LoginForm` attempts hint / cooldown countdown; `check_assisted_recovery_cooldown` v3 reports the later of ticket and unknown-identifier cooldowns so a reopened dialog stays truthful. *Defect history:* the initial cut (20261025230000) keyed the counter on the masked email; a live probe proved `mask_email` collapses distinct identifiers (`manager@`/`monitor@` $\to$ `m***r@…`), letting one identifier's attempts throttle another instantly — fixed per-exact-identifier in 20261025240000.
* **Invariants:**
  * A **correct** identifier is never blocked by this mechanism; the existing-account ticket path is unchanged.
  * The counter is per **exact identifier** (sha256-hashed key — no raw identifier stored; distinct identifiers never share state even when their masks collide); allowance resets when the cooldown expires or the 15-minute window lapses.
  * The state table is RLS-deny-all with client grants revoked; only the SECURITY DEFINER RPCs touch it.
  * No lockout side effects: no `account_security_state` writes, no lockout tokens, no account state modification.
  * Counting and cooldown math are serialized per identifier under the advisory transaction lock — concurrent submissions cannot undercount.
* **Failure Modes & Safe Behavior:**
  * *5th wrong attempt:* cooldown response with authoritative `next_allowed_at`; further attempts throttled with live remaining seconds and no additional attempt events.
  * *Cooldown expiry or 15-minute lapse:* allowance returns to five fresh attempts (state-table reset under the same lock).
  * *Dialog reopened mid-cooldown:* `check_assisted_recovery_cooldown` v3 surfaces the active unknown-identifier cooldown with the correct message.
* **Observability & Recovery:** `security_events` rows (`ASSISTED_RECOVERY_UNKNOWN_ACCOUNT`, `..._UNKNOWN_THROTTLED`, `..._UNKNOWN_COOLDOWN`) with masked identifiers + per-identifier counters in `account_recovery_attempt_state` (admin SQL only); migration contract tests `recoveryUnknownIdentifierCooldownMigrationContract.test.ts` (20261025230000) and `recoveryAttemptStateMigrationContract.test.ts` (20261025240000); service + component suites in `loginLockoutAndRecovery.test.ts` / `recoveryAndLockoutUi.test.tsx`.

### FFRC-13: 6th-Attempt Administrator Verification (Two-Stage Lockout)

* **Problem & User Outcome:** After a lockout or wrong-identifier cooldown expired, a still-struggling user simply entered another retry cycle with no human in the loop; conversely, the first no-timer cut removed the legitimate cooldown stage entirely. User outcome (owner decision, 2026-10-25): a **two-stage lockout that mirrors the recovery flow** — **stage 1:** the 5th failed login starts a **30-minute timed cooldown** (rose card, live countdown, self-releases on a server-confirmed EXPIRED); **stage 2:** the **6th attempt** — the first failure after a cooldown completed within 24h — triggers the **Administrator Lockout** (no timer): an amber "Administrator Verification Required" card whose **"Verify with an Administrator" button opens a shared contact pop-up** (`AdminContactModal` — why + where, from the same live directory), and only an administrator's verified unlock, a successful sign-in, or a verified RESOLVE_RESET restores access. The recovery side keeps its own stages (2-min cooldown → 6th wrong → 1-hour panel) and its panel button opens the same popup.
* **Current-State Trace:** stage 1 — `record_failed_login_attempt` (5th failure → `locked_until = now+30min`, token, `last_lockout_at`) $\to$ check/token RPCs carry the remaining time $\to$ rose card countdown; stage 2 — lapsed lock falls through the 6th rule (`last_lockout_at` within 24h → `verification_required=true`, `ACCOUNT_ESCALATION_REQUIRED`) $\to$ `escalation_required` on every response $\to$ amber card + popup; admin loop — `get_locked_accounts` (cooldown rows: remaining time; verification rows: "Admin unlock only") $\to$ `unlock_account` (keeps the anchor) $\to$ the user's card auto-clears within the 10-second poll.
* **Invariants:**
  * Thresholds unchanged: 5 failures/15 min → cooldown; 5 wrong identifiers/15 min → 2-min cooldown. Stage 2 is the layer after a completed cooldown, never instead of it.
  * Stage 2 has no countdown and no self-release; cleared only by admin early unlock (identity verified, reason audited), a successful sign-in, or an identity-verified RESOLVE_RESET (which also clears the wrong-identifier escalation).
  * An unlock keeps `last_lockout_at` — the first failure after a lift re-enters stage 2 (no fresh cycle).
  * A correct identifier on the recovery side always goes straight through to a ticket; no password attempt is sent while the login escalation is active; STATUS_UNKNOWN never touches the flag.
* **Failure Modes & Safe Behavior:**
  * *Transport failure during a check:* the current card persists; unknown ≠ released.
  * *Cooldown lapse while offline:* the next poll/focus reconcile returns EXPIRED and self-releases.
  * *No admin channels published:* the popup (and card) show the honest fallback pointing to the branch supervisor.
* **Observability & Recovery:** masked `ACCOUNT_LOCKED` (stage 'cooldown') and `ACCOUNT_ESCALATION_REQUIRED` events; console badge + per-row release column; contract tests `loginTwoStageCooldownMigrationContract.test.ts` (20261026130000) + `lockoutAdminUnlockOnlyMigrationContract.test.ts` (20261026120000 layered story) + UI suites covering both stages and the popup on both surfaces.
