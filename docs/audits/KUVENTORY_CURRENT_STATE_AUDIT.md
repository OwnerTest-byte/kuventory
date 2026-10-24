# KUVENTORY — Current-State Audit and Technical Findings Register

**Audit Baseline**: `OwnerTest-byte/kuventory`  
**Inspected HEAD**: `727a4f761edea7201c67cfdad0fe30babbeafed2` (24 October 2026)  
**Audit Scope**: Repository source code, PostgreSQL migrations, schema contracts, RLS policies, security boundaries, tests, CI workflows, and documentation.  
**Auditor Verification Principle**: Findings are classified strictly into:
- `SOURCE-VERIFIED`: Confirmed in current workspace repository files.
- `STRONG-RISK`: Plausible or probable based on code paths, permissions, or migrations, requiring live environment verification.
- `NOT-LIVE-VERIFIED`: Requires owner execution on the live Supabase / Netlify infrastructure (read-only audit queries provided).

---

## 1. Executive Summary & Audit Matrix

| Finding ID | Severity | Category | Primary Location | Current Status |
| :--- | :--- | :--- | :--- | :--- |
| **KUV-P0-01** | Critical | Auth / Trust Boundary | `20261024170000_release_c_...sql`<br>`loginLockoutService.ts` | **SOURCE-VERIFIED** |
| **KUV-P0-02** | Critical | Test Isolation / Safety | `e2e/critical_workflow_repairs.spec.ts`<br>`src/lib/supabase.ts` | **SOURCE-VERIFIED** |
| **KUV-P0-03** | Critical | Database RLS / Grants | `20260902050500_grants.sql`<br>`20260904140000_...sql` | **SOURCE-VERIFIED** |
| **KUV-P0-04** | High | Auth UX / Truthful State | `LoginForm.tsx`<br>`passwordResetService.ts` | **SOURCE-VERIFIED** |
| **KUV-P0-05** | Critical | UI / Modal Viewport | `src/components/ui/dialog.tsx`<br>`MyProfileModal.tsx`<br>`CorrectionRequestModal.tsx` | **SOURCE-VERIFIED** |
| **KUV-P1-01** | Critical | Data Integrity / Revisions | `20261024180000_release_d_...sql`<br>`correctionRequestService.ts` | **SOURCE-VERIFIED** |
| **KUV-P1-02** | Critical | Stock Integrity / Provenance | `20261024180000_release_d_...sql` | **SOURCE-VERIFIED** |
| **KUV-P1-03** | High | Stock / Sheet Atomicity | `src/features/inventory/api/index.ts` | **SOURCE-VERIFIED** |
| **KUV-P1-04** | High | PostgreSQL Schema Drift | `20261021210000_...sql`<br>`20261024150000_...sql` | **SOURCE-VERIFIED** |
| **KUV-P1-05** | High | Auth Service Architecture | `passwordResetService.ts` | **SOURCE-VERIFIED** |
| **KUV-P1-06** | High | Idempotency / Retries | `correctionRequestService.ts` | **SOURCE-VERIFIED** |
| **KUV-P1-07** | High | Privacy / Data Leakage | `20260902050300_rls_...sql`<br>`20261024170000_...sql` | **SOURCE-VERIFIED** |
| **KUV-P1-08** | High | Governance State Machine | `20261024180000_release_d_...sql` | **SOURCE-VERIFIED** |
| **KUV-P1-09** | High | Docs vs Implementation Drift | `docs/FEATURE_FAILURE_...md` | **SOURCE-VERIFIED** |
| **KUV-P1-10** | High | RBAC Authority Reconciliation | `20261024150000_...sql`<br>`docs/07_AUTH_...md` | **SOURCE-VERIFIED** |
| **KUV-P2-01** | Medium | Profile Privacy & Storage | `MyProfileModal.tsx`<br>`profileService.ts` | **SOURCE-VERIFIED** |
| **KUV-P2-02** | Medium | Testing Coverage | `e2e/responsive_multi_device.spec.ts`<br>`.github/workflows/ci.yml` | **SOURCE-VERIFIED** |
| **KUV-P2-03** | Medium | Deployment Security Headers | `netlify.toml`<br>`public/_headers` | **SOURCE-VERIFIED** |

---

## 2. Detailed Finding Profiles

---

