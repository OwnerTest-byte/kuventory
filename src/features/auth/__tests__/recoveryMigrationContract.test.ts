import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Regression guard for the authoritative recovery/lockout database contract.
 * These assertions keep the forward-only migration honest: the cooldown is
 * enforced atomically server-side, lockout RPC responses are self-describing
 * (server_now + explicit status), and a recovery ticket can only be marked
 * COMPLETED by the same transaction that performs the authorized reset.
 */

const MIGRATION_FILE = '20261025120000_assisted_recovery_and_lockout_authoritative_repair.sql';

function readMigration(): string {
  const migrationPath = path.resolve(__dirname, '../../../../supabase/migrations', MIGRATION_FILE);
  expect(fs.existsSync(migrationPath), `missing migration ${MIGRATION_FILE}`).toBe(true);
  return fs.readFileSync(migrationPath, 'utf8');
}

describe('Assisted recovery & lockout authoritative migration contract', () => {
  const sql = readMigration();

  it('enforces the assisted-recovery cooldown atomically via a transaction advisory lock', () => {
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtext\('kuventory_assisted_recovery:' \|\| v_norm_email\)::bigint\)/);
    // The 2-minute policy matches the existing request_password_reset throttle.
    expect(sql).toMatch(/v_cooldown CONSTANT INTERVAL := interval '2 minutes'/);
  });

  it('returns authoritative timing fields from the submission and cooldown RPCs', () => {
    expect(sql).toMatch(/'server_now', v_now/);
    expect(sql).toMatch(/'next_allowed_at'/);
    expect(sql).toMatch(/'seconds_remaining'/);
    // A side-effect-free cooldown lookup exists for reopened dialogs.
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.check_assisted_recovery_cooldown/);
  });

  it('never stores or logs the plaintext status credential', () => {
    expect(sql).toMatch(/v_credential_hash := encode\(digest\(v_credential, 'sha256'\), 'hex'\)/);
    // The ticket INSERT writes only the hash column — never the plaintext.
    const insertStart = sql.indexOf('INSERT INTO public.account_recovery_requests');
    const insertEnd = sql.indexOf('RETURNING id INTO v_req_id', insertStart);
    const insertBlock = sql.slice(insertStart, insertEnd);
    expect(insertBlock).toContain('status_credential_hash');
    expect(insertBlock).not.toContain("status_credential'");
    // Plaintext credential appears solely in the RPC return payload.
    expect(sql).toContain("'status_credential', v_credential");
  });

  it('preserves the 5-attempts / 15-minute window / 30-minute lockout policy', () => {
    expect(sql).toMatch(/v_failed_count >= 5/);
    expect(sql).toMatch(/interval '15 minutes'/);
    expect(sql).toMatch(/v_now \+ interval '30 minutes'/);
    expect(sql).toMatch(/v_seconds_rem := 1800/);
  });

  it('lockout status RPCs return an explicit status contract including server_now', () => {
    for (const fn of [
      'record_failed_login_attempt',
      'check_account_lockout',
      'check_lockout_status_by_token',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`));
    }
    expect(sql).toMatch(/'status', 'LOCKED'/);
    expect(sql).toMatch(/'status', 'ADMIN_UNLOCKED'/);
    expect(sql).toMatch(/'status', 'EXPIRED'/);
  });

  it('marks a ticket COMPLETED only inside the transaction that resets the password', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.review_assisted_recovery_request\(/);
    expect(sql).toMatch(/'RESOLVE_RESET'/);
    // The password update happens BEFORE the COMPLETED update in one function;
    // any exception rolls back the ticket status too.
    const pwUpdateIdx = sql.indexOf("UPDATE auth.users\n  SET encrypted_password");
    const completedIdx = sql.indexOf("SET status = 'COMPLETED'");
    expect(pwUpdateIdx).toBeGreaterThan(-1);
    expect(completedIdx).toBeGreaterThan(pwUpdateIdx);
    expect(sql).toMatch(/RAISE EXCEPTION 'Target account could not be updated; reset aborted\.'/);
    expect(sql).toMatch(/No account currently exists for identifier of request/);
  });

  it('blocks self-review and enforces the admin role hierarchy', () => {
    expect(sql).toMatch(/you cannot review your own recovery request/);
    expect(sql).toMatch(/only a Super Administrator may recover a Super Administrator account/);
    expect(sql).toMatch(/Administrators may only review recovery requests for Staff accounts/);
    expect(sql).toMatch(/v_caller_role NOT IN \('ADMIN', 'SUPER_ADMIN'\)/);
  });

  it('revokes every existing session and clears the lockout on a verified reset', () => {
    expect(sql).toMatch(/DELETE FROM auth\.sessions WHERE user_id = v_target_user_id/);
    expect(sql).toMatch(/lockout_status = 'UNLOCKED'/);
  });

  it('retires the stale MASTER_ADMIN reference and exposes the recovery notification to admins', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Admins view recovery requests" ON public\.account_recovery_requests/);
    // The recreated policy admits only current canonical roles.
    const policyStart = sql.indexOf('CREATE POLICY "Admins view recovery requests"');
    const policyBlock = sql.slice(policyStart, sql.indexOf(';', policyStart));
    expect(policyBlock).toContain("p.role IN ('ADMIN', 'SUPER_ADMIN')");
    expect(policyBlock).not.toContain('MASTER_ADMIN');
    expect(sql).toMatch(/'ASSISTED_RECOVERY_REQUEST',/);
  });
});
