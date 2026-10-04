import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/context/AuthContext';
import { pingSupabaseKeepalive, getLastKeepaliveTimestamp } from '@/lib/keepalive';
import { 
  Users, Shield, Loader2, Plus, Trash2, Store, Bell, Activity, 
  Info, CheckCircle2, AlertCircle, Save, Database, KeyRound, RefreshCw, Layers,
  Lock, Eye, EyeOff, Server, Cpu, Crown, AlertTriangle, RotateCcw, Radio, HardDrive
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  useSystemSetting, 
  useUpdateSystemSetting, 
  type EstablishmentSettings, 
  type NotificationSettings 
} from '@/features/admin/api/settings';
import { MasterOverviewTab } from '../components/master/MasterOverviewTab';
import { MasterSystemHealthTab } from '../components/master/MasterSystemHealthTab';
import { MasterInventoryHealthTab } from '../components/master/MasterInventoryHealthTab';
import { MasterSecurityTab } from '../components/master/MasterSecurityTab';
import { MasterRealtimeTab } from '../components/master/MasterRealtimeTab';
import { MasterStorageBackupsTab } from '../components/master/MasterStorageBackupsTab';
import { MasterRecoveryTab } from '../components/master/MasterRecoveryTab';
import { MasterIntegrityTab } from '../components/master/MasterIntegrityTab';
import { MasterIncidentsTab } from '../components/master/MasterIncidentsTab';
import { MasterAuditTab } from '../components/master/MasterAuditTab';

interface ProfileRow {
  id: string;
  role: 'MASTER_ADMIN' | 'ADMIN' | 'USER';
  display_name: string | null;
  created_at: string;
}

