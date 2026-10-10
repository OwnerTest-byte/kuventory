# [DEPLOYMENT, OPERATIONS & DISASTER RECOVERY] KUVENTORY™ Operational Runbook

**System Name:** KUVENTORY Enterprise Restaurant & Kiosk Inventory Management System  
**Document Code:** `DOC-04-DODR`  
**Classification:** Operational Runbook · DevOps & System Administration  
**Production URL:** [https://kuventory.netlify.app](https://kuventory.netlify.app)  
**Version:** 2.5.0 (Production Release)  

---

## 1. Local Environment Setup & Installation

### 1.1 Prerequisites
- **Node.js:** v18.x or v20.x LTS
- **Package Manager:** `npm` v9+
- **Version Control:** `git` v2.30+
- **Supabase Account:** Active project instance with PostgreSQL 17

### 1.2 Installation Steps
```bash
# 1. Clone the repository
git clone https://github.com/OwnerTest-byte/kuventory.git
cd kuventory

# 2. Install dependencies
npm ci

# 3. Configure environment variables
cp .env.example .env.local

# 4. Populate .env.local with Supabase credentials:
# VITE_SUPABASE_URL=https://<your-project>.supabase.co
# VITE_SUPABASE_ANON_KEY=<your-anon-key>

# 5. Launch local development server
npm run dev
```

### 1.3 Available NPM Scripts
- `npm run dev`: Starts the local Vite development server on `http://localhost:5173`.
- `npm run build`: Typechecks code with `tsc -b` and compiles the production bundle into `/dist`.
- `npm run preview`: Spins up a local web server serving the compiled `/dist` bundle.
- `npm run test`: Executes the Vitest unit testing suite.
- `npm run test:e2e`: Runs the Playwright multi-browser end-to-end test suite.
- `npm run typecheck`: Validates strict TypeScript compilation without emitting output.

---

## 2. Production Deployment (Netlify CI/CD)

KUVENTORY is deployed via continuous deployment linked directly to the GitHub `main` branch.

### 2.1 Netlify Build Pipeline Configuration (`netlify.toml`)
```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### 2.2 Deployment Workflow
1. A developer pushes tested commits to `origin/main`.
2. Netlify detects the push, pulls dependencies via `npm ci`, and runs `npm run build`.
3. The resulting `/dist` bundle is distributed across Netlify's global edge points.
4. Single-page application route rewrites ensure that direct visits to deep links (e.g., `/settings?tab=master` or `/daily-inventory`) serve `index.html` with full client-side routing.

---

## 3. Disaster Recovery & Continuity Plan

### 3.1 Objectives
- **Recovery Point Objective (RPO):** $\le 24$ hours for daily inventory logs; $\le 1$ hour with Supabase Point-in-Time Recovery (PITR).
- **Recovery Time Objective (RTO):** Full operational capability restored within $60$ minutes of incident declaration.

### 3.2 Backup Strategy & Separation of Assets
Database backups do **not** automatically restore binary objects stored via Supabase Storage. KUVENTORY implements an explicit dual-layer strategy:

| Asset Category | Storage Destination | Frequency | Retention | Recovery Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL Database** | Supabase Cloud Automated Snapshots + Local Master JSON Snapshots | Daily automated + On-demand Master Admin 1-click snapshot | 30 days rolling (PITR: 7 days) | Stored procedure replay / Master Admin Restore Engine |
| **Report Documents** | Immutable PostgreSQL records in `reports` and `report_items` | Database snapshots | Permanent | On-demand byte-for-byte PDF/Excel re-export |
| **Product Photography** | Repository `/public/pics/` bundled into deployment | Git Version Control | Indefinite | Re-deployed automatically with frontend bundle |
| **Schema Migrations** | `supabase/migrations/*.sql` in GitHub repository | Git Version Control | Indefinite | `npx supabase db push` |

---

## 4. Disaster Recovery Restoration Procedure

Restoration is a high-risk operation that must be authorized exclusively by the **Master Administrator** (`master@kuventory.com`).

```
[Incident Declared]
       │
       ▼
[Enter Emergency Maintenance Mode]
       │
       ▼
[Select & Inspect Recovery Snapshot]
       │
       ▼
[Review Dry-Run Discrepancy Report]
       │
       ▼
[Confirm Passphrase & Execute Restore]
       │
       ▼
[Post-Restore Verification Checklist]
       │
       ▼
[Deactivate Maintenance Mode & Re-Open]
```

### 4.1 Step-by-Step Restoration Workflow
1. **Declare Incident & Lock Site:**
   - Log into `master@kuventory.com`.
   - In `/settings?tab=master`, toggle **Emergency Maintenance Mode** to `ACTIVE`. This prevents concurrent user edits during recovery.
2. **Select Recovery Snapshot:**
   - Under **Disaster Recovery Center**, select the verified backup file (`kuventory_master_backup_[timestamp].json`).
3. **Execute Dry-Run Inspection:**
   - Review the generated discrepancy report comparing existing database records against the backup payload.
4. **Authorize & Execute Restoration:**
   - Input the required security passphrase to confirm authorization.
   - Click **Execute Disaster Recovery Restore**.
   - The restore engine synchronizes items, categories, batches, movements, and sheets without dropping table schemas.
5. **Post-Restore Verification Checklist:**
   - [ ] Database connection responds within normal latency ($\le 200\text{ms}$).
   - [ ] Auth engine authenticates Master Admin, Store Admin, and Staff.
   - [ ] Item catalog and active batches display correct balances.
   - [ ] Stock balance drift analyzer reports zero discrepancies.
   - [ ] Daily inventory sheets load properly.
   - [ ] Historical finalized reports can be viewed and re-exported.
6. **Re-Open Service:**
   - Deactivate Maintenance Mode in the Master Console.
   - Log incident completion in the Master Audit Trail.

---

## 5. Contingency Playbooks

### Playbook A: Accidental Record Deletion
- **Action:** Restore the affected record from the latest Master Admin JSON snapshot, or leverage the soft-delete (`archived_at`) restoration interface in the Admin Console.

### Playbook B: Database Migration Failure
- **Action:** Revert to the prior Git commit, push to `main` to trigger Netlify redeploy, and execute down-migration SQL via Supabase SQL Editor.

### Playbook C: Compromised Admin Account
- **Action:** Master Admin logs in, navigates to `/settings?tab=users`, immediately resets the compromised user's password or revokes their account status, and audits recent stock movements for unauthorized changes.
