import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  logger.error('CRITICAL: Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are missing. Refusing to connect to arbitrary fallback projects.');
}

const REMEMBER_ME_KEY = 'kuventory_remember_me';

function safeStorage(kind: 'local' | 'session'): Storage | null {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage;
    // Probe access — some browsers throw on any touch in private mode.
    const probe = '__kuventory_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/**
 * Remember-aware auth token storage.
 *
 * Session semantics:
 *  - "Remember me" UNCHECKED: the auth session lives in sessionStorage, so
 *    closing the browser (or the tab) ends the session — the next visit shows
 *    the login screen, exactly like a session cookie that dies with the
 *    browser.
 *  - "Remember me" CHECKED (kuventory_remember_me === 'true'): the session is
 *    persisted to localStorage and survives browser restarts.
 *
 * Exactly one storage ever holds the token; writes remove the copy in the
 * other so there is a single source of truth. Server-side authority is
 * untouched: session leases, revocation, and lockouts are enforced by the
 * database regardless of where the browser keeps its token.
 *
 * The boot sweep enforces the new rule for sessions persisted before this
 * behavior existed: a localStorage token WITHOUT the remember flag is
 * discarded once at adapter creation. The server-side lease expires on its
 * own TTL, so no orphan locks remain.
 */
export function createRememberAwareAuthStorage() {
  const local = safeStorage('local');
  const session = safeStorage('session');

  const isRemembered = () => {
    try {
      return local?.getItem(REMEMBER_ME_KEY) === 'true';
    } catch {
      return false;
    }
  };

  // One-time sweep of pre-existing persisted sessions that were never
  // remembered.
  if (local) {
    const remembered = isRemembered();
    if (!remembered) {
      try {
        const staleKeys: string[] = [];
        for (let i = 0; i < local.length; i++) {
          const key = local.key(i);
          if (key && (key.includes('auth-token') || key === 'kuventory_browser_session_active')) {
            staleKeys.push(key);
          }
        }
        staleKeys.forEach(k => local.removeItem(k));
      } catch {
        // Storage unreadable: nothing to sweep.
      }
    }
  }

  return {
    getItem: (key: string): string | null => {
      try {
        return session?.getItem(key) ?? local?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem: (key: string, value: string): void => {
      try {
        if (isRemembered()) {
          local?.setItem(key, value);
          session?.removeItem(key);
        } else {
          session?.setItem(key, value);
          local?.removeItem(key);
        }
      } catch {
        // Storage full/blocked: in-memory auth state still works for this
        // tab; the session simply won't survive a reload.
      }
    },
    removeItem: (key: string): void => {
      try {
        local?.removeItem(key);
        session?.removeItem(key);
      } catch {
        // Ignore — nothing to clear.
      }
    },
  };
}

// Fallback to local disposable dummy client if variables are absent to fail closed safely
export const supabase = createClient(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabaseAnonKey || 'dummy_anon_key_unconfigured',
  {
    auth: {
      storage: createRememberAwareAuthStorage(),
      autoRefreshToken: true,
      persistSession: true,
    },
  }
);

if (typeof window !== 'undefined') {
  (window as any).supabase = supabase;
}
