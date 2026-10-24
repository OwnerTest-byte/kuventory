import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Regression guard for migration 20261025200000:
 *  - notifications/audit_logs target_id must become TEXT (route strings are
 *    the documented storage format for navigation targets),
 *  - the correction-requests policy must no longer reference MASTER_ADMIN,
 *  - the admin review queue tables must be realtime-published, RLS-filtered.
 */

const MIGRATION_FILE = '20261025200000_notification_route_storage_and_realtime_repair.sql';

function readMigration(): string {
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations', MIGRATION_FILE);
  expect(fs.existsSync(migrationPath), `missing migration ${MIGRATION_FILE}`).toBe(true);
  return fs.readFileSync(migrationPath, 'utf8');
}

describe('Notification route storage & realtime repair migration contract', () => {
  const sql = readMigration();

  it('converts both target_id columns from UUID to TEXT, guarded and idempotent', () => {
    for (const table of ['notifications', 'audit_logs']) {
      expect(sql).toMatch(
        new RegExp(`ALTER TABLE public\\.${table} ALTER COLUMN target_id TYPE TEXT USING target_id::text`)
      );
    }
    // Guarded by udt_name = 'uuid' so re-running on an already-converted DB is a no-op.
    expect(sql.match(/udt_name = 'uuid'/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('recreates the correction-requests SELECT policy with canonical roles only', () => {
    const start = sql.indexOf('CREATE POLICY "Requesters can read own correction requests"');
    expect(start).toBeGreaterThan(-1);
    const block = sql.slice(start, sql.indexOf(';', start));
    expect(block).toContain("requested_by = (SELECT auth.uid())");
    expect(block).toContain("p.role IN ('ADMIN', 'SUPER_ADMIN')");
    expect(block).not.toContain('MASTER_ADMIN');
  });

  it('publishes both admin review queue tables to supabase_realtime with membership guards', () => {
    for (const table of ['account_recovery_requests', 'daily_inventory_correction_requests']) {
      expect(sql).toMatch(
        new RegExp(`ALTER PUBLICATION supabase_realtime ADD TABLE public\\.${table}`)
      );
    }
    // Membership checks prevent duplicate-add failures on re-run.
    expect(sql.match(/pg_publication_tables/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('never weakens row visibility: publication only relays rows the SELECT policies already allow', () => {
    // The migration must not touch the RLS-enabled flags or add permissive
    // policies; realtime authorization stays with the existing admin-only
    // SELECT policies.
    expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/USING \(true\)/);
    expect(sql).not.toMatch(/TO anon/);
  });
});
