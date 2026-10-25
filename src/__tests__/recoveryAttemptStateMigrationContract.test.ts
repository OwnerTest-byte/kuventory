import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Regression guard for migration 20261025240000:
 *  - the wrong-identifier counter is keyed per EXACT identifier (sha256 hash
 *    state table), fixing the live-probe-verified mask-collision defect where
 *    distinct identifiers (e.g. manager@ / monitor@ -> 'm***r@…') shared a
 *    counter and could throttle each other instantly,
 *  - 5 unknown submissions per identifier / 15-minute window -> 2-minute
 *    COOLDOWN (not a lockout); allowance resets on cooldown expiry or window
 *    lapse,
 *  - the state table is invisible to all client roles,
 *  - the authoritative cooldown check reads the same state,
 *  - the existing-account ticket path is unchanged.
 */

const MIGRATION_FILE = '20261025240000_recovery_attempt_state_exact_identifier.sql';

function readMigration(): string {
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations', MIGRATION_FILE);
  expect(fs.existsSync(migrationPath), `missing migration ${MIGRATION_FILE}`).toBe(true);
  return fs.readFileSync(migrationPath, 'utf8');
}

describe('Recovery attempt-state (exact identifier) migration contract', () => {
  const sql = readMigration();

  it('creates the hash-keyed attempt state table invisible to clients', () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS public\.account_recovery_attempt_state \(\s*identifier_hash TEXT PRIMARY KEY,/
    );
    expect(sql).toContain('unknown_attempts INT NOT NULL DEFAULT 0');
    expect(sql).toContain('cooldown_until TIMESTAMPTZ');
    expect(sql).toContain('last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now()');
    // RLS enabled with NO policies = deny all; explicit grants revoked.
    expect(sql).toMatch(/ALTER TABLE public\.account_recovery_attempt_state ENABLE ROW LEVEL SECURITY;/);
    expect(sql).not.toMatch(/CREATE POLICY [^;]*ON public\.account_recovery_attempt_state/);
    expect(sql).toContain('REVOKE ALL ON public.account_recovery_attempt_state FROM anon, authenticated');
  });

  it('keys counting by the sha256 of the exact identifier — never by masked email', () => {
    expect(sql).toContain("v_id_hash := encode(digest(v_norm_email, 'sha256'), 'hex')");
    // Counting no longer aggregates security_events by email_masked.
    expect(sql).not.toContain('SELECT count(*) INTO v_unknown_count');
    expect(sql).not.toMatch(/email_masked = v_masked\s*\n\s*AND created_at > GREATEST/);
    // The superseded mask-counting index is dropped.
    expect(sql).toContain('DROP INDEX IF EXISTS public.idx_security_events_type_masked_time');
  });

  it('serializes the unknown path with its own advisory lock BEFORE reading state', () => {
    const lockIdx = sql.indexOf("pg_advisory_xact_lock(hashtext('kuventory_recovery_unknown:' || v_norm_email)::bigint)");
    const stateReadIdx = sql.indexOf('SELECT s.unknown_attempts, s.cooldown_until, s.last_attempt_at');
    expect(lockIdx).toBeGreaterThan(-1);
    expect(stateReadIdx).toBeGreaterThan(lockIdx);
    // The known-account lock stays distinct and intact.
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtext\('kuventory_assisted_recovery:' \|\| v_norm_email\)::bigint\)/);
  });

  it('checks the active cooldown BEFORE counting, then applies the 15-minute window reset', () => {
    const activeCheckIdx = sql.indexOf('IF v_stored_cooldown_until IS NOT NULL AND v_now < v_stored_cooldown_until THEN');
    const priorIdx = sql.indexOf('v_prior := v_stored_attempts;');
    expect(activeCheckIdx).toBeGreaterThan(-1);
    expect(priorIdx).toBeGreaterThan(activeCheckIdx);
    expect(sql).toContain("v_unknown_cooldown CONSTANT INTERVAL := interval '2 minutes'");
    expect(sql).toContain("v_unknown_window CONSTANT INTERVAL := interval '15 minutes'");
    // Prior attempts count only when the stored cooldown expired AND the last
    // attempt is inside the window — expiry or lapse starts a fresh allowance.
    expect(sql).toContain('AND (v_stored_cooldown_until IS NULL OR v_now >= v_stored_cooldown_until)');
    expect(sql).toContain('AND v_stored_last_attempt > v_now - v_unknown_window');
  });

  it('makes the 5th wrong attempt start the 2-minute cooldown with the throttled payload', () => {
    expect(sql).toContain('IF v_prior >= 4 THEN');
    expect(sql).toContain("'unknown_identifier_cooldown', true");
    expect(sql).toContain("'seconds_remaining', EXTRACT(EPOCH FROM v_unknown_cooldown)::INT");
    expect(sql).toContain('Too many attempts with unknown identifiers. Please wait 2 minutes before trying again.');
  });

  it('persists the attempt counter atomically via upsert under the advisory lock', () => {
    expect(sql.match(/INSERT INTO public\.account_recovery_attempt_state/g)?.length).toBe(2);
    expect(sql).toContain('ON CONFLICT (identifier_hash) DO UPDATE');
    // Cooldown branch stores the authoritative expiry; counting branch clears it.
    expect(sql).toContain('v_now + v_unknown_cooldown, v_now, v_now');
    expect(sql).toContain('v_id_hash, v_prior + 1,');
    expect(sql).toContain('cooldown_until = NULL');
  });

  it('returns a structured attempts countdown for wrong attempts 1-4', () => {
    expect(sql).toContain("'account_exists', false");
    expect(sql).toContain("'attempts_remaining', 4 - v_prior");
    expect(sql).toContain('No KUVENTORY account matches this identifier.');
  });

  it('is a cooldown, not a lockout: no account_security_state writes and no lockout tokens', () => {
    expect(sql).not.toMatch(/INSERT INTO public\.account_security_state/i);
    expect(sql).not.toMatch(/UPDATE public\.account_security_state/i);
    expect(sql).not.toContain('lockout_token');
  });

  it('keeps append-only masked audit events for every unknown-path outcome', () => {
    expect(sql).toContain("'ASSISTED_RECOVERY_UNKNOWN_ACCOUNT'");
    expect(sql).toContain("'ASSISTED_RECOVERY_UNKNOWN_THROTTLED'");
    expect(sql).toContain("'ASSISTED_RECOVERY_UNKNOWN_COOLDOWN'");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.security_events/i);
  });

  it('check_assisted_recovery_cooldown reads the exact-identifier state and keeps the response shape', () => {
    const checkIdx = sql.indexOf('CREATE OR REPLACE FUNCTION public.check_assisted_recovery_cooldown');
    expect(checkIdx).toBeGreaterThan(-1);
    const body = sql.slice(checkIdx);
    expect(body).toContain('identifier_hash = encode(digest(v_norm_email, \'sha256\'), \'hex\')');
    expect(body).not.toContain('ASSISTED_RECOVERY_UNKNOWN_COOLDOWN');
    expect(body).toContain("'valid', true");
    expect(body).toContain("'can_submit', false");
    expect(body).toContain("'can_submit', true");
    expect(body).toContain('Too many attempts with unknown identifiers. Please wait before trying again.');
    expect(body).toContain('A recovery request was recently submitted for this identifier.');
  });

  it('keeps the existing-account ticket path unchanged', () => {
    expect(sql).toMatch(/v_credential_hash := encode\(digest\(v_credential, 'sha256'\), 'hex'\)/);
    expect(sql).toContain("'request_reference', v_ref");
    expect(sql).toContain("'status_credential', v_credential");
    expect(sql).toContain("'existing_request', true");
    expect(sql).toContain("'ASSISTED_RECOVERY_SUBMITTED'");
    expect(sql).toContain("'ASSISTED_RECOVERY_THROTTLED'");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
