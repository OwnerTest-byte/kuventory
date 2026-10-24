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
  role: 'USER',
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


  // Centralized terminal session cleanup
  const handleTerminalState = useCallback(async (reasonMessage: string) => {
    console.warn('Session terminated:', reasonMessage);
    setBrowserSessionMarker(false);
    consecutiveFailuresRef.current = 0;
    setIsSessionVerifying(false);
    try {
      await releaseSessionLease();
      await supabase.auth.signOut();
    } catch {}
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
        setBrowserSessionMarker(false);
        setSession(null);
        setUser(null);
        queryClient.clear();
        return;
      }

      // Accept new session immediately
      setBrowserSessionMarker(true);
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
            await handleTerminalState('Your account has been deactivated by an administrator.');
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
        const isSuper = data?.role === 'SUPER_ADMIN' || data?.role === 'MASTER_ADMIN';
        const isAdmin = isSuper || data?.role === 'ADMIN';
        const roleFromDb = data?.role as Role;
        const resolvedRole: Role = isSuper ? 'SUPER_ADMIN' : (isAdmin ? 'ADMIN' : (roleFromDb || 'USER'));

        return {
          id: user.id,
          role: resolvedRole,
          first_name: data?.display_name || user.email?.split('@')[0] || 'User',
          last_name: '',
          created_at: data?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        } as Profile;
      } catch (err) {
        console.warn('Profile query exception (failing closed to least-privileged role):', err);
        return {
          id: user.id,
          role: 'USER' as Role,
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
  const isSuperUser = profile?.role === 'SUPER_ADMIN' || profile?.role === 'MASTER_ADMIN';
  const isAdminUser = isSuperUser || profile?.role === 'ADMIN';
  const role: Role = isSuperUser 
    ? 'SUPER_ADMIN' 
    : (isAdminUser ? 'ADMIN' : (profile?.role ?? 'USER'));

  const clearSessionLeaseError = () => setSessionLeaseError(null);

  const activateSession = useCallback((newSession: Session) => {
    setBrowserSessionMarker(true);
    setSessionLeaseError(null);
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
