# KUVENTORY — Deployment, Environment Configuration & Operational Runbooks

```
Document:               docs/14_DEPLOYMENT_ENVIRONMENT_AND_RUNBOOKS.md
Audience:               DevOps Engineers, System Administrators, Software Architects, Technical Evaluators
Purpose:                Local setup instructions, environment variable declarations, Netlify edge configuration,
                        Supabase migration workflows, disaster recovery protocols, and safe rollback procedures.
Verification Status:    Verified against netlify.toml, .env.example, package.json, and CI workflows
Audit Date:             2026-10-19
Authoritative HEAD SHA: 135f10b807fedec368383c9e34895566da3d69fc
Primary References:     netlify.toml, .github/workflows/, scripts/backup-db.mjs
```

---

## 1. Local Developer Setup & Prerequisites

### 1.1 System Requirements
* **Node.js:** `>= 22.0.0` (Enforced in `package.json` and `.nvmrc`).
* **Package Manager:** `npm` (bundled with Node 22).
* **Git:** Version 2.40+.
* **Operating System:** Windows 10/11, macOS Sonoma/Sequoia, or Ubuntu Linux 22.04+.

### 1.2 Installation Steps
```bash
# 1. Clone the authoritative repository
git clone https://github.com/OwnerTest-byte/kuventory.git
cd kuventory

# 2. Verify Node version
node -v # Must output v22.x or higher

# 3. Install verified dependencies exactly matching package-lock.json
npm ci

# 4. Initialize local environment configuration
cp .env.example .env.local

# 5. Execute automated test suite to verify baseline integrity
npm test

# 6. Start the local development server
npm run dev
```

---

## 2. Environment Variable Configuration (Names Only)

In strict adherence to security rules, **no actual credentials, API tokens, or secrets are documented below**. The table describes the required keys and where the authorized owner configures them:

| Environment Variable Name | Target Runtime | Where Supplied by Owner | Description & Purpose |
| :--- | :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Frontend & Netlify Build | Netlify Site Settings / `.env.local` | HTTPS URL of the Supabase project (e.g., `https://xyz.supabase.co`). |
| `VITE_SUPABASE_ANON_KEY` | Frontend & Netlify Build | Netlify Site Settings / `.env.local` | Public anonymous key providing RLS-enforced database access. |
| `SUPABASE_SERVICE_ROLE_KEY`| Backend / Server Only | Secure Server `.env` / GitHub Secret | Privileged key bypassing RLS. **NEVER expose to frontend `VITE_`!** |
| `DATABASE_URL` | Scripts & Migrations | Standalone Server `.env` | Direct PostgreSQL connection string for `pg_dump` and migrations. |
| `SUPABASE_DB_URL` | Scripts & Migrations | Standalone Server `.env` | Alternative connection string for Supabase database pooling. |
| `PORT` | Optional Express Server | Server `.env` | Port for auxiliary Express security gateway (default: `5000`). |
| `ALLOWED_ORIGINS` | Optional Express Server | Server `.env` | Comma-separated CORS allowed origins (e.g., `https://kuventory.netlify.app`). |
| `BACKUP_DIR` | Standalone Backup Script | Server `.env` | Local filesystem path where `.sql.gz` database dumps are saved. |
| `BACKUP_RETENTION_DAYS` | Standalone Backup Script | Server `.env` | Retention window in days before old backup files are pruned (default: `30`). |
| `BACKUP_CRON_SCHEDULE` | Standalone Backup Script | Server `.env` | Standard 5-field cron expression for backup timing (default: `0 0 * * *`). |

---

## 3. Production Deployment Architecture (Netlify Edge)

KUVENTORY is configured for automated Git-driven continuous deployment on **Netlify Edge CDN**:

### 3.1 Netlify Build Pipeline (`netlify.toml`)
* **Build Command:** `npm run build` (`tsc -b && vite build`)
* **Publish Directory:** `dist`
* **SPA Routing Rule:**
  ```toml
  [[redirects]]
    from = "/*"
    to = "/index.html"
    status = 200
  ```
  Forces all client-side deep links (e.g., `/daily-inventory`, `/super-admin`) to route to `index.html` without 404 errors.
* **Security Headers Injected:** HSTS (`max-age=31536000`), CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.

