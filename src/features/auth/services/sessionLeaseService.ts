import { supabase } from '@/lib/supabase';

const CLIENT_ID_KEY = 'kuventory_session_client_id';

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
      p_lease_seconds: 45,
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
      p_lease_seconds: 45,
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
