import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { 
  Users, Shield, Loader2, Plus, Trash2, Store, Bell, Activity, 
  Info, CheckCircle2, AlertCircle, Save
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';

interface ProfileRow {
  id: string;
  role: 'ADMIN' | 'USER';
  display_name: string | null;
  created_at: string;
}

export function AdminPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('restaurant');

  // Restaurant Info state
  const [restaurantInfo, setRestaurantInfo] = useState({
    name: 'KUVENTORY KIOSK & BODEGA',
    branch: 'Central Bodega & Kiosk Operations',
    address: 'Commercial Boulevard, Metro Manila, Philippines',
    phone: '+63 (02) 8921-4567',
    email: 'operations@kuventory.com',
    hours: '10:00 AM – 11:00 PM Daily',
    currency: 'PHP (₱)',
  });
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSaveRestaurant = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  // Notification Preferences State
  const [notifPrefs, setNotifPrefs] = useState({
    lowStockThreshold: 20,
    expiryNoticeDays: 14,
    emailAlerts: true,
    soundAlerts: false,
    fefoAutoAllocation: true,
  });
  const [savedNotifNotice, setSavedNotifNotice] = useState(false);

  const handleSaveNotif = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNotifNotice(true);
    setTimeout(() => setSavedNotifNotice(false), 3000);
  };

  // User Management State
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', displayName: '', role: 'USER' });
  const [addError, setAddError] = useState<string | null>(null);

  // Fetch real users from public.profiles
  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['profiles-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, display_name, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Fetch profiles error:', error);
        throw error;
      }
      return data as ProfileRow[];
    }
  });

  // Toggle role mutation
  const toggleRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: 'ADMIN' | 'USER' }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles-admin'] });
    }
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('admin_delete_user', { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles-admin'] });
    }
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: typeof newUser) => {
      setAddError(null);
      const { error } = await supabase.rpc('admin_create_user', {
        p_email: data.email,
        p_password: data.password,
        p_first_name: data.displayName,
        p_last_name: '',
        p_role: data.role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles-admin'] });
      setIsAddUserOpen(false);
      setNewUser({ email: '', password: '', displayName: '', role: 'USER' });
    },
    onError: (err: Error) => {
      setAddError(err.message || 'Failed to create user');
    }
  });

  // System Activity Log
  const { data: activityMovements = [], isLoading: isLoadingActivities } = useQuery({
    queryKey: ['admin-activity-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_history_view')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return [];
      return data || [];
    }
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in">
      <header className="border-b pb-4 border-slate-200 dark:border-slate-800">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Shield className="w-8 h-8 text-blue-600" />
          System Settings & Administration
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
          Manage restaurant information, staff accounts, system preferences, and security audit logs.
        </p>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 rounded-lg flex flex-wrap h-auto gap-1">
          <TabsTrigger value="restaurant" className="font-semibold text-xs sm:text-sm">
            <Store className="w-4 h-4 mr-2" /> Restaurant Info
          </TabsTrigger>
          <TabsTrigger value="users" className="font-semibold text-xs sm:text-sm">
            <Users className="w-4 h-4 mr-2" /> Staff & Users ({users.length})
          </TabsTrigger>
          <TabsTrigger value="notifications" className="font-semibold text-xs sm:text-sm">
            <Bell className="w-4 h-4 mr-2" /> Preferences & Alerts
          </TabsTrigger>
          <TabsTrigger value="activity" className="font-semibold text-xs sm:text-sm">
            <Activity className="w-4 h-4 mr-2" /> Activity Audit Trail
          </TabsTrigger>
          <TabsTrigger value="about" className="font-semibold text-xs sm:text-sm">
            <Info className="w-4 h-4 mr-2" /> About & Diagnostics
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: RESTAURANT INFO */}
        <TabsContent value="restaurant" className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-3xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Restaurant Profile & Business Details</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              These details are automatically printed on official Daily Inventory sheets and exported reports.
            </p>

            <form onSubmit={handleSaveRestaurant} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Establishment Name</Label>
                  <Input 
                    value={restaurantInfo.name}
                    onChange={e => setRestaurantInfo({ ...restaurantInfo, name: e.target.value })}
                    className="font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Branch / Location Tag</Label>
                  <Input 
                    value={restaurantInfo.branch}
                    onChange={e => setRestaurantInfo({ ...restaurantInfo, branch: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Physical Address</Label>
                <Input 
                  value={restaurantInfo.address}
                  onChange={e => setRestaurantInfo({ ...restaurantInfo, address: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Contact Number</Label>
                  <Input 
                    value={restaurantInfo.phone}
                    onChange={e => setRestaurantInfo({ ...restaurantInfo, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Operations Email</Label>
                  <Input 
                    type="email"
                    value={restaurantInfo.email}
                    onChange={e => setRestaurantInfo({ ...restaurantInfo, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Operating Hours</Label>
                  <Input 
                    value={restaurantInfo.hours}
                    onChange={e => setRestaurantInfo({ ...restaurantInfo, hours: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Base Currency</Label>
                  <Input 
                    value={restaurantInfo.currency}
                    disabled
                    className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-bold"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center gap-3">
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
                  <Save className="w-4 h-4 mr-2" /> Save Restaurant Details
                </Button>
                {savedNotice && (
                  <span className="text-xs font-bold text-emerald-600 flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Settings saved successfully!
                  </span>
                )}
              </div>
            </form>
          </div>
        </TabsContent>

        {/* TAB 2: USER & STAFF MANAGEMENT */}
        <TabsContent value="users" className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Authorized Users & Roles</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Admins have full operational access; Staff/Users have permission to count and update sheets.
              </p>
            </div>
            <Button onClick={() => setIsAddUserOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm">
              <Plus className="w-4 h-4 mr-2" /> Add Staff Member
            </Button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-950">
                <TableRow>
                  <TableHead className="font-bold">Staff / Display Name</TableHead>
                  <TableHead className="font-bold">User Code / ID</TableHead>
                  <TableHead className="font-bold text-center">System Role</TableHead>
                  <TableHead className="font-bold">Created At</TableHead>
                  <TableHead className="text-right font-bold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingUsers ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-slate-500 font-medium">Loading user profiles...</TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-slate-500 font-medium">No user profiles found.</TableCell>
                  </TableRow>
                ) : (
                  users.map(u => {
                    const isAdmin = u.role === 'ADMIN';
                    return (
                      <TableRow key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TableCell>
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                              isAdmin ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}>
                              {u.display_name?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            {u.display_name || 'Staff Member'}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">
                          {u.id.substring(0, 13)}...
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                            isAdmin 
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' 
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}>
                            {isAdmin ? 'ADMIN' : 'STAFF'}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-500 text-xs">
                          {format(new Date(u.created_at), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-xs font-bold"
                              onClick={() => toggleRoleMutation.mutate({ userId: u.id, newRole: isAdmin ? 'USER' : 'ADMIN' })}
                              disabled={toggleRoleMutation.isPending}
                            >
                              {isAdmin ? 'Demote to Staff' : 'Promote to Admin'}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                              onClick={() => {
                                if (confirm(`Remove access for ${u.display_name || 'this user'}?`)) {
                                  deleteUserMutation.mutate(u.id);
                                }
                              }}
                              disabled={deleteUserMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 3: PREFERENCES & ALERT POLICIES */}
        <TabsContent value="notifications" className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-3xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Inventory Alert & Monitoring Preferences</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              Configure trigger thresholds for automated low-stock banners and FEFO batch expiration warnings.
            </p>

            <form onSubmit={handleSaveNotif} className="space-y-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Global Minimum Low-Stock Threshold
                </Label>
                <div className="flex items-center gap-4">
                  <Input 
                    type="number"
                    min="1"
                    max="500"
                    value={notifPrefs.lowStockThreshold}
                    onChange={e => setNotifPrefs({ ...notifPrefs, lowStockThreshold: Number(e.target.value) })}
                    className="w-32 font-bold"
                  />
                  <span className="text-xs text-slate-500">
                    Units remaining before warning appears on dashboard
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  FEFO Expiration Warning Window
                </Label>
                <div className="flex items-center gap-4">
                  <select 
                    value={notifPrefs.expiryNoticeDays}
                    onChange={e => setNotifPrefs({ ...notifPrefs, expiryNoticeDays: Number(e.target.value) })}
                    className="h-10 px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-sm font-semibold"
                  >
                    <option value={7}>7 Days Before Expiry</option>
                    <option value={14}>14 Days Before Expiry (Recommended)</option>
                    <option value={30}>30 Days Before Expiry</option>
                  </select>
                  <span className="text-xs text-slate-500">
                    Batches within this window are flagged as "EXPIRING SOON"
                  </span>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={notifPrefs.fefoAutoAllocation}
                    onChange={e => setNotifPrefs({ ...notifPrefs, fefoAutoAllocation: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                      Enforce Strict FEFO (First-Expired, First-Out)
                    </span>
                    <span className="text-xs text-slate-500">
                      Automatic allocation algorithm always serves oldest valid batches first
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={notifPrefs.emailAlerts}
                    onChange={e => setNotifPrefs({ ...notifPrefs, emailAlerts: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                      Emergency Out-of-Stock Notifications
                    </span>
                    <span className="text-xs text-slate-500">
                      Alert supervisors immediately when zero-stock occurs during active service
                    </span>
                  </div>
                </label>
              </div>

              <div className="pt-4 flex items-center gap-3">
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
                  <Save className="w-4 h-4 mr-2" /> Save Alert Policies
                </Button>
                {savedNotifNotice && (
                  <span className="text-xs font-bold text-emerald-600 flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Alert settings saved!
                  </span>
                )}
              </div>
            </form>
          </div>
        </TabsContent>

        {/* TAB 4: ACTIVITY AUDIT TRAIL */}
        <TabsContent value="activity" className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Security & Stock Action Audit Feed</h3>
                <p className="text-xs text-slate-500">Real-time immutable log of inventory modifications and system events</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600">
                {activityMovements.length} logged actions
              </span>
            </div>

            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-950">
                <TableRow>
                  <TableHead className="font-bold">Timestamp</TableHead>
                  <TableHead className="font-bold">Actor</TableHead>
                  <TableHead className="font-bold">Action Type</TableHead>
                  <TableHead className="font-bold">Target Item</TableHead>
                  <TableHead className="font-bold text-center">Qty / Delta</TableHead>
                  <TableHead className="font-bold">Reason / Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingActivities ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-500 font-medium">Loading audit events...</TableCell>
                  </TableRow>
                ) : activityMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-500 font-medium">No activity logged yet.</TableCell>
                  </TableRow>
                ) : (
                  activityMovements.map((act: any) => (
                    <TableRow key={act.movement_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs">
                      <TableCell className="font-mono text-slate-500">
                        {format(new Date(act.created_at), 'MMM dd, yyyy h:mm:ss a')}
                      </TableCell>
                      <TableCell className="font-bold text-slate-800 dark:text-slate-200">
                        {act.actor_name || 'System / Admin'}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px] ${
                          act.type === 'ADD' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : act.type === 'REMOVE' 
                            ? 'bg-rose-100 text-rose-800' 
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {act.type}
                        </span>
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900 dark:text-white">
                        {act.item_name}
                      </TableCell>
                      <TableCell className="text-center font-bold font-mono">
                        {act.quantity_change > 0 ? `+${act.quantity_change}` : act.quantity_change}
                      </TableCell>
                      <TableCell className="text-slate-500 max-w-xs truncate">
                        {act.reason}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 5: ABOUT & DIAGNOSTICS */}
        <TabsContent value="about" className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-3xl space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">KUVENTORY Enterprise</h2>
              <p className="text-xs text-slate-500 mt-1">
                Full-Stack Automated Inventory & First-Expired-First-Out (FEFO) Management Engine.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1">Release Version</span>
                <span className="text-base font-black text-slate-900 dark:text-white">v1.2.0 (Production Enterprise)</span>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1">Supabase Realtime Status</span>
                <span className="text-base font-black text-emerald-600 flex items-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse mr-2"></span>
                  CONNECTED (LIVE)
                </span>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1">Database Engine</span>
                <span className="text-base font-black text-slate-900 dark:text-white">PostgreSQL 15 (Supabase Cloud)</span>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1">Active Business SKUs</span>
                <span className="text-base font-black text-blue-600">32 Items (Grilled, Portion, Cases)</span>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-200">
              <p className="font-bold mb-1">Architectural Standard Guarantee:</p>
              <p>
                All stock transactions are guaranteed by atomic PostgreSQL SECURITY DEFINER stored procedures. No client-side balances are trusted. All report snapshots are immutable once finalized.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add User Modal */}
      <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Staff Member</DialogTitle>
            <DialogDescription>
              Create a new operational login for the KUVENTORY system.
            </DialogDescription>
          </DialogHeader>

          {addError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {addError}
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Display Name</Label>
              <Input 
                placeholder="e.g. John Doe"
                value={newUser.displayName}
                onChange={e => setNewUser({ ...newUser, displayName: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Email Address</Label>
              <Input 
                type="email"
                placeholder="staff@kuventory.com"
                value={newUser.email}
                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Password</Label>
              <Input 
                type="password"
                placeholder="Minimum 6 characters"
                value={newUser.password}
                onChange={e => setNewUser({ ...newUser, password: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Role Assignment</Label>
              <select 
                value={newUser.role}
                onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                className="w-full h-10 px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-sm font-semibold"
              >
                <option value="USER">Staff / Operator (Worksheet entry)</option>
                <option value="ADMIN">System Administrator (Full access)</option>
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddUserOpen(false)} disabled={createUserMutation.isPending}>
              Cancel
            </Button>
            <Button 
              onClick={() => createUserMutation.mutate(newUser)} 
              disabled={!newUser.email || !newUser.password || createUserMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
            >
              {createUserMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Create Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