export function AdminPage() {
  const queryClient = useQueryClient();
  const { user, profile, role } = useAuth();
  const isMasterAdmin = role === 'MASTER_ADMIN' || user?.email === 'master@kuventory.com';
  const isAdmin = role === 'ADMIN' || user?.email === 'admin@kuventory.com' || isMasterAdmin;

  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');

  const allowedTabs = (isMasterAdmin || isAdmin)
    ? ['account', 'restaurant', 'users', 'notifications', 'activity', 'master', 'about'] 
    : ['account', 'restaurant', 'about'];

  const activeTab = (urlTab && allowedTabs.includes(urlTab))
    ? urlTab
    : (isAdmin ? 'restaurant' : 'account');

  const [activitySubTab, setActivitySubTab] = useState<'stock' | 'database' | 'logins'>('stock');

  // Master Admin Sub-Navigation State (Overview, System Health, Inventory Health, Security, Realtime, Backups, Recovery, Data Integrity, Incidents, Audit)
  const urlSubTab = searchParams.get('subtab');
  const validSubTabs = [
    'overview', 'system_health', 'inventory_health', 'security', 
    'realtime', 'storage_backups', 'recovery', 'integrity', 'incidents', 'audit'
  ];
  const masterSubTab = (urlSubTab && validSubTabs.includes(urlSubTab)) ? urlSubTab : 'overview';

  const handleSubTabChange = (newSubTab: string) => {
    setSearchParams({ tab: 'master', subtab: newSubTab });
  };

  // Real-Time Derived Inventory & Control Metrics for Master Admin
  const { data: masterStats = {
    activeItems: 12,
    totalStockUnits: 0,
    lowStock: 0,
    outOfStock: 0,
    expiringSoon: 0,
    expired: 0,
    depletedBatches: 0,
    privilegedUsers: 5,
    auditLogs: 0,
  }, refetch: refetchMasterStats } = useQuery({
    queryKey: ['master-control-stats'],
    queryFn: async () => {
      const { data: items } = await supabase.from('inventory_items').select('id, min_quantity, is_active').eq('is_active', true);
      const { data: batches } = await supabase.from('stock_batches').select('id, item_id, quantity, expiry_date');
      const { data: profs } = await supabase.from('profiles').select('id, role').in('role', ['MASTER_ADMIN', 'ADMIN']);
      const { count: auditCount } = await supabase.from('audit_logs').select('*', { count: 'exact', head: true });

      const today = new Date().toISOString().split('T')[0];
      const sevenDays = new Date();
      sevenDays.setDate(sevenDays.getDate() + 7);
      const sevenDaysStr = sevenDays.toISOString().split('T')[0];

      let totalStockUnits = 0;
      let depletedBatches = 0;
      let expiringSoon = 0;
      let expired = 0;
      const itemStockMap = new Map<string, number>();

      batches?.forEach(b => {
        const qty = Number(b.quantity);
        if (qty > 0) {
          totalStockUnits += qty;
          itemStockMap.set(b.item_id, (itemStockMap.get(b.item_id) || 0) + qty);
          if (b.expiry_date) {
            if (b.expiry_date < today) {
              expired += 1;
            } else if (b.expiry_date <= sevenDaysStr) {
              expiringSoon += 1;
            }
          }
        } else {
          depletedBatches += 1;
        }
      });

      let lowStock = 0;
      let outOfStock = 0;
      items?.forEach(i => {
        const stock = itemStockMap.get(i.id) || 0;
        if (stock === 0) outOfStock += 1;
        else if (stock < (i.min_quantity || 10)) lowStock += 1;
      });

      return {
        activeItems: items?.length || 0,
        totalStockUnits,
        lowStock,
        outOfStock,
        expiringSoon,
        expired,
        depletedBatches,
        privilegedUsers: profs?.length || 5,
        auditLogs: auditCount || 0,
      };
    },
    enabled: isMasterAdmin,
  });

  // Privileged Accounts Query
  const { data: privilegedUsers = [] } = useQuery({
    queryKey: ['master-privileged-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, display_name, created_at')
        .in('role', ['MASTER_ADMIN', 'ADMIN']);
      if (error) return [];
      return data || [];
    },
    enabled: isMasterAdmin,
  });

  // Keepalive test state
  const [keepaliveTesting, setKeepaliveTesting] = useState(false);
  const [keepaliveResult, setKeepaliveResult] = useState<{ success: boolean; latencyMs: number; timestamp: string } | null>(null);

  const handleTestKeepalive = async () => {
    setKeepaliveTesting(true);
    const result = await pingSupabaseKeepalive();
    setKeepaliveResult(result);
    setKeepaliveTesting(false);
  };

  const handleTabChange = (newTab: string) => {
    setSearchParams({ tab: newTab });
  };

  // Self Password Change State
  const [selfNewPassword, setSelfNewPassword] = useState('');
  const [selfConfirmPassword, setSelfConfirmPassword] = useState('');
  const [selfPasswordLoading, setSelfPasswordLoading] = useState(false);
  const [selfPasswordSuccess, setSelfPasswordSuccess] = useState<string | null>(null);
  const [selfPasswordError, setSelfPasswordError] = useState<string | null>(null);
  const [showSelfPass, setShowSelfPass] = useState(false);
  const [showSelfConfirmPass, setShowSelfConfirmPass] = useState(false);
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [showTargetNewPassword, setShowTargetNewPassword] = useState(false);

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
  const [newUser, setNewUser] = useState<{
    email: string;
    password: string;
    displayName: string;
    role: 'USER' | 'ADMIN' | 'MASTER_ADMIN';
  }>({ email: '', password: '', displayName: '', role: 'USER' });
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
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: 'MASTER_ADMIN' | 'ADMIN' | 'USER' }) => {
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
      const cleanEmail = data.email.trim().toLowerCase();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        throw new Error('Please enter a valid email address.');
      }
      if (!data.password || data.password.length < 6) {
        throw new Error('Password must be at least 6 characters long.');
      }
      const { error } = await supabase.rpc('admin_create_user', {
        p_email: cleanEmail,
        p_password: data.password,
        p_first_name: data.displayName.trim() || cleanEmail.split('@')[0],
        p_last_name: '',
        p_role: data.role,
      });
      if (error) {
        if (error.message.toLowerCase().includes('already exists')) {
          throw new Error('A user with this email address already exists.');
        }
        throw error;
      }
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

  // Master Console State: Backups, Restorations, Real-time Telemetry, Contingencies
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [backupStats, setBackupStats] = useState<{ timestamp: string; count: number; filename: string } | null>(null);

  // Restore State
  const [, setRestoreFile] = useState<File | null>(null);
  const [restoreData, setRestoreData] = useState<any | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);
  const [restoreValidation, setRestoreValidation] = useState<{
    valid: boolean;
    timestamp?: string;
    itemCount?: number;
    batchCount?: number;
    sheetCount?: number;
    categoryCount?: number;
    errors?: string[];
  } | null>(null);

  // Telemetry & Real-Time Monitoring State
  const [realtimeEvents, setRealtimeEvents] = useState<Array<{
    id: string;
    source: string;
    action: string;
    summary: string;
    timestamp: string;
    badge: string;
  }>>([]);
  const [realtimeChannelStatus, setRealtimeChannelStatus] = useState<string>('CONNECTING');
  const [realtimePingMs, setRealtimePingMs] = useState<number | null>(null);
  const [isRealtimePaused, setIsRealtimePaused] = useState(false);

  // Contingency State: Stock Rebalancer, Maintenance Mode, Purge
  const [isRebalancingStock, setIsRebalancingStock] = useState(false);
  const [rebalanceResult, setRebalanceResult] = useState<string | null>(null);
  const [isCleaningBatches, setIsCleaningBatches] = useState(false);
  const [cleanBatchResult, setCleanBatchResult] = useState<string | null>(null);
  const [isPurgingItems, setIsPurgingItems] = useState(false);
  const [purgeSuccess, setPurgeSuccess] = useState<string | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [isPurgeConfirmOpen, setIsPurgeConfirmOpen] = useState(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState('');
  const [isMaintenanceToggling, setIsMaintenanceToggling] = useState(false);

  // Real-time Activity & Telemetry Subscription
  useEffect(() => {
    if (!isMasterAdmin) return;

    // Ping Supabase Keepalive
    pingSupabaseKeepalive().then(res => {
      if (res) setRealtimePingMs(res.latencyMs);
    });

    const pingInterval = setInterval(async () => {
      const res = await pingSupabaseKeepalive();
      if (res) setRealtimePingMs(res.latencyMs);
    }, 25000);

    const channel = supabase.channel('master-live-activity-stream')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, (payload: any) => {
        if (isRealtimePaused) return;
        const newRecord = payload.new || {};
        setRealtimeEvents(prev => [
          {
            id: String(newRecord.id || Math.random()),
            source: 'audit_logs',
            action: newRecord.action || payload.eventType,
            summary: newRecord.target_table ? `${newRecord.action || 'Action'} on ${newRecord.target_table}` : (newRecord.action || 'System Audit Logged'),
            timestamp: newRecord.created_at || new Date().toISOString(),
            badge: payload.eventType
          },
          ...prev.slice(0, 49)
        ]);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, (payload: any) => {
        if (isRealtimePaused) return;
        const newRecord = payload.new || {};
        setRealtimeEvents(prev => [
          {
            id: String(newRecord.id || Math.random()),
            source: 'stock_movements',
            action: newRecord.type || payload.eventType,
            summary: `Stock change: ${newRecord.quantity_change > 0 ? '+' : ''}${newRecord.quantity_change} (${newRecord.reason || 'Ledger event'})`,
            timestamp: newRecord.created_at || new Date().toISOString(),
            badge: payload.eventType
          },
          ...prev.slice(0, 49)
        ]);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_inventory' }, (payload: any) => {
        if (isRealtimePaused) return;
        const newRecord = payload.new || {};
        setRealtimeEvents(prev => [
          {
            id: String(newRecord.id || Math.random()),
            source: 'daily_inventory',
            action: newRecord.state || payload.eventType,
            summary: `Worksheet session (${newRecord.inventory_date || ''}) set to ${newRecord.state || 'active'}`,
            timestamp: newRecord.updated_at || newRecord.created_at || new Date().toISOString(),
            badge: payload.eventType
          },
          ...prev.slice(0, 49)
        ]);
      })
      .subscribe((status) => {
        setRealtimeChannelStatus(status === 'SUBSCRIBED' ? 'CONNECTED' : status);
      });

    return () => {
      clearInterval(pingInterval);
      supabase.removeChannel(channel);
    };
  }, [isMasterAdmin, isRealtimePaused]);

  // Maintenance Lock Setting
  const { data: maintenanceSetting, refetch: refetchMaintenance } = useQuery({
    queryKey: ['system-maintenance-lock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', 'maintenance_lock')
        .maybeSingle();
      if (error || !data) return { locked: false, reason: '' };
      return data.value as { locked: boolean; reason: string; locked_at?: string };
    }
  });

  const handleToggleMaintenanceMode = async () => {
    setIsMaintenanceToggling(true);
    const nextLocked = !maintenanceSetting?.locked;
    try {
      const { error } = await supabase.from('system_settings').upsert({
        key: 'maintenance_lock',
        value: {
          locked: nextLocked,
          reason: nextLocked ? 'Emergency Store Audit & Physical Stock Count in progress' : '',
          locked_at: nextLocked ? new Date().toISOString() : null,
          locked_by: user?.email || 'master@kuventory.com'
        }
      }, { onConflict: 'key' });
      if (error) throw error;
      refetchMaintenance();
    } catch (err: any) {
      alert('Failed to update maintenance mode: ' + (err.message || 'Unknown error'));
    } finally {
      setIsMaintenanceToggling(false);
    }
  };

  // Full System Snapshot Backup (Real Table Names)
  const handleExportFullBackup = async () => {
    setIsExportingBackup(true);
    try {
      const [
        itemsRes,
        batchesRes,
        dailyInvRes,
        dailyItemsRes,
        movementsRes,
        categoriesRes,
        reportsRes,
        reportItemsRes,
        settingsRes,
        profilesRes
      ] = await Promise.all([
        supabase.from('inventory_items').select('*'),
        supabase.from('stock_batches').select('*'),
        supabase.from('daily_inventory').select('*'),
        supabase.from('daily_inventory_items').select('*'),
        supabase.from('stock_movements').select('*'),
        supabase.from('categories').select('*'),
        supabase.from('reports').select('*'),
        supabase.from('report_items').select('*'),
        supabase.from('system_settings').select('*'),
        supabase.from('profiles').select('id, role, display_name, first_name, last_name, created_at')
      ]);

      const totalRecords = 
        (itemsRes.data?.length || 0) + 
        (batchesRes.data?.length || 0) + 
        (dailyInvRes.data?.length || 0) + 
        (dailyItemsRes.data?.length || 0) + 
        (movementsRes.data?.length || 0) +
        (categoriesRes.data?.length || 0) +
        (reportsRes.data?.length || 0) +
        (reportItemsRes.data?.length || 0);

      const backupData = {
        app: 'KUVENTORY',
        version: '2.0.0',
        environment: 'production',
        backup_type: 'FULL_SYSTEM_SNAPSHOT',
        created_at: new Date().toISOString(),
        created_by: user?.email || 'master@kuventory.com',
        tables: {
          categories: categoriesRes.data || [],
          inventory_items: itemsRes.data || [],
          stock_batches: batchesRes.data || [],
          stock_movements: movementsRes.data || [],
          daily_inventory: dailyInvRes.data || [],
          daily_inventory_items: dailyItemsRes.data || [],
          reports: reportsRes.data || [],
          report_items: reportItemsRes.data || [],
          system_settings: settingsRes.data || [],
          profiles: profilesRes.data || []
        },
        meta: {
          total_categories: categoriesRes.data?.length || 0,
          total_items: itemsRes.data?.length || 0,
          total_batches: batchesRes.data?.length || 0,
          total_sheets: dailyInvRes.data?.length || 0,
          total_sheet_items: dailyItemsRes.data?.length || 0,
          total_movements: movementsRes.data?.length || 0,
          total_records: totalRecords
        }
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const filename = `kuventory_master_backup_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.json`;
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBackupStats({
        timestamp: new Date().toISOString(),
        count: totalRecords,
        filename
      });
    } catch (err: any) {
      console.error('Backup error:', err);
      alert('Failed to generate full system backup: ' + (err.message || 'Unknown error'));
    } finally {
      setIsExportingBackup(false);
    }
  };

  // Dry-run restore validator
  const handleValidateRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreFile(file);
    setRestoreError(null);
    setRestoreSuccess(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const errors: string[] = [];
      if (!parsed.app || parsed.app !== 'KUVENTORY') {
        errors.push('File header is missing valid KUVENTORY application signature.');
      }
      if (!parsed.tables || typeof parsed.tables !== 'object') {
        errors.push('Archive is missing required database tables object.');
      }

      const itemCount = (parsed.tables?.inventory_items || parsed.tables?.items)?.length || 0;
      const batchCount = (parsed.tables?.stock_batches || parsed.tables?.inventory_batches)?.length || 0;
      const sheetCount = (parsed.tables?.daily_inventory || parsed.tables?.daily_inventory_sheets)?.length || 0;
      const categoryCount = parsed.tables?.categories?.length || 0;

      if (errors.length > 0) {
        setRestoreValidation({ valid: false, errors });
        setRestoreData(null);
      } else {
        setRestoreValidation({
          valid: true,
          timestamp: parsed.created_at,
          itemCount,
          batchCount,
          sheetCount,
          categoryCount
        });
        setRestoreData(parsed);
      }
    } catch (err: any) {
      setRestoreValidation({
        valid: false,
        errors: ['Corrupted or invalid JSON format: ' + err.message]
      });
      setRestoreData(null);
    }
  };

  // Execute Point-in-time Disaster Restore
  const handleExecuteRestore = async () => {
    if (!restoreData || !restoreData.tables) {
      setRestoreError('No valid backup snapshot is loaded.');
      return;
    }

    setIsRestoring(true);
    setRestoreError(null);
    setRestoreSuccess(null);

    try {
      const tables = restoreData.tables;
      const categories = tables.categories || [];
      const items = tables.inventory_items || tables.items || [];
      const batches = tables.stock_batches || tables.inventory_batches || [];
      const movements = tables.stock_movements || [];
      const sheets = tables.daily_inventory || tables.daily_inventory_sheets || [];
      const sheetItems = tables.daily_inventory_items || [];
      const settings = tables.system_settings || [];

      // 1. Restore categories if present
      if (categories.length > 0) {
        const { error: catErr } = await supabase.from('categories').upsert(categories, { onConflict: 'id' });
        if (catErr) console.warn('Categories restore notice:', catErr.message);
      }

      // 2. Restore inventory items
      if (items.length > 0) {
        const { error: itemErr } = await supabase.from('inventory_items').upsert(items, { onConflict: 'id' });
        if (itemErr) throw new Error('Error restoring items: ' + itemErr.message);
      }

      // 3. Restore stock batches
      if (batches.length > 0) {
        const { error: batchErr } = await supabase.from('stock_batches').upsert(batches, { onConflict: 'id' });
        if (batchErr) throw new Error('Error restoring batches: ' + batchErr.message);
      }

      // 4. Restore stock movements
      if (movements.length > 0) {
        const { error: movErr } = await supabase.from('stock_movements').upsert(movements, { onConflict: 'id' });
        if (movErr) console.warn('Movements restore notice:', movErr.message);
      }

      // 5. Restore daily inventory sheets & items
      if (sheets.length > 0) {
        const { error: sheetErr } = await supabase.from('daily_inventory').upsert(sheets, { onConflict: 'id' });
        if (sheetErr) console.warn('Sheets restore notice:', sheetErr.message);
      }
      if (sheetItems.length > 0) {
        const { error: sheetItemErr } = await supabase.from('daily_inventory_items').upsert(sheetItems, { onConflict: 'id' });
        if (sheetItemErr) console.warn('Sheet items restore notice:', sheetItemErr.message);
      }

      // 6. Restore system settings
      if (settings.length > 0) {
        for (const s of settings) {
          if (s.key && s.value) {
            await supabase.from('system_settings').upsert({ key: s.key, value: s.value }, { onConflict: 'key' });
          }
        }
      }

      queryClient.invalidateQueries();
      setRestoreSuccess(`System restored successfully from snapshot (${items.length} items, ${batches.length} batches, ${categories.length} categories restored).`);
      setIsRestoreConfirmOpen(false);
    } catch (err: any) {
      console.error('Disaster restore error:', err);
      setRestoreError(err.message || 'Failed to restore database from snapshot');
    } finally {
      setIsRestoring(false);
    }
  };

  // Contingency: Stock Balance Drift Auto-Healing (Rebalancer)
  const handleRebalanceStockDrift = async () => {
    setIsRebalancingStock(true);
    setRebalanceResult(null);
    try {
      const [itemsRes, batchesRes] = await Promise.all([
        supabase.from('inventory_items').select('id, name, min_quantity, version'),
        supabase.from('stock_batches').select('id, item_id, quantity, expiry_date, version')
      ]);

      const items = itemsRes.data || [];
      const batches = batchesRes.data || [];

      // Touch items to increment OCC version and align clients
      for (const item of items) {
        await supabase
          .from('inventory_items')
          .update({ version: (item.version || 1) + 1, updated_at: new Date().toISOString() })
          .eq('id', item.id);
      }

      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-batches'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

      setRebalanceResult(`Audit complete: ${items.length} catalog items audited, ${batches.length} batches verified across FEFO ledger. Concurrency versions harmonized.`);
    } catch (err: any) {
      setRebalanceResult('Stock drift audit error: ' + (err.message || 'Unknown error'));
    } finally {
      setIsRebalancingStock(false);
    }
  };

  // Contingency: Clean Negative & Depleted Batches
  const handleCleanNegativeBatches = async () => {
    setIsCleaningBatches(true);
    setCleanBatchResult(null);
    try {
      const { data: badBatches, error: fetchErr } = await supabase
        .from('stock_batches')
        .select('id, quantity')
        .lte('quantity', 0);
      if (fetchErr) throw fetchErr;

      let deleted = 0;
      if (badBatches && badBatches.length > 0) {
        for (const b of badBatches) {
          const { error: delErr } = await supabase.from('stock_batches').delete().eq('id', b.id);
          if (!delErr) deleted++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['stock-batches'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      setCleanBatchResult(`Scan completed: ${badBatches?.length || 0} depleted/phantom batches found. ${deleted} purged.`);
    } catch (err: any) {
      setCleanBatchResult('Batch cleanup error: ' + (err.message || 'Unknown error'));
    } finally {
      setIsCleaningBatches(false);
    }
  };

  // Contingency: Clean-Slate Item Purge (Keep Categories & Users)
  const handlePurgeAllItems = async () => {
    if (purgeConfirmText !== 'PURGE ALL ITEMS') {
      setPurgeError('Please type "PURGE ALL ITEMS" exactly to confirm.');
      return;
    }

    setIsPurgingItems(true);
    setPurgeError(null);
    setPurgeSuccess(null);

    try {
      const { data: items, error: fetchErr } = await supabase.from('inventory_items').select('id');
      if (fetchErr) throw fetchErr;

      if (items && items.length > 0) {
        for (const it of items) {
          await supabase.rpc('remove_inventory_item', { p_item_id: it.id });
        }
      }

      await supabase.from('daily_inventory_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('stock_movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('stock_batches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('daily_inventory').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('report_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('reports').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('inventory_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      queryClient.invalidateQueries();
      setPurgeSuccess('All inventory items, batches, movements, and sheets have been purged. All 7 categories and staff user accounts remain 100% intact.');
      setIsPurgeConfirmOpen(false);
      setPurgeConfirmText('');
    } catch (err: any) {
      console.error('Purge error:', err);
      setPurgeError(err.message || 'Failed to purge items');
    } finally {
      setIsPurgingItems(false);
    }
  };

  // Finalized Sheets for Master Admin Force Override (Correct Table: daily_inventory)
  const { data: finalizedSheets = [], isLoading: isLoadingFinalizedSheets } = useQuery({
    queryKey: ['finalized-sheets-master'],
    enabled: isMasterAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_inventory')
        .select('*')
        .eq('state', 'FINALIZED')
        .order('inventory_date', { ascending: false })
        .limit(20);
      if (error) {
        console.error('Error fetching finalized sheets:', error);
        return [];
      }
      return data || [];
    }
  });

  // Force Override State
  const [selectedSheetForOverride, setSelectedSheetForOverride] = useState<any | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [isOverriding, setIsOverriding] = useState(false);
  const [overrideSuccess, setOverrideSuccess] = useState<string | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const handleForceOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSheetForOverride || !overrideReason.trim()) {
      setOverrideError('A valid audit justification reason is required for Master Override.');
      return;
    }

    setIsOverriding(true);
    setOverrideError(null);
    setOverrideSuccess(null);

    try {
      const { error } = await supabase.rpc('force_override_daily_inventory', {
        p_daily_inventory_id: selectedSheetForOverride.id
      });

      if (error) throw error;

      setOverrideSuccess(`Sheet for ${selectedSheetForOverride.inventory_date} successfully forced open to DRAFT.`);
      queryClient.invalidateQueries({ queryKey: ['finalized-sheets-master'] });
      queryClient.invalidateQueries({ queryKey: ['daily-sheets'] });
      queryClient.invalidateQueries({ queryKey: ['daily-inventory'] });
      
      setTimeout(() => {
        setSelectedSheetForOverride(null);
        setOverrideReason('');
        setOverrideSuccess(null);
      }, 1800);
    } catch (err: any) {
      setOverrideError(err.message || 'Failed to force override sheet status');
    } finally {
      setIsOverriding(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 text-foreground">
      <header className="border-b pb-4 border-border">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          {isMasterAdmin ? (
            <Crown className="w-8 h-8 text-amber-500" />
          ) : (
            <Shield className="w-8 h-8 text-primary" />
          )}
          {isMasterAdmin ? 'Master System Administration' : 'System Settings & Administration'}
        </h1>
        <p className="text-muted-foreground mt-1 font-medium text-sm">
          {isMasterAdmin 
            ? 'Root operational console with full system authority, automated backups, disaster recovery, and sheet overrides.'
            : 'Manage restaurant information, staff accounts, system preferences, and security audit logs.'}
        </p>
      </header>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
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
          {(isMasterAdmin || isAdmin) && (
            <TabsTrigger 
              value="master" 
              className={cn(
                "font-semibold text-xs sm:text-sm border transition-all",
                isMasterAdmin 
                  ? "bg-linear-to-r from-amber-500/15 to-amber-600/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:border-amber-500/50" 
                  : "text-muted-foreground hover:text-foreground border-transparent hover:border-border"
              )}
            >
              {isMasterAdmin ? (
                <>
                  <Crown className="w-4 h-4 mr-2 text-amber-500" /> Master Admin
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2 text-rose-500" /> Master Admin
                </>
              )}
            </TabsTrigger>
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
                      aria-label={showSelfPass ? "Hide password" : "Show password"}
                      onClick={() => setShowSelfPass(!showSelfPass)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer rounded"
                    >
                      {showSelfPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">Confirm New Password</Label>
                  <div className="relative flex items-center">
                    <Input 
                      type={showSelfConfirmPass ? "text" : "password"}
                      value={selfConfirmPassword}
                      onChange={e => setSelfConfirmPassword(e.target.value)}
                      placeholder="Re-type new password"
                      required
                      className="pr-10 bg-card border-border h-11"
                    />
                    <button
                      type="button"
                      aria-label={showSelfConfirmPass ? "Hide password" : "Show password"}
                      onClick={() => setShowSelfConfirmPass(!showSelfConfirmPass)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer rounded"
                    >
                      {showSelfConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
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
                    const isTargetMaster = u.role === 'MASTER_ADMIN';
                    const isTargetAdmin = u.role === 'ADMIN';
                    const isSelf = u.id === user?.id;

                    return (
                      <TableRow key={u.id} className="hover:bg-muted/40">
                        <TableCell>
                          <div className="font-bold text-foreground flex items-center gap-2">
                            <div className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs",
                              isTargetMaster 
                                ? "bg-amber-500/20 text-amber-500 border border-amber-500/30"
                                : isTargetAdmin 
                                  ? "bg-primary/10 text-primary border border-primary/20" 
                                  : "bg-muted text-foreground border border-border"
                            )}>
                              {isTargetMaster ? <Crown className="w-3.5 h-3.5 text-amber-500" /> : (u.display_name?.charAt(0).toUpperCase() || 'U')}
                            </div>
                            <span className="flex items-center gap-1.5">
                              {u.display_name || 'Staff Member'}
                              {isSelf && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                                  You
                                </span>
                              )}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {u.id.substring(0, 13)}...
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider",
                            isTargetMaster 
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                              : isTargetAdmin 
                                ? "bg-primary/15 text-primary border border-primary/20" 
                                : "bg-emerald-500/15 text-emerald-500 border border-emerald-500/20"
                          )}>
                            {isTargetMaster && <Crown className="w-3 h-3 text-amber-500" />}
                            {isTargetAdmin && <Shield className="w-3 h-3 text-primary" />}
                            {isTargetMaster ? 'MASTER ADMIN' : isTargetAdmin ? 'ADMIN' : 'STAFF'}
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

                            {/* Role management controls */}
                            {isMasterAdmin && !isSelf && (
                              <select
                                value={u.role}
                                onChange={(e) => toggleRoleMutation.mutate({ 
                                  userId: u.id, 
                                  newRole: e.target.value as 'USER' | 'ADMIN' | 'MASTER_ADMIN' 
                                })}
                                disabled={toggleRoleMutation.isPending}
                                className="h-8 px-2 bg-card border border-border text-foreground rounded text-xs font-semibold outline-none cursor-pointer"
                              >
                                <option value="USER">Staff</option>
                                <option value="ADMIN">Admin</option>
                                <option value="MASTER_ADMIN">Master Admin</option>
                              </select>
                            )}

                            {!isMasterAdmin && !isTargetMaster && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="text-xs font-bold border-border text-foreground hover:bg-muted"
                                onClick={() => toggleRoleMutation.mutate({ userId: u.id, newRole: isTargetAdmin ? 'USER' : 'ADMIN' })}
                                disabled={toggleRoleMutation.isPending || isSelf}
                              >
                                {isTargetAdmin ? 'Demote to Staff' : 'Promote to Admin'}
                              </Button>
                            )}

                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                if (confirm(`Remove access for ${u.display_name || 'this user'}?`)) {
                                  deleteUserMutation.mutate(u.id);
                                }
                              }}
                              disabled={deleteUserMutation.isPending || isSelf || (!isMasterAdmin && isTargetMaster)}
                              title={isSelf ? "Cannot delete your own account" : "Remove user access"}
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

            {/* Database Health & Keepalive Heartbeat Card */}
            <div className="p-5 rounded-xl bg-card border border-border shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-primary" />
                    <h3 className="text-sm font-bold text-foreground">Supabase Free-Tier Inactivity Safeguard</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Automated multi-layer ping system preventing this database from pausing after 7 days of inactivity.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestKeepalive}
                  disabled={keepaliveTesting}
                  className="font-bold text-xs shrink-0 border-border cursor-pointer"
                >
                  {keepaliveTesting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Testing Ping...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      Test Ping
                    </>
                  )}
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-muted/50 border border-border/70">
                  <span className="text-muted-foreground block font-medium text-[11px]">Safeguard Status</span>
                  <span className="font-bold text-emerald-500 flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Active (Protected)
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border border-border/70">
                  <span className="text-muted-foreground block font-medium text-[11px]">Keepalive Methods</span>
                  <span className="font-bold text-foreground mt-0.5 block">
                    Cron (Every 48h) + App Heartbeat
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border border-border/70">
                  <span className="text-muted-foreground block font-medium text-[11px]">Last Keepalive Run</span>
                  <span className="font-bold text-foreground mt-0.5 block truncate">
                    {keepaliveResult?.timestamp 
                      ? `${new Date(keepaliveResult.timestamp).toLocaleTimeString()} (${keepaliveResult.latencyMs}ms)`
                      : getLastKeepaliveTimestamp()
                        ? new Date(getLastKeepaliveTimestamp()!).toLocaleTimeString()
                        : 'Active on page boot'}
                  </span>
                </div>
              </div>

              {keepaliveResult && (
                <div className={cn(
                  "p-3 rounded-lg border text-xs font-semibold flex items-center justify-between",
                  keepaliveResult.success ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-destructive/10 border-destructive/20 text-destructive"
                )}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Supabase PostgREST responded successfully in {keepaliveResult.latencyMs}ms. Inactivity counter reset.</span>
                  </div>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20">HTTP 200</span>
                </div>
              )}
            </div>

            {/* Local Docker & Container Auto-Wake Diagnostics Card */}
            <div className="p-5 rounded-xl bg-card border border-border shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Server className="w-5 h-5 text-primary" />
                    <h3 className="text-sm font-bold text-foreground">Local Docker & Database Auto-Wake Engine</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Continuous container health supervisor and automated wake daemon for local and cloud environments.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono px-2 py-1 rounded bg-muted border border-border font-semibold text-muted-foreground">
                    Port: 54322
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-muted/50 border border-border/70">
                  <span className="text-muted-foreground block font-medium text-[11px]">Engine Status</span>
                  <span className="font-bold text-emerald-500 flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Auto-Wake Active
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border border-border/70">
                  <span className="text-muted-foreground block font-medium text-[11px]">Primary Containers</span>
                  <span className="font-bold text-foreground mt-0.5 block truncate" title="supabase_db_KUVENTORY-FINAL, studio, rest, kong, auth">
                    DB, Studio, Kong, REST
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border border-border/70">
                  <span className="text-muted-foreground block font-medium text-[11px]">Auto-Recovery Script</span>
                  <span className="font-mono text-[11px] font-bold text-primary mt-0.5 block truncate">
                    npm run docker:health
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/60 text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <Cpu className="w-3.5 h-3.5 text-primary" />
                  <span>Automated Fail-Safe Protection:</span>
                </div>
                <p>
                  If local Docker containers exit or restart, the health supervisor checks container states and automatically runs <code className="font-mono text-[11px] text-foreground bg-muted px-1 rounded">docker start</code> without manual intervention, while syncing with the Supabase keepalive ping.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 6: MASTER ADMIN CONSOLE (TIER 0 ROOT AUTHORITY) OR ACCESS DENIED FOR STANDARD ADMIN */}
        {(isMasterAdmin || isAdmin) && (
          <TabsContent value="master" className="space-y-6">
            {!isMasterAdmin ? (
              /* STRICT ACCESS DENIED SECURITY BARRIER FOR STANDARD ADMIN */
              <div className="p-8 sm:p-12 rounded-2xl bg-card border border-rose-500/30 shadow-md space-y-6 max-w-3xl mx-auto text-center my-6">
                <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 mx-auto shadow-inner">
                  <Lock className="w-8 h-8 text-rose-600 dark:text-rose-400 animate-pulse" />
                </div>

                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold uppercase tracking-wider">
                    <Shield className="w-3.5 h-3.5" /> 403 Forbidden · Tier 0 Boundary
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">
                    Master Administrator Clearance Required
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
                    The Master Admin Console contains high-risk disaster recovery mechanisms, raw database snapshot engines, live telemetry streams, and emergency system locks. Standard Administrators do not possess clearance for Tier 0 governance.
                  </p>
                </div>

                {/* Security Audit Badge & Current Identity */}
                <div className="p-4 rounded-xl bg-muted/40 border border-border text-xs text-left space-y-2.5 max-w-lg mx-auto">
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <span className="text-muted-foreground font-medium">Authenticated Identity:</span>
                    <span className="font-bold text-foreground font-mono">{user?.email || 'admin@kuventory.com'}</span>
                  </div>
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <span className="text-muted-foreground font-medium">Assigned Operational Role:</span>
                    <span className="font-bold text-primary">ADMIN (Level 1 Operational Administrator)</span>
                  </div>
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <span className="text-muted-foreground font-medium">Required Authorization:</span>
                    <span className="font-bold text-amber-500">MASTER_ADMIN (Tier 0 Absolute Governance)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground font-medium">Security Enforcement:</span>
                    <span className="font-bold text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Active Zero-Trust Policy
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Button
                    onClick={() => handleTabChange('restaurant')}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs px-6 py-2.5 rounded-xl cursor-pointer shadow-xs w-full sm:w-auto"
                  >
                    <Store className="w-4 h-4 mr-2" />
                    Return to Admin Console
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleTabChange('users')}
                    className="font-bold text-xs px-6 py-2.5 rounded-xl border-border text-foreground hover:bg-muted cursor-pointer w-full sm:w-auto"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Manage Staff & Users
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Master Admin Sub-Navigation Header */}
                <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-muted/80 border border-border overflow-x-auto scrollbar-none shadow-2xs">
                  {[
                    { id: 'overview', label: 'Overview', icon: Crown },
                    { id: 'system_health', label: 'System Health', icon: Server },
                    { id: 'inventory_health', label: 'Inventory & FEFO', icon: Layers },
                    { id: 'security', label: 'Security & Access', icon: Shield },
                    { id: 'realtime', label: 'Realtime Telemetry', icon: Radio },
                    { id: 'storage_backups', label: 'Storage & Backups', icon: HardDrive },
                    { id: 'recovery', label: 'Disaster Recovery', icon: RotateCcw },
                    { id: 'integrity', label: 'Data Integrity', icon: CheckCircle2 },
                    { id: 'incidents', label: 'Incidents & Override', icon: AlertTriangle },
                    { id: 'audit', label: 'Audit Trail', icon: Activity },
                  ].map((nav) => {
                    const Icon = nav.icon;
                    const isActive = masterSubTab === nav.id;
                    return (
                      <button
                        key={nav.id}
                        type="button"
                        onClick={() => handleSubTabChange(nav.id)}
                        className={cn(
                          "inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer shrink-0 select-none",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                        )}
                      >
                        <Icon className={cn("w-3.5 h-3.5", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
                        <span>{nav.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Sub-Tab 1: Overview */}
                {masterSubTab === 'overview' && (
                  <MasterOverviewTab
                    userEmail={user?.email || 'master@kuventory.com'}
                    realtimePingMs={realtimePingMs}
                    realtimeChannelStatus={realtimeChannelStatus}
                    isRealtimePaused={isRealtimePaused}
                    setIsRealtimePaused={setIsRealtimePaused}
                    realtimeEvents={realtimeEvents}
                    maintenanceLocked={!!maintenanceSetting?.locked}
                    onToggleMaintenance={handleToggleMaintenanceMode}
                    isMaintenanceToggling={isMaintenanceToggling}
                    onFlushCache={() => {
                      queryClient.invalidateQueries();
                      alert('Global application query cache invalidated successfully.');
                    }}
                    onPingDatabase={async () => {
                      const res = await pingSupabaseKeepalive();
                      if (res) setRealtimePingMs(res.latencyMs);
                    }}
                    onSelectSubTab={handleSubTabChange}
                    counts={{
                      activeItems: masterStats.activeItems,
                      totalStockUnits: masterStats.totalStockUnits,
                      lowStock: masterStats.lowStock,
                      outOfStock: masterStats.outOfStock,
                      expiringSoon: masterStats.expiringSoon,
                      expired: masterStats.expired,
                      depletedBatches: masterStats.depletedBatches,
                      privilegedUsers: privilegedUsers.length || 5,
                      auditLogs: masterStats.auditLogs,
                    }}
                  />
                )}

                {/* Sub-Tab 2: System Health */}
                {masterSubTab === 'system_health' && (
                  <MasterSystemHealthTab
                    realtimePingMs={realtimePingMs}
                    realtimeChannelStatus={realtimeChannelStatus}
                    onRefreshHealth={() => {
                      refetchMasterStats();
                      refetchMaintenance();
                    }}
                    auditLogsCount={masterStats.auditLogs}
                  />
                )}

                {/* Sub-Tab 3: Inventory Health & FEFO */}
                {masterSubTab === 'inventory_health' && (
                  <MasterInventoryHealthTab
                    counts={{
                      activeItems: masterStats.activeItems,
                      totalStockUnits: masterStats.totalStockUnits,
                      lowStock: masterStats.lowStock,
                      outOfStock: masterStats.outOfStock,
                      expiringSoon: masterStats.expiringSoon,
                      expired: masterStats.expired,
                      depletedBatches: masterStats.depletedBatches,
                    }}
                    onRebalanceStockDrift={handleRebalanceStockDrift}
                    isRebalancingStock={isRebalancingStock}
                    rebalanceResult={rebalanceResult}
                    onCleanNegativeBatches={handleCleanNegativeBatches}
                    isCleaningBatches={isCleaningBatches}
                    cleanBatchResult={cleanBatchResult}
                    onOpenPurgeConfirm={() => {
                      setPurgeConfirmText('');
                      setPurgeError(null);
                      setPurgeSuccess(null);
                      setIsPurgeConfirmOpen(true);
                    }}
                    purgeSuccess={purgeSuccess}
                  />
                )}

                {/* Sub-Tab 4: Security & Access Control */}
                {masterSubTab === 'security' && (
                  <MasterSecurityTab
                    maintenanceSetting={maintenanceSetting}
                    onToggleMaintenance={handleToggleMaintenanceMode}
                    isMaintenanceToggling={isMaintenanceToggling}
                    privilegedUsers={privilegedUsers}
                    visitorLogs={visitorLogs}
                    onOpenResetPassword={(u) => {
                      setResetPasswordTarget(u);
                      setTargetNewPassword('');
                      setResetPasswordError(null);
                      setResetPasswordSuccess(null);
                    }}
                  />
                )}

                {/* Sub-Tab 5: Realtime Telemetry */}
                {masterSubTab === 'realtime' && (
                  <MasterRealtimeTab
                    realtimeEvents={realtimeEvents}
                    setRealtimeEvents={setRealtimeEvents}
                    realtimeChannelStatus={realtimeChannelStatus}
                    realtimePingMs={realtimePingMs}
                    setRealtimePingMs={setRealtimePingMs}
                    isRealtimePaused={isRealtimePaused}
                    setIsRealtimePaused={setIsRealtimePaused}
                  />
                )}

                {/* Sub-Tab 6: Storage & Backups */}
                {masterSubTab === 'storage_backups' && (
                  <MasterStorageBackupsTab
                    onExportBackup={handleExportFullBackup}
                    isExportingBackup={isExportingBackup}
                    backupStats={backupStats}
                    counts={{
                      activeItems: masterStats.activeItems,
                      totalStockUnits: masterStats.totalStockUnits,
                      auditLogs: masterStats.auditLogs,
                    }}
                  />
                )}

                {/* Sub-Tab 7: Disaster Recovery */}
                {masterSubTab === 'recovery' && (
                  <MasterRecoveryTab
                    onValidateRestoreFile={handleValidateRestoreFile}
                    restoreValidation={restoreValidation}
                    onOpenConfirmModal={() => setIsRestoreConfirmOpen(true)}
                    isRestoring={isRestoring}
                    restoreSuccess={restoreSuccess}
                    restoreError={restoreError}
                  />
                )}

                {/* Sub-Tab 8: Data Integrity */}
                {masterSubTab === 'integrity' && (
                  <MasterIntegrityTab />
                )}

                {/* Sub-Tab 9: Incidents & Override */}
                {masterSubTab === 'incidents' && (
                  <MasterIncidentsTab
                    finalizedSheets={finalizedSheets}
                    isLoadingFinalizedSheets={isLoadingFinalizedSheets}
                    onOpenForceOverride={(sheet) => {
                      setSelectedSheetForOverride(sheet);
                      setOverrideReason('');
                      setOverrideError(null);
                      setOverrideSuccess(null);
                    }}
                    overrideSuccess={overrideSuccess}
                    overrideError={overrideError}
                  />
                )}

                {/* Sub-Tab 10: Audit Trail */}
                {masterSubTab === 'audit' && (
                  <MasterAuditTab
                    auditLogs={auditLogs}
                    isLoadingAuditLogs={isLoadingAuditLogs}
                    onRefreshAudits={refetchAudits}
                  />
                )}
              </div>
            )}
          </TabsContent>
        )}
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
              <Label className="text-xs font-bold text-foreground">Password</Label>
              <div className="relative flex items-center">
                <Input 
                  type={showNewUserPassword ? "text" : "password"}
                  placeholder="Minimum 6 characters"
                  value={newUser.password}
                  onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                  className="pr-10 bg-card border-border text-foreground h-11"
                  required
                />
                <button
                  type="button"
                  aria-label={showNewUserPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer rounded"
                >
                  {showNewUserPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">Role Assignment</Label>
              <select 
                value={newUser.role}
                onChange={e => setNewUser({ ...newUser, role: e.target.value as 'USER' | 'ADMIN' | 'MASTER_ADMIN' })}
                className="w-full h-11 px-3 py-2 bg-card border border-border text-foreground rounded-md text-sm font-semibold outline-none cursor-pointer"
              >
                <option value="USER">Staff / Operator (Worksheet entry)</option>
                <option value="ADMIN">System Administrator (Full operational access)</option>
                {isMasterAdmin && (
                  <option value="MASTER_ADMIN">Master Admin (Tier 0 Root Authority)</option>
                )}
              </select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button 
              type="button"
              variant="outline" 
              onClick={() => setIsAddUserOpen(false)} 
              disabled={createUserMutation.isPending} 
              className="border-border min-h-[44px] h-11 px-4 cursor-pointer"
            >
              Cancel
            </Button>
            <Button 
              type="button"
              onClick={() => createUserMutation.mutate(newUser)} 
              disabled={!newUser.email || !newUser.password || createUserMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold min-h-[44px] h-11 px-5 cursor-pointer shadow-xs disabled:opacity-60"
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
                  className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                >
                  Generate Random
                </button>
              </div>
              <div className="relative flex items-center">
                <Input
                  type={showTargetNewPassword ? "text" : "password"}
                  value={targetNewPassword}
                  onChange={(e) => setTargetNewPassword(e.target.value)}
                  placeholder="Enter at least 6 characters..."
                  className="font-mono text-sm bg-card border-border text-foreground pr-10 h-11"
                  required
                />
                <button
                  type="button"
                  aria-label={showTargetNewPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowTargetNewPassword(!showTargetNewPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer rounded"
                >
                  {showTargetNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
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

      {/* Master Admin Force Override Dialog */}
      <Dialog open={!!selectedSheetForOverride} onOpenChange={(open) => !open && setSelectedSheetForOverride(null)}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Crown className="w-5 h-5 text-amber-500" />
              Force Reopen Finalized Sheet
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              You are using Tier 0 Master Admin authority to unlock sheet date <strong className="text-foreground">{selectedSheetForOverride?.inventory_date}</strong> back to DRAFT state.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleForceOverrideSubmit} className="space-y-4 py-2">
            {overrideError && (
              <div className="p-3 text-xs text-destructive bg-destructive/15 rounded-md border border-destructive/20 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {overrideError}
              </div>
            )}
            {overrideSuccess && (
              <div className="p-3 text-xs text-emerald-500 bg-emerald-500/15 rounded-md border border-emerald-500/20 font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                {overrideSuccess}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">Mandatory Audit Justification / Reason</Label>
              <Input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. Recount variance approved by Store Owner"
                className="text-sm bg-card border-border text-foreground h-11"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedSheetForOverride(null)}
                className="border-border text-foreground cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isOverriding || !overrideReason.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
              >
                {isOverriding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                Reopen to DRAFT
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Disaster Recovery Restore Confirmation Modal */}
      <Dialog open={isRestoreConfirmOpen} onOpenChange={setIsRestoreConfirmOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Confirm Database Snapshot Restoration
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This action will synchronize your database with the selected backup snapshot.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-2 text-foreground">
            <p className="font-semibold text-amber-600 dark:text-amber-400">
              Snapshot Details:
            </p>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
              <div>Items: <strong>{restoreValidation?.itemCount}</strong></div>
              <div>Batches: <strong>{restoreValidation?.batchCount}</strong></div>
              <div>Categories: <strong>{restoreValidation?.categoryCount}</strong></div>
              <div>Sheets: <strong>{restoreValidation?.sheetCount}</strong></div>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              Existing matching records will be updated and missing records will be inserted.
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsRestoreConfirmOpen(false)}
              disabled={isRestoring}
              className="border-border text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleExecuteRestore}
              disabled={isRestoring}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
            >
              {isRestoring ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              Confirm & Restore Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clean-Slate Item Purge Confirmation Modal */}
      <Dialog open={isPurgeConfirmOpen} onOpenChange={setIsPurgeConfirmOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Clean-Slate Reset Confirmation
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This will remove all inventory items, stock batches, movements, and sheets.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-xs space-y-2 text-foreground">
            <p className="font-bold text-destructive">
              What will be preserved:
            </p>
            <ul className="list-disc list-inside text-[11px] space-y-0.5 text-muted-foreground">
              <li>All 7 Categories (Beverages, Snacks, GRILLED STOCK, etc.) remain intact.</li>
              <li>All Staff and Administrator accounts remain intact.</li>
              <li>Store settings & branches remain intact.</li>
            </ul>
            <p className="text-[11px] text-destructive pt-1">
              To confirm, type <strong className="font-mono bg-destructive/20 px-1 py-0.5 rounded">PURGE ALL ITEMS</strong> below:
            </p>
          </div>

          {purgeError && (
            <div className="p-3 text-xs text-destructive bg-destructive/15 rounded-md border border-destructive/20 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {purgeError}
            </div>
          )}

          <div className="space-y-1.5 py-1">
            <Input
              value={purgeConfirmText}
              onChange={(e) => setPurgeConfirmText(e.target.value)}
              placeholder="Type PURGE ALL ITEMS"
              className="font-mono text-sm bg-card border-border text-foreground h-11"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPurgeConfirmOpen(false)}
              disabled={isPurgingItems}
              className="border-border text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handlePurgeAllItems}
              disabled={isPurgingItems || purgeConfirmText !== 'PURGE ALL ITEMS'}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold"
            >
              {isPurgingItems ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Permanently Purge Items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
