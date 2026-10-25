# KUVENTORY — API, RPC & Integration Reference

```
Document:               docs/06_API_RPC_AND_INTEGRATION_REFERENCE.md
Audience:               Backend Engineers, API Integrators, Software Architects, Security Auditors
Purpose:                Definitive contracts for client PostgREST queries, PostgreSQL RPC stored procedures,
                        optional Express gateway endpoints, Realtime subscriptions, and third-party provider hooks.
Verification Status:    Verified against src/features/*/api/, server/server.mjs, and migration RPC definitions
Audit Date:             2026-10-19
Authoritative HEAD SHA: 135f10b807fedec368383c9e34895566da3d69fc
Primary References:     src/features/*/api/, server/, supabase/migrations/
```

---

## 1. PostgREST Table & View Endpoints

In production, the React SPA communicates directly with PostgreSQL via the PostgREST REST interface (`/rest/v1/`). Every request includes:
* `apikey`: Supabase Anonymous Key (header)
* `Authorization`: `Bearer <jwt_token>` (for authenticated requests)

### 1.1 Core Query Catalog

| Table / View | Method | Key Query Params & Filter Clauses | Description & Client Caller |
| :--- | :--- | :--- | :--- |
| `inventory_items` | `GET` | `select=*,categories(*),suppliers(*)&is_archived=eq.false` | Fetches active inventory catalog items with relations for [getInventory](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/src/features/inventory/api/index.ts). |
| `inventory_items` | `POST` | Body: `{ name, unit, unit_cost, min_quantity, category_id, supplier_id }` | Inserts new catalog item; requires `ADMIN` or `SUPER_ADMIN`. |
| `inventory_items` | `PATCH` | Filter: `id=eq.<item_id>`, Body: `{ ...fields }` | Updates item metadata or soft-archive flag. |
| `stock_batches` | `GET` | `select=*,inventory_items(*)&quantity=gt.0&order=expiry_date.asc` | Queries active non-exhausted stock batches in FEFO order. |
| `stock_batches` | `POST` | Body: `{ item_id, quantity, expiry_date, received_date, supplier_id }` | Inserts newly received shipment batch. |
| `stock_movements` | `GET` | `select=*,inventory_items(name,unit),profiles(first_name,last_name)&order=created_at.desc&limit=50` | Fetches recent stock audit transactions for history ledger. |
| `daily_inventory_sheets` | `GET` | `select=*,daily_inventory_items(*,inventory_items(*))&sheet_date=eq.<date>` | Fetches daily shift worksheet and nested item rows for specified date. |
| `daily_inventory_items` | `POST` | `on_conflict=sheet_id,item_id`, Body: `[ { sheet_id, item_id, beginning_stock, added_stock, am_usage, pm_usage, physical_count } ]` | Debounced batch autosave for active shift worksheet. |
| `notifications` | `GET` | `select=*&order=created_at.desc&limit=25` | Queries recent operational alerts for global popover menu. |
| `notifications` | `PATCH` | Filter: `id=eq.<notif_id>`, Body: `{ is_read: true }` | Marks notification as read. |
| `report_snapshots` | `GET` | `select=*&report_date=eq.<date>` | Retrieves immutable frozen report snapshot for specified business date. |

---

## 2. PostgreSQL Remote Procedure Calls (RPCs)

All transactional business logic is executed inside PostgreSQL stored procedures (`/rest/v1/rpc/<rpc_name>`) with `SECURITY DEFINER` privileges.

### 2.1 `consume_stock`
* **Route:** `POST /rest/v1/rpc/consume_stock`
* **Signature:**
  ```sql
  public.consume_stock(
      p_item_id UUID,
      p_quantity NUMERIC,
      p_reason TEXT DEFAULT 'Manual Consumption'
  ) RETURNS JSONB
  ```
* **Authorization:** Authenticated user (`USER`, `ADMIN`, `SUPER_ADMIN`).
* **Behavior:**
  1. Validates `p_quantity > 0`.
  2. Acquires row-level lock on batches:
     ```sql
     SELECT id, quantity, expiry_date
     FROM public.stock_batches
     WHERE item_id = p_item_id
       AND quantity > 0
       AND expiry_date >= CURRENT_DATE
     ORDER BY expiry_date ASC, created_at ASC
     FOR UPDATE;
     ```
  3. Verifies aggregate available quantity covers `p_quantity`. If insufficient, rolls back with error: `'Insufficient stock for item'`.
  4. Iterates batches, decrementing quantities in FEFO order.
  5. Inserts audit record into `public.stock_movements` (`action_type = 'REMOVE'`).
  6. Recomputes and updates `inventory_items.current_qty`.
