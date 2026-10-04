import { format } from 'date-fns';
import { 
  Crown, CheckCircle2, Zap, Server, Shield, Layers, HardDrive, 
  RefreshCw, Lock, Radio, ArrowRight, Pause, Play
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MasterOverviewTabProps {
  userEmail: string;
  realtimePingMs: number | null;
  realtimeChannelStatus: string;
  isRealtimePaused: boolean;
  setIsRealtimePaused: (paused: boolean) => void;
  realtimeEvents: Array<{
    id: string;
    source: string;
    action: string;
    summary: string;
    timestamp: string;
    badge: string;
  }>;
  maintenanceLocked: boolean;
  onToggleMaintenance: () => void;
  isMaintenanceToggling: boolean;
  onFlushCache: () => void;
  onPingDatabase: () => void;
  onSelectSubTab: (subTabId: string) => void;
  counts: {
    activeItems: number;
    totalStockUnits: number;
    lowStock: number;
    outOfStock: number;
    expiringSoon: number;
    expired: number;
    depletedBatches: number;
    privilegedUsers: number;
    auditLogs: number;
  };
}

export function MasterOverviewTab({
  userEmail,
  realtimePingMs,
  realtimeChannelStatus,
  isRealtimePaused,
  setIsRealtimePaused,
  realtimeEvents,
  maintenanceLocked,
  onToggleMaintenance,
  isMaintenanceToggling,
  onFlushCache,
  onPingDatabase,
  onSelectSubTab,
  counts,
}: MasterOverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Identity & Root Authority Banner */}
      <div className="p-6 rounded-2xl bg-linear-to-br from-amber-500/10 via-card to-card border border-amber-500/30 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-500 shrink-0 shadow-xs">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Master Administrator Control Center
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  Tier 0 Root
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Authenticated as <strong className="text-foreground">{userEmail}</strong> · Absolute System, Security & Disaster Recovery Authority
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onFlushCache}
              className="font-bold text-xs border-border text-foreground hover:bg-muted cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Flush Cache
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onPingDatabase}
              className="font-bold text-xs border-border text-foreground hover:bg-muted cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
              {realtimePingMs ? `${realtimePingMs}ms Ping` : 'Ping DB'}
            </Button>
          </div>
        </div>

        {/* Operational Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-2">
          <div className="p-3.5 rounded-xl bg-card border border-border/80">
            <span className="text-muted-foreground block font-medium text-[11px]">System Clearance</span>
            <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 mt-0.5">
              <Crown className="w-3.5 h-3.5 text-amber-500" /> MASTER_ADMIN (Tier 0)
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-card border border-border/80">
            <span className="text-muted-foreground block font-medium text-[11px]">RLS Authorization</span>
            <span className="font-bold text-emerald-500 flex items-center gap-1.5 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> is_master_admin() = TRUE
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-card border border-border/80">
            <span className="text-muted-foreground block font-medium text-[11px]">Engine Latency</span>
            <span className="font-bold text-foreground mt-0.5 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" /> {realtimePingMs ? `${realtimePingMs}ms · PostgREST OK` : 'Evaluating...'}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-card border border-border/80">
            <span className="text-muted-foreground block font-medium text-[11px]">Direct Master Hotline</span>
            <span className="font-bold text-foreground mt-0.5 block font-mono">
              09917101298 (Call / SMS)
            </span>
          </div>
        </div>
      </div>

      {/* The 4 Core Pillars of KUVENTORY Master Admin */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pillar 1: System Status */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-3 flex flex-col justify-between hover:border-border/80 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-foreground uppercase tracking-wider">System Status</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                HEALTHY
              </span>
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Database:</span>
                <span className="font-bold text-foreground">{realtimePingMs ? `${realtimePingMs}ms` : 'Connected'}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Authentication:</span>
                <span className="font-bold text-emerald-500">GoTrue Online</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Realtime WS:</span>
                <span className="font-bold text-emerald-500">{realtimeChannelStatus}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Storage Buckets:</span>
                <span className="font-medium text-muted-foreground">0 Configured</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onSelectSubTab('system_health')}
            className="pt-2 text-xs font-bold text-primary hover:underline flex items-center justify-between cursor-pointer"
          >
            <span>View Technical Health</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Pillar 2: Inventory Status */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-3 flex flex-col justify-between hover:border-border/80 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-foreground uppercase tracking-wider">Inventory Status</span>
              </div>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-black uppercase",
                counts.lowStock > 0 ? "bg-amber-500/15 text-amber-500 border border-amber-500/20" : "bg-emerald-500/15 text-emerald-500 border border-emerald-500/20"
              )}>
                {counts.lowStock > 0 ? `${counts.lowStock} Low Stock` : 'Optimal'}
              </span>
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Active Items:</span>
                <span className="font-bold text-foreground">{counts.activeItems} items</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Total Units:</span>
                <span className="font-bold text-foreground">{counts.totalStockUnits} in stock</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Expiring Soon (&le;7d):</span>
                <span className={cn("font-bold", counts.expiringSoon > 0 ? "text-amber-500" : "text-foreground")}>
                  {counts.expiringSoon}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Zero-Stock Batches:</span>
                <span className="font-medium text-muted-foreground">{counts.depletedBatches} (isolated)</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onSelectSubTab('inventory_health')}
            className="pt-2 text-xs font-bold text-primary hover:underline flex items-center justify-between cursor-pointer"
          >
            <span>Audit Inventory & FEFO</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Pillar 3: Security Status */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-3 flex flex-col justify-between hover:border-border/80 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-bold text-foreground uppercase tracking-wider">Security Status</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                PROTECTED
              </span>
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Zero-Trust Barrier:</span>
                <span className="font-bold text-emerald-500">Tier 0 Active</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Privileged Accounts:</span>
                <span className="font-bold text-foreground">{counts.privilegedUsers} (1 Master, {counts.privilegedUsers - 1} Admin)</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Maintenance Lock:</span>
                <span className={cn("font-bold", maintenanceLocked ? "text-rose-500" : "text-emerald-500")}>
                  {maintenanceLocked ? 'ACTIVE' : 'OFF'}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Audit Logs Recorded:</span>
                <span className="font-bold text-foreground">{counts.auditLogs} events</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onSelectSubTab('security')}
            className="pt-2 text-xs font-bold text-primary hover:underline flex items-center justify-between cursor-pointer"
          >
            <span>Inspect Security Controls</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Pillar 4: Recovery Status */}
        <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-3 flex flex-col justify-between hover:border-border/80 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-foreground uppercase tracking-wider">Recovery Status</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                READY
              </span>
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Backup Mechanism:</span>
                <span className="font-bold text-foreground">Immutable JSON</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Point-in-Time Scope:</span>
                <span className="font-bold text-foreground">7 Categories + All Items</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Recovery Availability:</span>
                <span className="font-bold text-emerald-500">Operational</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Current Mode:</span>
                <span className="font-bold text-foreground">{maintenanceLocked ? 'MAINTENANCE' : 'NORMAL'}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onSelectSubTab('recovery')}
            className="pt-2 text-xs font-bold text-primary hover:underline flex items-center justify-between cursor-pointer"
          >
            <span>Disaster Recovery Center</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Realtime Live Activity Stream Preview */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="relative flex h-3 w-3">
                <span className={cn(
                  "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                  realtimeChannelStatus === 'CONNECTED' ? "bg-emerald-400" : "bg-amber-400"
                )} />
                <span className={cn(
                  "relative inline-flex rounded-full h-3 w-3",
                  realtimeChannelStatus === 'CONNECTED' ? "bg-emerald-500" : "bg-amber-500"
                )} />
              </div>
              <h3 className="text-base font-bold text-foreground">
                Live Real-Time Activity Stream
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                {realtimeChannelStatus}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Instantaneous telemetry listening to PostgreSQL changes across stock movements, audit logs, and inventory sheets.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRealtimePaused(!isRealtimePaused)}
              className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer"
            >
              {isRealtimePaused ? (
                <>
                  <Play className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                  Resume Feed
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                  Pause Feed
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelectSubTab('realtime')}
              className="text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              Full Realtime Monitor &rarr;
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
          {realtimeEvents.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground space-y-1">
              <Radio className="w-6 h-6 mx-auto text-muted-foreground/60 animate-pulse" />
              <p className="font-semibold text-foreground">Real-time WebSocket listener active</p>
              <p className="text-[11px]">Any catalog mutations, stock deductions, or staff actions will stream here live.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {realtimeEvents.slice(0, 5).map((evt) => (
                <div key={evt.id} className="p-3 text-xs flex items-center justify-between hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shrink-0",
                      evt.badge === 'INSERT' ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" :
                      evt.badge === 'UPDATE' ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" :
                      "bg-rose-500/20 text-rose-600 dark:text-rose-400"
                    )}>
                      {evt.badge}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground border border-border shrink-0">
                      {evt.source}
                    </span>
                    <span className="font-medium text-foreground truncate">
                      {evt.summary}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0 ml-3">
                    {format(new Date(evt.timestamp), 'HH:mm:ss')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Emergency Contingency Quick Controls */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-500" />
            <h3 className="text-base font-bold text-foreground">Emergency Contingency Controls</h3>
          </div>
          <span className="text-xs text-muted-foreground">Authorized Master Actions</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-2.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-primary" /> System Maintenance Lock
                </span>
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-black uppercase",
                  maintenanceLocked ? "bg-rose-500/20 text-rose-500" : "bg-emerald-500/20 text-emerald-500"
                )}>
                  {maintenanceLocked ? 'ACTIVE' : 'OFF'}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Freeze inventory worksheet modifications for store staff during physical counts.
              </p>
            </div>
            <Button
              variant={maintenanceLocked ? "destructive" : "outline"}
              size="sm"
              onClick={onToggleMaintenance}
              disabled={isMaintenanceToggling}
              className="w-full text-xs font-bold cursor-pointer"
            >
              {maintenanceLocked ? "Lift Maintenance Lock" : "Activate Maintenance Lock"}
            </Button>
          </div>

          <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-2.5 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-primary" /> Full Backup Snapshot
              </span>
              <p className="text-[11px] text-muted-foreground mt-1">
                Generate an immutable timestamped point-in-time JSON archive of the entire database.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelectSubTab('storage_backups')}
              className="w-full text-xs font-bold border-border hover:bg-muted cursor-pointer"
            >
              Go to Backup Center &rarr;
            </Button>
          </div>

          <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-2.5 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Data Integrity Verification
              </span>
              <p className="text-[11px] text-muted-foreground mt-1">
                Run deep relational integrity audit across items, batches, ledger transactions, and drifts.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelectSubTab('integrity')}
              className="w-full text-xs font-bold border-border hover:bg-muted cursor-pointer"
            >
              Run Integrity Audit &rarr;
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
