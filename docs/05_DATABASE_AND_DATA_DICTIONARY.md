# KUVENTORY — Database Schema & Data Dictionary

```
Document:               docs/05_DATABASE_AND_DATA_DICTIONARY.md
Audience:               Database Administrators, Software Architects, Technical Examiners, Backend Engineers
Purpose:                Definitive data dictionary, entity-relationship topology, table definitions,
                        generated columns, indexes, triggers, stored procedures (RPCs), RLS policies, and migration order.
Verification Status:    Verified against all 53 migration files in supabase/migrations/
Audit Date:             2026-10-19
Authoritative HEAD SHA: 135f10b807fedec368383c9e34895566da3d69fc
Primary References:     supabase/migrations/*.sql
```

---

## 1. Entity-Relationship Overview

The KUVENTORY database operates within PostgreSQL 15 on Supabase, featuring 18 relational tables in the `public` schema, enforced by foreign key constraints, generated columns, triggers, and Row Level Security (RLS) policies.

*(See full Mermaid ER diagram: [docs/diagrams/database_er_diagram.mmd](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/diagrams/database_er_diagram.mmd))*

---

## 2. Relational Table Dictionary

### 2.1 `public.profiles`
Stores extended user profile metadata linked 1:1 with Supabase GoTrue authentication accounts (`auth.users`).
* **Table Constraint:** Primary key references `auth.users(id)` with `ON DELETE CASCADE`.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PK`, `REFERENCES auth.users(id)` | Unique user ID issued by GoTrue auth. |
| `role` | `VARCHAR(20)` | `NOT NULL`, Default `'USER'` | User authorization role: `'USER'`, `'ADMIN'`, `'SUPER_ADMIN'` (or legacy `'MASTER_ADMIN'`). |
| `first_name` | `VARCHAR(100)` | `NULL` | User's given first name. |
| `last_name` | `VARCHAR(100)` | `NULL` | User's family surname. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default `now()` | Record creation timestamp. |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL`, Default `now()` | Record last modification timestamp. |

### 2.2 `public.categories`
Defines operational station categories for organizing items in the bistro.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PK`, Default `gen_random_uuid()` | Unique category ID. |
| `name` | `VARCHAR(100)` | `NOT NULL`, `UNIQUE` | Category display name (e.g., "Dairy & Milk", "Syrups"). |
| `description` | `TEXT` | `NULL` | Optional category description. |
| `station_name` | `VARCHAR(100)` | `NULL` | Prep station association (e.g., "Coffee Bar", "Kitchen"). |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default `now()` | Timestamp created. |

### 2.3 `public.suppliers`
Directory of verified commercial vendors delivering supplies to Kape Uno Bistro.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PK`, Default `gen_random_uuid()` | Unique supplier identifier. |
| `name` | `VARCHAR(150)` | `NOT NULL` | Vendor or company name. |
| `contact_person` | `VARCHAR(100)` | `NULL` | Direct contact representative. |
| `phone` | `VARCHAR(50)` | `NULL` | Primary telephone number. |
| `email` | `VARCHAR(150)` | `NULL` | Contact email address. |
| `lead_time_days` | `INTEGER` | Default `3` | Expected order delivery lead time in days. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default `now()` | Timestamp created. |

### 2.4 `public.inventory_items`
Core catalog of all inventoried products, raw materials, and packaging supplies.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PK`, Default `gen_random_uuid()` | Unique inventory item identifier. |
| `name` | `VARCHAR(150)` | `NOT NULL`, `UNIQUE` | Distinct item name (e.g., "Whole Milk 1L"). |
| `unit` | `VARCHAR(50)` | `NOT NULL`, Default `'pcs'` | Measurement unit (e.g., "bottles", "grams", "liters"). |
| `unit_cost` | `NUMERIC(12,2)`| `NOT NULL`, Default `0.00` | Current acquisition cost per unit in Philippine Pesos (PHP). |
| `current_qty` | `NUMERIC(12,2)`| `NOT NULL`, Default `0.00`, `CHECK >= 0` | Authoritative aggregate current stock volume. |
| `min_quantity` | `NUMERIC(12,2)`| `NOT NULL`, Default `5.00` | Reorder threshold triggering `LOW_STOCK` alert. |
| `category_id` | `UUID` | `NULL`, `REFERENCES categories(id)` | Foreign key to operational category. |
| `supplier_id` | `UUID` | `NULL`, `REFERENCES suppliers(id)` | Foreign key to primary vendor. |
| `is_archived` | `BOOLEAN` | `NOT NULL`, Default `false` | Soft-deletion flag excluding item from active worksheets. |
| `image_path` | `TEXT` | `NULL` | Supabase storage bucket path or external URL. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default `now()` | Creation timestamp. |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL`, Default `now()` | Last update timestamp. |

