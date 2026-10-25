# KUVENTORY — Master Flowchart Register (Figs 6.1.1–6.1.8)

```text
Document:   docs/FLOWCHART_REGISTER.md
Purpose:    Complete register + node-by-node flow specification for the eight
            manuscript flowcharts (§6.1.1 Proposed System, TANIM format).
Status:     Final — reflects system behavior through commit 6b08c1b
            (wrong-identifier 5-attempt cooldown included).
Companion:  Paste-ready AI-maker prompts delivered in the working chat; this
            register is the authoritative content they encode.
```

## Register summary

| Fig | Title | Purpose |
| :---: | :--- | :--- |
| 6.1.1 | Main System | Hub: session, lease, maintenance gate, role routing |
| 6.1.2 | Authentication, Session Security & Sign-Out | Sign-in, 5/15→30 lockout, Remember-me storage, session lease, sign-out |
| 6.1.3 | Assisted Account Recovery & Administrator Support Contacts | Existence gate, 5-wrong-attempt cooldown, tickets, admin review, contact directory |
| 6.1.4 | Inventory & Stock (FEFO) | Add / stock-in / consume FEFO / adjust / archive + audit |
| 6.1.5 | Daily Worksheet & Finalization | Autosave → finalize immutable → corrections two-stage approval |
| 6.1.6 | Notification & Real-Time Alert | Zero-trust event routing, realtime push, click-through |
| 6.1.7 | Report Generation & Export | Report types → filters → views → PDF/Excel/CSV |
| 6.1.8 | Administration & Maintenance Governance | Admin duties + super-admin maintenance powers → audit ledger |

**Connection map (one line):** 6.1.1 routes everyone; 6.1.2 guards the door (helped by 6.1.8, informed by 6.1.3); 6.1.3 heals accounts and publishes who to contact; 6.1.4/6.1.5 do the business and feed 6.1.6/6.1.7; 6.1.6 echoes everything back to every role; 6.1.8 polices the whole system.

## Conventions

- **Lanes:** STAFF · ADMIN · SUPER ADMIN (maintenance/dev team — never an operational approver) · SYSTEM · DATABASE.
- **Symbols (ANSI X3.5 / ISO 5807):** oval terminator · rectangle process · diamond decision (ONLY real server-enforced questions, ≥2 labeled exits) · parallelogram I/O · manual-input shape (user-entered data) · manual-operation trapezoid (human judgment: identity verification, physical counting) · document wavy-bottom (exports, one-time credential, tickets) · database cylinder (Supabase tables/RPCs) · preparation hexagon · D-shape delay (server-owned waits only) · display shape · circle on-page connector (loops/phase joins) · pentagon off-page connector (cross-chart links, labeled with target figure).
- **Honesty rules:** every diamond is a real server-enforced gate; fail-closed branches drawn explicitly (UNKNOWN states, RLS-invisible events, transport errors); delays only where the server owns the clock (30-min login cooldown, 2-min recovery cooldowns). Stage 2 of the login lockout has NO timer — release is administrator-unlock-only.

---

## Fig. 6.1.1 — Main System Flowchart

**Lanes:** SYSTEM · STAFF · ADMIN · SUPER ADMIN · DATABASE

1. [SYSTEM] Oval: Start (user opens KUVENTORY in any browser)
2. [SYSTEM] Diamond: Valid session exists?
   - No → Pentagon → Fig 6.1.2 (authentication)
   - Yes → node 3
3. [DATABASE] Cylinder: Resolve profile — role read strictly from the `profiles` row (fail-closed: no profile → treated as signed out; role never trusted from client storage)
4. [SYSTEM] Diamond: Session lease valid? (`user_session_leases`)
   - Revoked / expired → Pentagon → Fig 6.1.2
   - Valid → node 5
5. [SYSTEM] Diamond: Maintenance mode active? (`system_settings`)
   - Yes + role ≠ SUPER ADMIN → Display "System under maintenance" → Oval: End
   - Yes + SUPER ADMIN → allowed through → node 6
   - No → node 6