* **Success Response:**
  ```json
  { "success": true, "item_id": "...", "consumed": 15.0, "remaining_stock": 45.0 }
  ```

### 2.2 `finalize_daily_inventory_sheet`
* **Route:** `POST /rest/v1/rpc/finalize_daily_inventory_sheet`
* **Signature:**
  ```sql
  public.finalize_daily_inventory_sheet(
      p_sheet_id UUID
  ) RETURNS JSONB
  ```
* **Authorization:** `ADMIN` or `SUPER_ADMIN`.
* **Behavior:**
  1. Verifies sheet status is `'DRAFT'`.
  2. For every item in `daily_inventory_items` where `(am_usage + pm_usage) > 0`, invokes `consume_stock(item_id, am_usage + pm_usage, 'Daily Finalization')`.
  3. Sets sheet status to `'FINALIZED'`, records `finalized_by = auth.uid()`, and `finalized_at = now()`.
  4. Serializes all worksheet rows into a JSON snapshot in `public.report_snapshots`.
* **Idempotency:** Re-executing on an already finalized sheet returns an error: `'Sheet is already finalized'`.

### 2.3 `apply_daily_sheet_correction`
* **Route:** `POST /rest/v1/rpc/apply_daily_sheet_correction`
* **Signature:**
  ```sql
  public.apply_daily_sheet_correction(
      p_sheet_id UUID,
      p_reason TEXT,
      p_items JSONB
  ) RETURNS JSONB
  ```
* **Authorization:** `USER`, `ADMIN`, `SUPER_ADMIN`.
* **Behavior:**
  1. Validates that `p_reason` is non-empty.
  2. Calculates delta between previous `(am_usage + pm_usage)` and new `(am_usage + pm_usage)`.
  3. If delta > 0: executes `consume_stock` for additional usage.
  4. If delta < 0: restores stock to active batches.
  5. Inserts an audited revision record into `public.daily_inventory_revisions`.
  6. Increments sheet `revision_number`.
  7. Updates frozen snapshot in `public.report_snapshots`.

### 2.4 `renew_session_lease`
* **Route:** `POST /rest/v1/rpc/renew_session_lease`
* **Signature:**
  ```sql
  public.renew_session_lease(
      p_device_id TEXT,
      p_user_agent TEXT
  ) RETURNS JSONB
  ```
* **Authorization:** Authenticated user.
* **Behavior:** Enforces single-device lease. Deletes or revokes sessions for `auth.uid()` matching different `device_id` values, updates `lease_expires_at = now() + INTERVAL '2 minutes'`, and returns lease validity.

### 2.5 Authentication, Recovery & Security RPC Family
All are `SECURITY DEFINER`, forward-only replaced by the migrations listed in `docs/05` §4, and consumed exclusively through `src/features/auth/services/passwordResetService.ts` and `loginLockoutService.ts` (single source of truth — no component calls them directly).

