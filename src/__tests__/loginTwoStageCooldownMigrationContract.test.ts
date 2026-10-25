import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Regression guard for migration 20261026130000 (owner decision — two-stage
 * design mirroring the assisted-recovery flow):
 *   STAGE 1: 5th failure -> 30-minute TIMED cooldown (self-releasing).
 *   STAGE 2: 6th attempt (first failure after a cooldown within 24h) ->
 *            administrator lockout, no timer, admin-unlock-only.
 * 20261026120000's "no expiry" policy is superseded for stage 1 only; stage 2
 * keeps every no-timer guarantee.
 */

const MIGRATION_FILE = '20261026130000_login_two_stage_cooldown_admin_lockout.sql';

function readMigration(): string {
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations', MIGRATION_FILE);
  expect(fs.existsSync(migrationPath), `missing migration ${MIGRATION_FILE}`).toBe(true);
  return fs.readFileSync(migrationPath, 'utf8');
}

describe('Two-stage login cooldown/admin-lockout migration contract', () => {
  const sql = readMigration();

  it('stage 1: the 5th failure writes a 30-minute timed cooldown with a token', () => {
    const recordFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.record_failed_login_attempt'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.check_account_lockout')
    );
    expect(recordFn).toContain("v_locked_until := v_now + interval '30 minutes'");
    expect(recordFn).toContain('v_seconds_rem := 1800');
    expect(recordFn).toContain("'stage', 'cooldown'");
    expect(recordFn).toContain('last_lockout_at = v_now');
    expect(recordFn).toContain('lockout_token_hash = v_token_hash');
  });

  it('stage 1: an active cooldown returns the authoritative remaining time', () => {
    const recordFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.record_failed_login_attempt'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.check_account_lockout')
    );
    const activeIdx = recordFn.indexOf("v_rec.locked_until > v_now");
    expect(activeIdx).toBeGreaterThan(-1);
    expect(recordFn).toContain("'seconds_remaining', GREATEST(0, EXTRACT(EPOCH FROM (v_rec.locked_until - v_now))::INT)");
    // Cooldown message offers both waiting and contacting.
    expect(recordFn).toContain('Please wait for the cooldown to end, or contact an administrator');
  });

  it('stage-2 trigger: the lapsed lock falls through to the 6th-attempt rule (no fresh cycle)', () => {
    const recordFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.record_failed_login_attempt'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.check_account_lockout')
    );
    // Order: active-cooldown return -> verification short-circuit -> 6th rule -> window counting.
    const activeIdx = recordFn.indexOf("v_rec.locked_until > v_now");
    const verifyIdx = recordFn.indexOf('IF v_rec.verification_required THEN');
    const sixthIdx = recordFn.indexOf("v_rec.last_lockout_at > v_now - interval '24 hours'");
    const windowIdx = recordFn.indexOf('-- 15-minute rolling window');
    expect(verifyIdx).toBeGreaterThan(activeIdx);
    expect(sixthIdx).toBeGreaterThan(verifyIdx);
    expect(windowIdx).toBeGreaterThan(sixthIdx);
    expect(recordFn).toContain("'ACCOUNT_ESCALATION_REQUIRED'");
    expect(recordFn).toContain('verification_required = true');
  });

  it('check_account_lockout: cooldown = LOCKED with timer; verification = no timer; lapsed = UNLOCKED', () => {
    const checkFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.check_account_lockout'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.check_lockout_status_by_token')
    );
    expect(checkFn).toContain('IF v_rec.verification_required THEN');
    expect(checkFn).toContain("'escalation_required', true");
    expect(checkFn).toContain("'seconds_remaining', GREATEST(0, EXTRACT(EPOCH FROM (v_rec.locked_until - v_now))::INT)");
    expect(checkFn).toContain("v_rec.locked_until IS NULL OR v_rec.locked_until <= v_now");
  });

  it('token poll: active timer LOCKED; lapsed timer EXPIRED (self-release); unlock NOT_FOUND', () => {
    const tokenFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.check_lockout_status_by_token'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.get_locked_accounts')
    );
    expect(tokenFn).toContain("v_rec.lockout_status = 'UNLOCKED'");
    expect(tokenFn).toContain("v_rec.lockout_status = 'EXPIRED'");
    // Active timer branch returns the countdown.
    expect(tokenFn).toContain("'seconds_remaining', GREATEST(0, EXTRACT(EPOCH FROM (v_rec.locked_until - v_now))::INT)");
    // Lapsed ACTIVE + not verified -> EXPIRED (self-release).
    const lapsedIdx = tokenFn.indexOf('-- ACTIVE with a lapsed/absent timer and not verified');
    expect(lapsedIdx).toBeGreaterThan(-1);
    expect(tokenFn.slice(lapsedIdx)).toContain("'status', 'EXPIRED'");
  });

  it('unlock_account is NOT modified by this migration (anchor semantics preserved)', () => {
    // The migration file must not contain an unlock_account redefinition.
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.unlock_account');
  });

  it('admin console: cooldown rows expose remaining time; verification rows flag', () => {
    const listFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.get_locked_accounts'));
    expect(listFn).toMatch(/WHEN ass\.locked_until IS NOT NULL AND ass\.locked_until > now\(\)\s*\n\s*THEN GREATEST\(0, EXTRACT\(EPOCH FROM \(ass\.locked_until - now\(\)\)\)::INT\)/);
    expect(listFn).toContain('ass.verification_required');
    expect(listFn).toContain("ass.lockout_status = 'ACTIVE' OR ass.verification_required = true");
  });

  it('no RLS or policy changes; schema cache reloaded', () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