### KUV-P0-01: Pre-Auth `record_login_attempt` Trusts Client-Controlled `p_success`
- **Severity**: Critical (P0)
- **Primary Locations**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/migrations/20261024170000_release_c_login_lockout_and_account_security.sql#L116-L274`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/auth/services/loginLockoutService.ts#L65-L100`
- **Code & SQL Evidence**:
  ```sql
  CREATE OR REPLACE FUNCTION public.record_login_attempt(
    p_email TEXT,
    p_success BOOLEAN,
    p_ip TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
  )
  ...
  IF p_success THEN
    UPDATE public.account_security_state
    SET failed_attempts = 0, locked_until = NULL, lockout_status = 'EXPIRED' ...
  ...
  GRANT EXECUTE ON FUNCTION public.record_login_attempt(TEXT, BOOLEAN, TEXT, TEXT) TO anon, authenticated;
  ```
- **Current Behavior**: Any unauthenticated client calling `supabase.rpc('record_login_attempt', { p_email: 'target@example.com', p_success: true })` can unilaterally clear active lockouts and reset failed counters for any account without possessing valid credentials. Conversely, calling it with `p_success: false` 5 times locks any targeted user account for 30 minutes (Denial of Service).
- **Root Cause**: Placing the trust boundary inside a client-callable RPC accessible by `anon` that accepts an unverified boolean assertion of login success.
- **Real Fix**:
  1. Revoke `EXECUTE` on success-reset logic from `anon`.
  2. Separate failed-attempt recording from success clearing.
  3. Reset lockout only when the user is authenticated (`auth.uid() = profile.id`) or through a trusted administrative unlock RPC.
  4. Apply server-enforced rate-limiting and non-enumerating responses so failed attempts cannot be abused for DoS or account enumeration.
- **Affected Flows**: Login, lockout enforcement, Security Console.
- **Verification & Tests**: Direct SQL test executing as `anon` attempting `p_success = true` on another user; assert error or non-mutation.

---

### KUV-P0-02: E2E Remote Target Guard Only Warns; Retains Hardcoded Credentials & Production Fallbacks
- **Severity**: Critical (P0)
- **Primary Locations**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/e2e/critical_workflow_repairs.spec.ts#L5-L14`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/lib/supabase.ts#L4-L11`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/tests/rpc_test.sql#L21-L26`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/tests/rls_test.sql#L15-L25`
- **Code & SQL Evidence**:
  ```typescript
  // e2e/critical_workflow_repairs.spec.ts
  const targetSupabaseUrl = process.env.PLAYWRIGHT_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://stotgoylyzltzpahuglc.supabase.co';
  const isRemoteTarget = !targetSupabaseUrl.includes('127.0.0.1') && !targetSupabaseUrl.includes('localhost');
  if (isRemoteTarget && process.env.E2E_ALLOW_REMOTE !== 'true') {
    console.warn('⚠️ E2E Production Guard: Target is remote and E2E_ALLOW_REMOTE is not set to true...');
  }
  const directSupabase = createClient(targetSupabaseUrl, targetAnonKey);
  const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD || 'SuperAdmin2026!';
  ```
  ```typescript
  // src/lib/supabase.ts
  export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://stotgoylyzltzpahuglc.supabase.co';
  ```
- **Current Behavior**: If environment variables are omitted, E2E tests default to targeting the live remote Supabase project, log a non-blocking warning, create a live client, and execute maintenance mode updates (`resetMaintenanceToNormal()`). `rpc_test.sql` selects the first live inventory item and modifies stock, while `rls_test.sql` mutates fixed UUID profiles.
- **Root Cause**: Reliance on `console.warn` rather than a hard runtime exception before client initialization, paired with embedded fallback URLs and passwords.
- **Real Fix**:
  1. Remove hardcoded production fallback URLs and test account passwords from tests and `src/lib/supabase.ts`.
  2. Implement an immediate hard abort (`throw new Error(...)`) in test setup before `createClient` if the URL is remote and not on an explicit disposable project ref allow-list.
  3. Refactor `rpc_test.sql` and `rls_test.sql` to execute in an isolated transactional fixture with mandatory `ROLLBACK` or clean teardown.
- **Affected Flows**: CI execution, Playwright runner, developer test commands.
- **Verification & Tests**: Unit test verifying `assertSafeE2EEnvironment()` throws before network initialization when given a remote URL.

---

