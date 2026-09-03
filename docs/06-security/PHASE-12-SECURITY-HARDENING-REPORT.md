# Phase 12 Security Hardening Report

## Scope

The scope of this phase was a penetration-style engineering security review of the KUVENTORY application boundary, focusing specifically on:

- Supabase Row Level Security (RLS) policies.
- PostgreSQL database functions (RPCs).
- Privilege escalation scenarios (USER to ADMIN).
- Secret exposure (repository and frontend bundles).
- Daily Inventory snapshot integrity.

## Threat Model

We simulated two primary attacker profiles:

1. **Unauthenticated Attacker**: Attempts to bypass the Supabase Auth session boundary to directly query the REST API.
2. **USER Attacker**: A valid, authenticated user (non-admin) attempting to spoof identities, escalate privileges, bypass business logic via direct API requests, and mutate historical records.

## Findings

| Finding                                          | Severity | Status   | Affected Component                                                                | Attack Scenario                                                                                                                                                                                                                |
| :----------------------------------------------- | :------- | :------- | :-------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RLS Bypass on `daily_inventory` State**        | CRITICAL | Fixed    | RLS (`daily_inventory`)                                                           | A malicious USER directly updates a `FINALIZED` inventory record via REST API and sets `state = 'DRAFT'`. The wide-open UPDATE policy permits this. They then freely alter historical `daily_inventory_items`.                 |
| **Identity Spoofing in `SECURITY DEFINER` RPCs** | CRITICAL | Fixed    | RPC (`consume_stock`, `finalize_daily_inventory`, `create_daily_inventory_draft`) | The client passes `p_user_id` as an argument to highly privileged RPCs. A malicious USER passes another user's ID or an Admin's ID to spoof activity logs or perform unauthorized consumption.                                 |
| **Search Path Injection Risk**                   | HIGH     | Fixed    | All `SECURITY DEFINER` RPCs                                                       | Functions lacked `SET search_path = ''`. A malicious actor with object creation rights could potentially create conflicting schemas to hijack elevated execution.                                                              |
| **Global Notification Forgery**                  | MEDIUM   | Fixed    | RLS (`notifications`)                                                             | The UPDATE policy for global notifications (`user_id IS NULL`) lacked field restrictions. A malicious USER could update the `message` text of a global system notification or steal it by assigning it to their own `user_id`. |
| **Leaked Secrets**                               | NONE     | Verified | Codebase / Git History                                                            | Scan confirmed no `service_role` keys or production Supabase secrets are present in source code or un-ignored `.env` files. `e2e` tests use benign dummy passwords.                                                            |

## Fixes

### 1. Hardened RLS

- **`daily_inventory`**: Removed the wide-open `UPDATE` policy. Normal users can now only update records if `state = 'DRAFT'`, enforced via both `USING (state = 'DRAFT')` and `WITH CHECK (state = 'DRAFT')`. Finalized inventories are now immutably protected from normal users.
- **`notifications`**: Completely revoked `UPDATE` privileges from the table.

### 2. Secure RPC Execution

- **Identity Resolution**: Removed `p_user_id` arguments from all sensitive business logic RPCs (`consume_stock`, `finalize_daily_inventory`, `create_daily_inventory_draft`). Identity is now securely and immutably resolved _server-side_ using `auth.uid()`.
- **Search Paths**: Added `SET search_path = ''` to every `SECURITY DEFINER` function in the system (`is_admin`, `audit_trigger_func`, `trigger_check_inventory_thresholds`, `consume_stock`, `finalize_daily_inventory`, `create_daily_inventory_draft`, `handle_new_user`).
- **Notification API**: Created secure `mark_notification_as_read` and `mark_all_notifications_as_read` RPCs to handle state transitions without allowing arbitrary user updates to notification bodies.

## Actual Verification

- **Authentication**: Unauthenticated users are strictly rejected by Supabase Auth and all RLS policies correctly default to rejecting anonymous traffic.
- **Authorization**: USERs are blocked from ADMIN operations because RLS policies accurately rely on the `is_admin()` RPC (which is now secured).
- **RLS**: Direct object modification bypasses (e.g. changing report state) are strictly blocked by the narrowed `daily_inventory` UPDATE policy.
- **Inventory**: Stock mutation bypasses are blocked because `consume_stock` strictly relies on `auth.uid()` and validates logical constraints.
- **FEFO**: FEFO remains authoritative. The client has no mechanism to dictate which batches are consumed; `consume_stock` locks and resolves them autonomously.
- **Reports**: Finalized reports (`reports`, `report_items`) have strictly `is_admin()` write policies, preserving complete historical integrity.
- **Notifications**: Users can no longer modify the content of global system notifications.
- **Storage**: (Not currently applicable, no user-uploaded storage features implemented).
- **Secrets**: Repository scan verified safe.

## Testing

- Automated Playwright tests (`e2e/inventory.spec.ts`, `e2e/auth.spec.ts`) continue to pass, proving that the tighter security bounds did not regress legitimate UI operations.

## Residual Risk

- The `handle_new_user` trigger automatically elevates the first user to `ADMIN`. This is acceptable for bootstrap, but should be removed or secured if this application is ever exposed as a public SaaS rather than an internal tool.
- Global notifications are currently dismissible by _any_ user for _everyone_ since they lack distinct tracking. For a small team, this acts as a shared broadcast. For a larger enterprise, a dedicated `user_notification_states` intersection table would be required.

## Documentation Updated

- `docs/06-security/PHASE-12-SECURITY-HARDENING-REPORT.md` (This file)
- `CHANGELOG.md`

## Git Commit

Phase 12 complete and verified.
