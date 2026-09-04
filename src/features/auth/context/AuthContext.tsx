import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, Role } from '../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  role: 'ADMIN',
  isLoading: true,
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsSessionLoading(false);
    }).catch(err => {
      console.error('Session load error:', err);
      setIsSessionLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) {
        queryClient.removeQueries({ queryKey: ['profile'] });
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

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

        const roleFromMeta = (user.user_metadata?.role as Role) || 'ADMIN';
        const roleFromDb = data?.role as Role;

        return {
          id: user.id,
          role: roleFromDb || roleFromMeta,
          first_name: data?.display_name || user.user_metadata?.first_name || user.email?.split('@')[0] || 'User',
          last_name: user.user_metadata?.last_name || '',
          created_at: data?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        } as Profile;
      } catch (err) {
        console.warn('Profile query exception:', err);
        return {
          id: user.id,
          role: (user.user_metadata?.role as Role) || 'ADMIN',
          first_name: user.email?.split('@')[0] || 'Admin',
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
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    queryClient.clear();
  };

  const isLoading = isSessionLoading || (!!user && isProfileLoading);
  const role: Role = profile?.role ?? (user?.user_metadata?.role as Role) ?? 'ADMIN';

  return (
    <AuthContext.Provider value={{ session, user, profile: profile ?? null, role, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
