import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/context/AuthContext';
import { pingSupabaseKeepalive } from '@/lib/keepalive';
import { SuperAdminControlCenter } from '../components/super/SuperAdminControlCenter';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMaintenanceStatus, setMaintenanceLockdown } from '../services/maintenanceService';
import { exportFullSystemBackup } from '../services/superAdminService';

export function SuperAdminPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userEmail = user?.email || 'superadmin@kuventory.com';

  // 1. Maintenance Status Query & Mutation
  const [isMaintenanceToggling, setIsMaintenanceToggling] = useState(false);
  const { data: maintenanceSetting, refetch: refetchMaintenance } = useQuery({
    queryKey: ['system-maintenance-lock'],
    queryFn: getMaintenanceStatus,
  });

  const [pageError, setPageError] = useState<string | null>(null);

  const handleToggleMaintenanceMode = async (customReason?: string) => {
    setIsMaintenanceToggling(true);
    setPageError(null);
    const nextLocked = !maintenanceSetting?.locked;
    try {
      await setMaintenanceLockdown(
        nextLocked, 
        customReason || (nextLocked ? 'Manual emergency maintenance lockdown activated by Super Admin' : ''), 
        userEmail
      );
      await refetchMaintenance();
      queryClient.invalidateQueries({ queryKey: ['system-maintenance-lock'] });
    } catch (err: any) {
      setPageError('Failed to update maintenance mode: ' + (err.message || 'Unknown error'));
    } finally {
      setIsMaintenanceToggling(false);
    }
  };

  // 2. Real-time Telemetry & Stream
  const [realtimeEvents, setRealtimeEvents] = useState<any[]>([]);
  const [realtimeChannelStatus, setRealtimeChannelStatus] = useState<string>('CONNECTED');
  const [realtimePingMs, setRealtimePingMs] = useState<number | null>(null);
  const [isRealtimePaused, setIsRealtimePaused] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // Initial ping
    pingSupabaseKeepalive().then((res) => {
      if (isMounted && res) setRealtimePingMs(res.latencyMs);
    });

    const pingTimer = setInterval(async () => {
      const res = await pingSupabaseKeepalive();
      if (isMounted && res) setRealtimePingMs(res.latencyMs);
    }, 20000);

    // Initial pre-fetch of live activity
    const prefetchTelemetry = async () => {
      try {
        const [auditRes, stockRes] = await Promise.all([
          supabase.from('audit_logs').select('id, action, target_table, created_at').order('created_at', { ascending: false }).limit(25),
          supabase.from('stock_movements').select('id, type, quantity_change, reason, created_at').order('created_at', { ascending: false }).limit(25),
        ]);

        const initial: any[] = [];
        auditRes.data?.forEach((log: any) => {
          initial.push({
            id: String(log.id),
            source: 'audit_logs',
            action: log.action || 'AUDIT_LOG',
            summary: log.target_table ? `${log.action || 'Action'} on ${log.target_table}` : (log.action || 'System Audit Record'),
            timestamp: log.created_at,
            badge: 'AUDIT',
          });
        });

        stockRes.data?.forEach((mov: any) => {
          initial.push({
            id: String(mov.id),
            source: 'stock_movements',
            action: mov.type || 'STOCK_EVENT',
            summary: `Stock change: ${mov.quantity_change > 0 ? '+' : ''}${mov.quantity_change} (${mov.reason || 'Ledger event'})`,
            timestamp: mov.created_at,
            badge: 'LEDGER',
          });
        });

        initial.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        if (isMounted) setRealtimeEvents(initial.slice(0, 50));
      } catch (e) {
        console.warn('Telemetry prefetch warning:', e);
      }
    };

    prefetchTelemetry();

    const channel = supabase
      .channel('super-admin-activity-stream')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, (payload: any) => {
        if (!isRealtimePaused && isMounted) {
          const newEvent = {
            id: String(payload.new?.id || Date.now()),
            source: 'audit_logs',
            action: payload.new?.action || payload.eventType,
            summary: `${payload.new?.action || payload.eventType} on ${payload.new?.target_table || 'system'}`,
            timestamp: payload.new?.created_at || new Date().toISOString(),
            badge: 'AUDIT',
          };
          setRealtimeEvents((prev) => [newEvent, ...prev.slice(0, 49)]);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, (payload: any) => {
        if (!isRealtimePaused && isMounted) {
          const newEvent = {
            id: String(payload.new?.id || Date.now()),
            source: 'stock_movements',
            action: payload.new?.type || 'STOCK_EVENT',
            summary: `Stock delta: ${payload.new?.quantity_change > 0 ? '+' : ''}${payload.new?.quantity_change}`,
            timestamp: payload.new?.created_at || new Date().toISOString(),
            badge: 'LEDGER',
          };
          setRealtimeEvents((prev) => [newEvent, ...prev.slice(0, 49)]);
        }
      })
      .subscribe((status) => {
        if (isMounted) setRealtimeChannelStatus(status === 'SUBSCRIBED' ? 'CONNECTED' : status);
      });

    return () => {
      isMounted = false;
      clearInterval(pingTimer);
      supabase.removeChannel(channel);
    };
  }, [isRealtimePaused]);


  // 4. Backups
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const handleExportFullBackup = async () => {
    setIsExportingBackup(true);
    setPageError(null);
    try {
      await exportFullSystemBackup(userEmail);
    } catch (err: any) {
      setPageError('Backup export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsExportingBackup(false);
    }
  };


  // 6. Audit Logs
  const { data: auditLogs = [], isLoading: isLoadingAuditLogs, refetch: refetchAudits } = useQuery({
    queryKey: ['super-audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) return [];
      return data || [];
    },
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-foreground">
      {pageError && (
        <div className="p-4 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold flex items-center justify-between animate-in fade-in" role="alert">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{pageError}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setPageError(null)} className="h-7 text-xs text-destructive hover:bg-destructive/20 font-bold">
            Dismiss
          </Button>
        </div>
      )}
      <SuperAdminControlCenter
        userEmail={userEmail}
        maintenanceLocked={maintenanceSetting?.locked || false}
        onToggleMaintenance={handleToggleMaintenanceMode}
        isMaintenanceToggling={isMaintenanceToggling}
        realtimePingMs={realtimePingMs}
        setRealtimePingMs={setRealtimePingMs}
        realtimeChannelStatus={realtimeChannelStatus}
        realtimeEvents={realtimeEvents}
        setRealtimeEvents={setRealtimeEvents}
        isRealtimePaused={isRealtimePaused}
        setIsRealtimePaused={setIsRealtimePaused}
        onExportFullBackup={handleExportFullBackup}
        isExportingBackup={isExportingBackup}
        auditLogs={auditLogs}
        isLoadingAuditLogs={isLoadingAuditLogs}
        refetchAudits={refetchAudits}
      />
    </div>
  );
}