### KUV-P0-03: Historical Migrations Grant Broad Permissions & Overlapping Permissive Policies
- **Severity**: Critical (P0)
- **Primary Locations**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/migrations/20260902050500_grants.sql`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/migrations/20260904140000_permanent_auth_and_schema_fix.sql`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/migrations/20260906050000_full_crud_for_users_and_admins.sql`
- **Code & SQL Evidence**:
  ```sql
  -- 20260902050500_grants.sql:
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
  -- 20260904140000_permanent_auth_and_schema_fix.sql:
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
  ```
- **Current Behavior**: Broad historical grants and permissive RLS policies (`FOR ALL USING (true)`) were granted in earlier migrations. Because PostgreSQL combines permissive RLS policies with `OR` logic, adding stricter policies in later migrations does not automatically revoke access if an older permissive policy remains active in the database.
- **Root Cause**: Incremental migrations that did not systematically drop legacy policy names or revoke schema-wide grants.
- **Real Fix**:
  1. Author a comprehensive consolidation migration that drops all legacy broad policies by exact name.
  2. Revoke table/routine privileges from `anon` and `PUBLIC` by default across all internal tables.
  3. Grant only minimal, operation-specific privileges to `authenticated` and explicit public RPCs.
  4. Provide owner-run read-only SQL scripts to audit live `pg_policies` and `information_schema.role_table_grants`.
- **Affected Flows**: All REST/PostgREST table queries and RPC endpoints.
- **Verification & Tests**: SQL role-negative tests asserting `anon` receives permission denied on direct table access.

---

### KUV-P0-04: Forgot Password Displays "Request Dispatched" Even When API Fails
- **Severity**: High (P0/P1)
- **Primary Locations**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/auth/components/LoginForm.tsx#L360-L375`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/auth/components/LoginForm.tsx#L705-L715`
- **Code & SQL Evidence**:
  ```typescript
  const { error: resetErr } = await supabase.auth.resetPasswordForEmail(emailToReset, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (resetErr) {
    console.warn('Supabase resetPasswordForEmail warning:', resetErr.message);
  }
  setForgotCooldown(120);
  setForgotMessage('If an account matches this address, a reset link will arrive by email...');
  ```
  ```tsx
  {forgotMessage && (
    <div className="..." role="status">
      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
      <span>Request Dispatched</span>
  ```
- **Current Behavior**: If `supabase.auth.resetPasswordForEmail` returns an error (e.g. rate limit, SMTP misconfiguration, network timeout), the error is merely logged with `console.warn`, and the UI still presents a green success card claiming "Request Dispatched".
- **Root Cause**: Conflating API failure with the non-enumerating generic response design.
- **Real Fix**:
  1. If `resetPasswordForEmail` returns an error, set `forgotError` and display an actionable failure message with administrative support channels; do not render a success card.
  2. If the API returns without error, display neutral text ("Request submitted. If an account matches this address, an email may arrive shortly.") without claiming "Request Dispatched" or confirmed delivery.
- **Affected Flows**: Password recovery flow, login screen.
- **Verification & Tests**: Component unit test mocking `resetPasswordForEmail` failure; assert error alert is rendered and success card is absent.

---

### KUV-P0-05: Shared `DialogContent` Default `sm:max-w-sm` Overrides Custom Modal Widths
- **Severity**: Critical (P0)
- **Primary Locations**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/components/ui/dialog.tsx#L55-L58`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/admin/components/MyProfileModal.tsx#L185`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/daily-inventory/components/CorrectionRequestModal.tsx#L136`
- **Code & SQL Evidence**:
  ```tsx
  // src/components/ui/dialog.tsx
  className={cn(
    "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm ...",
    className
  )}
  ```
  ```tsx
  // MyProfileModal.tsx
  <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto ...">
  ```
  ```tsx
  // CorrectionRequestModal.tsx
  <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto ...">
  ```
- **Current Behavior**: At viewport widths $\ge 640\text{px}$ (`sm`), Tailwind CSS applies `sm:max-w-sm` (24rem / 384px). Because `max-w-2xl` and `max-w-4xl` passed by caller classes are unprefixed, Tailwind Merge treats them as different utility variants and retains `sm:max-w-sm`. The modals are locked to 384px width on tablet and desktop screens, causing severe text clipping, multi-column form distortion, and horizontal table clipping.
- **Root Cause**: Hardcoding responsive modifier `sm:max-w-sm` in the shared default class string of `DialogContent`.
- **Real Fix**:
  1. Remove `sm:max-w-sm` from the shared `DialogContent` default.
  2. Implement an explicit `size` prop or base unconstrained width contract allowing `max-w-2xl`, `max-w-4xl`, etc. to govern at all breakpoints.
  3. Bound popups safely to `max-w-[calc(100vw-2rem)]` and `max-h-[calc(100dvh-2rem)]`.
  4. Ensure only the inner table wrapper in `CorrectionRequestModal` scrolls horizontally, while the outer modal container remains firmly within viewport bounds.
