import { useState } from 'react';
import { 
  Database, RefreshCw, Loader2, Trash2, AlertTriangle, 
  ShieldCheck, HelpCircle, CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn, formatSafeDate } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getBusinessDateString } from '@/lib/businessDate';
import { 
  analyzeStockDrift, 
  reconcileStockDrift, 
  scanDepletedBatches, 
  cleanupDepletedBatches,
  fetchInventoryHealthAudit,
  type SystemTelemetry, 
  type StockDriftItem, 
  type DepletedBatchItem 
} from '../../services/superAdminService';

interface SuperIntegrityTabProps {
  telemetry: SystemTelemetry;
  onRefresh: () => void;
}

export function SuperIntegrityTab({
  telemetry: _telemetry,
  onRefresh
}: SuperIntegrityTabProps) {
  // 1. Audit Query
  const { data: auditData, refetch: refetchAudit, isLoading: isAuditLoading } = useQuery({
    queryKey: ['super-inventory-health-audit'],
    queryFn: fetchInventoryHealthAudit,
  });

  // 2. Drift Analysis State
  const [isAnalyzingDrift, setIsAnalyzingDrift] = useState(false);
  const [driftAnalysis, setDriftAnalysis] = useState<{
    totalItems: number;
    discrepancyCount: number;
    items: StockDriftItem[];
  } | null>(null);
  const [driftError, setDriftError] = useState<string | null>(null);

  // Drift Repair Modal
  const [isRepairModalOpen, setIsRepairModalOpen] = useState(false);
  const [repairReason, setRepairReason] = useState('Super Admin Manual Drift Rebalance');
  const [isApplyingRepair, setIsApplyingRepair] = useState(false);
  const [repairSuccessMessage, setRepairSuccessMessage] = useState<string | null>(null);

  // 3. Depleted Batches State
  const [isScanningBatches, setIsScanningBatches] = useState(false);
  const [depletedBatchResult, setDepletedBatchResult] = useState<{
    count: number;
    batches: DepletedBatchItem[];
  } | null>(null);
  const [isPruneModalOpen, setIsPruneModalOpen] = useState(false);
  const [isPruningBatches, setIsPruningBatches] = useState(false);
  const [pruneSuccessMessage, setPruneSuccessMessage] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  // 4. Batch Expiry Remediation Modal State
  const [remediatingBatch, setRemediatingBatch] = useState<{ id: string; itemName: string; currentExpiry: string } | null>(null);
  const [newVerifiedExpiry, setNewVerifiedExpiry] = useState('');
  const [remediationReason, setRemediationReason] = useState('');
  const [isRemediating, setIsRemediating] = useState(false);
  const [remediationError, setRemediationError] = useState<string | null>(null);

  // Query batches with fake / missing expiry for remediation list
  const { data: anomalousBatches = [], refetch: refetchAnomalousBatches } = useQuery({
    queryKey: ['anomalous-expiry-batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_batches')
        .select('id, item_id, quantity, expiry_date, created_at, inventory_items(name, unit)')
        .gt('quantity', 0)
        .or('expiry_date.is.null,expiry_date.gte.2099-01-01')
        .limit(25);
      if (error) return [];
      return data || [];
    }
  });

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
      const res = await reconcileStockDrift(driftedIds, repairReason || 'Super Admin Manual Drift Rebalance');
      setRepairSuccessMessage(res.message);
      setIsRepairModalOpen(false);
      // Re-run analysis immediately to verify zero drift outcome
      const refreshed = await analyzeStockDrift();
      setDriftAnalysis(refreshed);
      onRefresh();
      refetchAudit();
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

  // Handler: Prune Depleted Batches
  const handlePruneBatches = async () => {
    if (!depletedBatchResult || depletedBatchResult.batches.length === 0) return;
    setIsPruningBatches(true);
    setBatchError(null);
    try {
      const batchIds = depletedBatchResult.batches.map(b => b.batchId);
      const res = await cleanupDepletedBatches(batchIds, 'Super Admin Depleted Batch Pruning');
      setPruneSuccessMessage(res.message);
      setIsPruneModalOpen(false);
      // Refresh scan
      const refreshed = await scanDepletedBatches();
      setDepletedBatchResult(refreshed);
      onRefresh();
      refetchAudit();
    } catch (err: any) {
      setBatchError(err.message || 'Depleted batch cleanup failed');
    } finally {
      setIsPruningBatches(false);
    }
  };

  // Handler: Save Verified Expiry for an Anomalous Batch
  const handleSaveRemediatedExpiry = async () => {
    if (!remediatingBatch || !newVerifiedExpiry) return;
    setIsRemediating(true);
    setRemediationError(null);
    try {
      const { error } = await supabase
        .from('stock_batches')
        .update({
          expiry_date: newVerifiedExpiry,
        })
        .eq('id', remediatingBatch.id);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        action: 'REMEDIATE_BATCH_EXPIRY',
        target_table: 'stock_batches',
        target_id: remediatingBatch.id,
        details: {
          batch_id: remediatingBatch.id,
          previous_expiry: remediatingBatch.currentExpiry,
          new_verified_expiry: newVerifiedExpiry,
          reason: remediationReason || 'Physical inventory verification'
        }
      });

      setRemediatingBatch(null);
      setNewVerifiedExpiry('');
      setRemediationReason('');
      refetchAnomalousBatches();
      refetchAudit();
      onRefresh();
    } catch (err: any) {
      setRemediationError(err.message || 'Failed to update batch expiry');
    } finally {
      setIsRemediating(false);
    }
  };

  const businessDate = getBusinessDateString();

  return (
    <div className="space-y-6">
      {/* 1. Header & Data Quality Overview */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Inventory Integrity & Stock Reconciliation
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Audits stock drift, depleted batches, expiration anomalies, and duplicate item codes.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchAudit();
              refetchAnomalousBatches();
            }}
            disabled={isAuditLoading}
            className="h-8 text-xs font-semibold cursor-pointer border-border hover:bg-muted self-start sm:self-auto"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isAuditLoading && "animate-spin")} />
            Audit Database
          </Button>
        </div>

        {/* 5 Quality Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">Placeholder Expiry</span>
            <div className="text-xl font-bold font-mono text-purple-400">{auditData?.nullOrFakeExpiryBatches ?? 0}</div>
            <p className="text-[10px] text-muted-foreground">Active batches with null/2099</p>
          </div>

          <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">Expired Positive Stock</span>
            <div className="text-xl font-bold font-mono text-destructive">{auditData?.expiredPositiveBatches ?? 0}</div>
            <p className="text-[10px] text-muted-foreground">Past expiry with stock &gt; 0</p>
          </div>

          <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">Zero Stock Items</span>
            <div className="text-xl font-bold font-mono text-foreground">{auditData?.zeroStockItems ?? 0}</div>
            <p className="text-[10px] text-muted-foreground">Completely depleted items</p>
          </div>

          <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">Below Min Threshold</span>
            <div className="text-xl font-bold font-mono text-amber-500">{auditData?.belowMinItems ?? 0}</div>
            <p className="text-[10px] text-muted-foreground">Stock under safety buffer</p>
          </div>

          <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">Duplicate Codes</span>
            <div className="text-xl font-bold font-mono text-foreground">{auditData?.duplicateItemCodes ?? 0}</div>
            <p className="text-[10px] text-muted-foreground">Normalized code collisions</p>
          </div>
        </div>
      </div>

      {/* 2. Stock Drift Analysis & Transactional Reconciliation */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-500" />
              Stock Drift Analysis (Catalog Item Total vs. Active Batch Sum)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Identifies discrepancies between master item current_qty and physical batch stock.
            </p>
          </div>

          <Button
            size="sm"
            onClick={handleRunDriftAnalysis}
            disabled={isAnalyzingDrift}
            className="h-8 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer self-start sm:self-auto"
          >
            {isAnalyzingDrift ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Analyzing Drift...
              </>
            ) : (
              'Run Drift Diagnostics'
            )}
          </Button>
        </div>

        {driftError && (
          <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{driftError}</span>
          </div>
        )}

        {repairSuccessMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{repairSuccessMessage}</span>
          </div>
        )}

        {driftAnalysis && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs p-3 rounded-xl bg-muted/40 border border-border">
              <span className="font-semibold text-foreground">
                Total Items Analyzed: <strong className="font-mono">{driftAnalysis.totalItems}</strong>
              </span>
              <span className={cn(
                "px-2.5 py-0.5 rounded-full font-bold",
                driftAnalysis.discrepancyCount > 0 ? "bg-destructive text-white" : "bg-emerald-500/15 text-emerald-500"
              )}>
                {driftAnalysis.discrepancyCount > 0 
                  ? `${driftAnalysis.discrepancyCount} Drift Discrepancies Detected` 
                  : '✓ Zero Drift Detected'}
              </span>
            </div>

            {driftAnalysis.items.filter(i => i.hasDrift).length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted text-muted-foreground font-semibold border-b border-border">
                    <tr>
                      <th className="p-2.5">Item Name</th>
                      <th className="p-2.5 text-center">Unit</th>
                      <th className="p-2.5 text-right">Catalog Qty</th>
                      <th className="p-2.5 text-right">Batch Sum</th>
                      <th className="p-2.5 text-right">Drift Delta</th>
                      <th className="p-2.5 text-center">Active Batches</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {driftAnalysis.items.filter(i => i.hasDrift).map(item => (
                      <tr key={item.itemId} className="hover:bg-muted/30">
                        <td className="p-2.5 font-bold text-foreground">{item.itemName}</td>
                        <td className="p-2.5 text-center text-muted-foreground">{item.unit}</td>
                        <td className="p-2.5 text-right font-mono font-semibold">{item.currentQuantity}</td>
                        <td className="p-2.5 text-right font-mono font-semibold">{item.batchSum}</td>
                        <td className={cn(
                          "p-2.5 text-right font-mono font-bold",
                          item.driftDelta > 0 ? "text-emerald-500" : "text-destructive"
                        )}>
                          {item.driftDelta > 0 ? `+${item.driftDelta}` : item.driftDelta}
                        </td>
                        <td className="p-2.5 text-center font-mono">{item.activeBatchesCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {driftAnalysis.discrepancyCount > 0 && (
              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  onClick={() => setIsRepairModalOpen(true)}
                  className="h-8 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                >
                  Reconcile Discrepancies (Transactional)
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Anomalous & Placeholder Expiry Remediation Queue */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-purple-400" />
              Unverified / Placeholder Expiry Batch Queue
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Active batches recorded with null or 2099 placeholder expiry dates requiring physical staff verification.
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-purple-400">
            {anomalousBatches.length} Batches Listed
          </span>
        </div>

        {anomalousBatches.length === 0 ? (
          <div className="p-4 rounded-xl bg-muted/30 border border-border text-center text-xs text-muted-foreground">
            No active batches have missing or fake 2099 expiry dates.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted text-muted-foreground font-semibold border-b border-border">
                <tr>
                  <th className="p-2.5">Item Name</th>
                  <th className="p-2.5 text-right">Quantity</th>
                  <th className="p-2.5">Recorded Expiry</th>
                  <th className="p-2.5">Received Date</th>
                  <th className="p-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {anomalousBatches.map((b: any) => (
                  <tr key={b.id} className="hover:bg-muted/30">
                    <td className="p-2.5 font-bold text-foreground">
                      {b.inventory_items?.name || 'Unknown item'}
                    </td>
                    <td className="p-2.5 text-right font-mono font-semibold">
                      {b.quantity} {b.inventory_items?.unit || ''}
                    </td>
                    <td className="p-2.5 font-mono text-purple-400 font-bold">
                      {b.expiry_date || 'NULL'}
                    </td>
                    <td className="p-2.5 text-muted-foreground font-mono">
                      {formatSafeDate(b.created_at, 'yyyy-MM-dd')}
                    </td>
                    <td className="p-2.5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRemediatingBatch({
                            id: b.id,
                            itemName: b.inventory_items?.name || 'Item',
                            currentExpiry: b.expiry_date || 'NULL'
                          });
                          setNewVerifiedExpiry('');
                          setRemediationReason('');
                        }}
                        className="h-7 text-xs font-bold cursor-pointer hover:bg-primary hover:text-primary-foreground"
                      >
                        Set Real Expiry
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Depleted Batches Pruning */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-muted-foreground" />
              Depleted Batches Archival (0 Quantity Batches)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Safely prunes fully consumed historical batches to maintain lean FEFO query performance.
            </p>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleScanBatches}
            disabled={isScanningBatches}
            className="h-8 text-xs font-semibold cursor-pointer border-border hover:bg-muted self-start sm:self-auto"
          >
            {isScanningBatches ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Scanning Batches...
              </>
            ) : (
              'Scan Depleted Batches'
            )}
          </Button>
        </div>

        {batchError && (
          <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{batchError}</span>
          </div>
        )}

        {pruneSuccessMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{pruneSuccessMessage}</span>
          </div>
        )}

        {depletedBatchResult && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs p-3 rounded-xl bg-muted/40 border border-border">
              <span className="font-semibold text-foreground">
                Depleted Batches Found: <strong className="font-mono">{depletedBatchResult.count}</strong>
              </span>
              {depletedBatchResult.count > 0 && (
                <Button
                  size="sm"
                  onClick={() => setIsPruneModalOpen(true)}
                  className="h-7 text-xs font-bold bg-destructive hover:bg-destructive/90 text-white cursor-pointer"
                >
                  Prune {depletedBatchResult.count} Depleted Batches
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: Drift Reconciliation Confirmation */}
      <Dialog open={isRepairModalOpen} onOpenChange={setIsRepairModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Confirm Stock Drift Reconciliation
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              This executes an atomic PostgreSQL transaction that rebalances master item totals to equal the exact sum of verified active physical batches, recording ledger movements and audit entries.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1">
              <p className="font-semibold text-foreground">Affected Items with Discrepancy:</p>
              <p className="text-muted-foreground font-mono">
                {driftAnalysis?.items.filter(i => i.hasDrift).map(i => `${i.itemName} (${i.driftDelta > 0 ? '+' : ''}${i.driftDelta})`).join(', ')}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Reconciliation Reason (Audit Mandate):</label>
              <Input
                value={repairReason}
                onChange={e => setRepairReason(e.target.value)}
                placeholder="Reason for stock rebalance..."
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsRepairModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isApplyingRepair || !repairReason.trim()}
              onClick={handleApplyStockRepair}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
            >
              {isApplyingRepair ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Execute Reconciliation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Depleted Batch Pruning Confirmation */}
      <Dialog open={isPruneModalOpen} onOpenChange={setIsPruneModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Confirm Depleted Batches Pruning
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Permanently archives {depletedBatchResult?.count} batches whose quantity is 0 and records an audit log.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsPruneModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isPruningBatches}
              onClick={handlePruneBatches}
              className="font-bold cursor-pointer"
            >
              {isPruningBatches ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Confirm Prune
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Remediate Anomalous Expiry */}
      <Dialog open={Boolean(remediatingBatch)} onOpenChange={(open) => { if (!open) setRemediatingBatch(null); }}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-purple-400" />
              Verify & Set Physical Expiry Date
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Item: <strong>{remediatingBatch?.itemName}</strong> (Current recorded expiry: {remediatingBatch?.currentExpiry})
            </DialogDescription>
          </DialogHeader>

          {remediationError && (
            <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold">
              {remediationError}
            </div>
          )}

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Verified Expiration Date (Required):</label>
              <Input
                type="date"
                min={businessDate}
                value={newVerifiedExpiry}
                onChange={e => setNewVerifiedExpiry(e.target.value)}
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Verification Reference / Audit Note:</label>
              <Input
                value={remediationReason}
                onChange={e => setRemediationReason(e.target.value)}
                placeholder="Physical package inspection, invoice reference, etc."
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRemediatingBatch(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isRemediating || !newVerifiedExpiry}
              onClick={handleSaveRemediatedExpiry}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
            >
              {isRemediating ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Save Verified Expiry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
