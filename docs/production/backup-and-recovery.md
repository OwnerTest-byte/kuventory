# Backup and Recovery Strategy

## Overview
This document outlines the production database backup strategy for Kuventory, leveraging Supabase's native database management features. Since Kuventory does not deploy its own Postgres instances manually, we rely heavily on the automated features provided by the Supabase Cloud.

## Backup Strategy

### 1. Daily Automated Backups (Default Supabase Plan)
- **Frequency:** Supabase performs automatic daily backups for all Pro plans.
- **Retention:** 7 Days (on standard Pro Plan). 
- **Location:** Stored securely in the same region as the database but logically separated.
- **Data Covered:** All Postgres schemas, tables, roles, data, and storage object references.

### 2. Point-in-Time Recovery (PITR)
- **Status:** Requires a specific Supabase add-on. If enabled, PITR allows rolling back the database to any exact minute within the retention window.
- **Recommendation:** Enabling PITR is highly recommended for production instances of Kuventory to protect against accidental mass deletions or incorrect financial transactions.

### 3. Manual Logical Backups
- **Frequency:** Before any major application release (especially those including DB migrations).
- **Process:** Use the Supabase CLI to create a SQL dump.
  ```bash
  supabase db dump --db-url <production-db-url> -f backups/manual_backup_YYYY_MM_DD.sql
  ```

## Recovery Process

### 1. Full Database Restoration (Automated)
If the database needs to be restored from a daily backup:
1. An **Administrator** logs into the Supabase Dashboard.
2. Navigate to **Database > Backups**.
3. Select the target backup date and click **Restore**.
4. *Note*: Restoring a backup overwrites the current live database. The frontend should be put into a maintenance mode before executing this action.

### 2. Restoring Migrations
If a deployment fails due to a bad migration:
- Migrations are version-controlled via `supabase/migrations/`.
- Never restore a backup that lacks the corresponding tables expected by the live frontend application. Ensure the frontend version is rolled back simultaneously if necessary (see `deployment-and-rollback.md`).

## Responsibilities
- **Execution & Recovery**: Only personnel with `Owner` or `Admin` privileges on the Supabase Cloud project can execute a database restore.
- **Verification**: Post-recovery, a QA check of `inventory_balances` and recent `sales` must be conducted to ensure integrity.
