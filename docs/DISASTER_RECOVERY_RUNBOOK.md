# KUVENTORY Disaster Recovery & Backup Runbook

## 1. Overview & Objective
This runbook establishes standard operational procedures for database backup, disaster recovery, and data verification for the KUVENTORY Restaurant Kiosk & Bodega Inventory Management System.

- **Recovery Point Objective (RPO):** Maximum 24 hours of lost transactions in disaster scenario (or 1 hour with Point-in-Time Recovery enabled).
- **Recovery Time Objective (RTO):** Full operational restoration within 60 minutes.

---

## 2. Backup Mechanisms

### 2.1 Automated Cloud Backups (Supabase)
Supabase automatically takes daily logical backups and WAL snapshots of the PostgreSQL database engine.
- Backups are stored in redundant multi-region cloud object storage.
- Available through Supabase Dashboard -> **Database** -> **Backups**.

### 2.2 Scheduled Manual / CI Logical Dumps
To create an off-site logical SQL snapshot:

```bash
# 1. Export schema and operational data using Supabase CLI
npx supabase db dump --db-url "$DATABASE_URL" -f backups/kuventory_backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Dump schema only
npx supabase db dump --db-url "$DATABASE_URL" --schema-only -f backups/schema_snapshot.sql

# 3. Dump data only
npx supabase db dump --db-url "$DATABASE_URL" --data-only -f backups/data_snapshot.sql
```

---

## 3. Disaster Recovery Restoration Procedure

In the event of database corruption, ransomware, or catastrophic infrastructure failure:

### Step 1: Provision Replacement Instance
1. Create a new Supabase project or spin up a PostgreSQL 15+ container.
2. Configure environment variables in `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `DATABASE_URL`

### Step 2: Apply Migrations & Security Hardening
Run migrations in sequence from `supabase/migrations/`:
```bash
npx supabase db push
# Or execute migrations in alphabetical order using psql:
cat supabase/migrations/*.sql | psql "$DATABASE_URL"
```

### Step 3: Restore Data Snapshot
Restore data from the latest verified backup:
```bash
psql "$DATABASE_URL" -f backups/kuventory_backup_LATEST.sql
```

### Step 4: Verification & Parity Checks
Execute integrity queries to ensure all master and operational tables are restored:
```sql
SELECT 
  (SELECT count(*) FROM public.inventory_items) AS inventory_items_count,
  (SELECT count(*) FROM public.stock_batches) AS stock_batches_count,
  (SELECT count(*) FROM public.daily_inventory) AS daily_inventory_count,
  (SELECT count(*) FROM public.profiles) AS profiles_count,
  (SELECT count(*) FROM public.system_settings) AS settings_count;
```

### Step 5: Test Keepalive & Reconnect Frontend
1. Run `node scripts/ping-supabase.mjs` to ensure the instance is active and reachable.
2. Deploy the frontend with updated environment variables to Netlify.
3. Perform a test login as administrator and verify the active stock view.