- **Affected Flows**: Profile modal, Finalized Correction Request modal, all custom-sized dialogs.
- **Verification & Tests**: Playwright responsive assertions measuring `getBoundingClientRect().width` at 320, 390, 768, 820, 1024, and 1440 px.

---

### KUV-P1-01: Finalized Correction Apply Lacks Stale Revision Check & Stable Item ID Matching
- **Severity**: Critical Data Integrity (P1)
- **Primary Location**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/migrations/20261024180000_release_d_finalized_correction_approvals.sql#L370-L540`
- **Code & SQL Evidence**:
  ```sql
  -- In apply_approved_daily_inventory_correction:
  UPDATE public.report_items
  SET beg = v_new_beg, add = v_new_add, ...
  WHERE report_id = v_report_id 
    AND item_name = (SELECT name FROM public.inventory_items WHERE id = v_item_id);
  ```
- **Current Behavior**:
  1. `apply_approved_daily_inventory_correction` does not verify that `v_req.expected_revision` matches the current sheet revision under lock. If another correction was approved in the interim, the stale correction proposal is applied on top of the already modified baseline.
  2. If an item ID in `proposed_items` does not exist in `daily_inventory_items`, the loop silently skips it without an exception and marks the request `APPLIED`.
  3. Report items are matched by `item_name` instead of a stable `item_id`, risking silent update failure if an item was renamed.
- **Root Cause**: Absence of optimistic concurrency revision verification and reliance on string names rather than primary keys.
- **Real Fix**:
  1. Lock worksheet `FOR UPDATE` and assert current revision equals `expected_revision`.
  2. Validate that all proposed item IDs exist and belong to the sheet; throw an exception if any item is missing or unrecognized.
  3. Join report items by `item_id` (or assert exactly 1 matching row) and update snapshot atomically.
- **Affected Flows**: Two-stage correction approval, finalized report versioning.
- **Verification & Tests**: SQL integration test attempting to apply a request with stale `expected_revision`; assert rejection.

---

### KUV-P1-02: Finalized Correction Apply Fabricates +90 Day Expiry Dates for Restored Stock
- **Severity**: Critical Data Integrity (P1)
- **Primary Location**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/migrations/20261024180000_release_d_finalized_correction_approvals.sql#L454-L464`
- **Code & SQL Evidence**:
  ```sql
  ELSIF v_delta_consumption < 0 THEN
    PERFORM public.add_stock(
      v_item_id, 
      abs(v_delta_consumption), 
      (CURRENT_DATE + interval '90 days')::DATE, 
      CURRENT_DATE, 
      format('Approved Correction Req %s (Rev %s): Restored %s consumption', ...)
    );
  ```
- **Current Behavior**: When a correction restores stock (reducing recorded consumption or increasing recorded receipts), `add_stock` is invoked with `(CURRENT_DATE + interval '90 days')::DATE`, fabricating an arbitrary 90-day expiry date in contradiction of inventory provenance rules.
- **Root Cause**: Placeholder date arithmetic inserted during initial RPC scaffolding.
- **Real Fix**:
  1. When restoring stock from consumption corrections, reverse the original lot allocation where traceable.
  2. When original lot allocation cannot be determined, inherit the nearest active batch expiry for that item or route the restoration to a designated non-perishable/reconciliation lot with mandatory operator verification.
  3. Completely eliminate the arbitrary `+ 90 days` interval.
- **Affected Flows**: Stock batch creation, FEFO expiry tracking, inventory audits.
- **Verification & Tests**: Verify no stock batch is created with an arbitrary 90-day expiry during correction apply.

---

### KUV-P1-03: `addStock` Commits Physical Stock First, Swallowing Sheet Sync Errors
- **Severity**: High (P1)
- **Primary Location**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/inventory/api/index.ts#L145-L160`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/inventory/api/index.ts#L240-L255`
- **Code & SQL Evidence**:
  ```typescript
  const { error } = await supabase.rpc('add_stock', { ... });
  if (error) throw error;
  // Separate call to sync sheet:
  await syncItemToTodayDailyInventory(params.itemId, { addDelta: safeQty });
  // Inside syncItemToTodayDailyInventory:
  catch (err) {
    console.warn('[Sync Daily Inventory] Non-blocking sheet sync failed:', err);
  }
  ```