6. [SYSTEM] Diamond: Role?
   - STAFF → Pentagon → 6.1.4, Pentagon → 6.1.5
   - ADMIN → 6.1.4, 6.1.5 + Pentagon → 6.1.8 (+ 6.1.3 review duty)
   - SUPER ADMIN → all modules + Pentagon → 6.1.8
7. All roles: Pentagon → 6.1.6 (Notifications), Pentagon → 6.1.7 (Reports)
8. [USER] Rectangle: Sign-out requested → Pentagon → Fig 6.1.2 exit phase → Oval: End

---

## Fig. 6.1.2 — Authentication, Session Security & Sign-Out

**Lanes:** STAFF · SYSTEM · DATABASE. Three phases joined at circle Ⓐ "Sign-in successful".

### Phase 1 — Entry
1. [STAFF] Oval: Start (login screen)
2. [STAFF] Manual Input: login identifier + password + "Remember me on this device" checkbox
3. [DATABASE] Cylinder: `check_account_lockout` — typed contract LOCKED / UNLOCKED / EXPIRED / ADMIN_UNLOCKED / NOT_FOUND / STATUS_UNKNOWN + server_now
4. [SYSTEM] Diamond: Locked?
   - Yes → Display: two-stage card — rose cooldown with live countdown (stage 1, self-releasing) or amber Administrator Verification card (stage 2, no timer, popup), reconciled every 10 s via `check_lockout_status_by_token` (opaque token, sha256-stored) + focus/online; support contact directory shown (data link ← Fig 6.1.3); Pentagon ← Fig 6.1.8 (admin unlock clears stage 2 within one poll) → Circle-loop → node 2
   - STATUS_UNKNOWN (transport) → fail-closed: treated as not-unlocked, retry — never guessed
   - No → node 5
5. [SYSTEM] Rectangle: Sign-in attempt (`signInWithPassword`)
6. [SYSTEM] Diamond: Credentials valid?
   - No → [DATABASE] Cylinder: `record_failed_login_attempt` → Diamond: 5 failures within 15 min?
     - **Yes** → [DATABASE] Rectangle: 30-minute COOLDOWN (stage 1 — timed, self-releasing; opaque token, `last_lockout_at` recorded) → **Rose "Sign-In Temporarily Paused" card with live countdown** → cooldown expires → server-confirmed EXPIRED → form returns automatically (no admin needed)
     - **No** → Display: single-source note "N attempt(s) remaining before the account locks automatically" (server-returned, never locally decremented) → Circle-loop → node 2
   - Yes → Circle Ⓐ
6b. **6th attempt (first failure after a cooldown within 24h)** → [DATABASE] Rectangle: `verification_required = true` → **Amber "Administrator Verification Required" card (NO timer)** → **"Verify with an Administrator" button opens the shared contact POP-UP** (why + one card per admin: call/email/link) → cleared only by admin unlock (`unlock_account`) or a successful sign-in → the poll flips the form back automatically (Pentagon ↔ Fig 6.1.8 badge)

### Phase 2 — Session (at Ⓐ)
7. [SYSTEM] Hexagon (Preparation): Remember-me flag settled BEFORE sign-in — checked → token in localStorage (persists restarts); unchecked → token in sessionStorage (dies with browser close)
8. [DATABASE] Cylinder: Claim single-session lease
9. [SYSTEM] Diamond: Another device held the lease?
   - Yes → Display: takeover banner; old device terminated on its next heartbeat
   - No → continue
10. [SYSTEM] Rectangle: 20-second heartbeat (`renew_session_lease`) + revocation listener
    - Heartbeat UNKNOWN → Display: verifying banner — session NOT terminated on transport failure (fail-closed for revocation, fail-open for availability); keeps retrying
    - Revoked → forced sign-out → Phase 3

### Phase 3 — Exit
11. [STAFF] Rectangle: Sign-out → [SYSTEM] Rectangle: keepalive beacon releases the lease (fires during page unload) → Rectangle: clear both storages → Rectangle: boot sweep discards legacy non-remembered localStorage tokens → Oval: End

**Links:** "Forgot password?" → 6.1.3 · early unlock / revocation ← 6.1.8 · success → 6.1.1