---

## 4. Supabase Database Migration Runbook

Database schema updates are managed through sequential migration files in `supabase/migrations/`:

### 4.1 Applying Migrations to Remote Supabase
When deploying schema updates to production:
1. Ensure the Supabase CLI is authenticated:
   ```bash
   supabase login
   supabase link --project-ref <your-project-id>
   ```
2. Execute pending migrations in timestamp order:
   ```bash
   supabase db push
   ```
3. Verify applied migrations:
   ```bash
   node scripts/check_applied_migrations.mjs
   ```

### 4.2 Manual Migration Application (SQL Editor Fallback)
If deploying without the Supabase CLI:
1. Open the Supabase Web Dashboard $\rightarrow$ **SQL Editor**.
2. Run migration files sequentially by timestamp (from `20260831000000` to `20261019090000`).
3. Reload the PostgREST schema cache to ensure new columns and RPCs are immediately visible:
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```

---

## 5. Operational Disaster Recovery Protocols

*(See full Mermaid flowchart: [docs/diagrams/disaster_recovery_runbook.mmd](file:///c:/Users/Nuero/OneDrive/Desktop/KUVENTORY-FINAL/docs/diagrams/disaster_recovery_runbook.mmd))*

### Tier 1: Minor Operational Desync (Client Cache Mismatch)
* **Symptom:** Staff tablet displays stale stock counts after another counter finalized a shift.
* **Remediation:**
  1. Have staff tap the **"Refresh"** button on the top navigation bar.
  2. If desync persists, clear browser application storage (`Application > Clear site data`) and reload to re-establish the WebSocket channel.

### Tier 2: Worksheet Stock Drift (Batch Reconciliation)
* **Symptom:** Discrepancy detected between catalog item totals and physical batch quantities.
* **Remediation:**
  1. Super Admin navigates to `/super-admin` $\rightarrow$ **Database Health** tab.
  2. Click **"Run Stock Drift Analysis"** to inspect discrepancy rows.
  3. Click **"Preview Repairs"** to review proposed batch reconciliations.
  4. Click **"Apply Repairs"** to atomically synchronize quantities.

### Tier 3: Compromised Account or Malicious Modification
* **Symptom:** Unauthorized user mutating worksheets or compromised credentials detected.
* **Remediation:**
  1. Super Admin navigates to `/super-admin` $\rightarrow$ **Security & Access** tab.
  2. Toggle **"Emergency Maintenance Mode"** ON. All standard staff and manager accounts are immediately locked out.
  3. In the **Active Sessions** table, click **"Revoke Session"** on the rogue device.
  4. Navigate to `/admin`, locate the compromised user, and reset their password.
  5. Inspect the **Audit Logs** tab to identify and revert unauthorized mutations.
  6. Deactivate Maintenance Mode to restore operational access.

### Tier 4: Catastrophic Table Loss or Corrupted State
* **Symptom:** Accidental drop of core tables or severe transactional data corruption.
* **Remediation:**
  1. Open the Supabase Project Dashboard $\rightarrow$ **Database** $\rightarrow$ **Backups**.
  2. Select the latest clean daily backup point and initiate a **Point-in-Time Restore (PITR)**.
  3. Alternatively, if running the standalone backup runner, restore the latest verified `.sql.gz` dump:
     ```bash
     gunzip < backups/kuventory-backup-YYYY-MM-DD.sql.gz | psql "$DATABASE_URL"
     ```
  4. Run `npm test` and verify that all 107 tests pass before reopening store operations.

---

## 6. Safe Rollback Procedures (Git & Netlify)

If a newly deployed release introduces unexpected UI defects:
1. **Identify Last Known Good Commit:** Check the verified deployment log in `docs/00_PROJECT_OVERVIEW_AND_HISTORY.md` (e.g., commit `4d71bb0`).
2. **Revert in Git (Without Destructive Force Pushes):**
   ```bash
   git revert --no-edit <bad-commit-sha>
   git push origin main
   ```
3. **Netlify Instant Rollback (Zero Downtime):**
   * Open the Netlify Dashboard $\rightarrow$ **Deploys**.
   * Locate the previous successful deploy.
   * Click **"Publish deploy"**. Netlify's CDN will roll back the active release in under 5 seconds.
