import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';

const CLIENT_ID_KEY = 'kuventory_session_client_id';
export const DEFAULT_LEASE_SECONDS = 30;

export function getOrCreateClientId(): string {
  try {
    let clientId = sessionStorage.getItem(CLIENT_ID_KEY);
    if (!clientId) {
      clientId = 'client_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
      sessionStorage.setItem(CLIENT_ID_KEY, clientId);
    }
    return clientId;
  } catch {
    return 'client_' + Math.random().toString(36).substring(2, 11);
  }
}

export interface ClaimSessionResult {
  success: boolean;
  reason?: string;
  message?: string;
  occupied_since?: string;
  last_seen?: string;
  lease_expires_at?: string;
}

export async function claimSessionLease(sessionId: string): Promise<ClaimSessionResult> {
  const clientId = getOrCreateClientId();
  const deviceInfo = typeof navigator !== 'undefined' 
    ? `${navigator.userAgent.slice(0, 120)}`
    : 'Unknown Browser';

  try {
    const { data, error } = await supabase.rpc('claim_user_session', {
      p_session_id: sessionId,
      p_client_id: clientId,
      p_device_info: deviceInfo,
      p_lease_seconds: DEFAULT_LEASE_SECONDS,
    });

    if (error) {
      console.warn('claim_user_session RPC warning:', error.message);
      // Fallback: If RPC is inaccessible or network hiccup, allow login so user is not locked out
      return { success: true };
    }

    return (data as ClaimSessionResult) || { success: true };
  } catch (err: any) {
    console.warn('claim_user_session exception:', err);
    return { success: true };
  }
}

export async function heartbeatSessionLease(): Promise<{ status: string; reason?: string }> {
  const clientId = getOrCreateClientId();

  try {
    const { data, error } = await supabase.rpc('heartbeat_user_session', {
      p_client_id: clientId,
      p_lease_seconds: DEFAULT_LEASE_SECONDS,
    });

    if (error) {
      return { status: 'ACTIVE' };
    }

    return (data as { status: string; reason?: string }) || { status: 'ACTIVE' };
  } catch {
    return { status: 'ACTIVE' };
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
    const clientId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CLIENT_ID_KEY) : null;
    if (!clientId) return;

    // Retrieve active access token from Supabase storage or client
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

    // Use keepalive fetch which is guaranteed to complete after page unloads
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
    return [];
  }
}
