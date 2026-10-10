import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, Role } from '../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { claimSessionLease, heartbeatSessionLease, releaseSessionLease, releaseSessionLeaseBeacon } from '../services/sessionLeaseService';

const BROWSER_SESSION_KEY = 'kuventory_browser_session_active';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role;
  isLoading: boolean;
  sessionLeaseError: string | null;
  clearSessionLeaseError: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  role: 'USER',
  isLoading: true,
  sessionLeaseError: null,
  clearSessionLeaseError: () => {},
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [sessionLeaseError, setSessionLeaseError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Instant release beacon on page unload or browser quit
  useEffect(() => {
    const handlePageUnload = () => {
      releaseSessionLeaseBeacon();
    };

    window.addEventListener('pagehide', handlePageUnload);
    window.addEventListener('beforeunload', handlePageUnload);

    return () => {
      window.removeEventListener('pagehide', handlePageUnload);
      window.removeEventListener('beforeunload', handlePageUnload);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session: initSession } }) => {
      if (!isMounted) return;
      if (initSession) {
        // Enforce browser-quit auto-logout: if user closed the browser/tab and reopens fresh,
        // sessionStorage has cleared. We terminate the stale session to maintain enterprise security.
        const isSessionActive = sessionStorage.getItem(BROWSER_SESSION_KEY);
        if (!isSessionActive) {
          try {
            await releaseSessionLease();
            await supabase.auth.signOut();
          } catch {}
          if (isMounted) {
            setSession(null);
            setUser(null);
            setIsSessionLoading(false);
          }
          return;
        }

        const claimResult = await claimSessionLease(initSession.access_token.slice(-16));
        if (!claimResult.success) {
          console.warn('Initial session lease rejected: occupied on another device.');
          await supabase.auth.signOut();
          sessionStorage.removeItem(BROWSER_SESSION_KEY);
          if (isMounted) {
            setSession(null);
            setUser(null);
            setSessionLeaseError('ACCOUNT IN USE');
            setIsSessionLoading(false);
          }
          return;
        }
        if (isMounted) {
          sessionStorage.setItem(BROWSER_SESSION_KEY, '1');
          setSession(initSession);
          setUser(initSession.user ?? null);
        }
      }
      if (isMounted) setIsSessionLoading(false);
    }).catch(err => {
      console.error('Session load error:', err);
      if (isMounted) setIsSessionLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;
      if (!newSession) {
        sessionStorage.removeItem(BROWSER_SESSION_KEY);
        setSession(null);
        setUser(null);
        queryClient.removeQueries({ queryKey: ['profile'] });
        return;
      }

      // Atomically claim session lease before setting active session
      const claimResult = await claimSessionLease(newSession.access_token.slice(-16));
      if (!claimResult.success) {
        console.warn('Session lease rejected on auth change: occupied on another device.');
        await supabase.auth.signOut();
        sessionStorage.removeItem(BROWSER_SESSION_KEY);
        if (isMounted) {
          setSession(null);
          setUser(null);
          setSessionLeaseError('ACCOUNT IN USE');
        }
        return;
      }

      if (isMounted) {
        sessionStorage.setItem(BROWSER_SESSION_KEY, '1');
        setSessionLeaseError(null);
        setSession(newSession);
        setUser(newSession.user ?? null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  // Periodic Session Heartbeat (Rule 13 & 15: Heartbeat + Lease + Grace Period)
  useEffect(() => {
    if (!user || !session) return;

    // Send immediate heartbeat on mount
    heartbeatSessionLease();

    // Periodic fallback heartbeat every 10s
    const heartbeatInterval = setInterval(async () => {
      const res = await heartbeatSessionLease();
      if (res.status === 'REVOKED') {
        console.warn('Session has been revoked by an administrator.');
        sessionStorage.removeItem(BROWSER_SESSION_KEY);
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        queryClient.clear();
        alert('Your session has been terminated by an administrator: ' + (res.reason || 'Administrative revocation'));
      }
    }, 10000);

    // Instantaneous 0ms realtime session revocation and account deactivation listener
    const channelName = `session-revocation-${user.id}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_user_sessions', filter: `user_id=eq.${user.id}` },
        async (payload: any) => {
          if (payload.new && payload.new.status === 'REVOKED') {
            console.warn('Session revoked via realtime event.');
            sessionStorage.removeItem(BROWSER_SESSION_KEY);
            await supabase.auth.signOut();
            setSession(null);
            setUser(null);
            queryClient.clear();
            alert('Your session has been terminated by an administrator: ' + (payload.new.reason || 'Administrative revocation'));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        async (payload: any) => {
          if (payload.new) {
            if (payload.new.is_active === false) {
              console.warn('Account deactivated via realtime event.');
              sessionStorage.removeItem(BROWSER_SESSION_KEY);
              await supabase.auth.signOut();
              setSession(null);
              setUser(null);
              queryClient.clear();
              alert('Your account has been deactivated by an administrator.');
            } else {
              queryClient.invalidateQueries({ queryKey: ['profile'] });
            }
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(heartbeatInterval);
      supabase.removeChannel(channel);
    };
  }, [user?.id, session?.access_token, queryClient]);

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

        const isMaster = user.email === 'master@kuventory.com';
        const isAdmin = user.email === 'admin@kuventory.com';
        const roleFromMeta = (user.user_metadata?.role as Role) || 'USER';
        const roleFromDb = data?.role as Role;
        const resolvedRole: Role = isMaster ? 'MASTER_ADMIN' : (isAdmin ? 'ADMIN' : (roleFromDb || roleFromMeta));

        return {
          id: user.id,
          role: resolvedRole,
          first_name: data?.display_name || user.user_metadata?.first_name || user.email?.split('@')[0] || 'User',
          last_name: user.user_metadata?.last_name || '',
          created_at: data?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        } as Profile;
      } catch (err) {
        console.warn('Profile query exception:', err);
        const isMaster = user.email === 'master@kuventory.com';
        const isAdmin = user.email === 'admin@kuventory.com';
        const fallbackRole: Role = isMaster ? 'MASTER_ADMIN' : (isAdmin ? 'ADMIN' : ((user.user_metadata?.role as Role) || 'USER'));
        return {
          id: user.id,
          role: fallbackRole,
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
    sessionStorage.removeItem(BROWSER_SESSION_KEY);
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
  const isMasterUser = user?.email === 'master@kuventory.com';
  const isAdminUser = user?.email === 'admin@kuventory.com';
  const role: Role = isMasterUser 
    ? 'MASTER_ADMIN' 
    : (isAdminUser ? 'ADMIN' : (profile?.role ?? (user?.user_metadata?.role as Role) ?? 'USER'));

  const clearSessionLeaseError = () => setSessionLeaseError(null);

  return (
    <AuthContext.Provider value={{ 
      session, 
      user, 
      profile: profile ?? null, 
      role, 
      isLoading, 
      sessionLeaseError, 
      clearSessionLeaseError, 
      signOut 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
