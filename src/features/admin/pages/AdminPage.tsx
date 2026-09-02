import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Users, Shield, ShieldAlert, Loader2 } from 'lucide-react';

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  user_roles: {
    role: 'ADMIN' | 'USER';
  }[];
}

export function AdminPage() {
  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      // In a real production environment this would be an RPC or Edge Function to get auth.users + profiles.
      // We will fetch from profiles and join user_roles.
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          user_roles ( role )
        `);
      
      if (error) throw error;
      return data as unknown as UserProfile[];
    }
  });

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-8 h-8 text-blue-500" />
            User Management
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">View and manage system access and roles.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">Name</th>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">User ID</th>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : users?.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                users?.map(user => {
                  const role = user.user_roles?.[0]?.role || 'USER';
                  const isAdmin = role === 'ADMIN';
                  
                  return (
                    <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-4 font-medium text-slate-900 dark:text-slate-100">
                        {user.first_name} {user.last_name}
                      </td>
                      <td className="p-4 text-slate-500 font-mono text-xs">
                        {user.id}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          isAdmin 
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' 
                            : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {isAdmin ? <ShieldAlert className="w-3 h-3 mr-1" /> : <Shield className="w-3 h-3 mr-1" />}
                          {role}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
