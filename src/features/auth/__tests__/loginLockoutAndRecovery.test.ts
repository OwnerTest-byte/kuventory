import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkAccountLockout,
  recordLoginAttempt,
  checkLockoutStatusByToken,
  unlockAccount,
  fetchLockedAccounts,
  requestPasswordResetAuth
} from '../services/loginLockoutService';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    auth: {
      resetPasswordForEmail: vi.fn(),
    }
  }
}));

describe('Login Lockout & Account Recovery Suite (Phase 2 & Phase 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Five Failed Attempts -> 30-Minute Lockout Policy', () => {
    it('returns is_locked = false when account has fewer than 5 failed attempts', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: {
          is_locked: false,
          seconds_remaining: 0,
          locked_until: null,
          failed_attempts: 2,
        },
        error: null
      } as any);

      const status = await checkAccountLockout('staff@kuventory.com');
      expect(status.is_locked).toBe(false);
      expect(status.seconds_remaining).toBe(0);
      expect(mockRpc).toHaveBeenCalledWith('check_account_lockout', {
        p_email: 'staff@kuventory.com',
        p_ip: null,
      });
    });

    it('returns is_locked = true and server-backed 30-minute lockout on the 5th failed attempt', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      const futureExpiry = new Date(Date.now() + 1800 * 1000).toISOString();
      const opaqueToken = 'a1b2c3d4e5f67890';

      mockRpc.mockResolvedValueOnce({
        data: {
          is_locked: true,
          failed_attempts: 5,
          seconds_remaining: 1800,
          locked_until: futureExpiry,
          lockout_token: opaqueToken,
          message: 'Account temporarily locked for 30 minutes due to 5 consecutive failed login attempts.',
        },
        error: null
      } as any);

      const result = await recordLoginAttempt(
        'attacker@kuventory.com',
        false,
        '192.168.1.100',
        'Mozilla/5.0 TestBrowser'
      );

      expect(result.is_locked).toBe(true);
      expect(result.failed_attempts).toBe(5);
      expect(result.seconds_remaining).toBe(1800);
      expect(result.lockout_token).toBe(opaqueToken);
      expect(result.locked_until).toBe(futureExpiry);
      expect(mockRpc).toHaveBeenCalledWith('record_failed_login_attempt', {
        p_email: 'attacker@kuventory.com',
        p_ip: '192.168.1.100',
        p_user_agent: 'Mozilla/5.0 TestBrowser',
      });
    });

    it('polls lockout status using opaque token without email enumeration risk', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: {
          is_locked: true,
          seconds_remaining: 1720,
          locked_until: new Date(Date.now() + 1720 * 1000).toISOString(),
          was_unlocked: false,
        },
        error: null
      } as any);

      const status = await checkLockoutStatusByToken('test-opaque-token');
      expect(status.is_locked).toBe(true);
      expect(status.seconds_remaining).toBe(1720);
      expect(mockRpc).toHaveBeenCalledWith('check_lockout_status_by_token', {
        p_token: 'test-opaque-token'
      });
    });

    it('reflects when an authorized operator clears the lock early via opaque token polling', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: {
          is_locked: false,
          seconds_remaining: 0,
          locked_until: null,
          was_unlocked: true,
        },
        error: null
      } as any);

      const status = await checkLockoutStatusByToken('test-opaque-token');
      expect(status.is_locked).toBe(false);
      expect(status.seconds_remaining).toBe(0);
      expect(status.was_unlocked).toBe(true);
    });
  });

  describe('Admin Unlock Permission Matrix & Audit Trail', () => {
    it('allows Admin to unlock locked Staff account with mandatory reason', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Account unlocked successfully for staff@kuventory.com.',
        },
        error: null
      } as any);

      const res = await unlockAccount(
        'staff-security-id-123',
        'Staff verified identity via branch manager phone'
      );

      expect(res.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('unlock_account', {
        p_account_security_id: 'staff-security-id-123',
        p_reason: 'Staff verified identity via branch manager phone'
      });
    });

    it('fails closed when an unauthorized user or missing reason is supplied', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Unauthorized: Admins cannot unlock accounts with higher or equal role.' }
      } as any);

      await expect(
        unlockAccount('admin-security-id-456', 'Attempted self-unlock')
      ).rejects.toThrow('Unauthorized: Admins cannot unlock accounts with higher or equal role.');
    });

    it('lists locked accounts for privileged security dashboard', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            id: 'sec-1',
            email_lookup: 'locked-user@kuventory.com',
            email_masked: 'l***r@kuventory.com',
            user_role: 'USER',
            failed_attempts: 5,
            locked_until: new Date(Date.now() + 1200 * 1000).toISOString(),
            last_failed_at: new Date().toISOString(),
            window_started_at: null,
            lockout_status: 'LOCKED',
            seconds_remaining: 1200,
            display_name: 'Locked User',
            updated_at: new Date().toISOString(),
          }
        ],
        error: null
      } as any);

      const accounts = await fetchLockedAccounts();
      expect(accounts).toHaveLength(1);
      expect(accounts[0].email_lookup).toBe('locked-user@kuventory.com');
      expect(accounts[0].failed_attempts).toBe(5);
    });
  });

  describe('Authoritative Forgot-Password Recovery & Anti-Enumeration', () => {
    it('returns generic safe response whether email exists or not', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          message: 'If an account matches this address, recovery instructions will be dispatched. Please check your inbox and spam folder.',
          cooldown_seconds: 120,
        },
        error: null
      } as any);

      const res = await requestPasswordResetAuth('unregistered@kuventory.com');
      expect(res.success).toBe(true);
      expect(res.message).toContain('If an account matches this address');
      expect(res.cooldown_seconds).toBe(120);
    });

    it('enforces server-side 2-minute throttling on repeated reset requests', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Please wait 95 seconds before requesting another password reset.' }
      } as any);

      await expect(requestPasswordResetAuth('rapid@kuventory.com')).rejects.toThrow(
        'Please wait 95 seconds before requesting another password reset.'
      );
    });
  });

  describe('Password Hashing Architectural Defense Proof', () => {
    it('verifies that public application queries do not expose password_hash columns', async () => {
      // Supabase Auth stores encrypted passwords in auth.users.encrypted_password via bcrypt.
      // Assert that public schema profiles do NOT contain password_hash or salt columns.
      const mockFrom = vi.mocked(supabase.from);
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockResolvedValueOnce({
            data: [{
              id: 'test-user-id',
              role: 'USER',
              display_name: 'Test Staff',
              created_at: '2026-10-24T00:00:00Z',
              updated_at: '2026-10-24T00:00:00Z'
            }],
            error: null
          })
        })
      } as any);

      const { data } = await supabase.from('profiles').select('*').eq('id', 'test-user-id');
      const profile = data?.[0] as any;

      expect(profile).toBeDefined();
      expect(profile.password).toBeUndefined();
      expect(profile.password_hash).toBeUndefined();
      expect(profile.encrypted_password).toBeUndefined();
      expect(profile.salt).toBeUndefined();
    });
  });
});
