import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, Role } from '../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  claimSessionLease,
  heartbeatSessionLease, 
  releaseSessionLease, 
  type HeartbeatResult
} from '../services/sessionLeaseService';

const BROWSER_SESSION_KEY = 'kuventory_browser_session_active';

function setBrowserSessionMarker(active: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') {
      if (active) localStorage.setItem(BROWSER_SESSION_KEY, '1');
      else localStorage.removeItem(BROWSER_SESSION_KEY);
    }
  } catch {}
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (active) sessionStorage.setItem(BROWSER_SESSION_KEY, '1');
      else sessionStorage.removeItem(BROWSER_SESSION_KEY);
    }
  } catch {}
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role;
  isLoading: boolean;
  sessionLeaseError: string | null;
  isSessionVerifying: boolean;
  clearSessionLeaseError: () => void;
  activateSession: (session: Session) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  role: 'STAFF',
  isLoading: true,
  sessionLeaseError: null,
  isSessionVerifying: false,
  clearSessionLeaseError: () => {},
  activateSession: () => {},
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [sessionLeaseError, setSessionLeaseError] = useState<string | null>(null);
  const [isSessionVerifying, setIsSessionVerifying] = useState(false);
  const queryClient = useQueryClient();

  const consecutiveFailuresRef = useRef<number>(0);
  // Mirror of the live session for listeners that must know whether a
  // session existed before a null-session event.
  const sessionRef = useRef<Session | null>(null);


  // Centralized terminal session cleanup
  const handleTerminalState = useCallback(async (reasonMessage: string) => {
    console.warn('Session terminated:', reasonMessage);
    setBrowserSessionMarker(false);
    consecutiveFailuresRef.current = 0;
    setIsSessionVerifying(false);
    // Marker for the login page: this was an actual terminated session
    // (admin action, deactivation, auth expiry) — not a plain first visit.
    try { sessionStorage.setItem('kuventory_unexpected_signout', '1'); } catch {}
    try {
      await releaseSessionLease();
      await supabase.auth.signOut();
    } catch {}
    sessionRef.current = null;
    setSession(null);
    setUser(null);
    queryClient.clear();
    setSessionLeaseError(reasonMessage);
  }, [queryClient]);

  // Centralized heartbeat outcome processing
  const processHeartbeatResult = useCallback(async (res: HeartbeatResult) => {
    if (res.status === 'ACTIVE') {
      consecutiveFailuresRef.current = 0;
      setIsSessionVerifying(false);
      return;
    }

    if (res.status === 'REVOKED') {
      await handleTerminalState(res.reason || 'Your session was ended by an administrator.');
      return;
    }

    if (res.status === 'UNAUTHENTICATED') {
      // Check if user session actually still exists in Supabase Auth before logging out
      const { data: currentAuth } = await supabase.auth.getSession();
      if (!currentAuth?.session) {
        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current >= 3) {
          await handleTerminalState('Your authentication has expired. Please sign in again.');
        }
        return;
      }
      // Auth session is valid; clear failure counter and re-claim lease
      consecutiveFailuresRef.current = 0;
      claimSessionLease('keepalive_' + Date.now(), true).catch(() => {});
      return;
    }

    // UNKNOWN: the security verification could not reach the server. Surface
    // the interruption honestly (banner) only after it persists across a
    // second heartbeat — a single network blip must not flash it. The session
    // stays active while heartbeats retry. Never terminate a session on a
    // transport failure, and never claim verification succeeded.
    if (res.status === 'UNKNOWN') {
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= 2) {
        setIsSessionVerifying(true);
      }
      return;
    }

    // Keep session active uninterrupted - quietly refresh lease in background
    claimSessionLease('keepalive_' + Date.now(), true).catch(() => {});
  }, [handleTerminalState]);

  // Initial session restoration and auth state listener
  useEffect(() => {
    let isMounted = true;

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session: initSession } }) => {
      if (!isMounted) return;
      if (initSession) {
        // Authenticated user found in session storage: preserve session immediately
        setBrowserSessionMarker(true);
        sessionRef.current = initSession;
        setSession(initSession);
        setUser(initSession.user ?? null);
        setIsSessionLoading(false);

        // Background non-blocking lease sync
        try {
          const hbResult = await heartbeatSessionLease();
          if (hbResult.status === 'REVOKED') {
            await handleTerminalState(hbResult.reason || 'Your session was ended by an administrator.');
          }
        } catch {}
        return;
      }
      if (isMounted) setIsSessionLoading(false);
    }).catch(err => {
      console.error('Session load error:', err);
      if (isMounted) setIsSessionLoading(false);
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;
      if (!newSession) {
        // An unexpected null-session event while we still held a session
        // (e.g. auth-js removed an expired session) is also a terminated
        // session — mark it so the login page explains itself. A plain first
        // visit never had a session, so no marker, no note.
        if (sessionRef.current) {
          try { sessionStorage.setItem('kuventory_unexpected_signout', '1'); } catch {}
        }
        sessionRef.current = null;
        setBrowserSessionMarker(false);
        setSession(null);
        setUser(null);
        queryClient.clear();
        return;
      }

      // Accept new session immediately
      setBrowserSessionMarker(true);
      sessionRef.current = newSession;
      setSession(newSession);
      setUser(newSession.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient, handleTerminalState]);

  // Periodic Session Heartbeat and Realtime Safety Net
  useEffect(() => {
    if (!user || !session) return;

    let isHeartbeatActive = true;

    // Send immediate heartbeat on mount and process outcome
    heartbeatSessionLease().then(res => {
      if (isHeartbeatActive) {
        processHeartbeatResult(res);
      }
    });

    // Periodic safety-net heartbeat every 20 seconds
    const heartbeatInterval = setInterval(async () => {
      if (!isHeartbeatActive) return;
      const res = await heartbeatSessionLease();
      if (isHeartbeatActive) {
        await processHeartbeatResult(res);
      }
    }, 20000);

    // Instantaneous Realtime session listener on authoritative table 'user_session_leases'
    const channelName = `session-lease-${user.id}-${Date.now()}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'user_session_leases', 
          filter: `user_id=eq.${user.id}` 
        },
        async (payload: any) => {
          if (!isHeartbeatActive || !payload.new) return;

          // Only terminate if an administrator explicitly revoked the session
          if (payload.new.status === 'REVOKED') {
            await handleTerminalState(payload.new.revocation_reason || 'Your session was ended by an administrator.');
          }
        }
      )
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'profiles', 
          filter: `id=eq.${user.id}` 
        },
        async (payload: any) => {
          if (!isHeartbeatActive || !payload.new) return;
          if (payload.new.is_active === false) {
            // A stale/replayed deactivation event (e.g. from an earlier
            // lockout) must not kill a fresh session: re-fetch the
            // authoritative profile and sign out only if the server STILL
            // says inactive.
            try {
              const { data: freshProfile } = await supabase
                .from('profiles')
                .select('is_active')
                .eq('id', user.id)
                .maybeSingle();
              if (freshProfile?.is_active === false) {
                await handleTerminalState('Your account has been deactivated by an administrator.');
                return;
              }
            } catch {
              // Verification unreachable: do NOT terminate on a transport
              // failure; the next heartbeat/profile query will re-check.
              return;
            }
            queryClient.invalidateQueries({ queryKey: ['profile'] });
          } else {
            queryClient.invalidateQueries({ queryKey: ['profile'] });
          }
        }
      )
      .subscribe();

    return () => {
      isHeartbeatActive = false;
      clearInterval(heartbeatInterval);
      supabase.removeChannel(channel);
    };
  }, [user?.id, session?.access_token, queryClient, processHeartbeatResult, handleTerminalState]);

  // Fetch profile when user is authenticated
  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.warn('Profile fetch warning (using metadata fallback):', error.message);
        }

        // Authoritative role evaluation strictly from server record
        const roleFromDb = data?.role as Role;
        const validRoles: Role[] = ['SUPER_ADMIN', 'ADMIN', 'STAFF'];
        const resolvedRole: Role = validRoles.includes(roleFromDb) ? roleFromDb : 'STAFF';

        // Return the FULL profile row (support contacts, job title, avatar,
        // opt-in flag, names) — profile screens must reflect what was saved.
        // The spread keeps every column; overrides below only pin identity
        // and fail-closed role resolution.
        return {
          ...data,
          id: user.id,
          role: resolvedRole,
          first_name: data?.first_name || data?.display_name || user.email?.split('@')[0] || 'User',
          last_name: data?.last_name ?? '',
          created_at: data?.created_at || new Date().toISOString(),
          updated_at: data?.updated_at || new Date().toISOString(),
        } as Profile;
      } catch (err) {
        console.warn('Profile query exception (failing closed to least-privileged role):', err);
        return {
          id: user.id,
          role: 'STAFF' as Role,
          first_name: user.email?.split('@')[0] || 'User',
          last_name: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        } as Profile;
      }
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  const signOut = async () => {
    setBrowserSessionMarker(false);
    consecutiveFailuresRef.current = 0;
    setIsSessionVerifying(false);
    try {
      await releaseSessionLease();
    } catch (e) {
      console.warn('Error releasing session lease:', e);
    }
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    queryClient.clear();
  };

  const isLoading = isSessionLoading || (!!user && isProfileLoading);
  const role: Role = profile?.role ?? 'STAFF';

  const clearSessionLeaseError = () => setSessionLeaseError(null);

  const activateSession = useCallback((newSession: Session) => {
    setBrowserSessionMarker(true);
    setSessionLeaseError(null);
    sessionRef.current = newSession;
    setSession(newSession);
    setUser(newSession.user ?? null);
  }, []);

  return (
    <AuthContext.Provider value={{ 
      session, 
      user, 
      profile: profile ?? null, 
      role, 
      isLoading, 
      sessionLeaseError, 
      isSessionVerifying,
      clearSessionLeaseError, 
      activateSession,
      signOut 
    }}>
      {/* Non-blocking persistent banner during transient network re-verification */}
      {isSessionVerifying && session && (
        <div 
          role="status" 
          aria-live="polite" 
          className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-amber-950 px-4 py-1.5 text-xs font-bold text-center flex items-center justify-center gap-2 shadow-sm"
        >
          <span className="w-2 h-2 rounded-full bg-amber-950 animate-ping" />
          <span>Connection interrupted — verifying session security with server...</span>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