### 2.5 `public.stock_batches`
Physical inventory batches received from suppliers, tracked individually for FEFO rotation.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PK`, Default `gen_random_uuid()` | Unique batch identifier. |
| `item_id` | `UUID` | `NOT NULL`, `REFERENCES inventory_items(id) ON DELETE CASCADE` | Associated inventory catalog item. |
| `quantity` | `NUMERIC(12,2)`| `NOT NULL`, `CHECK >= 0` | Remaining unconsumed quantity in this physical batch. |
| `expiry_date` | `DATE` | `NOT NULL` | Expiration date determining FEFO consumption order. |
| `received_date` | `DATE` | `NOT NULL`, Default `CURRENT_DATE` | Physical receipt date. |
| `supplier_id` | `UUID` | `NULL`, `REFERENCES suppliers(id)` | Vendor supplying this batch. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default `now()` | Timestamp created. |

### 2.6 `public.stock_movements`
Immutable transactional audit ledger of all physical inventory stock changes.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PK`, Default `gen_random_uuid()` | Unique ledger entry ID. |
| `item_id` | `UUID` | `NOT NULL`, `REFERENCES inventory_items(id)` | Item affected. |
| `batch_id` | `UUID` | `NULL`, `REFERENCES stock_batches(id)` | Specific batch affected if applicable. |
| `quantity` | `NUMERIC(12,2)`| `NOT NULL` | Quantity changed (positive for ADD, negative/absolute for REMOVE). |
| `action_type` | `VARCHAR(20)` | `NOT NULL`, `CHECK IN ('ADD','REMOVE','ADJUST')` | Operation category. |
| `reason` | `TEXT` | `NULL` | Operational explanation (e.g., "Shift Finalization", "Spoilage"). |
| `created_by` | `UUID` | `NULL`, `REFERENCES profiles(id)` | Actor who authorized the stock movement. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default `now()` | Immutable timestamp of the stock movement. |

