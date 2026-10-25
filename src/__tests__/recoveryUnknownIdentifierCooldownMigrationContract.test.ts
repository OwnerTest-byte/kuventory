import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Regression guard for migration 20261025230000:
 *  - wrong-identifier recovery submissions are counted per identifier and the
 *    5th within a generation starts a 2-minute COOLDOWN (explicitly not a
 *    lockout: no account state is modified),
 *  - the counter is generation-based (append-only marker event, no deletes)
 *    so an expired cooldown restarts the allowance at five attempts,
 *  - the authoritative cooldown check also reports an active
 *    unknown-identifier cooldown with the same response shape,
 *  - the existing-account ticket path is unchanged.
 */

const MIGRATION_FILE = '20261025230000_recovery_unknown_identifier_attempt_cooldown.sql';

function readMigration(): string {
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations', MIGRATION_FILE);
  expect(fs.existsSync(migrationPath), `missing migration ${MIGRATION_FILE}`).toBe(true);
  return fs.readFileSync(migrationPath, 'utf8');
}

describe('Recovery unknown-identifier attempt cooldown migration contract', () => {
  const sql = readMigration();

  it('serializes the unknown path with its own advisory lock BEFORE counting', () => {
    const lockIdx = sql.indexOf("pg_advisory_xact_lock(hashtext('kuventory_recovery_unknown:' || v_norm_email)::bigint)");
    const countIdx = sql.indexOf('SELECT count(*) INTO v_unknown_count');
    const markerIdx = sql.indexOf("'ASSISTED_RECOVERY_UNKNOWN_COOLDOWN'");
    expect(lockIdx).toBeGreaterThan(-1);
    expect(countIdx).toBeGreaterThan(lockIdx);
    expect(markerIdx).toBeGreaterThan(lockIdx);
    // The known-account lock stays distinct and intact.
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtext\('kuventory_assisted_recovery:' \|\| v_norm_email\)::bigint\)/);
  });

  it('checks the active cooldown (marker within 2 minutes) before counting attempts', () => {
    const activeCheckIdx = sql.indexOf('(v_now - v_gen_start) < v_unknown_cooldown');
    const countIdx = sql.indexOf('SELECT count(*) INTO v_unknown_count');
    expect(activeCheckIdx).toBeGreaterThan(-1);
    expect(countIdx).toBeGreaterThan(activeCheckIdx);
    expect(sql).toContain("v_unknown_cooldown CONSTANT INTERVAL := interval '2 minutes'");
    expect(sql).toContain("v_unknown_window CONSTANT INTERVAL := interval '15 minutes'");
  });

  it('makes the 5th wrong attempt start the cooldown with the throttled payload', () => {
    const thresholdIdx = sql.indexOf('IF v_unknown_count >= 4 THEN');
    expect(thresholdIdx).toBeGreaterThan(-1);
    expect(sql).toContain("'unknown_identifier_cooldown', true");
    expect(sql).toContain("'seconds_remaining', EXTRACT(EPOCH FROM v_unknown_cooldown)::INT");
    expect(sql).toContain('Too many attempts with unknown identifiers. Please wait 2 minutes before trying again.');
  });

  it('returns a structured attempts countdown for wrong attempts 1-4 (not a throw-shaped error)', () => {
    expect(sql).toContain("'account_exists', false");
    expect(sql).toContain("'attempts_remaining', 4 - v_unknown_count");
    expect(sql).toContain('No KUVENTORY account matches this identifier.');
  });

  it('is generation-based and append-only: no DELETE on security_events', () => {
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.security_events/i);
    // Counting only considers events AFTER the latest marker, inside the window.
    expect(sql).toContain("created_at > GREATEST(COALESCE(v_gen_start, timestamptz '-infinity'), v_now - v_unknown_window)");
  });

  it('is a cooldown, not a lockout: no account_security_state writes and no lockout tokens', () => {
    expect(sql).not.toMatch(/INSERT INTO public\.account_security_state/i);
    expect(sql).not.toMatch(/UPDATE public\.account_security_state/i);
    expect(sql).not.toContain('lockout_token');
  });

  it('check_assisted_recovery_cooldown v2 reports the later of ticket and unknown-identifier cooldowns', () => {
    const checkIdx = sql.indexOf('CREATE OR REPLACE FUNCTION public.check_assisted_recovery_cooldown');
    expect(checkIdx).toBeGreaterThan(-1);
    const body = sql.slice(checkIdx);
    expect(body).toContain("'ASSISTED_RECOVERY_UNKNOWN_COOLDOWN'");
    expect(body).toContain('v_unknown_next > v_next_allowed');
    // Response shape is unchanged for callers.
    expect(body).toContain("'valid', true");
    expect(body).toContain("'can_submit', false");
    expect(body).toContain("'can_submit', true");
    expect(body).toContain("'seconds_remaining', v_seconds_rem");
    // The message names which limit applies.
    expect(body).toContain('Too many attempts with unknown identifiers. Please wait before trying again.');
    expect(body).toContain('A recovery request was recently submitted for this identifier.');
  });

  it('keeps the existing-account ticket path byte-compatible with v3 semantics', () => {
    expect(sql).toMatch(/v_credential_hash := encode\(digest\(v_credential, 'sha256'\), 'hex'\)/);
    expect(sql).toContain("'request_reference', v_ref");
    expect(sql).toContain("'status_credential', v_credential");
    expect(sql).toContain("'existing_request', true");
    expect(sql).toContain("'ASSISTED_RECOVERY_SUBMITTED'");
    expect(sql).toContain("'ASSISTED_RECOVERY_THROTTLED'");
  });

  it('adds the converged per-mask counting index and reloads the schema cache', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_security_events_type_masked_time\s+ON public\.security_events \(event_type, email_masked, created_at DESC\)/
    );
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
