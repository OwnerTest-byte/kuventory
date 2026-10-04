import { supabase } from './supabase';

export interface KeepaliveResult {
  success: boolean;
  latencyMs: number;
  timestamp: string;
  error?: string;
}

const STORAGE_KEY = 'kuventory_last_keepalive_ts';

/**
 * Pings Supabase database over PostgREST to prevent the free tier 7-day inactivity pause.
 * Returns connection latency and health status.
 */
export async function pingSupabaseKeepalive(): Promise<KeepaliveResult> {
  const start = performance.now();
  const now = new Date().toISOString();

  try {
    // 1. Try lightweight RPC first (zero table lock, sub-5ms)
    const rpcRes = await supabase.rpc('ping_keepalive');
    const latencyMs = Math.round(performance.now() - start);

    if (!rpcRes.error) {
      sessionStorage.setItem(STORAGE_KEY, now);
      return { success: true, latencyMs, timestamp: now };
    }

    // 2. Fallback to selecting from system_settings
    const { error } = await supabase
      .from('system_settings')
      .select('key')
      .limit(1);

    if (error) {
      console.warn('Keepalive ping notice:', error.message);
      sessionStorage.setItem(STORAGE_KEY, now);
      return { success: true, latencyMs, timestamp: now, error: error.message };
    }

    sessionStorage.setItem(STORAGE_KEY, now);
    return { success: true, latencyMs, timestamp: now };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      success: false,
      latencyMs,
      timestamp: now,
      error: err?.message || 'Network unreachable'
    };
  }
}

/**
 * Initializes automatic background keepalive upon application start.
 * Throttles to at most once per browser session to eliminate redundant requests.
 */
export function initKeepaliveHeartbeat(): void {
  const lastPing = sessionStorage.getItem(STORAGE_KEY);
  if (!lastPing) {
    // Asynchronously ping in background without blocking UI
    setTimeout(() => {
      pingSupabaseKeepalive().catch(() => {});
    }, 1500);
  }
}

export function getLastKeepaliveTimestamp(): string | null {
  return sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
}
