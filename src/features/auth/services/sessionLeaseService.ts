import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';

const CLIENT_ID_KEY = 'kuventory_session_client_id';
export const DEFAULT_LEASE_SECONDS = 90;

export function getOrCreateClientId(): string {
  try {
    // sessionStorage is per-tab; localStorage shares a stable client ID
    // across tabs in this browser so one account is not falsely marked busy.
    let clientId: string | null = null;
    try {
      if (typeof localStorage !== 'undefined') {
        clientId = localStorage.getItem(CLIENT_ID_KEY);
      }
    } catch {}

    if (!clientId) {
      try {
        if (typeof sessionStorage !== 'undefined') {
          clientId = sessionStorage.getItem(CLIENT_ID_KEY);
        }
      } catch {}
    }

    if (!clientId) {
      clientId = 'client_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CLIENT_ID_KEY, clientId);
      }
    } catch {}

    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(CLIENT_ID_KEY, clientId);
      }
    } catch {}

    return clientId;
  } catch {
    try {
      const existingId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CLIENT_ID_KEY) : null;
      if (existingId) return existingId;
      const fallbackId = 'client_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(CLIENT_ID_KEY, fallbackId);
      }
      return fallbackId;
    } catch {
      return 'client_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    }
  }
}

export function parseHumanDeviceInfo(userAgentString?: string | null): string {
  if (!userAgentString) return 'Web Browser';
  const ua = userAgentString;
  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox/')) browser = 'Firefox';

  let os = 'Device';
  if (ua.includes('Windows NT 10.0') || ua.includes('Windows NT 11.0')) os = 'Windows PC';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('iPhone')) os = 'iPhone';
  else if (ua.includes('iPad')) os = 'iPad';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'Mac';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('Linux')) os = 'Linux';

  return `${browser} on ${os}`;
}

export interface ClaimSessionResult {
  success: boolean;
  reason?: string;
  message?: string;
  occupied_since?: string;
  last_seen?: string;
  occupied_device_info?: string;
  lease_expires_at?: string;
  takeover?: boolean;
}

export interface HeartbeatResult {
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'SUPERSEDED_OR_OCCUPIED' | 'NO_LEASE' | 'UNAUTHENTICATED' | 'UNKNOWN';
  reason?: string;
  message?: string;
  lease_expires_at?: string;
}

export async function claimSessionLease(
  sessionId: string, 
  forceTakeover: boolean = false
): Promise<ClaimSessionResult> {
  const clientId = getOrCreateClientId();
  const deviceInfo = typeof navigator !== 'undefined' 
    ? `${navigator.userAgent.slice(0, 120)}`
    : 'Unknown Browser';

  const rpcParams: Record<string, any> = {
    p_session_id: sessionId,
    p_client_id: clientId,
    p_device_info: deviceInfo,
    p_lease_seconds: DEFAULT_LEASE_SECONDS,
  };

  if (forceTakeover) {
    rpcParams.p_force_takeover = true;
  }

  try {
    let { data, error } = await supabase.rpc('claim_user_session', rpcParams);

    // If server schema only has the 4-parameter signature, retry without p_force_takeover
    if (error && error.code === 'PGRST202' && 'p_force_takeover' in rpcParams) {
      delete rpcParams.p_force_takeover;
      if (forceTakeover) {
        try {
          await supabase.rpc('release_user_session', { p_client_id: null });
        } catch {}
      }
      const retry = await supabase.rpc('claim_user_session', rpcParams);
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.warn('claim_user_session RPC warning:', error.message);
      return {
        success: false,
        reason: 'verification_unavailable',
        message: 'Session security could not be verified. Please retry when the server is available.',
      };
    }

    return (data as ClaimSessionResult) || {
      success: false,
      reason: 'empty_response',
      message: 'Session security returned no result. Please retry.',
    };
  } catch (err: any) {
    console.warn('claim_user_session exception:', err);
    return {
      success: false,
      reason: 'verification_unavailable',
      message: 'Session security could not be verified. Please retry when the server is available.',
    };
  }
}

export async function heartbeatSessionLease(): Promise<HeartbeatResult> {
  const clientId = getOrCreateClientId();

  try {
    const { data, error } = await supabase.rpc('heartbeat_user_session', {
      p_client_id: clientId,
      p_lease_seconds: DEFAULT_LEASE_SECONDS,
    });

    if (error) {
      return { 
        status: 'UNKNOWN', 
        reason: error.message || 'Heartbeat verification failed.' 
      };
    }

    return (data as HeartbeatResult) || { 
      status: 'UNKNOWN', 
      reason: 'Empty heartbeat response.' 
    };
  } catch (err: any) {
    return { 
      status: 'UNKNOWN', 
      reason: err?.message || 'Heartbeat network failure.' 
    };
  }
}

export async function releaseSessionLease(): Promise<void> {
  const clientId = getOrCreateClientId();

  try {
    await supabase.rpc('release_user_session', {
      p_client_id: clientId,
    });
  } catch (err) {
    console.warn('release_user_session failed:', err);
  }
}

/**
 * Synchronous / keepalive lease release for page unload/quit.
 * Ensures the session lease is deleted immediately in Postgres when the user closes the tab or quits the browser.
 */
export function releaseSessionLeaseBeacon(): void {
  try {
    const stableClientId = typeof localStorage !== 'undefined' ? localStorage.getItem(CLIENT_ID_KEY) : null;
    const legacyClientId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CLIENT_ID_KEY) : null;
    const clientId = stableClientId || legacyClientId;
    if (!clientId) return;

    let token = supabaseAnonKey;
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('auth-token') || key.includes('supabase.auth.token'))) {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed?.access_token) {
                token = parsed.access_token;
                break;
              }
              if (parsed?.currentSession?.access_token) {
                token = parsed.currentSession.access_token;
                break;
              }
            }
          } catch {}
        }
      }
    }

    const endpoint = `${supabaseUrl}/rest/v1/rpc/release_user_session`;
    const payload = JSON.stringify({ p_client_id: clientId });

    if (typeof fetch === 'function') {
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('releaseSessionLeaseBeacon error:', err);
  }
}

export async function revokeUserSessionByAdmin(targetUserId: string, reason: string): Promise<{ success: boolean }> {
  try {
    const { data, error } = await supabase.rpc('revoke_user_session_by_admin', {
      p_target_user_id: targetUserId,
      p_reason: reason,
    });

    if (error) throw error;
    return { success: (data as any)?.success ?? true };
  } catch (err) {
    console.error('revoke_user_session_by_admin failed:', err);
    throw err;
  }
}

export async function revokeSessionLease(clientId: string, reason: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('revoke_user_session_lease', {
      p_client_id: clientId,
      p_reason: reason,
    });

    if (error) throw error;
    return Boolean((data as any)?.success ?? true);
  } catch (err) {
    console.error('revoke_user_session_lease failed:', err);
    throw err;
  }
}

export interface ActiveSessionRecord {
  lease_id: string;
  user_id: string;
  email: string;
  role: string;
  display_name: string;
  client_id: string;
  device_info: string;
  created_at: string;
  last_heartbeat_at: string;
  lease_expires_at: string;
  status: string;
  is_occupied_now: boolean;
}

export async function getActiveUserSessions(): Promise<ActiveSessionRecord[]> {
  try {
    const { data, error } = await supabase.rpc('get_active_user_sessions');
    if (error) throw error;
    return (data as ActiveSessionRecord[]) || [];
  } catch (err) {
    console.error('getActiveUserSessions failed:', err);
    throw err;
  }
}