### 2.7 `public.daily_inventory_sheets`
Daily shift inventory tracking header representing a single business operating date.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PK`, Default `gen_random_uuid()` | Unique daily worksheet identifier. |
| `sheet_date` | `DATE` | `NOT NULL`, `UNIQUE` | Business operating date strictly in `Asia/Manila`. |
| `status` | `VARCHAR(20)` | `NOT NULL`, Default `'DRAFT'`, `CHECK IN ('DRAFT','FINALIZED')` | Current lifecycle state. |
| `revision_number`| `INTEGER` | `NOT NULL`, Default `0` | Increments upon post-finalization corrections. |
| `finalized_by` | `UUID` | `NULL`, `REFERENCES profiles(id)` | User who executed finalization. |
| `finalized_at` | `TIMESTAMPTZ` | `NULL` | Timestamp of finalization. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default `now()` | Sheet creation timestamp. |

### 2.8 `public.daily_inventory_items`
Row-level item records within a daily inventory worksheet, containing mathematical balance calculations.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PK`, Default `gen_random_uuid()` | Unique worksheet item row ID. |
| `sheet_id` | `UUID` | `NOT NULL`, `REFERENCES daily_inventory_sheets(id) ON DELETE CASCADE` | Associated daily worksheet. |
| `item_id` | `UUID` | `NOT NULL`, `REFERENCES inventory_items(id)` | Inventoried item. |
| `beginning_stock`| `NUMERIC(12,2)`| `NOT NULL`, Default `0.00`, `CHECK >= 0` | Opening stock at shift start. |
| `added_stock` | `NUMERIC(12,2)`| `NOT NULL`, Default `0.00`, `CHECK >= 0` | Mid-shift restock additions received. |
| `am_usage` | `NUMERIC(12,2)`| `NOT NULL`, Default `0.00`, `CHECK >= 0` | Morning shift recorded consumption. |
| `pm_usage` | `NUMERIC(12,2)`| `NOT NULL`, Default `0.00`, `CHECK >= 0` | Evening shift recorded consumption. |
| `total_stock` | `NUMERIC(12,2)`| `GENERATED ALWAYS AS (beginning_stock + added_stock) STORED` | Total available stock for the day. |
| `ending_stock` | `NUMERIC(12,2)`| `GENERATED ALWAYS AS (GREATEST(0, (beginning_stock + added_stock) - (am_usage + pm_usage))) STORED` | Computed non-negative ending stock balance. |
| `physical_count`| `NUMERIC(12,2)`| `NULL`, `CHECK >= 0` | Actual count verified by staff at shift close. |
| `discrepancy` | `NUMERIC(12,2)`| `GENERATED ALWAYS AS (COALESCE(physical_count, GREATEST(0, (beginning_stock + added_stock) - (am_usage + pm_usage))) - GREATEST(0, (beginning_stock + added_stock) - (am_usage + pm_usage))) STORED` | Variance between physical count and computed ending stock. |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL`, Default `now()` | Last autosave timestamp. |

### 2.9 `public.daily_inventory_revisions`
Audit log storing all post-finalization sheet modifications.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PK`, Default `gen_random_uuid()` | Unique revision ID. |
| `sheet_id` | `UUID` | `NOT NULL`, `REFERENCES daily_inventory_sheets(id) ON DELETE CASCADE` | Corrected worksheet. |
| `revision_number`| `INTEGER` | `NOT NULL` | Sequential revision sequence index (1, 2, 3...). |
| `revised_by` | `UUID` | `NOT NULL`, `REFERENCES profiles(id)` | User who submitted the correction. |
| `reason` | `TEXT` | `NOT NULL` | Mandatory explanation for audit purposes. |
| `previous_state`| `JSONB` | `NOT NULL` | Snapshot of item balances prior to correction. |
| `corrected_state`| `JSONB` | `NOT NULL` | Snapshot of item balances following correction. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default `now()` | Revision timestamp. |

### 2.10 `public.notifications`
Operational alert queue for low stock, expirations, and system announcements.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PK`, Default `gen_random_uuid()` | Unique notification ID. |
| `type` | `VARCHAR(30)` | `NOT NULL` | Category: `'LOW_STOCK'`, `'OUT_OF_STOCK'`, `'EXPIRING_SOON'`, `'EXPIRED'`, `'SYSTEM'`. |
| `title` | `VARCHAR(200)` | `NOT NULL` | Headline summary. |
| `message` | `TEXT` | `NOT NULL` | Detailed operational alert text. |
| `item_id` | `UUID` | `NULL`, `REFERENCES inventory_items(id)` | Target item for direct navigation. |
| `batch_id` | `UUID` | `NULL`, `REFERENCES stock_batches(id)` | Target batch for expiration warnings. |
| `dedup_key` | `VARCHAR(255)` | `NULL`, `UNIQUE` | Deduplication key preventing duplicate spam alerts. |
| `is_read` | `BOOLEAN` | `NOT NULL`, Default `false` | Acknowledgment state. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default `now()` | Timestamp created. |

### 2.11 `public.report_snapshots`
Frozen immutable historical records of daily shift inventory balances.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PK`, Default `gen_random_uuid()` | Unique snapshot ID. |
| `report_date` | `DATE` | `NOT NULL`, `UNIQUE` | Calendar date of the snapshot. |
| `report_type` | `VARCHAR(50)` | `NOT NULL`, Default `'DAILY_INVENTORY'` | Category of report. |
| `data_payload` | `JSONB` | `NOT NULL` | Complete array of serialized item rows and metadata. |
| `generated_by` | `UUID` | `NULL`, `REFERENCES profiles(id)` | User who finalized the report. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, Default `now()` | Creation timestamp. |