---

## Fig. 6.1.3 — Assisted Account Recovery & Administrator Support Contacts

**Lanes:** STAFF (requester) · ADMIN · SYSTEM · DATABASE

### Requester flow
1. [STAFF] Oval: Start ← Pentagon from Fig 6.1.2 ("Forgot password?")
2. [STAFF] Manual Input: account login identifier + reason — explainer: system addresses have no mailboxes; recovery is admin-assisted (no email reset link is ever sent)
3. [SYSTEM] Diamond: Cooldown active on open? (`check_assisted_recovery_cooldown` — later of ticket / wrong-identifier cooldown; reconciles reopen, reload, other tabs) → blocked: button "Wait MM:SS to resubmit", disabled until server confirms expiry
4. [STAFF] Rectangle: Submit → [DATABASE] Cylinder: `submit_assisted_recovery_request` v5
5. [DATABASE] Diamond: Account exists? (existence gate FIRST)
   - No → [DATABASE] Rectangle: count wrong attempt — per EXACT identifier (sha256 key in `account_recovery_attempt_state`; distinct identifiers never share state), 15-minute window, per-identifier advisory lock → Diamond: 5th wrong attempt?
     - No → Display: "No KUVENTORY account matches this identifier. Check the spelling or contact your administrator." + "N attempt(s) remaining before a short cooldown." (N = 4→1) → Circle-loop → node 2. One masked audit event; no ticket, no notification
     - Yes → D-shape Delay: 2-minute cooldown — explicitly NOT a lockout (no account state written, no lockout token) → Display: "Too many attempts with unknown identifiers. Please wait 2 minutes before trying again." + live countdown; further submits throttled with decreasing seconds → **cooldown expires → next unknown identifier (the 6th)** → [DATABASE] Rectangle: `verification_required_until = now + 1 hour` (prior cooldown within 1h) → **Contact an Administrator panel** replaces the identifier form (directory + "Check Again"; ticket tracker stays; a CORRECT identifier always goes straight through to a ticket)
   - Yes → Diamond: ticket for this identifier within last 2 minutes?
     - Yes → throttle with authoritative next_allowed_at → wait → loop
     - No → node 6
6. [DATABASE] Rectangle: create ticket — `account_recovery_requests`, reference REF-YYYYMMDD-XXXXXX, one-time status credential ST-… (shown exactly once; only sha256 hash stored) + Rectangle: admin notification (ASSISTED_RECOVERY_REQUEST, route /settings?tab=users) → Pentagon → Fig 6.1.6
7. [STAFF] Document: reference + credential with copy actions — kept only in sessionStorage (never localStorage), cleared on outcome
8. [SYSTEM] Display: pending card "Administrators are reviewing your recovery request" — reference+credential status RPC every 20 s, reconciled on focus/visibility/online; survives reload; transport failure → "Status check unavailable — retrying", never a fake outcome
9. [SYSTEM] Diamond: Decision?
   - COMPLETED → "Your password was reset by an administrator." → Pentagon → Fig 6.1.2 (sign in with new password)
   - REJECTED → honest decision reason + contact directory below
   - NEEDS_INFORMATION → card updates, stays pending
   - EXPIRED → card clears with expiry notice

### Admin lane — duty 1: review
10. [ADMIN] Rectangle: review queue (realtime ← Fig 6.1.6; Live/Polling badge, 15 s fallback poll)
11. [ADMIN] Manual Operation: Verify requester identity (phone / in-person — human judgment)
12. [ADMIN] Diamond: Decision?
    - RESOLVE_RESET → [DATABASE] Rectangle: single transaction — server-side password reset AND ticket COMPLETED only if the reset succeeded (failure rolls all back)
    - REJECT → decision reason visible to requester (admin notes never exposed)
    - NEEDS_INFORMATION → status change; requester card updates

### Admin lane — duty 2: publish contact channels
13. [ADMIN] Manual Input: My Profile — display name, support phone, support email, job title, avatar, public links (https/mailto/tel only), opt-in "Show on locked login screen"
14. [SYSTEM] Diamond: Validation gates? — display name required · email format · opt-in requires ≥1 channel (else "Add at least one contact channel or uncheck the visibility box") → Pass → [DATABASE] Cylinder: `update_my_profile` (self-only) → Display: "Your support channels are now live on the login recovery and lockout screens" / "Saved. Your contacts stay private."

