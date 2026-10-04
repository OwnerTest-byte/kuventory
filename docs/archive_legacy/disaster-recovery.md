# KUVENTORY Disaster Recovery & Continuity Plan

**Document Version:** 2.0  
**Effective Date:** October 2026  
**System:** KUVENTORY Restaurant Inventory Management System  
**Classification:** Confidential / System Administration

---

## 1. Executive Summary & Objective

This Disaster Recovery (DR) Plan establishes operational, verifiable procedures to preserve data integrity, restore system functionality, and protect business continuity for KUVENTORY during catastrophic system events. 

- **Recovery Point Objective (RPO):** ≤ 24 hours for daily physical inventory logs; ≤ 1 hour with Point-in-Time Recovery (PITR) enabled.
- **Recovery Time Objective (RTO):** Full operational capability restored within 60 minutes of incident declaration.

---

## 2. Backup Strategy & Asset Inventory

Database backups **do not** automatically restore binary objects stored in Supabase Storage (e.g., uploaded item pictures, generated PDF/Excel report exports). Thus, a dual-layer backup architecture is implemented:

| Asset Category | What Is Backed Up | Storage Destination | Frequency | Retention Period | Authorized Operators |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL Database** | Schemas, tables, views, RLS policies, triggers, RPC functions, audit logs | Supabase Cloud automated storage + Local encrypted off-site dump | Daily logical snapshots + Continuous WAL archiving | 30 days rolling (PITR: 7 days) | Master Admin, DevOps Lead |
| **Supabase Storage** | Item images (`/item-images`), generated report files | Cloud Storage Bucket sync (`rclone` / S3-compatible mirror) + Local repository assets (`/public/pics`) | Daily incremental sync | 90 days | Master Admin |
| **Schema Migrations** | Versioned SQL scripts in `supabase/migrations/` | Git Version Control (GitHub main repo) | On each committed release | Indefinite | System Architects |
| **Environment Configuration** | Environment variables (`.env`, Netlify environment secrets) | Secure password manager / Vault (Encrypted offsite) | On every change / credential rotation | Latest + 3 versions | Master Admin |

---

## 3. Storage Backup & Report File Recovery Strategy

### 3.1 Report File Architecture & Recovery
In KUVENTORY, official daily inventory reports and shift snapshots are **immutable database records** in `daily_inventory` and `daily_inventory_items`.
- If an exported PDF or Excel file in Supabase Storage is deleted or corrupted, **no historical inventory data is lost**.
- Any authorized administrator can re-export the exact, byte-for-byte identical PDF, XLSX, or CSV report on demand from the `daily_inventory` snapshot in the database.
- Database snapshots represent the authoritative source of truth.

### 3.2 Product Image Recovery
- Core placeholder assets and default product photography are maintained in the repository under `/public/pics/` and bundled with the frontend deployment.
- Custom user uploads are mirrored weekly using Supabase Storage CLI:
```bash
# Sync Supabase Storage bucket to local backup
npx supabase storage download-all item-images ./backups/storage/item-images
```

---

## 4. Disaster Recovery Restoration Procedure

### 4.1 Prerequisites & Access Control
Restoration must only be initiated by the **Master Administrator** or designated emergency technical contact. NEVER execute destructive reset operations against production databases.

### 4.2 Step-by-Step Restoration Workflow

