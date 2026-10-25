import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkAccountLockout,
  recordFailedLoginAttempt,
  recordLoginAttempt,
  checkLockoutStatusByToken,
  mapLockoutRpc,
  unlockAccount,
  fetchLockedAccounts
} from '../services/loginLockoutService';
import {
  submitAssistedRecoveryTicket,
  checkAssistedRecoveryCooldown,
  checkAssistedRecoveryTicketStatus,
  reviewAssistedRecoveryRequest
} from '../services/passwordResetService';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    auth: {
      resetPasswordForEmail: vi.fn(),
      signInWithPassword: vi.fn(),
    },
  },
}));

const rpcMock = vi.fn();

describe('Login Lockout & Account Recovery Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockReset();
    vi.mocked(supabase.rpc).mockImplementation(rpcMock);
  });

  // -------------------------------------------------------------------------
  // Typed lockout contract: errors are NEVER interpreted as unlocked
  // -------------------------------------------------------------------------

  describe('Lockout status contract (LOCKED / UNLOCKED / EXPIRED / ADMIN_UNLOCKED / STATUS_UNKNOWN)', () => {
    it('maps an explicit LOCKED response with authoritative timestamps', async () => {
      const lockedUntil = new Date(Date.now() + 1800_000).toISOString();
      const serverNow = new Date().toISOString();
      rpcMock.mockResolvedValueOnce({
        data: {
          status: 'LOCKED',
          is_locked: true,
          locked_until: lockedUntil,
          seconds_remaining: 1800,
          failed_attempts: 5,
          lockout_token: 'opaque-token',
          server_now: serverNow,
        },
        error: null,
      });

      const res = await checkAccountLockout('staff@kuventory.com');
      expect(res.outcome).toBe('LOCKED');
      expect(res.lockedUntil).toBe(lockedUntil);
      expect(res.serverNow).toBe(serverNow);
      expect(res.lockoutToken).toBe('opaque-token');
      expect(res.secondsRemaining).toBe(1800);
    });

    it('returns STATUS_UNKNOWN (never "unlocked") when the RPC fails', async () => {
      rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });

      const res = await checkAccountLockout('staff@kuventory.com');
      expect(res.outcome).toBe('STATUS_UNKNOWN');
    });

    it('returns STATUS_UNKNOWN when the network call throws', async () => {
      rpcMock.mockRejectedValueOnce(new Error('fetch failed'));

      const res = await checkAccountLockout('staff@kuventory.com');
      expect(res.outcome).toBe('STATUS_UNKNOWN');
    });

    it('fails closed on legacy payloads that cannot prove their outcome', () => {
      // Old shape: is_locked false but nothing proves verification succeeded.
      expect(mapLockoutRpc({ is_locked: false }).outcome).toBe('STATUS_UNKNOWN');
      expect(mapLockoutRpc(null).outcome).toBe('STATUS_UNKNOWN');
      expect(mapLockoutRpc({ status: 'WEIRD' }).outcome).toBe('STATUS_UNKNOWN');
    });

    it('still understands legacy LOCKED payloads during rollout', () => {
      const res = mapLockoutRpc({ is_locked: true, locked_until: 'x', seconds_remaining: 900 });
      expect(res.outcome).toBe('LOCKED');
    });
  });

  describe('Five failed attempts -> 30-minute lockout policy', () => {
    it('returns the server-backed 30-minute lockout on the 5th failed attempt', async () => {
      const futureExpiry = new Date(Date.now() + 1800 * 1000).toISOString();
      const serverNow = new Date().toISOString();

      rpcMock.mockResolvedValueOnce({
        data: {
          status: 'LOCKED',
          is_locked: true,
          failed_attempts: 5,
          seconds_remaining: 1800,
          locked_until: futureExpiry,
          lockout_token: 'a1b2c3d4e5f67890',
          server_now: serverNow,
        },
        error: null,
      });

      const result = await recordFailedLoginAttempt(
        'attacker@kuventory.com',
        '192.168.1.100',
        'Mozilla/5.0 TestBrowser'
      );

      expect(result.outcome).toBe('LOCKED');
      expect(result.failedAttempts).toBe(5);
      expect(result.secondsRemaining).toBe(1800);
      expect(result.lockoutToken).toBe('a1b2c3d4e5f67890');
      expect(result.lockedUntil).toBe(futureExpiry);
      expect(result.serverNow).toBe(serverNow);
      expect(rpcMock).toHaveBeenCalledWith('record_failed_login_attempt', {
        p_email: 'attacker@kuventory.com',
        p_ip: '192.168.1.100',
        p_user_agent: 'Mozilla/5.0 TestBrowser',
      });
    });

    it('surfaces a recording failure as STATUS_UNKNOWN without a fabricated fallback call', async () => {
      rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'rpc crashed' } });

      const res = await recordFailedLoginAttempt('staff@kuventory.com');
      expect(res.outcome).toBe('STATUS_UNKNOWN');
      // Exactly one RPC: no legacy record_login_attempt fallback attempt.
      expect(rpcMock).toHaveBeenCalledTimes(1);
    });

    it('does not treat fewer than 5 attempts as a lockout', async () => {
      rpcMock.mockResolvedValueOnce({
        data: { status: 'UNLOCKED', is_locked: false, failed_attempts: 2, server_now: new Date().toISOString() },
        error: null,
      });

      const status = await checkAccountLockout('staff@kuventory.com');
      expect(status.outcome).toBe('UNLOCKED');
      expect(status.failedAttempts).toBe(2);
      expect(rpcMock).toHaveBeenCalledWith('check_account_lockout', {
        p_email: 'staff@kuventory.com',
        p_ip: null,
      });
    });

    it('resets the caller own counters only through the authenticated RPC on success', async () => {
      rpcMock.mockResolvedValueOnce({ data: { success: true }, error: null });

      const res = await recordLoginAttempt('staff@kuventory.com', true);
      expect(res.outcome).toBe('UNLOCKED');
      expect(rpcMock.mock.calls.some(c => c[0] === 'reset_my_login_lockout')).toBe(true);
    });
  });

  describe('Opaque-token lockout polling', () => {
    it('reports LOCKED while the server still holds the lock', async () => {
      rpcMock.mockResolvedValueOnce({
        data: {
          status: 'LOCKED',
          is_locked: true,
          seconds_remaining: 1720,
          locked_until: new Date(Date.now() + 1720 * 1000).toISOString(),
          server_now: new Date().toISOString(),
        },
        error: null,
      });

      const status = await checkLockoutStatusByToken('test-opaque-token');
      expect(status.outcome).toBe('LOCKED');
      expect(status.secondsRemaining).toBe(1720);
      expect(rpcMock).toHaveBeenCalledWith('check_lockout_status_by_token', { p_token: 'test-opaque-token' });
    });

    it('distinguishes an early administrative unlock from ordinary expiry', async () => {
      rpcMock.mockResolvedValueOnce({
        data: { status: 'ADMIN_UNLOCKED', is_locked: false, was_unlocked: true, token_valid: true, server_now: new Date().toISOString() },
        error: null,
      });
      const unlocked = await checkLockoutStatusByToken('test-opaque-token');
      expect(unlocked.outcome).toBe('ADMIN_UNLOCKED');

      rpcMock.mockResolvedValueOnce({
        data: { status: 'EXPIRED', is_locked: false, was_unlocked: false, token_valid: true, server_now: new Date().toISOString() },
        error: null,
      });
      const expired = await checkLockoutStatusByToken('test-opaque-token');
      expect(expired.outcome).toBe('EXPIRED');
    });

    it('treats a cleared token (NOT_FOUND) as an ended lockout, not a transport failure', async () => {
      rpcMock.mockResolvedValueOnce({
        data: { status: 'NOT_FOUND', is_locked: false, was_unlocked: true, token_valid: false, server_now: new Date().toISOString() },
        error: null,
      });
      const res = await checkLockoutStatusByToken('test-opaque-token');
      expect(res.outcome).toBe('NOT_FOUND');
    });

    it('keeps the locked state honest when the status RPC fails (STATUS_UNKNOWN)', async () => {
      rpcMock.mockRejectedValueOnce(new Error('network down'));
      const res = await checkLockoutStatusByToken('test-opaque-token');
      expect(res.outcome).toBe('STATUS_UNKNOWN');
    });

    it('refuses to poll with an empty token', async () => {
      const res = await checkLockoutStatusByToken('   ');
      expect(res.outcome).toBe('STATUS_UNKNOWN');
      expect(rpcMock).not.toHaveBeenCalled();
    });
  });

  describe('Admin Unlock Permission Matrix & Audit Trail', () => {
    it('passes the mandatory reason and security id to unlock_account', async () => {
      rpcMock.mockResolvedValueOnce({
        data: { success: true, message: 'Account unlocked successfully.' },
        error: null,
      });

      const res = await unlockAccount('staff-security-id-123', 'Staff verified identity via branch manager phone');
      expect(res.success).toBe(true);
      expect(rpcMock).toHaveBeenCalledWith('unlock_account', {
        p_account_security_id: 'staff-security-id-123',
        p_reason: 'Staff verified identity via branch manager phone',
      });
    });

    it('fails closed when an unauthorized user or missing reason is supplied', async () => {
      rpcMock.mockResolvedValueOnce({
        data: null,
        error: { message: 'Forbidden: only administrators can unlock locked accounts.' },
      });

      await expect(unlockAccount('admin-security-id-456', 'Attempted self-unlock')).rejects.toThrow(
        'Forbidden: only administrators can unlock locked accounts.'
      );
    });

    it('lists locked accounts for the privileged security dashboard', async () => {
      rpcMock.mockResolvedValueOnce({
        data: [
          {
            id: 'sec-1',
            email_lookup: 'locked-user@kuventory.com',
            email_masked: 'l***r@kuventory.com',
            user_role: 'USER',
            failed_attempts: 5,
            locked_until: new Date(Date.now() + 1200 * 1000).toISOString(),
            lockout_status: 'ACTIVE',
            seconds_remaining: 1200,
            updated_at: new Date().toISOString(),
          },
        ],
        error: null,
      });

      const accounts = await fetchLockedAccounts();
      expect(accounts).toHaveLength(1);
      expect(accounts[0].failed_attempts).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // Assisted recovery (the real workflow for mailbox-less @kuventory.com IDs)
  // -------------------------------------------------------------------------

  describe('Assisted recovery submission (atomic server-side throttle)', () => {
    it('returns the reference and one-time credential with the authoritative cooldown', async () => {
      const serverNow = new Date().toISOString();
      const nextAllowed = new Date(Date.now() + 120_000).toISOString();
      rpcMock.mockResolvedValueOnce({
        data: {
          accepted: true,
          throttled: false,
          request_reference: 'REF-20261025-A1B2C3',
          status_credential: 'ST-' + 'ab'.repeat(16),
          server_now: serverNow,
          next_allowed_at: nextAllowed,
          seconds_remaining: 120,
          message: 'Your recovery request has been received.',
        },
        error: null,
      });

      const res = await submitAssistedRecoveryTicket('staff@kuventory.com', 'Forgot password');
      expect(res.accepted).toBe(true);
      expect(res.throttled).toBe(false);
      expect(res.requestReference).toBe('REF-20261025-A1B2C3');
      expect(res.statusCredential).toMatch(/^ST-/);
      expect(res.serverNow).toBe(serverNow);
      expect(res.nextAllowedAt).toBe(nextAllowed);
      expect(res.secondsRemaining).toBe(120);
      // The synthetic identifier is NEVER routed through email reset delivery.
      expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });

    it('reports throttling with the authoritative remaining wait and no credential', async () => {
      rpcMock.mockResolvedValueOnce({
        data: {
          accepted: false,
          throttled: true,
          existing_request: true,
          server_now: new Date().toISOString(),
          next_allowed_at: new Date(Date.now() + 95_000).toISOString(),
          seconds_remaining: 95,
          message: 'A recovery request for this identifier was recently submitted.',
        },
        error: null,
      });

      const res = await submitAssistedRecoveryTicket('staff@kuventory.com', 'Forgot password');
      expect(res.accepted).toBe(false);
      expect(res.throttled).toBe(true);
      expect(res.secondsRemaining).toBe(95);
      expect(res.requestReference).toBeUndefined();
      expect(res.statusCredential).toBeUndefined();
    });

    it('resolves a wrong-identifier rejection as structured data with the attempts countdown (no throw)', async () => {
      rpcMock.mockResolvedValueOnce({
        data: {
          accepted: false,
          account_exists: false,
          attempts_remaining: 3,
          server_now: new Date().toISOString(),
          message: 'No KUVENTORY account matches this identifier. Check the spelling or contact your administrator.',
        },
        error: null,
      });

      const res = await submitAssistedRecoveryTicket('ghost@kuventory.com', 'Forgot password');
      expect(res.accepted).toBe(false);
      expect(res.throttled).toBe(false);
      expect(res.accountExists).toBe(false);
      expect(res.attemptsRemaining).toBe(3);
      expect(res.message).toMatch(/No KUVENTORY account matches/i);
      expect(res.nextAllowedAt).toBeNull();
    });

    it('maps the 5th-wrong-attempt cooldown response with the unknownCooldown flag', async () => {
      rpcMock.mockResolvedValueOnce({
        data: {
          accepted: false,
          throttled: true,
          unknown_identifier_cooldown: true,
          server_now: new Date().toISOString(),
          next_allowed_at: new Date(Date.now() + 120_000).toISOString(),
          seconds_remaining: 120,
          message: 'Too many attempts with unknown identifiers. Please wait 2 minutes before trying again.',
        },
        error: null,
      });

      const res = await submitAssistedRecoveryTicket('ghost@kuventory.com', 'Forgot password');
      expect(res.accepted).toBe(false);
      expect(res.throttled).toBe(true);
      expect(res.unknownCooldown).toBe(true);
      expect(res.secondsRemaining).toBe(120);
      expect(res.nextAllowedAt).toBeTruthy();
    });

    it('still throws for malformed-input rejections that carry no account_exists signal', async () => {
      rpcMock.mockResolvedValueOnce({
        data: { accepted: false, error: 'Valid email identifier required.' },
        error: null,
      });
      await expect(submitAssistedRecoveryTicket('staff@kuventory.com', 'Forgot password')).rejects.toThrow(
        /Valid email identifier required/i
      );
    });

    it('throws on RPC failure instead of fabricating success', async () => {
      rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'db unreachable' } });
      await expect(submitAssistedRecoveryTicket('staff@kuventory.com', 'Forgot password')).rejects.toThrow();
    });

    it('throws on an unreadable response body', async () => {
      rpcMock.mockResolvedValueOnce({ data: null, error: null });
      await expect(submitAssistedRecoveryTicket('staff@kuventory.com', 'Forgot password')).rejects.toThrow(
        /unreadable response/i
      );
    });
  });

  describe('Authoritative cooldown check (no ticket created)', () => {
    it('reflects an active cooldown from the server', async () => {
      rpcMock.mockResolvedValueOnce({
        data: {
          valid: true,
          can_submit: false,
          server_now: new Date().toISOString(),
          next_allowed_at: new Date(Date.now() + 60_000).toISOString(),
          seconds_remaining: 60,
        },
        error: null,
      });

      const res = await checkAssistedRecoveryCooldown('staff@kuventory.com');
      expect(res.verified).toBe(true);
      expect(res.canSubmit).toBe(false);
      expect(res.secondsRemaining).toBe(60);
      expect(rpcMock).toHaveBeenCalledWith('check_assisted_recovery_cooldown', {
        p_email: 'staff@kuventory.com',
      });
    });

    it('reports canSubmit once the cooldown has expired server-side', async () => {
      rpcMock.mockResolvedValueOnce({
        data: { valid: true, can_submit: true, seconds_remaining: 0 },
        error: null,
      });

      const res = await checkAssistedRecoveryCooldown('staff@kuventory.com');
      expect(res.verified).toBe(true);
      expect(res.canSubmit).toBe(true);
      expect(res.secondsRemaining).toBe(0);
    });

    it('reports an unverified cooldown on failure so the UI never assumes expiry', async () => {
      rpcMock.mockRejectedValueOnce(new Error('offline'));
      const res = await checkAssistedRecoveryCooldown('staff@kuventory.com');
      expect(res.verified).toBe(false);
      expect(res.canSubmit).toBe(false);
    });
  });

  describe('Requester ticket status check (reference + credential)', () => {
    it('returns status without administrator notes', async () => {
      rpcMock.mockResolvedValueOnce({
        data: {
          valid: true,
          status: 'COMPLETED',
          submitted_at: '2026-10-25T10:00:00Z',
          resolved_at: '2026-10-25T11:30:00Z',
          decision_reason: 'Identity verified by administrator; password reset completed.',
        },
        error: null,
      });

      const res = await checkAssistedRecoveryTicketStatus('REF-20261025-A1B2C3', 'ST-abcdef');
      expect(res.valid).toBe(true);
      expect(res.status).toBe('COMPLETED');
      expect(res.resolvedAt).toBe('2026-10-25T11:30:00Z');
      expect(res.decisionReason).not.toMatch(/note/i);
    });

    it('rejects invalid reference/credential pairs', async () => {
      rpcMock.mockResolvedValueOnce({
        data: { valid: false, message: 'Invalid request reference or status credential.' },
        error: null,
      });

      const res = await checkAssistedRecoveryTicketStatus('REF-XXXX', 'ST-wrong');
      expect(res.valid).toBe(false);
    });
  });

  describe('Authorized administrator decision RPC', () => {
    it('performs the verified reset through review_assisted_recovery_request', async () => {
      rpcMock.mockResolvedValueOnce({
        data: { success: true, status: 'COMPLETED', message: 'Identity verified. Password reset completed.' },
        error: null,
      });

      const res = await reviewAssistedRecoveryRequest({
        requestId: 'req-1',
        decision: 'RESOLVE_RESET',
        notes: 'Verified in person with branch supervisor + ID',
        newPassword: 'NewSecurePass9',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('COMPLETED');
      expect(rpcMock).toHaveBeenCalledWith('review_assisted_recovery_request', {
        p_request_id: 'req-1',
        p_decision: 'RESOLVE_RESET',
        p_notes: 'Verified in person with branch supervisor + ID',
        p_new_password: 'NewSecurePass9',
      });
    });

    it('propagates server-side rejections (failed resets never report success)', async () => {
      rpcMock.mockResolvedValueOnce({
        data: null,
        error: { message: 'No account currently exists for identifier of request REF-1.' },
      });

      await expect(
        reviewAssistedRecoveryRequest({ requestId: 'req-1', decision: 'RESOLVE_RESET', notes: 'x', newPassword: 'NewSecurePass9' })
      ).rejects.toThrow(/No account currently exists/);
    });
  });
});
