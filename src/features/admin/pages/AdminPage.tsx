import { useState } from 'react';
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

interface VisitorLog {
  id: string;
  user_id: string;
  user_email: string;
  visited_at: string;
  profiles: {
    first_name: string;
    last_name: string;
  };
}

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'visitors'>('users');
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

  const { data: visitors, isLoading: isLoadingVisitors } = useQuery({
    queryKey: ['visitor_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitor_logs')
        .select(`
          id,
          user_id,
          user_email,
          visited_at,
          profiles ( first_name, last_name )
        `)
        .order('visited_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as unknown as VisitorLog[];
    }
  });

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-8 h-8 text-blue-500" />
            Administration
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">View and manage system access and activity.</p>
        </div>
      </div>
      
      <div className="flex gap-2 justify-between items-center mb-2">
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${activeTab === 'users' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
          >
            User Management
          </button>
          <button 
            onClick={() => setActiveTab('visitors')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${activeTab === 'visitors' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
          >
            Visitor Logs
          </button>
        </div>
        
        {activeTab === 'users' && (
          <button 
            onClick={() => alert("Add User functionality requires Supabase Edge Functions or Admin API.")}
            className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            + Add User
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        {activeTab === 'users' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                  <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">Name</th>
                  <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">User ID</th>
                  <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">Role</th>
                  <th className="p-4 font-semibold text-slate-600 dark:text-slate-400 text-right">Actions</th>
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
                        <td className="p-4 text-right">
                           <button 
                             onClick={() => alert("Remove User functionality requires Supabase Admin API.")}
                             className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 bg-red-50 hover:bg-red-100 rounded"
                           >
                             Remove
                           </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
        
        {activeTab === 'visitors' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                  <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">Date / Time</th>
                  <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">Name</th>
                  <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {isLoadingVisitors ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : visitors?.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-slate-500">
                      No visitor logs found.
                    </td>
                  </tr>
                ) : (
                  visitors?.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {new Date(log.visited_at).toLocaleString()}
                      </td>
                      <td className="p-4 font-medium text-slate-900 dark:text-slate-100">
                        {log.profiles?.first_name} {log.profiles?.last_name}
                      </td>
                      <td className="p-4 text-slate-500 text-sm max-w-xs truncate" title={log.user_email}>
                        {log.user_email || 'Unknown'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
