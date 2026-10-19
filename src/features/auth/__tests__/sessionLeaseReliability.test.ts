import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  parseHumanDeviceInfo, 
  claimSessionLease, 
  heartbeatSessionLease, 
  revokeSessionLease,
  getOrCreateClientId
} from '../services/sessionLeaseService';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      rpc: vi.fn(),
      from: vi.fn(),
      auth: {
        getUser: vi.fn(),
        signOut: vi.fn(),
      }
    },
    supabaseUrl: 'https://mock.supabase.co',
    supabaseAnonKey: 'mock-key',
  };
});

const storageMap = new Map<string, string>();
const mockSessionStorage = {
  getItem: (k: string) => storageMap.get(k) ?? null,
  setItem: (k: string, v: string) => storageMap.set(k, v),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};
(globalThis as any).sessionStorage = mockSessionStorage;

describe('Session Lease Reliability & Lifecycle (Audit Rules 11-17, 149)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionStorage.clear();
  });

  describe('parseHumanDeviceInfo', () => {
    it('parses Chrome on Windows NT correctly', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      expect(parseHumanDeviceInfo(ua)).toBe('Chrome on Windows PC');
    });

    it('parses Safari on iPhone correctly', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      expect(parseHumanDeviceInfo(ua)).toBe('Safari on iPhone');
    });

    it('parses Firefox on Linux correctly', () => {
      const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0';
      expect(parseHumanDeviceInfo(ua)).toBe('Firefox on Linux');
    });

    it('parses Edge on Windows correctly', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
      expect(parseHumanDeviceInfo(ua)).toBe('Edge on Windows PC');
    });

    it('falls back to default label when userAgent is empty or null', () => {
      expect(parseHumanDeviceInfo(null)).toBe('Web Browser');
      expect(parseHumanDeviceInfo('')).toBe('Web Browser');
    });
  });

  describe('Client ID Generation', () => {
    it('creates and persists a stable client_id in sessionStorage', () => {
      const id1 = getOrCreateClientId();
      const id2 = getOrCreateClientId();
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^client_/);
    });
  });

  describe('claimSessionLease', () => {
    it('calls claim_user_session with default parameters (forceTakeover=false)', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { success: true, lease_expires_at: '2026-10-20T12:00:00Z' },
        error: null,
      } as any);

      const res = await claimSessionLease('test-session-id');
      expect(res.success).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith('claim_user_session', expect.objectContaining({
        p_session_id: 'test-session-id',
      }));
      expect(supabase.rpc).not.toHaveBeenCalledWith('claim_user_session', expect.objectContaining({
        p_force_takeover: true,
      }));
    });

    it('passes forceTakeover=true when requested for atomic takeover', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { success: true, takeover: true, lease_expires_at: '2026-10-20T12:00:00Z' },
        error: null,
      } as any);

      const res = await claimSessionLease('test-session-id', true);
      expect(res.success).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith('claim_user_session', expect.objectContaining({
        p_session_id: 'test-session-id',
        p_force_takeover: true,
      }));
    });

    it('returns OCCUPIED reason when another device holds the lease', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: false,
          reason: 'OCCUPIED',
          message: 'This account is currently active in another browser or device.',
          occupied_device_info: 'Chrome on Windows',
          last_seen: '2026-10-19T23:59:00Z'
        },
        error: null,
      } as any);

      const res = await claimSessionLease('device-b-session');
      expect(res.success).toBe(false);
      expect(res.reason).toBe('OCCUPIED');
      expect(res.occupied_device_info).toBe('Chrome on Windows');
    });
  });

  describe('heartbeatSessionLease', () => {
    it('returns ACTIVE when lease is renewed', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { status: 'ACTIVE', lease_expires_at: '2026-10-20T12:00:30Z' },
        error: null,
      } as any);

      const res = await heartbeatSessionLease();
      expect(res.status).toBe('ACTIVE');
      expect(res.lease_expires_at).toBe('2026-10-20T12:00:30Z');
    });

    it('returns EXPIRED when lease timestamp passed or status was expired', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { 
          status: 'EXPIRED', 
          message: 'Your session expired because it could not be verified in time.' 
        },
        error: null,
      } as any);

      const res = await heartbeatSessionLease();
      expect(res.status).toBe('EXPIRED');
      expect(res.message).toContain('expired');
    });

    it('returns SUPERSEDED_OR_OCCUPIED when a different client took over the lease', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { 
          status: 'SUPERSEDED_OR_OCCUPIED', 
          message: 'This account is now active in another browser or device.' 
        },
        error: null,
      } as any);

      const res = await heartbeatSessionLease();
      expect(res.status).toBe('SUPERSEDED_OR_OCCUPIED');
      expect(res.message).toContain('active in another browser');
    });

    it('returns REVOKED when session was terminated by an administrator', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { 
          status: 'REVOKED', 
          reason: 'Terminated during security review' 
        },
        error: null,
      } as any);

      const res = await heartbeatSessionLease();
      expect(res.status).toBe('REVOKED');
      expect(res.reason).toBe('Terminated during security review');
    });

    it('returns UNKNOWN with safe error on network failure', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'Network connection timeout' },
      } as any);

      const res = await heartbeatSessionLease();
      expect(res.status).toBe('UNKNOWN');
      expect(res.reason).toContain('Network connection timeout');
    });
  });

  describe('revokeSessionLease', () => {
    it('calls revoke_user_session_lease RPC with client ID and reason', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { success: true, revoked_client_id: 'client_target_123' },
        error: null,
      } as any);

      const success = await revokeSessionLease('client_target_123', 'Lost device reported');
      expect(success).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith('revoke_user_session_lease', {
        p_client_id: 'client_target_123',
        p_reason: 'Lost device reported',
      });
    });

    it('throws error when server RPC rejects revocation', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'Unauthorized: insufficient privileges to revoke session' },
      } as any);

      await expect(
        revokeSessionLease('client_target_123', 'Test reason')
      ).rejects.toThrow('insufficient privileges');
    });
  });
});
