import { useState, useRef, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Crown, ShieldCheck, ClipboardList, Users, Activity, 
  RotateCcw, Clock, FileText, ChevronLeft, ChevronRight,
  Database, HardDrive, Radio, AlertTriangle, Settings
} from 'lucide-react';
import { cn, formatSafeDate } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { 
  fetchSystemTelemetry, 
  fetchAutomations, 
  fetchIncidents 
} from '../../services/superAdminService';

import { SuperOverviewTab } from './SuperOverviewTab';
import { SuperIntegrityTab } from './SuperIntegrityTab';
import { SuperDailyOperationsTab } from './SuperDailyOperationsTab';
import { SuperSecurityTab } from './SuperSecurityTab';
import { SuperDatabaseTab } from './SuperDatabaseTab';
import { SuperStorageTab } from './SuperStorageTab';
import { SuperRealtimeTab } from './SuperRealtimeTab';
import { SuperRecoveryTab } from './SuperRecoveryTab';
import { SuperAutomationsTab } from './SuperAutomationsTab';
import { SuperLogsTab } from './SuperLogsTab';
import { SuperIncidentsTab } from './SuperIncidentsTab';
import { SuperSettingsTab } from './SuperSettingsTab';

interface SuperAdminControlCenterProps {
  userEmail: string;
  maintenanceLocked: boolean;
  onToggleMaintenance: (reason?: string) => void;
  isMaintenanceToggling: boolean;
  realtimePingMs: number | null;
  setRealtimePingMs: (ms: number | null) => void;
  realtimeChannelStatus: string;
  realtimeEvents: any[];
  setRealtimeEvents: any;
  isRealtimePaused: boolean;
  setIsRealtimePaused: (p: boolean) => void;
  onExportFullBackup: () => Promise<void>;
  isExportingBackup: boolean;
  auditLogs: any[];
  isLoadingAuditLogs: boolean;
  refetchAudits: () => void;
}

const NAVIGATION_AREAS = [
  { id: 'overview', label: 'Overview', icon: Crown },
  { id: 'inventory', label: 'Inventory', icon: ShieldCheck },
  { id: 'users', label: 'Users & Security', icon: Users },
  { id: 'system', label: 'System Health', icon: Activity },
  { id: 'recovery', label: 'Backups & Recovery', icon: RotateCcw },
  { id: 'automations', label: 'Automations', icon: Clock },
  { id: 'audit', label: 'Audit & Settings', icon: FileText },
];

const SUBTAB_ALIASES: Record<string, { area: string; section?: string }> = {
  integrity: { area: 'inventory', section: 'stock' },
  stock: { area: 'inventory', section: 'stock' },
  operations: { area: 'inventory', section: 'daily' },
  daily: { area: 'inventory', section: 'daily' },
  access: { area: 'users' },
  security: { area: 'users' },
  users: { area: 'users' },
  system: { area: 'system' },
  realtime: { area: 'system', section: 'realtime' },
  monitoring: { area: 'system', section: 'realtime' },
  database: { area: 'system', section: 'database' },
  storage: { area: 'system', section: 'storage' },
  backup: { area: 'recovery' },
  recovery: { area: 'recovery' },
  backups: { area: 'recovery' },
  automations: { area: 'automations' },
  jobs: { area: 'automations' },
  services: { area: 'automations' },
  audit: { area: 'audit' },
  logs: { area: 'audit', section: 'logs' },
  incidents: { area: 'audit', section: 'incidents' },
  settings: { area: 'audit', section: 'settings' },
};