### 2.12 Additional Operational & Governance Tables
* `public.system_sessions`: Tracks active single-session device leases (`device_id`, `lease_expires_at`, `last_heartbeat`).
* `public.system_settings`: Key-value configuration store (`key` PK, `value`, `description`, `updated_at`).
* `public.system_incidents`: Incident management registry (`incident_code` UK, `severity`, `status`, `title`).
* `public.recovery_points`: Disaster recovery checkpoint metadata (`point_code` UK, `integrity_status`, `scope_manifest`).
* `public.system_automations`: Registered background job metadata (`automation_code` UK, `is_enabled`, `last_status`).
* `public.system_deployments`: Verified deployment commit history (`commit_sha`, `version`, `deployed_at`).
* `public.audit_logs`: Immutable security and administrative event ledger (`action`, `entity_name`, `entity_id`, `metadata`).
* `public.user_session_leases`: Authoritative single-session lease per user (`lease_token`, `device_id`, `claimed_at`, `last_heartbeat_at`, `released_at`); takeover and heartbeat are server-enforced (`renew_session_lease`).
* `public.account_security_state`: Per-account login lockout state (`failed_attempts`, `locked_until`, `lockout_token_hash`, `last_lockout_at`, `verification_required` — set on the first failed attempt after a lockout expired within 24h, cleared by admin unlock or successful sign-in); RLS denies all client reads — status flows only through typed RPCs.
* `public.security_events`: Append-only security audit ledger (`event_type`, `email_masked`, `details`); admin-only SELECT; masked identifiers, never raw.
* `public.password_reset_requests`: Legacy email-reset request log for real-mailbox accounts (`request_code`, `email`, `status`).
* `public.account_recovery_requests`: Assisted recovery tickets for mailbox-less `@kuventory.com` identifiers (`request_reference`, `email_lookup`, `status_credential_hash`, `status` RECEIVED → HUMAN_REVIEW/NEEDS_INFORMATION → COMPLETED/REJECTED/EXPIRED).
* `public.account_recovery_factors`: Registered recovery factors backing the assisted-recovery engine.
* `public.account_recovery_attempt_state`: Wrong-identifier attempt counters for the recovery dialog, keyed by sha256 of the exact identifier (`unknown_attempts`, `cooldown_until`, `last_attempt_at`, `verification_required_until`); RLS deny-all — 5 unknown submissions per identifier / 15 min triggers a 2-minute cooldown (not a lockout), and the first unknown identifier after a cooldown within 1 hour triggers administrator verification for 1 hour (FFRC-12/13).
* `public.profile_contact_links`: Per-profile public contact links (`label`, `platform`, `url` https/mailto/tel only, `is_public`, `sort_order`).
* `public.daily_inventory_correction_requests`: Two-stage finalized-sheet correction workflow (PENDING → APPROVED/REJECTED; approver is admin-only; applied atomically via `apply_approved_daily_inventory_correction`).

---

## 3. Stored Procedures & Database Functions (RPCs)