- **Current Behavior**: Physical stock is committed to `stock_batches` and `stock_movements`. The client then makes an independent call to update today's daily inventory draft sheet. If the sheet update fails, the error is caught and logged as a warning; the user is told the operation succeeded, leaving physical stock and worksheet state permanently desynchronized.
- **Root Cause**: Multi-step non-atomic operations orchestrated from client-side JavaScript.
- **Real Fix**: Provide a unified, atomic database RPC (`receive_stock_with_worksheet_sync`) that performs physical batch creation, movement logging, and worksheet row updating inside one database transaction.
- **Affected Flows**: Add stock, receipt workflows, daily inventory sheet accuracy.
- **Verification & Tests**: Test simulating worksheet lock/failure; assert that physical stock changes roll back completely.

---

### KUV-P1-04: Conflicting PostgreSQL Overloads for `create_inventory_item_with_initial_stock`
- **Severity**: High (P1)
- **Primary Locations**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/migrations/20261021210000_atomic_create_item_and_initial_stock.sql#L48-L61`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/migrations/20261024150000_release_a_authorization_and_grants_hardening.sql#L531-L544`
- **Code & SQL Evidence**:
  - `20261021210000`: `(p_name TEXT, p_category_id UUID, p_unit TEXT, p_initial_quantity NUMERIC, p_expiry_date DATE, ...)`
  - `20261024150000`: `(p_category_id UUID, p_item_code TEXT, p_name TEXT, p_description TEXT, p_unit_cost NUMERIC, ...)`
- **Current Behavior**: Because the parameter types and positions differ, PostgreSQL treats these as two distinct overloaded functions with the same name. `20261024150000` did not drop the legacy signature. When PostgREST attempts to resolve named RPC calls, it can throw `PGRST202` / `PGRST203` (function overload resolution ambiguity).
- **Root Cause**: `CREATE OR REPLACE FUNCTION` does not remove an older function with a different argument type list.
- **Real Fix**:
  1. Add an explicit `DROP FUNCTION IF EXISTS public.create_inventory_item_with_initial_stock(...)` targeting the exact legacy argument types.
  2. Verify that exactly one canonical signature remains in `pg_proc`.
  3. Ensure all frontend callers use the single canonical signature.
- **Affected Flows**: Inventory item creation, opening stock setup.
- **Verification & Tests**: Migration test verifying single entry in `pg_proc` for `create_inventory_item_with_initial_stock`.

---

### KUV-P1-05: Legacy Alternate Password Reset Service with `system_settings` Fallback
- **Severity**: High (P1)
- **Primary Location**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/auth/services/passwordResetService.ts#L58-L88`
- **Code & SQL Evidence**:
  ```typescript
  // In submitPasswordResetRequest fallback:
  await supabase.from('system_settings').upsert({
    key: 'password_reset_requests_log',
    value: list.slice(0, 50),
  });
  // In fetchPasswordResetRequests fallback:
  // Synthesizes records from notifications table using regex matching!
  ```
- **Current Behavior**: `passwordResetService.ts` maintains an obsolete secondary implementation that stores JSON logs inside `system_settings` and synthesizes fake request tickets from `notifications` rows via regex email matching. It returns `success: true` even if persistence fails.
- **Root Cause**: Technical debt from earlier development stages before database-enforced tables were introduced.
- **Real Fix**: Retire obsolete fallback paths. Align `passwordResetService.ts` directly with the canonical `password_reset_requests` table and RPCs.
- **Affected Flows**: Settings -> Users admin view, password recovery tracking.
- **Verification & Tests**: Verify `fetchPasswordResetRequests` queries only authoritative tables.

---

### KUV-P1-06: `correctionRequestService.ts` Omits `idempotency_key`
- **Severity**: High (P1)
- **Primary Location**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/daily-inventory/services/correctionRequestService.ts#L83-L88`
- **Code & SQL Evidence**:
  ```typescript
  const { data, error } = await supabase.rpc('submit_correction_request', {
    p_daily_inventory_id: dailyInventoryId,
    p_reason: cleanReason,
    p_proposed_items: payload,
  });
  ```