```
[Incident Declared]
       │
       ▼
[Isolate & Notify] ──► Post maintenance banner; revoke compromised sessions
       │
       ▼
[Provision Target] ──► Supabase staging or replacement PostgreSQL 15+ instance
       │
       ▼
[Apply Migrations] ──► Run `supabase/migrations/*.sql` in chronological order
       │
       ▼
[Restore Data Dump] ──► `psql -f backups/kuventory_backup_LATEST.sql`
       │
       ▼
[Verify Parity] ────► Run Table Count & Foreign Key integrity queries
       │
       ▼
[Storage Sync] ─────► Upload mirrored assets to `/item-images` bucket
       │
       ▼
[Frontend Reconnect] ─► Update `VITE_SUPABASE_URL` / keys & redeploy
       │
       ▼
[Resume Operations] ─► Remove maintenance banner; notify operational staff
```

#### Step 1: User Notification & System Isolation
1. If the database is corrupted or compromised, temporarily divert traffic to a static maintenance page:
   ```html
   <!-- Netlify _redirects maintenance mode -->
   /*  /maintenance.html  503!
   ```
2. Notify managers and shift supervisors via WhatsApp/SMS: *"KUVENTORY is undergoing emergency scheduled maintenance. Please record physical daily counts on paper until further notice."*

#### Step 2: Provision Replacement Database (Staging / New Project)
1. Initialize a new project in the Supabase Dashboard or spin up a local/cloud PostgreSQL 15 container.
2. Ensure required extensions are active (`uuid-ossp`, `pgcrypto`).

#### Step 3: Run Database Migrations
Execute all versioned migrations in chronological order:
```bash
# Using Supabase CLI
npx supabase db push

# Or directly using psql:
cat supabase/migrations/*.sql | psql "$DATABASE_URL"
```

#### Step 4: Restore Authoritative Data Snapshot
Restore operational data from the latest verified backup:
```bash
psql "$DATABASE_URL" -f backups/kuventory_backup_VERIFIED.sql
```

#### Step 5: Post-Restore Verification & Integrity Checks
Run the verification query suite to validate referential integrity, positive stock constraints, and record counts:
```sql
-- 1. Table Record Audit
SELECT 
  (SELECT count(*) FROM public.inventory_items) AS total_items,
  (SELECT count(*) FROM public.stock_batches WHERE quantity > 0) AS active_batches,
  (SELECT count(*) FROM public.stock_batches WHERE quantity <= 0) AS depleted_batches,
  (SELECT count(*) FROM public.daily_inventory) AS finalized_reports,
  (SELECT count(*) FROM public.profiles) AS user_accounts;

-- 2. Negative Stock Invariant Check (Must return 0 rows)
SELECT id, item_id, batch_code, quantity 
FROM public.stock_batches 
WHERE quantity < 0;

-- 3. Orphaned Batches Check (Must return 0 rows)
SELECT sb.id, sb.batch_code 
FROM public.stock_batches sb 
LEFT JOIN public.inventory_items ii ON sb.item_id = ii.id 
WHERE ii.id IS NULL;
```

#### Step 6: Storage Restoration
Ensure the `/item-images` storage bucket exists with public read permissions and restore image assets:
```bash
npx supabase storage upload-all item-images ./backups/storage/item-images
```

#### Step 7: Application Reconnection & Verification
1. Update Netlify environment variables with the restored database credentials:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Trigger production rebuild:
   ```bash
   npm run build
   ```
3. Test end-to-end authentication, item lookup, and stock balance display.
4. Remove the maintenance redirect and reopen the kiosk interface.

---

## 5. Specific Contingency Procedures (14 Scenarios)

### Scenario 1: Accidental Item / Batch Deletion
- **Cause:** User accidentally clicks Delete on an active item or batch.
- **Protection:** Items use soft-deletion (`is_archived = true`). Physical item deletion requires explicit confirmation and cascades cleanly to movements.
- **Remediation:** If archived, open Items Catalog -> Filter by "Archived" -> Click "Restore". If permanently deleted, inspect the previous night's logical dump and restore the single row with its `stock_movements`.

### Scenario 2: Corrupted Inventory Data (Inconsistent Totals)
- **Cause:** Client-side arithmetic bug or incomplete transaction.
- **Protection:** All stock updates run through transactional Postgres RPCs (`add_stock_batch`, `deduct_stock_fefo`, `adjust_stock_level`) with row-level locks (`FOR UPDATE`).
- **Remediation:** Run `reconcile_item_stock(item_id)` to recompute master stock strictly from the sum of active batches (`quantity > 0`).

### Scenario 3: Bad Database Migration
- **Cause:** Migration introduces a locking deadlock, invalid syntax, or unintended constraint.
- **Protection:** Migrations are tested on local Supabase emulator before cloud deployment.
- **Remediation:** Roll back by applying the corresponding down-migration script or restoring the pre-migration snapshot taken before `supabase db push`.

### Scenario 4: Failed Deployment
- **Cause:** Broken build artifact or incompatible environment configuration.
- **Protection:** CI/CD pipeline runs `npm run typecheck`, `npm test`, and `npm run build` before publishing.
- **Remediation:** Roll back instantly to the prior release in Netlify Deploy History with one click (zero downtime).

### Scenario 5: Complete Database Outage
- **Cause:** Cloud region incident or provider hardware failure.
- **Protection:** Automated daily logical dumps stored across distinct geographical locations.
- **Remediation:** Spin up a standby Supabase project in an alternative region, execute migrations, restore data snapshot, update DNS / frontend API URL.

### Scenario 6: Network Outage (Offline Kiosk)
- **Cause:** Local ISP outage at the restaurant.
- **Protection:** TanStack Query caches existing item catalogs in browser memory. Daily Inventory displays clear network status indicator.
- **Remediation:** Staff switch to mobile hotspot or paper logs until the connection is restored. When back online, TanStack Query automatically refetches fresh stock state.

### Scenario 7: Duplicate Stock Mutation (Double-Click / Double-Submit)
- **Cause:** Worker double-clicks "Confirm" or network lags during submission.
- **Protection:** Modal submit buttons are immediately disabled on click (`isPending = true`), preventing repeated submission. PostgreSQL transaction functions enforce row locks.
- **Remediation:** Database triggers reject concurrent modifications that conflict with optimistic versioning tokens.

### Scenario 8: Concurrent Stock Changes (Race Condition)
- **Cause:** Worker A and Worker B deduct stock from the same SKU at the same second.
- **Protection:** PostgreSQL row locks (`SELECT ... FOR UPDATE`) in `deduct_stock_fefo` sequence the mutations deterministically. If stock is insufficient, the second transaction is rolled back with an atomic error: `Insufficient stock balance`.
- **Remediation:** The second worker receives an immediate user-friendly notification: *"Stock was just updated by another user. Remaining balance is insufficient."*

### Scenario 9: Compromised Staff Account
- **Cause:** Worker credentials leaked or shared insecurely.
- **Protection:** Strict Row-Level Security prevents staff accounts from modifying system settings, user roles, or audit logs.
- **Remediation:** Admin opens `/admin` -> Staff Accounts -> Click "Deactivate" or "Reset Password". Deactivated sessions are invalidated on subsequent Supabase requests.

### Scenario 10: Compromised Administrator Account
- **Cause:** Admin password leaked or session hijacked.
- **Protection:** Break-glass master credentials stored in secure hardware vault. System audit logs track all role changes.
- **Remediation:** The Break-Glass account logs in, immediately revokes admin privileges for the compromised email, changes passwords, and reviews audit logs in `stock_movements` and `audit_logs`.

### Scenario 11: Failed Report Generation
- **Cause:** Browser PDF generation exceeds timeout or memory limit.
- **Protection:** Report generation never marks status "Complete" until the file is fully rendered. The underlying daily inventory snapshot in PostgreSQL is preserved independently.
- **Remediation:** UI displays *"Report generation failed. Source data is safely preserved. Click to retry."* Authorized users can re-trigger export at any time.

### Scenario 12: Broken Notification Processing
- **Cause:** Notification queue backlog or trigger failure.
- **Protection:** Expiry notifications are generated directly by database views (`check_expiry_notifications()`) and automatically resolved when batches hit `<= 0`.
- **Remediation:** Call `SELECT check_expiry_notifications();` manually via SQL editor. The UI immediately reflects current alert states.

### Scenario 13: Storage File Loss
- **Cause:** Bucket deletion or CDN error.
- **Protection:** Core item photography is version-controlled in the Git repository (`/public/pics/`). Reports are regenerated dynamically from PostgreSQL records.
- **Remediation:** Restore image directory from git / local mirror to the Supabase storage bucket.

### Scenario 14: Realtime Subscription Failure
- **Cause:** WebSocket disconnection or firewall drop.
- **Protection:** TanStack Query treats Realtime as an enhancement, NOT the sole source of truth. Background refetch on window focus and manual refresh buttons are built into every view.
- **Remediation:** The UI continues operating in HTTP request/response mode. Clicking refresh or navigating routes fetches the authoritative PostgreSQL state.

---

## 6. Restore Testing & Verification Cadence

- **Quarterly Staging Drill:** Every 90 days, a full dry-run restore must be executed on a staging database.
- **Pass Criteria:**
  1. All 11 test suites (`npm test`) pass on the restored staging instance.
  2. All 5 expiry test cases pass.
  3. No orphan records or negative stock balances exist.
  4. Finalized historical reports match original snapshot totals.
- **Audit Logging:** Results of every restore drill must be logged in `docs/qa/restore-drill-log.md`.