| RPC Name | Signature | Security Mode | Purpose & Behavior |
| :--- | :--- | :--- | :--- |
| `consume_stock` | `(p_item_id UUID, p_quantity NUMERIC, p_reason TEXT)` | `SECURITY DEFINER` | Core FEFO consumption procedure. Locks batches with `FOR UPDATE`, deducts from earliest expiring batches, and logs `stock_movements`. |
| `finalize_daily_inventory_sheet` | `(p_sheet_id UUID)` | `SECURITY DEFINER` | Transitions sheet to `'FINALIZED'`, loops items to execute `consume_stock`, and generates frozen `report_snapshots`. |
| `apply_daily_sheet_correction` | `(p_sheet_id UUID, p_reason TEXT, p_items JSONB)` | `SECURITY DEFINER` | Evaluates consumption delta, executes FEFO stock adjustments, creates revision record in `daily_inventory_revisions`, and increments revision number. |
| `renew_session_lease` | `(p_device_id TEXT, p_user_agent TEXT)` | `SECURITY DEFINER` | Heartbeat RPC. Validates caller's `auth.uid()`, revokes other devices for this user, and extends lease expiration by 2 minutes. |
| `check_expiry_notifications` | `()` | `SECURITY DEFINER` | Scheduled routine (invoked by `pg_cron`) evaluating expiring and expired batches, inserting alerts with unique dedup keys. |
| `execute_inventory_drift_analysis`| `()` | `SECURITY DEFINER` | Compares sum of active batch quantities against `inventory_items.current_qty` and returns discrepancies. |
| `submit_assisted_recovery_request` | `(p_email TEXT, p_reason TEXT)` | `SECURITY DEFINER` (anon) | v5 assisted-recovery submission. Existence gate first; unknown identifiers are counted per exact identifier (sha256 state) — attempts 1–4 return `attempts_remaining`, the 5th within 15 min starts a 2-minute **cooldown** (not a lockout); known identifiers get the atomic 2-min ticket throttle plus the one-time status credential. |
| `check_assisted_recovery_cooldown` | `(p_email TEXT)` | `SECURITY DEFINER` (anon) | v3 side-effect-free cooldown check: reports the later of the ticket cooldown and the active unknown-identifier cooldown, with the message naming which limit applies. |
| `check_assisted_recovery_status` | `(p_request_reference TEXT, p_status_credential TEXT)` | `SECURITY DEFINER` (anon) | Non-enumerating ticket status lookup: requires BOTH the public reference and the secret credential; never exposes admin notes. |
| `review_assisted_recovery_request` | `(p_request_id UUID, p_decision TEXT, p_notes TEXT, p_new_password TEXT)` | `SECURITY DEFINER` (admin) | Admin-only ticket decision; `RESOLVE_RESET` performs the verified password reset server-side and marks the ticket COMPLETED in the same transaction. |
| `get_public_support_contacts` | `()` | `SECURITY DEFINER` (anon) | Opted-in ADMIN/SUPER_ADMIN profiles with at least one real public channel (support phone, support email, or public link) for the recovery and lockout screens. |
| `update_my_profile` | `(p_display_name, p_first_name, …)` | `SECURITY DEFINER` (authenticated) | Self-only profile update including support channels and the `show_on_lockout_screen` opt-in; no role/id escalation. |
| `record_failed_login_attempt` | `(p_email TEXT)` | `SECURITY DEFINER` (anon) | Server-authoritative failure counter: 5 failures / 15 min locks the account with **no time expiry** — release is administrator-unlock-only (verified unlock / successful sign-in / identity-verified reset); opaque token (sha256-stored). |
| `check_account_lockout` | `(p_email TEXT)` | `SECURITY DEFINER` (anon) | Typed lockout status (`LOCKED/UNLOCKED/EXPIRED/…`) plus `server_now`; never guesses on transport failure. |
| `check_lockout_status_by_token` | `(p_token TEXT)` | `SECURITY DEFINER` (anon) | Opaque-token lockout polling for the lockout card; typed contract, fail-closed. |
| `get_locked_accounts` / `unlock_account` / `reset_my_login_lockout` | — | `SECURITY DEFINER` (admin / self) | Lockout admin console listing and authorized unlock / self reset after verified recovery. |
| `mark_notification_as_read` / `mark_all_notifications_as_read` | — | `SECURITY DEFINER` (authenticated) | Own-notification read state only (actor-checked). |
| `request_password_reset` | `(p_email TEXT)` | `SECURITY DEFINER` (anon) | Legacy email-reset dispatch for real-mailbox accounts (deduplicated admin notification); `@kuventory.com` identifiers use assisted recovery instead. |
| `admin_reset_user_password` | `(p_user_id UUID, p_new_password TEXT)` | `SECURITY DEFINER` (admin) | Direct admin reset with bcrypt hashing and an audit log entry. |
| `apply_approved_daily_inventory_correction` | `(p_request_id UUID)` | `SECURITY DEFINER` (admin) | Applies an approved finalized-sheet correction atomically (FEFO adjustments + revision record). |

---

## 4. Chronological Migration Inventory

The KUVENTORY schema is constructed through **80 sequential migrations** located in `supabase/migrations/`:

```
 1. 20260831000000_initial_schema.sql
 2. 20260902050213_foundation_schema.sql
 3. 20260902050300_rls_and_policies.sql
 4. 20260902050400_fefo_and_functions.sql
 5. 20260902050500_grants.sql
 6. 20260902060000_inventory_engine.sql
 7. 20260902070000_daily_inventory.sql
 8. 20260902080000_fefo_update.sql
 9. 20260902090000_notifications_schema.sql
10. 20260902090100_threshold_triggers.sql
11. 20260902094917_report_snapshots.sql
12. 20260902100000_expiry_cron.sql
13. 20260902120000_security_hardening.sql
14. 20260902130000_cleanup_rpc_signatures.sql
15. 20260903100000_inventory_view_id_alias.sql
16. 20260903110000_fix_consume_stock_expired_exclusion.sql
17. 20260903120000_fix_adjust_stock_movement_type.sql
18. 20260903130000_fix_notification_type_oos.sql
19. 20260903150000_items_enhancements_and_visitors.sql
20. 20260903151200_update_inventory_view.sql
21. 20260903153000_admin_user_management.sql
22. 20260904000000_real_data_views.sql
23. 20260904103508_fix_schema_grants_and_cache.sql
24. 20260904111022_fix_auth_schema_grants.sql
25. 20260904112028_fix_auth_null_tokens.sql
26. 20260904113012_fix_auth_null_tokens_complete.sql
27. 20260904134500_rls_policies.sql
28. 20260904134600_test_users.sql
29. 20260904140000_permanent_auth_and_schema_fix.sql
30. 20260904142000_seed_all_business_items.sql
31. 20260905001500_profiles_alignment_and_admin_sync.sql
32. 20260905002000_fix_finalize_daily_inventory_consumption.sql
33. 20260905002500_fix_inventory_thresholds_trigger_null_message.sql
34. 20260905003000_eliminate_all_nulls_and_harden_views.sql
35. 20260905004000_system_settings_and_suppliers.sql
36. 20260906050000_full_crud_for_users_and_admins.sql
37. 20260908180000_admin_password_management.sql
38. 20260908210000_database_hardening_and_security.sql
39. 20260909130000_add_item_image_path.sql
40. 20260909140000_security_and_keepalive_hardening.sql
41. 20260912030000_fix_security_definer_views.sql
42. 20260923234500_fix_admin_create_user_and_auth_schema.sql
43. 20261003180000_master_admin_and_concurrency.sql
44. 20261003190000_zero_stock_expiry_and_notifications.sql
45. 20261003200000_master_admin_and_reset_workflow.sql
46. 20261004220000_single_session_lease_and_recovery_engine.sql
47. 20261017233000_visitor_logs_and_archival_and_realtime.sql
48. 20261018000000_super_admin_foundation_and_control_center.sql
49. 20261018110000_critical_workflow_repairs.sql
50. 20261018140000_security_audit_hardening.sql
51. 20261018150000_master_security_and_realtime_hardening.sql
52. 20261018180000_super_admin_operations_console_hardening.sql
53. 20261019090000_final_safety_guards.sql
54. 20261019200000_session_reliability_and_scheduled_services.sql
55. 20261021210000_atomic_create_item_and_initial_stock.sql
56. 20261021220000_harden_inventory_view_and_security.sql
57. 20261022000000_fix_stock_batches_initial_quantity.sql
58. 20261022010000_fix_session_hostility_and_overload.sql
59. 20261022020000_fix_finalize_and_inventory_saving.sql
60. 20261022030000_repair_schema_and_stock_adjustment.sql
61. 20261022040000_fix_receive_stock_and_auth_fallbacks.sql
62. 20261024150000_release_a_authorization_and_grants_hardening.sql
63. 20261024160000_release_b_profile_and_support_contacts.sql
64. 20261024170000_release_c_login_lockout_and_account_security.sql
65. 20261024180000_release_d_finalized_correction_approvals.sql
66. 20261024190000_blueprint_remediation_p0_and_p1.sql
67. 20261024200000_comprehensive_auth_and_trust_boundary_repair.sql
68. 20261024210000_retire_master_admin_and_admin_only_corrections.sql
69. 20261024220000_align_stock_movement_types_and_consume.sql
70. 20261024230000_revoke_anon_defaults_and_function_grants.sql
71. 20261024231000_live_db_privilege_inspection.sql
72. 20261025000000_inspect_all_live_policies.sql
73. 20261025010000_zero_trust_notification_security_overhaul.sql
74. 20261025120000_assisted_recovery_and_lockout_authoritative_repair.sql
75. 20261025200000_notification_route_storage_and_realtime_repair.sql
76. 20261025220000_recovery_account_existence_gate.sql
77. 20261025230000_recovery_unknown_identifier_attempt_cooldown.sql
78. 20261025240000_recovery_attempt_state_exact_identifier.sql
79. 20261026000000_signin_escalation_to_admin_verification.sql
80. 20261026120000_lockout_admin_unlock_only.sql
```