### Join point — the directory
15. [DATABASE] Cylinder: `get_public_support_contacts` — opted-in ADMIN/SUPER_ADMIN with ≥1 real channel (phone OR email OR public link); System Administrator first, then account age
16. [SYSTEM] Rectangle: SupportContactDirectory — one card per admin: avatar/initials, display name, role badge, only that admin's real channels as clickable rows (tel: / mailto: / link chips); 1-column mobile, 2-up ≥sm
17. [SYSTEM] Display surfaces: BOTH the Forgot Password dialog and Fig 6.1.2's lockout card (data link)
18. [SYSTEM] Rectangle: live sync — refetch on dialog open / window focus / every 30 s (anonymous realtime on profiles impossible by RLS design; bounded refetch is the documented mechanism) → Diamond: none published? → honest fallback "No public support channels configured"

---

## Fig. 6.1.4 — Inventory & Stock FEFO

**Lanes:** STAFF · ADMIN · SYSTEM · DATABASE

1. Oval: Start → Diamond: **Who is acting?**
   - **STAFF** → the catalog is admin territory: STAFF work from the daily worksheet (Fig 6.1.5) and every structural change goes to the **change-request pipeline** — [STAFF] Manual Input: request (ADD_ITEM / EDIT_ITEM / ARCHIVE_ITEM / ADJUST_STOCK / REASSIGN_TABLE / ADD_CATEGORY / REMOVE_FROM_SHEET, with reason) → [DATABASE] Rectangle: `submit_staff_change_request` = PENDING + admins notified (→ Fig 6.1.8 review) → the approval auto-applies back into this chart
   - **ADMIN / SUPER ADMIN** → direct execution below
2. ADD ITEM → [ADMIN] Manual Input: name, category, supplier, unit, threshold, initial batch (qty + expiry) → [DATABASE] Rectangle: atomic item + initial stock batch in ONE transaction (no orphaned items, no phantom stock). *Approved staff ADD_ITEM requests enter here server-side and sync into today's worksheet.*
3. STOCK IN → Manual Input: batch quantity, expiry, supplier → [DATABASE] Cylinder: create `stock_batches` row (active)
4. CONSUME → Manual Input: quantity + reason → [DATABASE] Cylinder: `consume_stock` — locks batches FOR UPDATE, deducts earliest-expiring first (FEFO), expired batches excluded, concurrent requests serialized → Diamond: batch depleted? → Yes → archive · No → keep active
5. ADJUST → [ADMIN] Manual Operation: verify physical count → [DATABASE] Rectangle: adjustment with mandatory reason. *Approved staff ADJUST_STOCK requests enter here FEFO-aware with the requested target.*
6. All paths → [DATABASE] Cylinder: append `stock_movements` audit record (type, quantity, actor, reason, timestamp — append-only)
7. Diamond: below threshold OR expiring? → Yes → Pentagon → Fig 6.1.6 (low-stock/expiry alert; expiry also found by scheduled `check_expiry_notifications` with dedup keys) · No → continue
8. [DATABASE] Pentagon: stock data feeds Fig 6.1.5 (worksheet basis) and Fig 6.1.7 (reports) → Oval: End

---

## Fig. 6.1.5 — Daily Worksheet & Finalization

**Lanes:** STAFF · ADMIN · SUPER ADMIN · SYSTEM · DATABASE