- **Current Behavior**: The client does not supply `p_idempotency_key`. The database RPC generates a new timestamp-based key on every invocation, causing double-clicks or network retries to insert duplicate correction requests.
- **Root Cause**: Frontend service omitted client-generated UUID / idempotency parameter.
- **Real Fix**:
  1. Generate a stable client idempotency key (`crypto.randomUUID()`) per submit operation.
  2. Pass `p_idempotency_key` to `submit_correction_request`.
  3. Ensure the RPC returns the existing request record on replay rather than creating a duplicate.
- **Affected Flows**: Correction request submission, retry handling.
- **Verification & Tests**: Unit test asserting repeated submissions with same idempotency key return the original request ID.

---

### KUV-P1-07: Password Reset State Leaked via Global `user_id IS NULL` Notifications
- **Severity**: High (P1)
- **Primary Locations**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/migrations/20260902050300_rls_and_policies.sql#L78`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/migrations/20261024170000_release_c_login_lockout_and_account_security.sql#L601-L611`
- **Code & SQL Evidence**:
  ```sql
  -- 20260902050300_rls_and_policies.sql:
  CREATE POLICY "Users can read own notifications" ON public.notifications 
    FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
  ```
  ```sql
  -- 20261024170000_release_c_...sql:
  INSERT INTO public.notifications (type, title, message, target_id, dedup_key, created_at)
  VALUES (
    'PASSWORD_RESET',
    format('Password Reset Requested: %s', v_masked),
    format('User requested password reset [%s]. Account verified: %s.', v_request_code, ...),
    '/admin', ...
  );
  ```
- **Current Behavior**: Because `user_id` is omitted (null), the row matches `user_id IS NULL`. Any authenticated user (including basic Staff) can query `public.notifications` and observe whether any email corresponds to an active account (`Account verified: YES`), violating enumeration protection.
- **Root Cause**: Using `user_id IS NULL` as a catch-all for system notifications without restricting role access.
- **Real Fix**:
  1. Revise notification RLS so `user_id IS NULL` rows are visible only to `ADMIN` and `SUPER_ADMIN`.
  2. Store sensitive security and account verification state exclusively in `security_events`, never in unencrypted notification text.
- **Affected Flows**: Notifications feed, password reset requests.
- **Verification & Tests**: RLS test verifying non-admin users cannot read notifications where `type = 'PASSWORD_RESET'` or `user_id IS NULL`.

---

### KUV-P1-08: Correction Approval State Transitions Lack Explicit SQL Validation
- **Severity**: High (P1)
- **Primary Location**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/migrations/20261024180000_release_d_finalized_correction_approvals.sql`
- **Current Behavior**: While `apply_approved_daily_inventory_correction` checks `status = 'PENDING_SUPER_ADMIN'`, the rejection and return RPCs do not strictly enforce all state machine boundaries against terminal states.
- **Root Cause**: State validation distributed across multiple functions without a single unified transition matrix.
- **Real Fix**: Validate current status explicitly in all transition RPCs; reject any transition from terminal states (`APPLIED`, `REJECTED_BY_ADMIN`, `REJECTED_BY_SUPER_ADMIN`).
- **Affected Flows**: Two-stage correction review workflow.
- **Verification & Tests**: Test attempting to reject an already applied correction request; assert exception.

---

### KUV-P1-09: Divergence Between Documentation Claims and Actual Source Code
- **Severity**: High (P1)
- **Primary Locations**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/FEATURE_FAILURE_AND_RECOVERY_CARDS.md`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/19_EVIDENCE_AND_CLAIM_REGISTER.md`
- **Current Behavior**: `FEATURE_FAILURE_AND_RECOVERY_CARDS.md` asserts that E2E tests have a hard abort and no fallback credentials, and that no 90-day fake expiries exist in the codebase. Both claims were contradicted by the actual source code.
- **Root Cause**: Documentation updated optimistically prior to implementation and verification.
- **Real Fix**: Update all documentation, cards, and registers to match source reality. Apply truth-in-documentation tags (`SOURCE-VERIFIED`, `NOT-LIVE-VERIFIED`).
- **Affected Flows**: Architecture documentation, QA audits.

---

### KUV-P1-10: Role Authority Discrepancy for Finalization
- **Severity**: High (P1)
- **Primary Locations**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/supabase/migrations/20261024150000_release_a_authorization_and_grants_hardening.sql#L250`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/07_AUTH_SECURITY_AND_ROLES.md`
- **Current Behavior**: `finalize_daily_inventory` requires `ADMIN`, `SUPER_ADMIN`, or `MASTER_ADMIN`. Some UI text and older documentation described Staff finalization.
- **Root Cause**: Evolution of the governance model from permissive staff finalization to strict administrative finalization.
- **Real Fix**: Formally establish the rule: Staff creates/edits daily drafts and submits correction proposals; only Admins or Super Admins can finalize sheets or approve corrections. Align UI buttons, DB checks, and documentation.
- **Affected Flows**: Daily inventory finalization, UI action button visibility.

---

### KUV-P2-01: Profile Support Email Auto-Defaults to Login Email; Avatar Base64 Fallback
- **Severity**: Medium (P2)
- **Primary Locations**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/admin/components/MyProfileModal.tsx#L85`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/admin/services/profileService.ts#L213-L222`
- **Code & SQL Evidence**:
  ```typescript
  // MyProfileModal.tsx:
  setSupportEmail((profile as any).support_email || user?.email || '');
  // profileService.ts:
  if (uploadError) {
    return new Promise((resolve) => {
      reader.onload = () => resolve(reader.result as string); // 2MB base64 fallback!
    });
  }
  ```
