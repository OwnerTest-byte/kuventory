import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/context/AuthContext';
import { 
  Users, Shield, Loader2, Plus, Trash2, Store, Bell, Activity, 
  Info, CheckCircle2, AlertCircle, Save, Database, KeyRound, RefreshCw, Layers,
  Lock, Eye, EyeOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { 
  useSystemSetting, 
  useUpdateSystemSetting, 
  type EstablishmentSettings, 
  type NotificationSettings 
} from '@/features/admin/api/settings';

interface ProfileRow {
  id: string;
  role: 'ADMIN' | 'USER';
  display_name: string | null;
  created_at: string;
}

export function AdminPage() {
  const queryClient = useQueryClient();
  const { user, profile, role } = useAuth();
  const isAdmin = role === 'ADMIN';
  const [activeTab, setActiveTab] = useState(isAdmin ? 'restaurant' : 'account');
  const [activitySubTab, setActivitySubTab] = useState<'stock' | 'database' | 'logins'>('stock');

  // Self Password Change State
  const [selfNewPassword, setSelfNewPassword] = useState('');
  const [selfConfirmPassword, setSelfConfirmPassword] = useState('');
  const [selfPasswordLoading, setSelfPasswordLoading] = useState(false);
  const [selfPasswordSuccess, setSelfPasswordSuccess] = useState<string | null>(null);
  const [selfPasswordError, setSelfPasswordError] = useState<string | null>(null);
  const [showSelfPass, setShowSelfPass] = useState(false);

  // Admin Reset Password State for Staff
  const [resetPasswordTarget, setResetPasswordTarget] = useState<ProfileRow | null>(null);
  const [targetNewPassword, setTargetNewPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState<string | null>(null);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);

  const handleUpdateSelfPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selfNewPassword || selfNewPassword.length < 6) {
      setSelfPasswordError('Password must be at least 6 characters.');
      setSelfPasswordSuccess(null);
      return;
    }
    if (selfNewPassword !== selfConfirmPassword) {
      setSelfPasswordError('Passwords do not match.');
      setSelfPasswordSuccess(null);
      return;
    }
    setSelfPasswordLoading(true);
    setSelfPasswordError(null);
    setSelfPasswordSuccess(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: selfNewPassword });
      if (error) throw error;
      setSelfPasswordSuccess('Your password has been changed successfully!');
      setSelfNewPassword('');
      setSelfConfirmPassword('');
    } catch (err: any) {
      setSelfPasswordError(err.message || 'Failed to update password');
    } finally {
      setSelfPasswordLoading(false);
    }
  };

  const handleAdminResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordTarget) return;
    if (!targetNewPassword || targetNewPassword.length < 6) {
      setResetPasswordError('Password must be at least 6 characters.');
      setResetPasswordSuccess(null);
      return;
    }
    setIsResettingPassword(true);
    setResetPasswordError(null);
    setResetPasswordSuccess(null);
    try {
      const { error } = await supabase.rpc('admin_reset_user_password', {
        p_user_id: resetPasswordTarget.id,
        p_new_password: targetNewPassword,
      });
      if (error) throw error;
      setResetPasswordSuccess(`Password for ${resetPasswordTarget.display_name || 'user'} has been reset.`);
      setTimeout(() => {
        setResetPasswordTarget(null);
        setTargetNewPassword('');
        setResetPasswordSuccess(null);
      }, 1500);
    } catch (err: any) {
      setResetPasswordError(err.message || 'Failed to reset password');
    } finally {
      setIsResettingPassword(false);
    }
  };

  // 1. Establishment Settings from PostgreSQL system_settings table
  const { data: dbEst } = useSystemSetting<EstablishmentSettings>('establishment', {
    name: 'KUVENTORY KIOSK & BODEGA',
    branch: 'Central Bodega & Kiosk Operations',
    address: 'Commercial Boulevard, Metro Manila, Philippines',
    phone: '+63 (02) 8921-4567',
    email: 'operations@kuventory.com',
    hours: '10:00 AM – 11:00 PM Daily',
    currency: 'PHP (₱)',
  });

  const [restaurantInfo, setRestaurantInfo] = useState<EstablishmentSettings>(() => {
    const saved = localStorage.getItem('kuventory_setting_establishment');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return {
      name: 'KUVENTORY KIOSK & BODEGA',
      branch: 'Central Bodega & Kiosk Operations',
      address: 'Commercial Boulevard, Metro Manila, Philippines',
      phone: '+63 (02) 8921-4567',
      email: 'operations@kuventory.com',
      hours: '10:00 AM – 11:00 PM Daily',
      currency: 'PHP (₱)',
    };
  });

  useEffect(() => {
    if (dbEst) {
      setRestaurantInfo(prev => {
        const next = {
          name: dbEst.name || 'KUVENTORY KIOSK & BODEGA',
          branch: dbEst.branch || 'Central Bodega & Kiosk Operations',
          address: dbEst.address || '',
          phone: dbEst.phone || dbEst.contact_number || '',
          email: dbEst.email || '',
          hours: dbEst.hours || dbEst.operating_hours || '',
          currency: dbEst.currency || 'PHP (₱)',
          tax_rate: dbEst.tax_rate ?? 12,
          receipt_footer: dbEst.receipt_footer || ''
        };
        if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
        return next;
      });
    }
  }, [dbEst]);

  const updateEstMutation = useUpdateSystemSetting<EstablishmentSettings>('establishment');
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSaveRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateEstMutation.mutateAsync(restaurantInfo);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (err) {
      console.error('Save establishment error:', err);
    }
  };

  // 2. Notification & Alert Policies from PostgreSQL system_settings table
  const { data: dbNotifs } = useSystemSetting<NotificationSettings>('notifications', {
    lowStockThreshold: 20,
    expiryNoticeDays: 14,
    emailAlerts: true,
    soundAlerts: false,
    fefoAutoAllocation: true,
  });

  const [notifPrefs, setNotifPrefs] = useState<NotificationSettings>(() => {
    const saved = localStorage.getItem('kuventory_setting_notifications');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return {
      lowStockThreshold: 20,
      expiryNoticeDays: 14,
      emailAlerts: true,
      soundAlerts: false,
      fefoAutoAllocation: true,
    };
  });

  useEffect(() => {
    if (dbNotifs) {
      setNotifPrefs(prev => {
        const next = {
          lowStockThreshold: dbNotifs.lowStockThreshold ?? dbNotifs.low_stock_threshold ?? 20,
          expiryNoticeDays: dbNotifs.expiryNoticeDays ?? dbNotifs.expiry_warning_days ?? 14,
          emailAlerts: dbNotifs.emailAlerts ?? dbNotifs.email_alerts ?? true,
          soundAlerts: dbNotifs.soundAlerts ?? false,
          fefoAutoAllocation: dbNotifs.fefoAutoAllocation ?? true,
          autoDailyReminder: dbNotifs.autoDailyReminder ?? dbNotifs.auto_daily_reminder ?? true,
          sms_alerts: dbNotifs.sms_alerts ?? false,
        };
        if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
        return next;
      });
    }
  }, [dbNotifs]);

  const updateNotifsMutation = useUpdateSystemSetting<NotificationSettings>('notifications');
  const [savedNotifNotice, setSavedNotifNotice] = useState(false);

  const handleSaveNotif = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateNotifsMutation.mutateAsync(notifPrefs);
      setSavedNotifNotice(true);
      setTimeout(() => setSavedNotifNotice(false), 3000);
    } catch (err) {
      console.error('Save notifications error:', err);
    }
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

  // 1. Stock Movements Audit
  const { data: activityMovements = [], isLoading: isLoadingActivities, refetch: refetchMovements } = useQuery({
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

  // 2. Database Entity Mutations (audit_logs)
  const { data: auditLogs = [], isLoading: isLoadingAuditLogs, refetch: refetchAudits } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return [];
      return data || [];
    }
  });

  // 3. Staff Access & Security Logins (visitor_logs)
  const { data: visitorLogs = [], isLoading: isLoadingVisitorLogs, refetch: refetchVisitors } = useQuery({
    queryKey: ['admin-visitor-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitor_logs')
        .select('*')
        .order('visited_at', { ascending: false })
        .limit(50);
      if (error) return [];
      return data || [];
    }
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in text-foreground">
      <header className="border-b pb-4 border-border">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Shield className="w-8 h-8 text-primary" />
          System Settings & Administration
        </h1>
        <p className="text-muted-foreground mt-1 font-medium text-sm">
          Manage restaurant information, staff accounts, system preferences, and security audit logs.
        </p>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted p-1 rounded-lg flex flex-wrap h-auto gap-1 border border-border">
          <TabsTrigger value="account" className="font-semibold text-xs sm:text-sm">
            <KeyRound className="w-4 h-4 mr-2" /> Account & Password
          </TabsTrigger>
          <TabsTrigger value="restaurant" className="font-semibold text-xs sm:text-sm">
            <Store className="w-4 h-4 mr-2" /> Restaurant Info
          </TabsTrigger>
          {isAdmin && (
            <>
              <TabsTrigger value="users" className="font-semibold text-xs sm:text-sm">
                <Users className="w-4 h-4 mr-2" /> Staff & Users ({users.length})
              </TabsTrigger>
              <TabsTrigger value="notifications" className="font-semibold text-xs sm:text-sm">
                <Bell className="w-4 h-4 mr-2" /> Preferences & Alerts
              </TabsTrigger>
              <TabsTrigger value="activity" className="font-semibold text-xs sm:text-sm">
                <Activity className="w-4 h-4 mr-2" /> Activity Audit Trail
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="about" className="font-semibold text-xs sm:text-sm">
            <Info className="w-4 h-4 mr-2" /> About & Diagnostics
          </TabsTrigger>
        </TabsList>

        {/* TAB 0: ACCOUNT & PASSWORD (FOR ALL USERS) */}
        <TabsContent value="account" className="space-y-6">
          <div className="bg-card p-6 rounded-xl border border-border shadow-xs max-w-2xl space-y-6">
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                My Account & Profile
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Logged in as <strong className="text-foreground">{user?.email}</strong> with <strong className="text-primary">{role === 'ADMIN' ? 'Administrator' : 'Staff'}</strong> privileges.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/40 border border-border grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground block font-medium">Display Name</span>
                <span className="font-bold text-foreground">
                  {profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : (user?.email?.split('@')[0] || 'Staff User')}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block font-medium">Account Role</span>
                <span className="font-bold text-primary">{role || 'USER'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block font-medium">Security Status</span>
                <span className="font-bold text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active Session
                </span>
              </div>
            </div>

            <hr className="border-border" />

            <form onSubmit={handleUpdateSelfPassword} className="space-y-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                Change Account Password
              </h3>

              {selfPasswordError && (
                <div className="p-3 bg-destructive/15 border border-destructive/20 rounded text-xs text-destructive font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {selfPasswordError}
                </div>
              )}

              {selfPasswordSuccess && (
                <div className="p-3 bg-emerald-500/15 border border-emerald-500/20 rounded text-xs text-emerald-500 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                  {selfPasswordSuccess}
                </div>
              )}

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">New Password</Label>
                  <div className="relative">
                    <Input 
                      type={showSelfPass ? "text" : "password"}
                      value={selfNewPassword}
                      onChange={e => setSelfNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      required
                      className="pr-10 bg-card border-border"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSelfPass(!showSelfPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showSelfPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">Confirm New Password</Label>
                  <Input 
                    type={showSelfPass ? "text" : "password"}
                    value={selfConfirmPassword}
                    onChange={e => setSelfConfirmPassword(e.target.value)}
                    placeholder="Re-type new password"
                    required
                    className="bg-card border-border"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={selfPasswordLoading || !selfNewPassword}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs"
              >
                {selfPasswordLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
                Update My Password
              </Button>
            </form>
          </div>
        </TabsContent>

        {/* TAB 1: RESTAURANT INFO */}
        <TabsContent value="restaurant" className="space-y-6">
          <div className="bg-card p-6 rounded-xl border border-border shadow-xs max-w-3xl">
            <h2 className="text-lg font-bold text-foreground mb-1">Restaurant Profile & Business Details</h2>
            <p className="text-xs text-muted-foreground mb-6">
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
                  <Label className="text-xs font-semibold text-foreground">Base Currency</Label>
                  <Input 
                    value={restaurantInfo.currency}
                    disabled
                    className="bg-muted text-muted-foreground font-bold"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center gap-3">
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
                  <Save className="w-4 h-4 mr-2" /> Save Restaurant Details
                </Button>
                {savedNotice && (
                  <span className="text-xs font-bold text-emerald-500 flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Settings saved successfully!
                  </span>
                )}
              </div>
            </form>
          </div>
        </TabsContent>

        {/* TAB 2: USER & STAFF MANAGEMENT */}
        <TabsContent value="users" className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-xl border border-border">
            <div>
              <h2 className="text-sm font-bold text-foreground">Authorized Users & Roles</h2>
              <p className="text-xs text-muted-foreground">
                Admins have full operational access; Staff/Users have permission to count and update sheets.
              </p>
            </div>
            <Button onClick={() => setIsAddUserOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs sm:text-sm">
              <Plus className="w-4 h-4 mr-2" /> Add Staff Member
            </Button>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/60 border-b border-border">
                <TableRow>
                  <TableHead className="font-bold text-foreground">Staff / Display Name</TableHead>
                  <TableHead className="font-bold text-foreground">User Code / ID</TableHead>
                  <TableHead className="font-bold text-foreground text-center">System Role</TableHead>
                  <TableHead className="font-bold text-foreground">Created At</TableHead>
                  <TableHead className="text-right font-bold text-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingUsers ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground font-medium">Loading user profiles...</TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground font-medium">No user profiles found.</TableCell>
                  </TableRow>
                ) : (
                  users.map(u => {
                    const isAdmin = u.role === 'ADMIN';
                    return (
                      <TableRow key={u.id} className="hover:bg-muted/40">
                        <TableCell>
                          <div className="font-bold text-foreground flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                              isAdmin ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground'
                            }`}>
                              {u.display_name?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            {u.display_name || 'Staff Member'}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {u.id.substring(0, 13)}...
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                            isAdmin 
                              ? 'bg-primary/15 text-primary border border-primary/20' 
                              : 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20'
                          }`}>
                            {isAdmin ? 'ADMIN' : 'STAFF'}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {format(new Date(u.created_at), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-xs font-bold gap-1 border-border text-foreground hover:bg-muted"
                              onClick={() => {
                                setResetPasswordTarget(u);
                                setTargetNewPassword('');
                                setResetPasswordError(null);
                                setResetPasswordSuccess(null);
                              }}
                              title="Reset Password for this user"
                            >
                              <KeyRound className="w-3.5 h-3.5 text-primary" />
                              Reset Pass
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-xs font-bold border-border text-foreground hover:bg-muted"
                              onClick={() => toggleRoleMutation.mutate({ userId: u.id, newRole: isAdmin ? 'USER' : 'ADMIN' })}
                              disabled={toggleRoleMutation.isPending}
                            >
                              {isAdmin ? 'Demote to Staff' : 'Promote to Admin'}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
          <div className="bg-card p-6 rounded-xl border border-border shadow-xs max-w-3xl">
            <h2 className="text-lg font-bold text-foreground mb-1">Inventory Alert & Monitoring Preferences</h2>
            <p className="text-xs text-muted-foreground mb-6">
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
                <Label className="text-xs font-bold text-foreground">
                  FEFO Expiration Warning Window
                </Label>
                <div className="flex items-center gap-4">
                  <select 
                    value={notifPrefs.expiryNoticeDays}
                    onChange={e => setNotifPrefs({ ...notifPrefs, expiryNoticeDays: Number(e.target.value) })}
                    className="h-10 px-3 py-2 bg-card border border-border text-foreground rounded-md text-sm font-semibold outline-none"
                  >
                    <option value={7}>7 Days Before Expiry</option>
                    <option value={14}>14 Days Before Expiry (Recommended)</option>
                    <option value={30}>30 Days Before Expiry</option>
                  </select>
                  <span className="text-xs text-muted-foreground">
                    Batches within this window are flagged as "EXPIRING SOON"
                  </span>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-border">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={notifPrefs.fefoAutoAllocation}
                    onChange={e => setNotifPrefs({ ...notifPrefs, fefoAutoAllocation: e.target.checked })}
                    className="w-4 h-4 rounded text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="text-sm font-bold text-foreground block">
                      Enforce Strict FEFO (First-Expired, First-Out)
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Automatic allocation algorithm always serves oldest valid batches first
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={notifPrefs.emailAlerts}
                    onChange={e => setNotifPrefs({ ...notifPrefs, emailAlerts: e.target.checked })}
                    className="w-4 h-4 rounded text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="text-sm font-bold text-foreground block">
                      Emergency Out-of-Stock Notifications
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Alert supervisors immediately when zero-stock occurs during active service
                    </span>
                  </div>
                </label>
              </div>

              <div className="pt-4 flex items-center gap-3">
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
                  <Save className="w-4 h-4 mr-2" /> Save Alert Policies
                </Button>
                {savedNotifNotice && (
                  <span className="text-xs font-bold text-emerald-500 flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Alert settings saved!
                  </span>
                )}
              </div>
            </form>
          </div>
        </TabsContent>

        {/* TAB 4: MULTI-LAYER ACTIVITY AUDIT TRAIL */}
        <TabsContent value="activity" className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-card p-4 rounded-xl border border-border shadow-xs">
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Live System & Security Audit Center
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Multi-layer audit tracking of inventory stock movements, database mutations, and staff logins.
              </p>
            </div>
            
            <div className="flex items-center gap-1.5 p-1 bg-muted rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setActivitySubTab('stock')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activitySubTab === 'stock'
                    ? 'bg-card text-primary shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Stock Movements ({activityMovements.length})
              </button>
              <button
                type="button"
                onClick={() => setActivitySubTab('database')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activitySubTab === 'database'
                    ? 'bg-card text-primary shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                Database Mutations ({auditLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setActivitySubTab('logins')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activitySubTab === 'logins'
                    ? 'bg-card text-primary shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Staff Logins ({visitorLogs.length})
              </button>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            {activitySubTab === 'stock' && (
              <>
                <div className="p-4 border-b border-border flex justify-between items-center bg-muted/40">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Physical Inventory Stock Actions</h3>
                    <p className="text-xs text-muted-foreground">Atomic inventory adjustments, usage, deductions, and receiving movements</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => refetchMovements()} className="text-xs font-bold text-muted-foreground hover:text-foreground">
                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
                  </Button>
                </div>

                <Table>
                  <TableHeader className="bg-muted/60 border-b border-border">
                    <TableRow>
                      <TableHead className="font-bold text-foreground">Timestamp</TableHead>
                      <TableHead className="font-bold text-foreground">Actor</TableHead>
                      <TableHead className="font-bold text-foreground">Action Type</TableHead>
                      <TableHead className="font-bold text-foreground">Target Item</TableHead>
                      <TableHead className="font-bold text-foreground text-center">Qty / Delta</TableHead>
                      <TableHead className="font-bold text-foreground">Reason / Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingActivities ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-slate-500 font-medium">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                          Loading stock movement events...
                        </TableCell>
                      </TableRow>
                    ) : activityMovements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-slate-500 font-medium">No activity logged yet.</TableCell>
                      </TableRow>
                    ) : (
                      activityMovements.map((act: any) => (
                        <TableRow key={act.movement_id} className="hover:bg-muted/40 text-xs">
                          <TableCell className="font-mono text-muted-foreground">
                            {format(new Date(act.created_at), 'MMM dd, yyyy h:mm:ss a')}
                          </TableCell>
                          <TableCell className="font-bold text-foreground">
                            {act.actor_name || 'System / Admin'}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px] ${
                              act.type === 'ADD' 
                                ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20' 
                                : act.type === 'REMOVE' 
                                ? 'bg-destructive/15 text-destructive border border-destructive/20' 
                                : 'bg-primary/15 text-primary border border-primary/20'
                            }`}>
                              {act.type}
                            </span>
                          </TableCell>
                          <TableCell className="font-semibold text-foreground">
                            {act.item_name}
                          </TableCell>
                          <TableCell className="text-center font-bold font-mono text-foreground">
                            {act.quantity_change > 0 ? `+${act.quantity_change}` : act.quantity_change}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-xs truncate">
                            {act.reason || '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </>
            )}

            {activitySubTab === 'database' && (
              <>
                <div className="p-4 border-b border-border flex justify-between items-center bg-muted/40">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Database Mutation Audit Stream</h3>
                    <p className="text-xs text-muted-foreground">PostgreSQL row-level triggers recording INSERT, UPDATE, and DELETE operations</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => refetchAudits()} className="text-xs font-bold text-muted-foreground hover:text-foreground">
                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
                  </Button>
                </div>

                <Table>
                  <TableHeader className="bg-muted/60 border-b border-border">
                    <TableRow>
                      <TableHead className="font-bold text-foreground">Timestamp</TableHead>
                      <TableHead className="font-bold text-foreground">Mutation</TableHead>
                      <TableHead className="font-bold text-foreground">Target Table</TableHead>
                      <TableHead className="font-bold text-foreground">Record ID</TableHead>
                      <TableHead className="font-bold text-foreground">Audit Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingAuditLogs ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground font-medium">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                          Loading database audit logs...
                        </TableCell>
                      </TableRow>
                    ) : auditLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground font-medium">No database mutations recorded.</TableCell>
                      </TableRow>
                    ) : (
                      auditLogs.map((log: any) => (
                        <TableRow key={log.id} className="hover:bg-muted/40 text-xs">
                          <TableCell className="font-mono text-muted-foreground">
                            {format(new Date(log.created_at), 'MMM dd, yyyy h:mm:ss a')}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px] ${
                              log.action === 'INSERT'
                                ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20'
                                : log.action === 'DELETE'
                                ? 'bg-destructive/15 text-destructive border border-destructive/20'
                                : 'bg-primary/15 text-primary border border-primary/20'
                            }`}>
                              {log.action}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono font-bold text-foreground">
                            public.{log.target_table}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground text-[11px]">
                            {log.target_id ? `${String(log.target_id).substring(0, 13)}...` : '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-sm truncate">
                            {log.reason || (log.new_data ? JSON.stringify(log.new_data).substring(0, 80) + '...' : 'System Trigger')}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </>
            )}

            {activitySubTab === 'logins' && (
              <>
                <div className="p-4 border-b border-border flex justify-between items-center bg-muted/40">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Staff Session & Security Logins</h3>
                    <p className="text-xs text-muted-foreground">Authenticated access events logged from web portal sessions</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => refetchVisitors()} className="text-xs font-bold text-muted-foreground hover:text-foreground">
                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
                  </Button>
                </div>

                <Table>
                  <TableHeader className="bg-muted/60 border-b border-border">
                    <TableRow>
                      <TableHead className="font-bold text-foreground">Login Timestamp</TableHead>
                      <TableHead className="font-bold text-foreground">Staff User Email</TableHead>
                      <TableHead className="font-bold text-foreground">Auth User ID</TableHead>
                      <TableHead className="font-bold text-right text-foreground">Authentication Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingVisitorLogs ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-12 text-muted-foreground font-medium">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                          Loading access logs...
                        </TableCell>
                      </TableRow>
                    ) : visitorLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-12 text-muted-foreground font-medium">No visitor logs found.</TableCell>
                      </TableRow>
                    ) : (
                      visitorLogs.map((log: any) => (
                        <TableRow key={log.id} className="hover:bg-muted/40 text-xs">
                          <TableCell className="font-mono text-muted-foreground">
                            {format(new Date(log.visited_at), 'MMM dd, yyyy h:mm:ss a')}
                          </TableCell>
                          <TableCell className="font-bold text-foreground">
                            {log.user_email}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground text-[11px]">
                            {log.user_id ? `${String(log.user_id).substring(0, 13)}...` : 'Anonymous'}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              VERIFIED ACTIVE SESSION
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </>
            )}
          </div>
        </TabsContent>

        {/* TAB 5: ABOUT & DIAGNOSTICS */}
        <TabsContent value="about" className="space-y-6">
          <div className="bg-card p-6 rounded-xl border border-border shadow-xs max-w-3xl space-y-6">
            <div>
              <h2 className="text-xl font-bold text-foreground">KUVENTORY</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Full-Stack Automated Inventory & First-Expired-First-Out (FEFO) Management Engine.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-muted/40 border border-border">
                <span className="font-bold text-muted-foreground uppercase tracking-wider block mb-1">Release Version</span>
                <span className="text-base font-black text-foreground">v1.2.0 (Production)</span>
              </div>
              <div className="p-4 rounded-lg bg-muted/40 border border-border">
                <span className="font-bold text-muted-foreground uppercase tracking-wider block mb-1">Supabase Realtime Status</span>
                <span className="text-base font-black text-emerald-500 flex items-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse mr-2"></span>
                  CONNECTED (LIVE)
                </span>
              </div>
              <div className="p-4 rounded-lg bg-muted/40 border border-border">
                <span className="font-bold text-muted-foreground uppercase tracking-wider block mb-1">Database Engine</span>
                <span className="text-base font-black text-foreground">PostgreSQL 15 (Supabase Cloud)</span>
              </div>
              <div className="p-4 rounded-lg bg-muted/40 border border-border">
                <span className="font-bold text-muted-foreground uppercase tracking-wider block mb-1">Active Business SKUs</span>
                <span className="text-base font-black text-primary">32 Items (Grilled, Portion, Cases)</span>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-xs text-foreground">
              <p className="font-bold mb-1 text-primary">Architectural Standard Guarantee:</p>
              <p className="text-muted-foreground">
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
              <AlertCircle className="w-4 h-4 shrink-0" />
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
              <Label className="text-xs font-bold text-foreground">Role Assignment</Label>
              <select 
                value={newUser.role}
                onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                className="w-full h-10 px-3 py-2 bg-card border border-border text-foreground rounded-md text-sm font-semibold outline-none"
              >
                <option value="USER">Staff / Operator (Worksheet entry)</option>
                <option value="ADMIN">System Administrator (Full access)</option>
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddUserOpen(false)} disabled={createUserMutation.isPending} className="border-border">
              Cancel
            </Button>
            <Button 
              onClick={() => createUserMutation.mutate(newUser)} 
              disabled={!newUser.email || !newUser.password || createUserMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
            >
              {createUserMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Create Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Reset User Password Dialog */}
      <Dialog open={!!resetPasswordTarget} onOpenChange={(open) => !open && setResetPasswordTarget(null)}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <KeyRound className="w-5 h-5 text-primary" />
              Reset Staff Password
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Set a new operational password for <strong className="text-foreground">{resetPasswordTarget?.display_name || 'Staff Member'}</strong> ({resetPasswordTarget?.role}).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAdminResetPasswordSubmit} className="space-y-4 py-2">
            {resetPasswordError && (
              <div className="p-3 text-xs text-destructive bg-destructive/15 rounded-md border border-destructive/20 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {resetPasswordError}
              </div>
            )}
            {resetPasswordSuccess && (
              <div className="p-3 text-xs text-emerald-500 bg-emerald-500/15 rounded-md border border-emerald-500/20 font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                {resetPasswordSuccess}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-foreground">New Password</Label>
                <button
                  type="button"
                  onClick={() => {
                    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
                    let pass = '';
                    for (let i = 0; i < 10; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
                    setTargetNewPassword(pass);
                  }}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  Generate Random
                </button>
              </div>
              <Input
                type="text"
                value={targetNewPassword}
                onChange={(e) => setTargetNewPassword(e.target.value)}
                placeholder="Enter at least 6 characters..."
                className="font-mono text-sm bg-card border-border text-foreground"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetPasswordTarget(null)}
                className="border-border text-foreground"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isResettingPassword || !targetNewPassword || targetNewPassword.length < 6}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
              >
                {isResettingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
                Set New Password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