export function SuperAdminControlCenter({
  userEmail,
  maintenanceLocked,
  onToggleMaintenance,
  isMaintenanceToggling,
  realtimePingMs,
  setRealtimePingMs,
  realtimeChannelStatus,
  realtimeEvents,
  setRealtimeEvents,
  isRealtimePaused,
  setIsRealtimePaused,
  onExportFullBackup,
  isExportingBackup,
  auditLogs,
  isLoadingAuditLogs,
  refetchAudits
}: SuperAdminControlCenterProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Sub-tab resolution with alias support
  const rawSubTab = searchParams.get('subtab') || 'overview';
  const aliasMatch = SUBTAB_ALIASES[rawSubTab];
  const resolvedSubTab = aliasMatch?.area || rawSubTab;
  const activeSubTab = NAVIGATION_AREAS.some(a => a.id === resolvedSubTab) ? resolvedSubTab : 'overview';

  // Sub-sections for composite tabs
  const [inventorySection, setInventorySection] = useState<'stock' | 'daily'>('stock');
  const [systemSection, setSystemSection] = useState<'realtime' | 'database' | 'storage'>('realtime');
  const [auditSection, setAuditSection] = useState<'logs' | 'incidents' | 'settings'>('logs');

  useEffect(() => {
    if (aliasMatch?.section) {
      if (aliasMatch.area === 'inventory') setInventorySection(aliasMatch.section as 'stock' | 'daily');
      if (aliasMatch.area === 'system') setSystemSection(aliasMatch.section as 'realtime' | 'database' | 'storage');
      if (aliasMatch.area === 'audit') setAuditSection(aliasMatch.section as 'logs' | 'incidents' | 'settings');
    }
  }, [rawSubTab, aliasMatch]);

  const handleSubTabChange = (newSubTab: string) => {
    setSearchParams({ subtab: newSubTab });
  };

  const subTabsRef = useRef<HTMLDivElement>(null);
  const scrollSubTabs = (direction: 'left' | 'right') => {
    if (subTabsRef.current) {
      subTabsRef.current.scrollBy({
        left: direction === 'left' ? -260 : 260,
        behavior: 'smooth'
      });
    }
  };

  // 1. Live Telemetry Query
  const { data: telemetry = {
    itemsCount: 0,
    batchesCount: 0,
    movementsCount: 0,
    dailyCount: 0,
    activeLeases: 0,
    activeIncidents: 0,
    failedAutomations: 0,
    databaseStatus: 'Unavailable' as const,
    storageStatus: 'Unavailable' as const,
    applicationStatus: 'Unavailable' as const,
    serverTime: '',
    pingMs: 0
  }, refetch: refetchTelemetry } = useQuery({
    queryKey: ['super-telemetry'],
    queryFn: fetchSystemTelemetry,
    refetchInterval: 30000
  });

  // 2. Automations Query
  const { data: automations = [], refetch: refetchAutomations } = useQuery({
    queryKey: ['super-automations'],
    queryFn: fetchAutomations
  });

  // 3. Incidents Query
  const { data: incidents = [], refetch: refetchIncidents } = useQuery({
    queryKey: ['super-incidents'],
    queryFn: fetchIncidents
  });

  // Recent activity feed aggregated strictly from real audit logs
  const recentActivity = useMemo(() => {
    const list: Array<{
      id: string;
      type: string;
      title: string;
      timestamp: string;
      status: 'success' | 'warning' | 'info' | 'error';
    }> = [];

    auditLogs.slice(0, 6).forEach((l, idx) => {
      list.push({
        id: `audit-${l.id || idx}`,
        type: 'audit',
        title: `${l.action || 'Audit Record'} on ${l.target_table || 'system'}`,
        timestamp: formatSafeDate(l.created_at, 'hh:mm a', 'Recent'),
        status: l.action?.includes('DELETE') || l.action?.includes('ERROR') ? 'warning' : 'success'
      });
    });

    return list;
  }, [auditLogs]);

  // Realtime channel synchronization
  useEffect(() => {
    const channel = supabase
      .channel('super-admin-telemetry')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_automations' }, () => {
        refetchAutomations();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_incidents' }, () => {
        refetchIncidents();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchAutomations, refetchIncidents]);

  return (
    <div className="space-y-6">
      {/* Super Admin Operations Console Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500 shrink-0" />
            <span>Super Admin Operations Console — KUVENTORY Operations</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Mission-critical system telemetry, security lockdown controls, inventory reconciliation, and operations.
          </p>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      <div className="sm:hidden w-full">
        <label htmlFor="super-admin-area-select" className="sr-only">Select Navigation Area</label>
        <select
          id="super-admin-area-select"
          value={activeSubTab}
          onChange={(e) => handleSubTabChange(e.target.value)}
          className="w-full rounded-xl bg-card border border-border px-3.5 py-2.5 text-xs font-bold text-foreground shadow-2xs focus:ring-2 focus:ring-primary focus:outline-none"
        >
          {NAVIGATION_AREAS.map((nav) => (
            <option key={nav.id} value={nav.id}>
              {nav.label}
            </option>
          ))}
        </select>
      </div>

      {/* 7-Area Task-Oriented Navigation Bar */}
      <div className="relative w-full min-w-0 max-w-full flex items-center group">
        <button
          type="button"
          aria-label="Scroll tabs left"
          onClick={() => scrollSubTabs('left')}
          className="hidden sm:flex absolute -left-2 z-10 w-7 h-7 rounded-full bg-card/95 border border-border shadow-md items-center justify-center text-muted-foreground hover:text-foreground hover:scale-110 transition-all cursor-pointer backdrop-blur-xs"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div 
          ref={subTabsRef}
          className="w-full min-w-0 max-w-full flex items-center gap-1.5 p-1.5 rounded-2xl bg-muted/80 border border-border overflow-x-auto scroll-smooth touch-pan-x shadow-2xs py-2 scrollbar-thin scrollbar-thumb-border hover:scrollbar-thumb-muted-foreground/30"
        >
          {NAVIGATION_AREAS.map((nav) => {
            const Icon = nav.icon;
            const isActive = activeSubTab === nav.id;
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

        <button
          type="button"
          aria-label="Scroll tabs right"
          onClick={() => scrollSubTabs('right')}
          className="hidden sm:flex absolute -right-2 z-10 w-7 h-7 rounded-full bg-card/95 border border-border shadow-md items-center justify-center text-muted-foreground hover:text-foreground hover:scale-110 transition-all cursor-pointer backdrop-blur-xs"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 1. Overview */}
      {activeSubTab === 'overview' && (
        <SuperOverviewTab
          telemetry={telemetry}
          deployments={[]}
          automations={automations}
          incidents={incidents}
          recentActivity={recentActivity}
          onSelectTab={handleSubTabChange}
          onRefresh={() => {
            refetchTelemetry();
            refetchAutomations();
            refetchIncidents();
          }}
          onTriggerBackup={onExportFullBackup}
          isTriggeringBackup={isExportingBackup}
        />
      )}

      {/* 2. Inventory (Stock Health & Daily Operations) */}
      {activeSubTab === 'inventory' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setInventorySection('stock')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5",
                inventorySection === 'stock' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Stock Health
            </button>
            <button
              type="button"
              onClick={() => setInventorySection('daily')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5",
                inventorySection === 'daily' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Daily Operations
            </button>
          </div>

          {inventorySection === 'stock' && (
            <SuperIntegrityTab
              telemetry={telemetry}
              onRefresh={refetchTelemetry}
            />
          )}

          {inventorySection === 'daily' && (
            <SuperDailyOperationsTab
              onRefresh={refetchTelemetry}
            />
          )}
        </div>
      )}

      {/* 3. Users & Security */}
      {activeSubTab === 'users' && (
        <SuperSecurityTab
          maintenanceLocked={maintenanceLocked}
          onToggleMaintenance={onToggleMaintenance}
          isMaintenanceToggling={isMaintenanceToggling}
          userEmail={userEmail}
        />
      )}

      {/* 4. System Health */}
      {activeSubTab === 'system' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSystemSection('realtime')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5",
                systemSection === 'realtime' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Radio className="w-3.5 h-3.5" />
              Live Realtime Stream
            </button>
            <button
              type="button"
              onClick={() => setSystemSection('database')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5",
                systemSection === 'database' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Database className="w-3.5 h-3.5" />
              Database Ping
            </button>
            <button
              type="button"
              onClick={() => setSystemSection('storage')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5",
                systemSection === 'storage' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <HardDrive className="w-3.5 h-3.5" />
              Storage API
            </button>
          </div>

          {systemSection === 'realtime' && (
            <SuperRealtimeTab
              realtimeEvents={realtimeEvents}
              setRealtimeEvents={setRealtimeEvents}
              realtimeChannelStatus={realtimeChannelStatus}
              realtimePingMs={realtimePingMs}
              setRealtimePingMs={setRealtimePingMs}
              isRealtimePaused={isRealtimePaused}
              setIsRealtimePaused={setIsRealtimePaused}
            />
          )}

          {systemSection === 'database' && (
            <SuperDatabaseTab
              telemetry={telemetry}
              onPingDatabase={refetchTelemetry}
              onRefresh={refetchTelemetry}
            />
          )}

          {systemSection === 'storage' && (
            <SuperStorageTab
              onRefresh={refetchTelemetry}
            />
          )}
        </div>
      )}

      {/* 5. Backups & Recovery */}
      {activeSubTab === 'recovery' && (
        <SuperRecoveryTab />
      )}

      {/* 6. Automations */}
      {activeSubTab === 'automations' && (
        <SuperAutomationsTab
          automations={automations}
          onRefresh={refetchAutomations}
        />
      )}

      {/* 7. Audit & Settings */}
      {activeSubTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setAuditSection('logs')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5",
                auditSection === 'logs' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FileText className="w-3.5 h-3.5" />
              Audit Logs
            </button>
            <button
              type="button"
              onClick={() => setAuditSection('incidents')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5",
                auditSection === 'incidents' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Incident Records ({incidents.length})
            </button>
            <button
              type="button"
              onClick={() => setAuditSection('settings')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5",
                auditSection === 'settings' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Settings className="w-3.5 h-3.5" />
              Settings & Governance
            </button>
          </div>

          {auditSection === 'logs' && (
            <SuperLogsTab
              auditLogs={auditLogs}
              isLoadingAuditLogs={isLoadingAuditLogs}
              onRefreshAudits={refetchAudits}
            />
          )}

          {auditSection === 'incidents' && (
            <SuperIncidentsTab
              incidents={incidents}
              onRefresh={refetchIncidents}
              userEmail={userEmail}
            />
          )}

          {auditSection === 'settings' && (
            <SuperSettingsTab
              userEmail={userEmail}
            />
          )}
        </div>
      )}
    </div>
  );
}