- **Current Behavior**:
  1. An admin enabling "Show on locked login screen" without editing the support email field can accidentally expose their private authentication login email.
  2. If Supabase Storage avatar upload fails, `uploadProfileAvatar` converts the image into a 2MB base64 data URI and stores it in the database `profiles.avatar_url` column, bloating database rows and public RPC responses.
- **Root Cause**: Overly permissive fallbacks designed to keep the UI running despite infrastructure failures.
- **Real Fix**:
  1. Leave public support email blank by default; require explicit opt-in and operator confirmation before publishing.
  2. Remove base64 data URI fallback; display an explicit, actionable upload error if Storage is unavailable.
- **Affected Flows**: Profile settings, login screen public support contact display.
- **Verification & Tests**: Verify avatar upload failure displays error alert and does not alter `profiles.avatar_url`.

---

### KUV-P2-02: Playwright CI Workflow Runs Only Chromium and Skips E2E on Push
- **Severity**: Medium (P2)
- **Primary Locations**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/.github/workflows/ci.yml#L80-L103`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/playwright.config.ts`
- **Current Behavior**: `ci.yml` gates Playwright E2E execution to `pull_request` and `workflow_dispatch`, skipping it on direct pushes to `main`. When run, it executes only `--project=chromium`, leaving mobile and cross-browser configurations untested.
- **Root Cause**: Cost/time optimization on GitHub Actions runners.
- **Real Fix**: Maintain explicit documentation in CI metadata that PR smoke testing runs Chromium, while full cross-browser and mobile responsive suites run on scheduled or nightly runs.
- **Affected Flows**: CI build, deployment verification.

---

### KUV-P2-03: Security Header Drift Between `netlify.toml` and `public/_headers`
- **Severity**: Medium (P2)
- **Primary Locations**:
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/netlify.toml#L10-L27`
  - `file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/public/_headers`
- **Code & SQL Evidence**:
  - `netlify.toml` includes `Access-Control-Allow-Origin = "*"` and `connect-src ... https://api.netlify.com`.
  - `public/_headers` omits CORS headers and Netlify API connect sources.
- **Current Behavior**: Depending on Netlify's build-time evaluation order, production headers can drift between the two configuration files.
- **Root Cause**: Maintaining two competing files for HTTP response headers.
- **Real Fix**: Canonicalize security headers in `netlify.toml`, align `public/_headers`, and remove unnecessary wildcard CORS on static assets.
- **Affected Flows**: Production HTTP response delivery, CSP enforcement.

---

## 3. Owner-Run Live Verification Checklist (Read-Only)

Execute these read-only SQL queries on the live Supabase SQL Editor to verify the effective state of production grants and policies:

```sql
-- 1. Check all policies on sensitive tables
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 2. Audit public/anon grants on all routines
SELECT routine_schema, routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND grantee IN ('anon', 'PUBLIC')
ORDER BY routine_name;

-- 3. Audit all overloads of critical functions
SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_inventory_item_with_initial_stock',
    'record_login_attempt',
    'check_account_lockout',
    'apply_approved_daily_inventory_correction'
  );
```