1. Oval: Start → [STAFF] Rectangle: open today's worksheet (their home page — one per day per branch)
2. [STAFF] Manual Input: AM usage / PM usage per item → [SYSTEM] Rectangle: autosave DRAFT → Circle-loop through the day. **ADD spinner** (mid-day receiving) → [DATABASE] Cylinder: `receive_daily_inventory_stock` (batch + movement + ledger in one transaction). **BEG is read-only for staff** (server-derived; the guard trigger rejects any staff edit to beginning counts or item/station assignment)
3. [STAFF] structural needs (reassign table, remove entry, edit item, adjust stock, new station) → **change-request pipeline** (→ Fig 6.1.4 request path; decisions appear in the requester's My Requests panel — which also carries a **Contact an Administrator** button popping up the full admin contact directory) · [ADMIN] performs the same actions directly
4. [ADMIN] Manual Operation: Finalize (confirmation — human judgment; the button is admin-only on screen and in the database)
5. [DATABASE] Rectangle: status → FINALIZED (immutable; direct edits rejected server-side, not merely hidden)
6. [SYSTEM] Rectangle: per-item FEFO consumption (into Fig 6.1.4's consume path, same transaction) → [DATABASE] Document: frozen `report_snapshots` → Pentagon → Fig 6.1.6 (finalize event)
7. CORRECTIONS: [STAFF] Manual Input: correction request (reason + item deltas on a finalized sheet) → [DATABASE] Rectangle: `daily_inventory_correction_requests` = PENDING
8. [ADMIN] Rectangle: review (two-stage; ADMIN-ONLY approval — super admin is the maintenance/dev team, deliberately not an operational approver) → Diamond: Approved?
   - No → rejected with reason → requester notified (→ Fig 6.1.6)
   - Yes → [DATABASE] Cylinder: `apply_approved_daily_inventory_correction` — ONE atomic transaction: FEFO adjustments + `daily_inventory_revisions` record + revision number increment; any failure rolls the whole correction back → Pentagon → Fig 6.1.4 (reconciliation)
9. EXCEPTION: [SUPER ADMIN] Pentagon ← Fig 6.1.8: force-override a finalized sheet (maintenance escape hatch only) → [DATABASE] Rectangle: audit log → Oval: End

---

## Fig. 6.1.6 — Notification & Real-Time Alert

**Lanes:** SYSTEM · DATABASE · STAFF · ADMIN · SUPER ADMIN

**Per-role scoping (20261026170000 + client zero-trust mirror):** STAFF receive the floor tier (LOW_STOCK, OUT_OF_STOCK, EXPIRING_SOON, EXPIRED, BATCH_DEPLETED, DAILY_SHEET) + anything targeted to them (their request decisions); ADMIN and SUPER ADMIN additionally receive the investigation + queue tier (STOCK_DISCREPANCY, SHEET_CORRECTION, PASSWORD_RESET, RECOVERY_REQUEST, ASSISTED_RECOVERY_REQUEST, ACCOUNT_LOCKOUT, SECURITY_ALERT, SYSTEM, MAINTENANCE, STAFF_CHANGE_REQUEST); targeted rows are always recipient-only. Unclassified types default to admins (fail-closed).

1. Oval: Start ← Pentagon sources: Fig 6.1.3 (recovery ticket), Fig 6.1.4 (threshold/expiry), Fig 6.1.5 (finalize/correction), Fig 6.1.8 (admin ops, broadcasts)
2. [DATABASE] Cylinder: insert `notifications` — type, title, message, `target_id` route string (TEXT, e.g. /settings?tab=users, /items/<id>), dedup key
3. [DATABASE] Diamond: Visible to this user per Row-Level Security?
   - No → never pushed, never rendered (zero-trust: filtering lives in the database, not the UI) — fail-closed
   - Yes → node 4
4. [SYSTEM] Rectangle: realtime postgres_changes (RLS-filtered) → triggers query refetch; the fetched server response is the trusted state (the event is only the hint)
5. [SYSTEM] Display: bell unread counter + toast (title + message)
6. Diamond: Clicked? → Yes → [SYSTEM] Rectangle: route via target_id → Pentagon back into the SOURCE module (6.1.3 queue / 6.1.4 item / 6.1.5 sheet / 6.1.8 console) · No → stays unread
7. [USER] Rectangle: mark as read (own only, actor-checked RPC; optimistic with rollback) → Circle-loop → Oval: End

---

## Fig. 6.1.7 — Report Generation & Export

**Lanes:** STAFF · ADMIN · SUPER ADMIN · SYSTEM · DATABASE

1. Oval: Start → Diamond: Report type? — inventory valuation · item usage / consumption velocity · low-stock status · expiry monitoring (FEFO horizon) · finalized sheet snapshots (frozen `report_snapshots`, Pentagon data link ← Fig 6.1.5) · correction/revision history
2. [USER] Manual Input: filters — date range, category, supplier, branch
3. [DATABASE] Cylinder: query RLS-scoped views (users can only query what their role may see)
4. [SYSTEM] Display: tables + charts (recharts)
5. Diamond: Export? → PDF → Document (jsPDF + autotable) · Excel → Document (.xlsx, ExcelJS) · CSV → Document (.csv) · No → on-screen only. All exports generated client-side from authorized data only
6. Oval: End (exports are terminal — nothing flows back)

---

## Fig. 6.1.8 — Administration & Maintenance Governance

**Lanes:** ADMIN · SUPER ADMIN · SYSTEM · DATABASE

### ADMIN lane
1. [ADMIN] Manual Input: create user account → Diamond: Admin quota (max 3) reached? → Yes → blocked with message · No → [DATABASE] Rectangle: provision auth account + profile row (role STAFF or ADMIN; SUPER_ADMIN creation requires a super)
2. [ADMIN] Rectangle: role hierarchy enforced — SUPER ADMIN > ADMIN > STAFF (strict three-role model; legacy MASTER_ADMIN and USER are retired/normalized); roles live only in `profiles`
3. **[ADMIN] Rectangle: Staff Requests review queue** (Settings → Staff Requests tab, realtime Live/Polling) → review card per request (requester, reason, requested values) → Diamond: decision?
   - **Approve & Apply** → [DATABASE] Cylinder: `review_staff_change_request` executes the change SERVER-SIDE in one transaction (item + initial stock created & synced into today's worksheet / whitelisted edit / FEFO-aware adjust / station move / station created / worksheet row removed) → requester notified, decision appears in their My Requests panel (Pentagon ↔ Fig 6.1.5/6.1.4)
   - **Return** (notes required) → back to the staff member as "needs changes" · **Reject** (notes required) → closed with the honest reason
   - An apply failure marks the request FAILED — never a fake success
4. [ADMIN] Rectangle: configure low-stock thresholds per item
5. [ADMIN] Rectangle: change own password (verified against current)
6. [ADMIN] Manual Operation: early unlock of a locked account — written reason required → [DATABASE] Cylinder: `unlock_account` → Pentagon → Fig 6.1.2 (lockout card clears within its 10-second poll; unlock audited)

### SUPER ADMIN lane (maintenance/development team — never an operational approver)
7. [SUPER] Rectangle: maintenance lockdown lifecycle — enable (system_settings flag) → Pentagon → Fig 6.1.1 (entry blocked for non-supers; supers keep access) → maintenance → disable → system reopens
8. [SUPER] Rectangle: finalized-sheet force override → Pentagon → Fig 6.1.5 exception branch (audited)
9. [SUPER] Rectangle: revoke any user's session → Pentagon → Fig 6.1.2 (device terminates on next heartbeat/listener tick)
10. [SUPER] Rectangle: recovery checkpoints (`recovery_points`, integrity-verified) + diagnostics (drift analysis, policy inspection, `inspect_authenticated_grants`)

### Merge
11. Both lanes → [DATABASE] Cylinder: append-only `audit_logs` + `security_events` (masked, immutable trace of every action) → Oval: End

---

## Staff role model (2026-10-25, strict roles)

STAFF / ADMIN / SUPER_ADMIN are the only roles. STAFF work the daily worksheet (sales AM/PM + ADD spinner direct; BEG read-only) and every structural change (add/edit/archive item, adjust stock, reassign table, new station, remove from worksheet) goes through the change-request pipeline: submit with reason → admin review card (requested context) → **Approve & Apply** (server-side, in-transaction) / **Return** / **Reject** → decision visible in the requester's My Requests panel. STAFF also keep Reports (view + export) and Notifications; all other routes redirect to /daily-inventory. Direct client writes to catalog/stock/worksheet structure are blocked by RLS and the worksheet-edit trigger (operational columns only).

## §6.4 Screen Layout/Specification — screenshot list (strict-role scopes)

TANIM-verified format (from TANIM-Manuscript-V5-FINAL §6.4): heading, then **Figure 6.4.N. <Name>** caption immediately followed by the pasted screenshot — no descriptive paragraphs. Suggested 15-figure KUVENTORY sequence: Dashboard, Log In, Daily Inventory (Staff), Staff Change Request, Daily Inventory (Admin), Staff Change Requests Review, Item Catalog, Item Details & FEFO Batches, Reports Low Stock, Reports Expiry, Notifications, Account Recovery Dialog, Administrator Verification Card, Settings Users & Lockouts, Super Admin Console. (TANIM-essential trim: Dashboard, Log In, Daily Inventory Staff, Daily Inventory Admin, Staff Change Requests Review, Reports.)

**STAFF set (the 6.4.1-6.4.6 essentials):**
- 6.4.1 Log In — identifier + password, Remember me; mention the two-stage lockout card and Forgot Password dialog as the security states
- 6.4.2 Daily Inventory Worksheet (STAFF view) — Sales AM/PM + ADD spinner editable, BEG read-only, Request Change/Reassign/Remove buttons, workflow explainer banner, **My Requests panel with the Contact an Administrator button**, no Finalize button
- 6.4.3 Staff Request Modal — type-aware fields, required reason, "nothing changes until approved" note
- 6.4.4 Reports — Low Stock tab with **Request Restock** buttons + Expiry tab (no admin actions), CSV/PDF export
- 6.4.5 Notifications — staff tier only (floor alerts + own request decisions)
- 6.4.6 Account & Password (Settings, staff scope)

**ADMIN set (6.4.7-6.4.13):**
- 6.4.7 Dashboard — stat cards with real numbers (post grants-heal)
- 6.4.8 Items Catalog — full Add/Update Stock/Edit/Archive/Delete actions
- 6.4.9 Item Details — FEFO batches, consume/adjust
- 6.4.10 Daily Inventory (ADMIN view) — direct actions + Finalize Day
- 6.4.11 Settings → Staff Requests queue — review card with requester, reason, current → requested values, Approve & Apply / Return / Reject
- 6.4.12 Settings → Users + Login Lockouts — strict roles, admin quota 3, Verification-required badge, Admin-unlock-only
- 6.4.13 My Profile — support channels + lockout-screen opt-in (feeds the directory)

**Optional companions:** Forgot Password dialog (reference + one-time credential + contact directory), Correction Request modal + Finalized Corrections queue (6.1.5 evidence), Super Admin console (lockdown/force-override/revocation).

## Cross-chart connection map (pentagon labels)

- **6.1.1 (hub)** → 6.1.2 (no session) · → 6.1.3/6.1.4/6.1.5/6.1.6/6.1.7 (module entries) · → 6.1.8 (ADMIN/SUPER); lockdown gate in 6.1.8 blocks 6.1.1 entry for non-supers
- **6.1.2** ↔ 6.1.1 (auth success → routing) · → 6.1.3 ("Forgot password?") · ← 6.1.8 (early unlock ~10 s; session revocation) · 6.1.3's directory displayed on its lockout card (data link)
- **6.1.3** → 6.1.6 (ticket creates admin notification) · ← 6.1.6 (admin opens review queue from notification) · → 6.1.2 (COMPLETED → sign in with admin-provided password)
- **6.1.4** → 6.1.6 (threshold/expiry events) · → 6.1.7 + 6.1.5 (data reads) · ← 6.1.5 (correction apply writes stock back) · ← 6.1.8 (staff request approvals enter here server-side) · ← 6.1.6 (click-through)
- **6.1.5** → 6.1.6 (finalize/correction events) · → 6.1.4 (reconciliation) · → 6.1.7 (snapshots) · ← 6.1.8 (force override exception)
- **6.1.6** ← events from 6.1.3/6.1.4/6.1.5/6.1.8 · → one-click routing back into each source
- **6.1.7** terminal (Document exports)
- **6.1.8** → 6.1.1 / 6.1.2 / 6.1.5 / 6.1.6
