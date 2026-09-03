import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Users, Shield, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
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
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'users' | 'visitors'>('users');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', firstName: '', lastName: '', role: 'USER' });

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
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

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('admin_delete_user', { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof newUser) => {
      const { error } = await supabase.rpc('admin_create_user', {
        p_email: data.email,
        p_password: data.password,
        p_first_name: data.firstName,
        p_last_name: data.lastName,
        p_role: data.role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsAddUserOpen(false);
      setNewUser({ email: '', password: '', firstName: '', lastName: '', role: 'USER' });
    }
  });

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to completely delete this user? This action cannot be undone.')) {
      try {
        await deleteUserMutation.mutateAsync(id);
      } catch (err: any) {
        alert(err.message || 'Failed to delete user');
      }
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUserMutation.mutateAsync(newUser);
    } catch (err: any) {
      alert(err.message || 'Failed to create user');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">System Settings & Administration</h1>
          <p className="text-slate-500 mt-1">Manage users and view visitor logs.</p>
        </div>
        {activeTab === 'users' && (
          <Button onClick={() => setIsAddUserOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold">
            <Plus className="w-4 h-4 mr-2" /> Add User
          </Button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center px-6 py-4 font-semibold text-sm transition-colors ${activeTab === 'users' ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
          >
            <Users className="w-4 h-4 mr-2" />
            Manage Users
          </button>
          <button
            onClick={() => setActiveTab('visitors')}
            className={`flex items-center px-6 py-4 font-semibold text-sm transition-colors ${activeTab === 'visitors' ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
          >
            <Shield className="w-4 h-4 mr-2" />
            Visitor Logs
          </button>
        </div>

        {activeTab === 'users' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">Name</th>
                  <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">Role</th>
                  <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {isLoading ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : (
                  users?.map(user => {
                    const role = user.user_roles?.[0]?.role || 'USER';
                    return (
                      <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {user.first_name} {user.last_name}
                        </td>
                        <td className="px-6 py-4">
                           <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>
                             {role}
                           </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <Button
                             variant="ghost"
                             size="sm"
                             className="text-red-600 hover:text-red-800 hover:bg-red-50"
                             onClick={() => handleDelete(user.id)}
                             disabled={deleteUserMutation.isPending}
                           >
                             <Trash2 className="w-4 h-4 mr-2" /> Remove
                           </Button>
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
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">Date / Time</th>
                  <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">Name</th>
                  <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">Email</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {isLoadingVisitors ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : visitors?.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-slate-500">
                      No visitor logs found.
                    </td>
                  </tr>
                ) : (
                  visitors?.map(log => (
                    <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-slate-600">
                        {new Date(log.visited_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {log.profiles?.first_name} {log.profiles?.last_name}
                      </td>
                      <td className="px-6 py-4 text-slate-500">
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

      <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input required value={newUser.firstName} onChange={e => setNewUser({...newUser, firstName: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input required value={newUser.lastName} onChange={e => setNewUser({...newUser, lastName: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" required value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" required value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <select 
                className="w-full h-10 px-3 border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500"
                value={newUser.role}
                onChange={e => setNewUser({...newUser, role: e.target.value})}
              >
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsAddUserOpen(false)} disabled={createUserMutation.isPending}>Cancel</Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? 'Creating...' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
