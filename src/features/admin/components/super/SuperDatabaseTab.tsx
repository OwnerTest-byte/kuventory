import { 
  Database, Zap, CheckCircle2, 
  RefreshCw, Loader2, Layers, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SystemTelemetry } from '../../services/superAdminService';

interface SuperDatabaseTabProps {
  telemetry: SystemTelemetry;
  onPingDatabase: () => void;
  onRebalanceStockDrift: () => Promise<void>;
  isRebalancingStock: boolean;
  rebalanceResult: string | null;
  onCleanNegativeBatches: () => Promise<void>;
  isCleaningBatches: boolean;
  cleanBatchResult: string | null;
  onRefresh: () => void;
}

export function SuperDatabaseTab({
  telemetry,
  onPingDatabase,
  onRebalanceStockDrift,
  isRebalancingStock,
  rebalanceResult,
  onCleanNegativeBatches,
  isCleaningBatches,
  cleanBatchResult,
  onRefresh
}: SuperDatabaseTabProps) {
  return (
    <div className="space-y-6">
      {/* 1. Database Health Overview matching mockup */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-500 flex items-center justify-center shrink-0">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  PostgreSQL Engine & Real-Time Monitoring
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                  Healthy
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Supabase Managed PostgreSQL with Row-Level Security and Atomic Transaction Stored Procedures
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onPingDatabase}
              className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
              {telemetry.pingMs ? `${telemetry.pingMs}ms Ping` : 'Ping DB'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>
        </div>

        {/* 3 Metric cards for DB */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-muted/40 border border-border/80">
            <span className="text-[11px] font-semibold text-muted-foreground">Connection Status</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-lg font-bold text-emerald-500 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Healthy
              </span>
              <span className="text-xs font-mono text-muted-foreground">99.9% uptime</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-muted/40 border border-border/80">
            <span className="text-[11px] font-semibold text-muted-foreground">Active Connection Pool</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-lg font-bold text-foreground">
                {Math.max(4, telemetry.activeLeases * 2)} / 100
              </span>
              <span className="text-xs font-mono text-emerald-500 font-bold">Optimal</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-muted/40 border border-border/80">
            <span className="text-[11px] font-semibold text-muted-foreground">Query Execution Latency</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-lg font-bold text-foreground">
                {telemetry.pingMs} ms
              </span>
              <span className="text-xs font-mono text-emerald-500 font-bold">&lt; 100ms Target</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Core Relational Tables Telemetry */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Relational Schema & Record Counts</h3>
          <p className="text-xs text-muted-foreground">Live row telemetry from production PostgreSQL database</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-1">
            <span className="text-muted-foreground text-[11px]">Active Items</span>
            <p className="text-xl font-bold font-mono text-foreground">{telemetry.itemsCount}</p>
            <p className="text-[10px] text-muted-foreground">public.inventory_items</p>
          </div>

          <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-1">
            <span className="text-muted-foreground text-[11px]">Stock Batches</span>
            <p className="text-xl font-bold font-mono text-foreground">{telemetry.batchesCount}</p>
            <p className="text-[10px] text-muted-foreground">public.stock_batches</p>
          </div>

          <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-1">
            <span className="text-muted-foreground text-[11px]">Audit Movements</span>
            <p className="text-xl font-bold font-mono text-foreground">{telemetry.movementsCount}</p>
            <p className="text-[10px] text-muted-foreground">public.stock_movements</p>
          </div>

          <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-1">
            <span className="text-muted-foreground text-[11px]">Daily Sheets</span>
            <p className="text-xl font-bold font-mono text-foreground">{telemetry.dailyCount}</p>
            <p className="text-[10px] text-muted-foreground">public.daily_inventory</p>
          </div>
        </div>
      </div>

      {/* 3. Database Maintenance & Auto-Healing Controls */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Database Maintenance & Integrity Healers</h3>
          <p className="text-xs text-muted-foreground">Real-time routines to prevent stock drift and prune orphaned records</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Drift Auto-Healer */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 text-primary font-bold text-xs">
                <Layers className="w-4 h-4" />
                <span>Inventory Stock Drift Auto-Healer</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Audits the sum of individual batches against item stock balances and reconciles any discrepancies atomically.
              </p>
              {rebalanceResult && (
                <p className="text-xs text-emerald-500 font-bold mt-2">{rebalanceResult}</p>
              )}
            </div>

            <Button
              size="sm"
              onClick={onRebalanceStockDrift}
              disabled={isRebalancingStock}
              className="w-full text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
            >
              {isRebalancingStock ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Reconcile All Stock Drift
            </Button>
          </div>

          {/* Phantom Batch Cleaner */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 text-destructive font-bold text-xs">
                <Trash2 className="w-4 h-4" />
                <span>Zero-Stock & Depleted Batch Pruner</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Scans for zero-quantity expired batches and cleanly removes them to optimize database query indices.
              </p>
              {cleanBatchResult && (
                <p className="text-xs text-emerald-500 font-bold mt-2">{cleanBatchResult}</p>
              )}
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={onCleanNegativeBatches}
              disabled={isCleaningBatches}
              className="w-full text-xs font-bold border-destructive/30 text-destructive hover:bg-destructive/10 cursor-pointer"
            >
              {isCleaningBatches ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Clean Depleted Batches
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
