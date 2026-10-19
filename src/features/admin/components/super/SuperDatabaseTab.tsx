import { useState } from 'react';
import { 
  Database, Zap, CheckCircle2, 
  RefreshCw, Loader2, Layers, Trash2, AlertTriangle, Eye, ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { 
  analyzeStockDrift, 
  reconcileStockDrift, 
  scanDepletedBatches, 
  cleanupDepletedBatches,
  type SystemTelemetry, 
  type StockDriftItem, 
  type DepletedBatchItem 
} from '../../services/superAdminService';

interface SuperDatabaseTabProps {
  telemetry: SystemTelemetry;
  onPingDatabase: () => void;
  onRefresh: () => void;
}

export function SuperDatabaseTab({
  telemetry,
  onPingDatabase,
  onRefresh
}: SuperDatabaseTabProps) {
  // Drift Analysis State
  const [isAnalyzingDrift, setIsAnalyzingDrift] = useState(false);
  const [driftAnalysis, setDriftAnalysis] = useState<{
    totalItems: number;
    discrepancyCount: number;
    items: StockDriftItem[];
  } | null>(null);
  const [driftError, setDriftError] = useState<string | null>(null);

  // Drift Repair Modal
  const [isRepairModalOpen, setIsRepairModalOpen] = useState(false);
  const [isApplyingRepair, setIsApplyingRepair] = useState(false);
  const [repairSuccessMessage, setRepairSuccessMessage] = useState<string | null>(null);

  // Depleted Batches State
  const [isScanningBatches, setIsScanningBatches] = useState(false);
  const [depletedBatchResult, setDepletedBatchResult] = useState<{
    count: number;
    batches: DepletedBatchItem[];
  } | null>(null);
  const [isPruneModalOpen, setIsPruneModalOpen] = useState(false);
  const [isPruningBatches, setIsPruningBatches] = useState(false);
  const [pruneSuccessMessage, setPruneSuccessMessage] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Handler: Analyze Stock Drift (READ-ONLY)
  const handleRunDriftAnalysis = async () => {
    setIsAnalyzingDrift(true);
    setDriftError(null);
    setRepairSuccessMessage(null);
    try {
      const res = await analyzeStockDrift();
      setDriftAnalysis(res);
    } catch (err: any) {
      setDriftError(err.message || 'Failed to analyze stock drift');
    } finally {
      setIsAnalyzingDrift(false);
    }
  };

  // Handler: Apply Stock Drift Repair (TRANSACTIONAL)
  const handleApplyStockRepair = async () => {
    setIsApplyingRepair(true);
    setDriftError(null);
    try {
      const driftedIds = (driftAnalysis?.items || []).filter(i => i.hasDrift).map(i => i.itemId);
      const res = await reconcileStockDrift(driftedIds, 'Super Admin Manual Drift Rebalance');
      setRepairSuccessMessage(res.message);
      setIsRepairModalOpen(false);
      // Re-run analysis immediately to verify zero drift outcome
      const refreshed = await analyzeStockDrift();
      setDriftAnalysis(refreshed);
      onRefresh();
    } catch (err: any) {
      setDriftError(err.message || 'Repair execution failed');
    } finally {
      setIsApplyingRepair(false);
    }
  };

  // Handler: Scan Depleted Batches (READ-ONLY)
  const handleScanBatches = async () => {
    setIsScanningBatches(true);
    setPruneSuccessMessage(null);
    setBatchError(null);
    try {
      const res = await scanDepletedBatches();
      setDepletedBatchResult(res);
    } catch (err: any) {
      setBatchError('Error scanning depleted batches: ' + (err.message || 'Unknown error'));
    } finally {
      setIsScanningBatches(false);
    }
  };

  // Handler: Execute Controlled Cleanup
  const handleExecutePrune = async () => {
    if (!depletedBatchResult || depletedBatchResult.batches.length === 0) return;
    setIsPruningBatches(true);
    setBatchError(null);
    try {
      const batchIds = depletedBatchResult.batches.map(b => b.batchId);
      const res = await cleanupDepletedBatches(batchIds, 'Super Admin Controlled Batch Cleanup');
      setPruneSuccessMessage(res.message);
      setIsPruneModalOpen(false);
      // Re-scan to verify
      const refreshed = await scanDepletedBatches();
      setDepletedBatchResult(refreshed);
      onRefresh();
    } catch (err: any) {
      setBatchError('Error cleaning batches: ' + (err.message || 'Unknown error'));
    } finally {
      setIsPruningBatches(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Database Health Overview */}
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
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                  telemetry.databaseStatus === 'Healthy'
                    ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                    : "bg-destructive/15 text-destructive border-destructive/30"
                )}>
                  {telemetry.databaseStatus}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Supabase Managed PostgreSQL with Row-Level Security, atomic stored procedures, and audit logging
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
              <span className={cn(
                "text-lg font-bold flex items-center gap-1.5",
                telemetry.databaseStatus === 'Healthy' ? "text-emerald-500" : "text-destructive"
              )}>
                <CheckCircle2 className="w-4 h-4" /> {telemetry.databaseStatus}
              </span>
              <span className="text-xs font-mono text-muted-foreground">Verified</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-muted/40 border border-border/80">
            <span className="text-[11px] font-semibold text-muted-foreground">Active Connection Leases</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-lg font-bold text-foreground">
                {telemetry.activeLeases} Live
              </span>
              <span className="text-xs font-mono text-emerald-500 font-bold">Single-Session</span>
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
          <p className="text-xs text-muted-foreground">Live row telemetry verified from production PostgreSQL database</p>
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

      {/* 3. Stock Drift Analysis & Two-Step Rebalance Section */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Inventory Stock Drift Diagnostics</h3>
              {driftAnalysis && (
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                  driftAnalysis.discrepancyCount === 0
                    ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                    : "bg-destructive/15 text-destructive border-destructive/30"
                )}>
                  {driftAnalysis.discrepancyCount === 0 ? 'Zero Drift Detected' : `${driftAnalysis.discrepancyCount} Discrepancies`}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Read-only mathematical audit comparing recorded item quantities with the sum of all active stock batches
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRunDriftAnalysis}
              disabled={isAnalyzingDrift}
              className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer"
            >
              {isAnalyzingDrift ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-1.5 text-primary" />}
              {driftAnalysis ? 'Re-Analyze Drift' : 'Analyze Stock Drift'}
            </Button>

            {driftAnalysis && driftAnalysis.discrepancyCount > 0 && (
              <Button
                size="sm"
                onClick={() => setIsRepairModalOpen(true)}
                className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Apply Rebalance ({driftAnalysis.discrepancyCount})
              </Button>
            )}
          </div>
        </div>

        {driftError && (
          <div className="p-3 text-xs text-destructive bg-destructive/15 rounded-xl border border-destructive/30 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{driftError}</span>
          </div>
        )}

        {repairSuccessMessage && (
          <div className="p-3 text-xs text-emerald-500 bg-emerald-500/15 rounded-xl border border-emerald-500/30 font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{repairSuccessMessage}</span>
          </div>
        )}

        {/* Drift Table */}
        {driftAnalysis && (
          <div className="space-y-2">
            <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 sticky top-0 border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Item Name</th>
                    <th className="py-2.5 px-3 font-semibold">Item Record Qty</th>
                    <th className="py-2.5 px-3 font-semibold">Batches Sum Qty</th>
                    <th className="py-2.5 px-3 font-semibold">Drift Delta</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Integrity Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 font-medium">
                  {driftAnalysis.items.map((it) => (
                    <tr key={it.itemId} className={cn("hover:bg-muted/30 transition-colors", it.hasDrift && "bg-destructive/5")}>
                      <td className="py-2.5 px-3 font-bold text-foreground">
                        {it.itemName}
                        <span className="text-[10px] text-muted-foreground font-normal ml-1">({it.activeBatchesCount} batches)</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">{it.currentQuantity} {it.unit}</td>
                      <td className="py-2.5 px-3 font-mono">{it.batchSum} {it.unit}</td>
                      <td className="py-2.5 px-3 font-mono">
                        <span className={cn(
                          "font-bold",
                          it.driftDelta === 0 ? "text-muted-foreground" : "text-destructive"
                        )}>
                          {it.driftDelta > 0 ? `+${it.driftDelta}` : it.driftDelta}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                          !it.hasDrift 
                            ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                            : "bg-destructive/15 text-destructive border border-destructive/30"
                        )}>
                          {!it.hasDrift ? 'In Sync' : 'Discrepancy'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground text-right">
              {driftAnalysis.totalItems} active items audited · {driftAnalysis.discrepancyCount} discrepancies detected
            </p>
          </div>
        )}
      </div>

      {/* 4. Depleted Batch Analysis & Controlled Cleanup */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-destructive" />
              <h3 className="text-sm font-bold text-foreground">Zero-Quantity Depleted Batch Management</h3>
              {depletedBatchResult && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                  {depletedBatchResult.count} Candidates Found
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Identifies depleted batches with zero remaining quantity. Preserves ledger movement history and financial traceability.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleScanBatches}
              disabled={isScanningBatches}
              className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer"
            >
              {isScanningBatches ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />}
              Scan Depleted Batches
            </Button>

            {depletedBatchResult && depletedBatchResult.count > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsPruneModalOpen(true)}
                className="text-xs font-bold border-destructive/30 text-destructive hover:bg-destructive/10 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Controlled Pruning ({depletedBatchResult.count})
              </Button>
            )}
          </div>
        </div>

        {batchError && (
          <div className="p-3 text-xs text-destructive bg-destructive/15 rounded-xl border border-destructive/30 font-semibold flex items-center justify-between gap-2" role="alert">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{batchError}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setBatchError(null)} className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/20 font-bold">
              Dismiss
            </Button>
          </div>
        )}

        {pruneSuccessMessage && (
          <div className="p-3 text-xs text-emerald-500 bg-emerald-500/15 rounded-xl border border-emerald-500/30 font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{pruneSuccessMessage}</span>
          </div>
        )}

        {depletedBatchResult && (
          <div className="space-y-2">
            {depletedBatchResult.count === 0 ? (
              <div className="p-4 rounded-xl bg-muted/30 border border-border text-center text-xs text-muted-foreground">
                No depleted zero-quantity batches currently require pruning.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-56 overflow-y-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 sticky top-0 border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Batch ID</th>
                      <th className="py-2 px-3 font-semibold">Item</th>
                      <th className="py-2 px-3 font-semibold">Expiry Date</th>
                      <th className="py-2 px-3 font-semibold">Ledger Movements</th>
                      <th className="py-2 px-3 font-semibold text-right">Cleanup Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50 font-medium">
                    {depletedBatchResult.batches.map(b => (
                      <tr key={b.batchId} className="hover:bg-muted/30">
                        <td className="py-2 px-3 font-mono text-[11px] text-muted-foreground">
                          {b.batchId.substring(0, 8)}...
                        </td>
                        <td className="py-2 px-3 font-bold text-foreground">{b.itemName}</td>
                        <td className="py-2 px-3 font-mono text-muted-foreground">{b.expiryDate}</td>
                        <td className="py-2 px-3 font-mono text-foreground">
                          {b.movementCount} referenced movements
                        </td>
                        <td className="py-2 px-3 text-right">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground border border-border">
                            {b.movementCount > 0 ? 'Archive (Keep Audit)' : 'Safe Delete'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Repair Confirmation Modal */}
      <Dialog open={isRepairModalOpen} onOpenChange={setIsRepairModalOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Confirm Stock Drift Reconciliation
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Review and authorize atomic server-side reconciliation for items with batch discrepancy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-2">
              <p className="font-bold text-foreground">Items that will be updated to match batch sums:</p>
              <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-[11px]">
                {(driftAnalysis?.items || []).filter(i => i.hasDrift).map(i => (
                  <div key={i.itemId} className="flex justify-between py-1 border-b border-border/40">
                    <span className="font-sans font-semibold text-foreground">{i.itemName}</span>
                    <span className="text-muted-foreground">
                      {i.currentQuantity} &rarr; <strong className="text-emerald-500">{i.batchSum} {i.unit}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Every reconciled change will generate an audited <code>RECONCILIATION</code> movement in <code>stock_movements</code>, recording your Super Admin identity and delta timestamp.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRepairModalOpen(false)} disabled={isApplyingRepair}>
              Cancel
            </Button>
            <Button
              onClick={handleApplyStockRepair}
              disabled={isApplyingRepair}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
            >
              {isApplyingRepair ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Authorize & Apply Rebalance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Controlled Batch Pruning Modal */}
      <Dialog open={isPruneModalOpen} onOpenChange={setIsPruneModalOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Confirm Controlled Batch Pruning
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Clean up {depletedBatchResult?.count || 0} depleted zero-quantity batch candidates.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 space-y-1">
              <p className="font-bold">Traceability Guarantee:</p>
              <p className="text-[11px] leading-relaxed">
                Batches with existing movement ledger records will NOT have their financial or inventory history deleted. Only unreferenced zero-quantity batches will be deleted, and all actions are recorded in the audit trail.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPruneModalOpen(false)} disabled={isPruningBatches}>
              Cancel
            </Button>
            <Button
              onClick={handleExecutePrune}
              disabled={isPruningBatches}
              className="bg-destructive hover:bg-destructive/90 text-white font-bold cursor-pointer"
            >
              {isPruningBatches ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Confirm Batch Cleanup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
