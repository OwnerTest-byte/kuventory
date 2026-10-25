import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Regression guard for migration 20261026000000:
 *  - 6th-attempt escalation: the FIRST failed attempt after a completed
 *    countdown (login lockout within 24h / recovery cooldown within 1h)
 *    routes the person to administrator verification instead of a second
 *    retry cycle,
 *  - the flag is server-authoritative on every check RPC and clears only
 *    through admin unlock, successful sign-in, or identity-verified
 *    RESOLVE_RESET,
 *  - the admin console lists verification-required accounts,
 *  - the underlying 5/15->30-min lockout and 5-wrong->2-min cooldown
 *    policies are unchanged, and a correct identifier is never blocked.
 */

const MIGRATION_FILE = '20261026000000_signin_escalation_to_admin_verification.sql';

function readMigration(): string {
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations', MIGRATION_FILE);
  expect(fs.existsSync(migrationPath), `missing migration ${MIGRATION_FILE}`).toBe(true);
  return fs.readFileSync(migrationPath, 'utf8');
}

describe('Sign-in escalation to administrator verification migration contract', () => {
  const sql = readMigration();

  it('adds the verification state columns to both state tables', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS verification_required BOOLEAN NOT NULL DEFAULT false');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS last_lockout_at TIMESTAMPTZ');
    expect(sql).toContain(
      'ALTER TABLE public.account_recovery_attempt_state\n  ADD COLUMN IF NOT EXISTS verification_required_until TIMESTAMPTZ'
    );
    // No RLS or policy changes.
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
  });

  it('login: the first failed attempt after a lockout within 24h escalates with no second lockout', () => {
    const ruleIdx = sql.indexOf("v_rec.last_lockout_at > v_now - interval '24 hours'");
    expect(ruleIdx).toBeGreaterThan(-1);
    // The escalation branch must precede the 15-minute window counting.
    const windowIdx = sql.indexOf('-- 15-minute rolling window');
    expect(windowIdx).toBeGreaterThan(ruleIdx);
    // Escalation return carries the flag + message and no lock.
    expect(sql).toContain("'escalation_required', true");
    expect(sql).toContain('Administrator verification required. Contact an administrator through the official support channels');
    // Lock issuance unchanged and records last_lockout_at for future 6th-attempt detection.
    expect(sql).toContain("v_locked_until := v_now + interval '30 minutes'");
    expect(sql).toContain('last_lockout_at = v_now');
  });

  it('login: already-escalated attempts short-circuit without counting or locking', () => {
    const alreadyIdx = sql.indexOf('IF v_rec.verification_required THEN');
    const windowIdx = sql.indexOf('-- 15-minute rolling window');
    expect(alreadyIdx).toBeGreaterThan(-1);
    expect(windowIdx).toBeGreaterThan(alreadyIdx);
  });

  it('escalation_required is carried by every lockout check response', () => {
    expect(sql.match(/'escalation_required',/g)?.length).toBeGreaterThanOrEqual(12);
    // Token poll distinguishes admin unlock (cleared) from expiry (may still be escalated).
    const tokenFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.check_lockout_status_by_token'));
    expect(tokenFn).toContain("'escalation_required', false");
    expect(tokenFn).toContain("'escalation_required', v_rec.verification_required");
  });

  it('recovery: the first unknown identifier after a cooldown within 1h escalates for 1 hour', () => {
    const submitFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.submit_assisted_recovery_request'));
    expect(submitFn).toContain("v_escalation_window CONSTANT INTERVAL := interval '1 hour'");
    expect(submitFn).toMatch(/v_stored_cooldown_until <= v_now\s*\n\s*AND v_stored_cooldown_until > v_now - v_escalation_window/);
    expect(submitFn).toContain('verification_required_until = v_now + v_escalation_window');
    expect(submitFn).toContain("'escalation_required', true");
    expect(submitFn).toContain('Contact an administrator to verify your identity and confirm your correct login identifier.');
    // Escalation is checked BEFORE the active cooldown and the attempt counting.
    const escIdx = submitFn.indexOf('IF v_stored_verification_until IS NOT NULL AND v_now < v_stored_verification_until');
    const countIdx = submitFn.indexOf('-- Prior attempts that still count');
    expect(escIdx).toBeGreaterThan(-1);
    expect(countIdx).toBeGreaterThan(escIdx);
    // Existing 5-wrong -> 2-minute cooldown policy unchanged.
    expect(submitFn).toContain("v_unknown_cooldown CONSTANT INTERVAL := interval '2 minutes'");
    expect(submitFn).toContain('IF v_prior >= 4 THEN');
    // A correct identifier is never blocked: the known-account ticket path is intact.
    expect(submitFn).toContain("'request_reference', v_ref");
    expect(submitFn).toContain("'status_credential', v_credential");
  });

  it('check_assisted_recovery_cooldown reports the escalation state', () => {
    const checkFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.check_assisted_recovery_cooldown'));
    expect(checkFn).toContain("'escalation_required', true");
    expect(checkFn).toContain("'escalation_required', false");
    expect(checkFn).toContain('Contact an administrator to verify your identity and confirm your correct login identifier.');
  });

  it('clears the flag through the three authorized paths only', () => {
    // Admin early unlock.
    const unlockFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.unlock_account'));
    expect(unlockFn).toContain('verification_required = false');
    expect(unlockFn).toContain('last_lockout_at = NULL');
    expect(unlockFn).toContain("'escalation_cleared', v_sec.verification_required");
    // Successful sign-in.
    const resetFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.reset_my_login_lockout'));
    expect(resetFn).toContain('verification_required = false');
    // Identity-verified recovery reset: both state tables.
    const reviewFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.review_assisted_recovery_request'));
    expect(reviewFn).toContain('verification_required = false');
    expect(reviewFn).toMatch(/account_recovery_attempt_state\s+SET verification_required_until = NULL/);
    // The record RPC never clears the flag (only sets it).
    const recordFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.record_failed_login_attempt'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.check_account_lockout')
    );
    expect(recordFn).not.toContain('verification_required = false');
  });

  it('preserves the authoritative review RPC protections (self-review + hierarchical RBAC)', () => {
    const reviewFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.review_assisted_recovery_request'));
    expect(reviewFn).toContain('you cannot review your own recovery request');
    expect(reviewFn).toContain('only a Super Administrator may recover a Super Administrator account');
    expect(reviewFn).toContain('Administrators may only review recovery requests for Staff accounts');
    expect(reviewFn).toContain('its decision is final');
    expect(reviewFn).toContain("'ASSISTED_RECOVERY_COMPLETED'");
    expect(reviewFn).toContain("'ASSISTED_RECOVERY_RESET_COMPLETED'");
  });

  it('admin console lists verification-required accounts with the badge fields', () => {
    const listFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.get_locked_accounts'));
    expect(listFn).toContain('ass.verification_required');
    expect(listFn).toContain('ass.last_lockout_at');
    expect(listFn).toMatch(/\(ass\.locked_until IS NOT NULL AND ass\.locked_until > now\(\)\)\s*\n\s*OR ass\.verification_required = true/);
    expect(listFn).toContain('ass.verification_required DESC');
  });

  it('emits the masked escalation audit event on both paths and reloads the schema cache', () => {
    expect(sql.match(/'ACCOUNT_ESCALATION_REQUIRED'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("jsonb_build_object('path', 'login'");
    expect(sql).toContain("jsonb_build_object('path', 'recovery'");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
