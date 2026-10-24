import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Regression guard for migration 20261025220000:
 *  - the assisted-recovery existence gate runs BEFORE any ticket creation and
 *    creates no side effects for unknown accounts beyond one audit event,
 *  - the public contacts RPC returns only administrators with at least one
 *    real public contact method.
 */

const MIGRATION_FILE = '20261025220000_recovery_account_existence_gate.sql';

function readMigration(): string {
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations', MIGRATION_FILE);
  expect(fs.existsSync(migrationPath), `missing migration ${MIGRATION_FILE}`).toBe(true);
  return fs.readFileSync(migrationPath, 'utf8');
}

describe('Recovery account-existence gate migration contract', () => {
  const sql = readMigration();

  it('resolves the account before any ticket, throttle, or notification work', () => {
    const gateIdx = sql.indexOf('EXISTENCE GATE');
    const lockIdx = sql.indexOf('pg_advisory_xact_lock');
    const insertIdx = sql.indexOf('INSERT INTO public.account_recovery_requests');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeGreaterThan(gateIdx);
    expect(insertIdx).toBeGreaterThan(lockIdx);
  });

  it('rejects unknown accounts with an explicit message and no ticket/notification', () => {
    const gateReturnIdx = sql.indexOf("'No KUVENTORY account matches this identifier.");
    const ticketInsertIdx = sql.indexOf('INSERT INTO public.account_recovery_requests');
    // The unknown-account RETURN must appear before any ticket INSERT in the
    // function body (early return => the INSERT is unreachable for them).
    expect(gateReturnIdx).toBeGreaterThan(-1);
    expect(gateReturnIdx).toBeLessThan(ticketInsertIdx);
    // Unknown-account outcome flags
    expect(sql).toContain("'accepted', false");
    expect(sql).toContain("'account_exists', false");
    // Exactly one audit event for the unknown path; no notification insert there.
    expect(sql).toContain("'ASSISTED_RECOVERY_UNKNOWN_ACCOUNT'");
  });

  it('keeps the known-account security properties intact', () => {
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtext\('kuventory_assisted_recovery:' \|\| v_norm_email\)::bigint\)/);
    expect(sql).toMatch(/v_credential_hash := encode\(digest\(v_credential, 'sha256'\), 'hex'\)/);
    expect(sql).toMatch(/v_cooldown CONSTANT INTERVAL := interval '2 minutes'/);
    expect(sql).toContain("'request_reference', v_ref");
    expect(sql).toContain("'status_credential', v_credential");
  });

  it('contacts RPC requires at least one real public contact method', () => {
    expect(sql).toMatch(
      /NULLIF\(trim\(COALESCE\(p\.support_phone, ''\)\), ''\) IS NOT NULL/
    );
    expect(sql).toMatch(
      /NULLIF\(trim\(COALESCE\(p\.support_email, ''\)\), ''\) IS NOT NULL/
    );
    expect(sql).toMatch(/EXISTS \(\s*SELECT 1 FROM public\.profile_contact_links pcl\s*WHERE pcl\.profile_id = p\.id AND pcl\.is_public = true/);
    // Still gated on the admin's opt-in flag and canonical roles only.
    expect(sql).toContain('p.show_on_lockout_screen = true');
    expect(sql).toContain("p.role IN ('ADMIN', 'SUPER_ADMIN')");
    expect(sql).not.toContain('MASTER_ADMIN');
  });
});