| RPC | Caller | Authoritative behavior |
| :--- | :--- | :--- |
| `submit_assisted_recovery_request` (v6) | anon (login screen) | Existence gate first. Unknown identifier: per-exact-identifier counter (sha256 state in `account_recovery_attempt_state`) — attempts 1–4 return `account_exists:false` + `attempts_remaining`; the 5th within 15 min starts a **2-minute cooldown** (`unknown_identifier_cooldown`), never a lockout; the FIRST unknown identifier after a cooldown within 1 hour returns `escalation_required` (administrator verification, 1-hour window). Known identifier: atomic 2-min ticket throttle, one-time status credential, admin notification. |
| `check_assisted_recovery_cooldown` (v4) | anon | Side-effect-free check returning the later of the ticket cooldown and the active unknown-identifier cooldown (`next_allowed_at`, `seconds_remaining`, reason message) plus `escalation_required` while the administrator-verification window is active. |
| `check_assisted_recovery_status` | anon | Ticket progress only with BOTH reference + secret credential; never enumerates, never exposes admin notes. |
| `review_assisted_recovery_request` | ADMIN / SUPER_ADMIN | Decision RPC; `RESOLVE_RESET` resets the password server-side and completes the ticket in one transaction. |
| `get_public_support_contacts` | anon | Opted-in admins with ≥1 real public channel for the recovery/lockout screens. |
| `record_failed_login_attempt` / `check_account_lockout` / `check_lockout_status_by_token` | anon | Server-authoritative 5/15→30-min lockout with opaque tokens and a typed status contract (fail-closed on transport errors); every response carries `escalation_required` — set on the first failed attempt after a lockout expired within 24h (6th-attempt rule, FFRC-13). |
| `get_locked_accounts` / `unlock_account` / `reset_my_login_lockout` | admin / self | Lockout console listing and authorized unlocks. |
| `update_my_profile` | authenticated | Self-only profile + support channel updates (feeds the public contact directory). |
| `request_password_reset` / `admin_reset_user_password` | anon / admin | Legacy real-mailbox reset path; synthetic `@kuventory.com` identifiers never route here. |

---

## 3. Realtime WebSocket Subscriptions

The application establishes a single multiplexed WebSocket connection to Supabase Realtime (`wss://<project>.supabase.co/realtime/v1/websocket`).

### 3.1 Monitored Database Tables & Cache Invalidations

| Subscribed Table | Events | TanStack Query Cache Keys Invalidated | UI Effect |
| :--- | :--- | :--- | :--- |
| `inventory_items` | `*` (INSERT, UPDATE, DELETE) | `['inventory']`, `['item', id]`, `['items-catalog']` | Catalog counts, stock badges, and details update instantly. |
| `stock_batches` | `*` | `['stock-batches']`, `['batches', id]`, `['global-stock-batches-analytics']` | FEFO batch lists update; depleted batches disappear. |
| `stock_movements` | `*` | `['stock-movements']`, `['global-stock-history']` | History ledger updates; velocity bar chart recalculates. |
| `daily_inventory_sheets` | `*` | `['daily-inventory-sheet']`, `['reports-library']` | Sheet status (`DRAFT` / `FINALIZED`) synchronizes across screens. |
| `daily_inventory_items` | `*` | `['daily-inventory-items']`, `['daily-sheet-details']` | Live usage numbers synchronize across counter tablets. |
| `daily_inventory_revisions`| `*` | `['daily-revisions']`, `['sheet-revisions']` | Revision history badge increments on worksheet. |
| `notifications` | `*` | `['notifications']`, `['unread-notifications-count']` | Bell icon unread counter updates; toast popover alerts staff. |
| `account_recovery_requests` | `*` | recovery-queue query (`AssistedRecoveryQueue`, `useRealtimeTableSync`) | Admin recovery queue refetches live with a Live/Polling badge; RLS filters events to admin sessions. |
| `daily_inventory_correction_requests` | `*` | correction-queue query (`CorrectionRequestsQueue`, `useRealtimeTableSync`) | Finalized-sheet correction queue updates live across admin sessions. |
| `system_sessions` | `*` | `['active-sessions']`, `['user-session-state']` | Invalidation of terminated sessions forces immediate logout. |
| `system_settings` | `*` | `['system-settings']`, `['maintenance-status']` | Maintenance lockdown locks or unlocks client terminals. |
| `recovery_points` | `*` | `['recovery-points']`, `['overview-recent-checkpoints']` | Checkpoints table updates in Super Admin console. |

---

## 4. Optional Auxiliary Express Gateway API

The repository includes a secondary Node.js Express server ([server/server.mjs](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/server/server.mjs)) used in local containerized environments or dedicated backend proxies:

* `GET /health`: Healthcheck endpoint returning uptime and service identity.
* `GET /api/health`: Healthcheck endpoint returning `{ status: 'healthy', version: '1.0.0' }`.
* `POST /api/auth/login`: Secondary rate-limited login proxy.
* `GET /api/inventory/items`: Secondary inventory listing proxy with input sanitization.
* `POST /api/inventory/consume`: Secondary stock consumption endpoint.
* `GET /api/notifications`: Secondary notification retrieval proxy.
* **Rate Limits:** General endpoints limited to 100 requests per 15 minutes via `express-rate-limit`.
