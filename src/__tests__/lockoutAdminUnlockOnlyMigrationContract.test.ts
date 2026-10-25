import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Regression guard for migration 20261026120000 (owner decision):
 *  - the 30-minute countdown is REMOVED: a lock has no time-based release —
 *    it ends only through an administrator's verified unlock, a successful
 *    sign-in, or an identity-verified recovery reset,
 *  - the 6th-attempt rule SURVIVES an admin lift: unlock_account keeps
 *    last_lockout_at, so the first failure after a lift (within 24h) returns
 *    to administrator verification instead of a fresh countdown cycle,
 *  - ACTIVE is determined by lockout_status, never by locked_until,
 *  - the admin console lists ACTIVE locks without any countdown.
 */

const MIGRATION_FILE = '20261026120000_lockout_admin_unlock_only.sql';

function readMigration(): string {
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations', MIGRATION_FILE);
  expect(fs.existsSync(migrationPath), `missing migration ${MIGRATION_FILE}`).toBe(true);
  return fs.readFileSync(migrationPath, 'utf8');
}

describe('Lockout admin-unlock-only migration contract', () => {
  const sql = readMigration();

  it('record: new locks write NO expiry (locked_until = NULL) and keep the 5-failure threshold', () => {
    const recordFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.record_failed_login_attempt'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.check_account_lockout')
    );
    expect(recordFn).toContain("IF v_failed_count >= 5 THEN");
    expect(recordFn).toContain('locked_until = NULL');
    expect(recordFn).toContain("lockout_status = 'ACTIVE'");
    expect(recordFn).toContain('last_lockout_at = v_now');
    // No 30-minute interval anywhere in the record path.
    expect(recordFn).not.toContain("interval '30 minutes'");
    // 15-minute failure window unchanged.
    expect(recordFn).toContain("interval '15 minutes'");
  });

  it('record: ACTIVE and verification states short-circuit before counting', () => {
    const recordFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.record_failed_login_attempt'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.check_account_lockout')
    );
    const activeIdx = recordFn.indexOf("IF v_rec.lockout_status = 'ACTIVE' THEN");
    const verifyIdx = recordFn.indexOf('IF v_rec.verification_required THEN');
    const windowIdx = recordFn.indexOf('-- 15-minute rolling window');
    expect(activeIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeGreaterThan(activeIdx);
    expect(windowIdx).toBeGreaterThan(verifyIdx);
  });

  it('record: the 6th-attempt rule still fires after a lockout within 24h — including a lifted one', () => {
    const recordFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.record_failed_login_attempt'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.check_account_lockout')
    );
    expect(recordFn).toContain("v_rec.last_lockout_at > v_now - interval '24 hours'");
    expect(recordFn).toContain("'ACCOUNT_ESCALATION_REQUIRED'");
    expect(recordFn).toContain("jsonb_build_object('path', 'login'");
  });

  it('check_account_lockout: ACTIVE is status-based and carries no expiry', () => {
    const checkFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.check_account_lockout'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.check_lockout_status_by_token')
    );
    expect(checkFn).toContain("v_rec.lockout_status != 'ACTIVE'");
    expect(checkFn).not.toContain('locked_until > v_now');
    expect(checkFn).toContain('locked_until\', NULL');
  });

  it('token poll: LOCKED carries locked_until NULL; EXPIRED only from the server-set status', () => {
    const tokenFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.check_lockout_status_by_token'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.unlock_account')
    );
    expect(tokenFn).toContain("v_rec.lockout_status = 'UNLOCKED'");
    expect(tokenFn).toContain("v_rec.lockout_status = 'EXPIRED'");
    expect(tokenFn).not.toContain('locked_until <= v_now');
  });

  it('unlock_account: clears lock + verification but KEEPS last_lockout_at as the escalation anchor', () => {
    const unlockFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.unlock_account'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.get_locked_accounts')
    );
    expect(unlockFn).toContain('verification_required = false');
    expect(unlockFn).toContain('lockout_status = \'UNLOCKED\'');
    // last_lockout_at must NOT be reset on unlock.
    expect(unlockFn).not.toContain('last_lockout_at = NULL');
    expect(unlockFn).toContain("'escalation_anchor_kept_until'");
  });

  it('get_locked_accounts: lists ACTIVE + verification-required rows with no countdown semantics', () => {
    const listFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.get_locked_accounts'));
    expect(listFn).toContain("ass.lockout_status = 'ACTIVE' OR ass.verification_required = true");
    expect(listFn).not.toContain('locked_until > now()');
    expect(listFn).toContain('0 as seconds_remaining');
  });

  it('no RLS or policy changes', () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
