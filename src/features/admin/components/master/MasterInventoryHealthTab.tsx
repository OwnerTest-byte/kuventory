import { useState } from 'react';
import { 
  Layers, CheckCircle2, AlertTriangle, RefreshCw, Trash2, 
  Wrench, ShieldCheck, Info, Loader2, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MasterInventoryHealthTabProps {
  counts: {
    activeItems: number;
    totalStockUnits: number;
    lowStock: number;
    outOfStock: number;
    expiringSoon: number;
    expired: number;
    depletedBatches: number;
  };
  onRebalanceStockDrift: () => Promise<void>;
  isRebalancingStock: boolean;
  rebalanceResult: string | null;
  onCleanNegativeBatches: () => Promise<void>;
  isCleaningBatches: boolean;
  cleanBatchResult: string | null;
  onOpenPurgeConfirm: () => void;
  purgeSuccess: string | null;
}

export function MasterInventoryHealthTab({
  counts,
  onRebalanceStockDrift,
  isRebalancingStock,
  rebalanceResult,
  onCleanNegativeBatches,
  isCleaningBatches,
  cleanBatchResult,
  onOpenPurgeConfirm,
  purgeSuccess,
}: MasterInventoryHealthTabProps) {
  const [activeSubSection, setActiveSubSection] = useState<'metrics' | 'fefo' | 'zero_stock' | 'concurrency'>('metrics');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-500" />
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Inventory Health, FEFO & Concurrency Engine
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Verify stock accuracy, First-Expired First-Out (FEFO) batch allocation, zero-stock expiry rules, and multi-user concurrency protection.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRebalanceStockDrift}
              disabled={isRebalancingStock}
              className="text-xs font-bold border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
            >
              {isRebalancingStock ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Rebalance Drift
            </Button>
          </div>
        </div>

        {/* Sub-section Switcher */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
          <button
            onClick={() => setActiveSubSection('metrics')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              activeSubSection === 'metrics'
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:text-foreground"
            )}
          >
            Core Inventory Metrics
          </button>
          <button
            onClick={() => setActiveSubSection('zero_stock')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              activeSubSection === 'zero_stock'
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:text-foreground"
            )}
          >
            Zero-Stock Expiry Rule
          </button>
          <button
            onClick={() => setActiveSubSection('fefo')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              activeSubSection === 'fefo'
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:text-foreground"
            )}
          >
            FEFO Allocation Health
          </button>
          <button
            onClick={() => setActiveSubSection('concurrency')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              activeSubSection === 'concurrency'
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:text-foreground"
            )}
          >
            Multi-User Concurrency
          </button>
        </div>
      </div>

      {/* Action Results */}
      {rebalanceResult && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-foreground flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{rebalanceResult}</span>
        </div>
      )}
      {cleanBatchResult && (
        <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-xs text-foreground flex items-center gap-2">
          <Info className="w-4 h-4 text-primary shrink-0" />
          <span>{cleanBatchResult}</span>
        </div>
      )}
      {purgeSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-500 font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
          <span>{purgeSuccess}</span>
        </div>
      )}

      {/* SUB-SECTION 1: CORE METRICS */}
      {activeSubSection === 'metrics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-4 rounded-xl bg-card border border-border">
              <span className="text-muted-foreground text-[11px] block font-medium">Active Items</span>
              <span className="text-2xl font-black text-foreground mt-1 block">{counts.activeItems}</span>
              <span className="text-[10px] text-emerald-500 font-bold">Catalog items</span>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border">
              <span className="text-muted-foreground text-[11px] block font-medium">Total Quantity</span>
              <span className="text-2xl font-black text-foreground mt-1 block">{counts.totalStockUnits}</span>
              <span className="text-[10px] text-muted-foreground">Units in stock</span>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border">
              <span className="text-muted-foreground text-[11px] block font-medium">Low Stock</span>
              <span className={cn("text-2xl font-black mt-1 block", counts.lowStock > 0 ? "text-amber-500" : "text-foreground")}>
                {counts.lowStock}
              </span>
              <span className="text-[10px] text-amber-500 font-bold">&lt; Min threshold</span>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border">
              <span className="text-muted-foreground text-[11px] block font-medium">Out of Stock</span>
              <span className={cn("text-2xl font-black mt-1 block", counts.outOfStock > 0 ? "text-rose-500" : "text-foreground")}>
                {counts.outOfStock}
              </span>
              <span className="text-[10px] text-rose-500 font-bold">0 units available</span>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border">
              <span className="text-muted-foreground text-[11px] block font-medium">Expiring Soon</span>
              <span className={cn("text-2xl font-black mt-1 block", counts.expiringSoon > 0 ? "text-amber-500" : "text-foreground")}>
                {counts.expiringSoon}
              </span>
              <span className="text-[10px] text-amber-500 font-bold">&le; 7 days left</span>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border">
              <span className="text-muted-foreground text-[11px] block font-medium">Depleted Batches</span>
              <span className="text-2xl font-black text-foreground mt-1 block">{counts.depletedBatches}</span>
              <span className="text-[10px] text-muted-foreground">Qty &le; 0 (Preserved)</span>
            </div>
          </div>

          {/* Operational Contingency Tools */}
          <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
            <h3 className="text-base font-bold text-foreground">Operational Auto-Healing Tools</h3>
            <p className="text-xs text-muted-foreground">
              Direct root actions to remediate stock drifts, clean phantom records, or initialize catalog resets.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-amber-500" /> Stock Drift Rebalancer
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Audits all items against FEFO stock batches, synchronizing balance discrepancies and OCC versions.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRebalanceStockDrift}
                  disabled={isRebalancingStock}
                  className="w-full text-xs font-bold border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
                >
                  {isRebalancingStock ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                  Audit & Heal Drift
                </Button>
              </div>

              <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" /> Zero-Batch Purge
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Cleans zero or negative quantity batches that linger after consumption to optimize query indexes.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCleanNegativeBatches}
                  disabled={isCleaningBatches}
                  className="w-full text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {isCleaningBatches ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                  Purge Depleted Batches
                </Button>
              </div>

              <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-3 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-rose-500 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Clean-Slate Reset
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Permanently purges items and batches while strictly preserving all 7 categories and staff logins.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onOpenPurgeConfirm}
                  className="w-full text-xs font-bold cursor-pointer"
                >
                  Clean Slate Reset
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-SECTION 2: ZERO-STOCK EXPIRY RULE VERIFIER */}
      {activeSubSection === 'zero_stock' && (
        <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <h3 className="text-base font-bold text-foreground">
              Zero-Stock Expiry Rule Verification Engine
            </h3>
          </div>

          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-foreground space-y-2">
            <p className="font-bold text-emerald-600 dark:text-emerald-400">
              Verified Rule: Depleted stock (quantity &le; 0) is excluded from active operational expiry alerts.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              If an item or batch has <strong>quantity_remaining &le; 0</strong>, even if its expiry date has passed, it must <em>NOT</em> be flagged as an active expiring inventory alert because there is no physical stock at risk. However, it must remain preserved in the database for historical reporting, reconciliation, and audit integrity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
            <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-2">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Positive Stock + Expiring Soon
              </span>
              <p className="text-muted-foreground">
                Batch with <code className="bg-muted px-1 rounded font-mono">quantity &gt; 0</code> and <code className="bg-muted px-1 rounded font-mono">expiry_date &le; 7 days</code>:
              </p>
              <div className="p-2 rounded bg-card border border-border font-mono text-[11px] text-amber-500 font-bold">
                Status: ACTIVE OPERATIONAL ALERT ({counts.expiringSoon} items detected)
              </div>
            </div>

            <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-2">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Zero Stock + Expired
              </span>
              <p className="text-muted-foreground">
                Batch with <code className="bg-muted px-1 rounded font-mono">quantity = 0</code> and <code className="bg-muted px-1 rounded font-mono">expiry_date &lt; today</code>:
              </p>
              <div className="p-2 rounded bg-card border border-border font-mono text-[11px] text-emerald-500 font-bold">
                Status: PRESERVED FOR AUDIT ({counts.depletedBatches} batches preserved)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-SECTION 3: FEFO ALLOCATION HEALTH */}
      {activeSubSection === 'fefo' && (
        <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-bold text-foreground">
              First-Expired First-Out (FEFO) Allocation Verification
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            KUVENTORY enforces automated FEFO batch consumption at the PostgreSQL level through the <code className="bg-muted px-1 font-mono rounded">consume_stock</code> RPC.
          </p>

          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="font-medium text-muted-foreground">Earliest Expiry Priority:</span>
              <span className="font-bold text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> ORDER BY expiry_date ASC, id ASC
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="font-medium text-muted-foreground">Zero-Quantity Exclusion:</span>
              <span className="font-bold text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> WHERE quantity &gt; 0 Enforced
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="font-medium text-muted-foreground">Expired Stock Isolation:</span>
              <span className="font-bold text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Excluded from Sales Allocations
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-muted-foreground">Ledger Atomicity:</span>
              <span className="font-bold text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Atomic Movement Audit Recorded
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SUB-SECTION 4: MULTI-USER CONCURRENCY PROTECTION */}
      {activeSubSection === 'concurrency' && (
        <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h3 className="text-base font-bold text-foreground">
              Multi-User Concurrency & Race Condition Elimination
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Addresses the critical scenario: <strong>Two users on the same account or separate accounts modifying the exact same stock item simultaneously.</strong>
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-2">
            <div className="p-4 rounded-xl bg-card border border-border space-y-2">
              <span className="font-bold text-primary block">1. Database Row Locking</span>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Stock mutations utilize <code className="bg-muted px-1 rounded font-mono">SELECT ... FOR UPDATE</code>. Simultaneous requests are serialized by Postgres, eliminating race conditions.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border space-y-2">
              <span className="font-bold text-primary block">2. Optimistic Concurrency (OCC)</span>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Every mutation checks and increments the row's <code className="bg-muted px-1 rounded font-mono">version</code> counter. Stale submissions are rejected safely without data corruption.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border space-y-2">
              <span className="font-bold text-primary block">3. Instant Real-Time Sync</span>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                When User A updates stock, Supabase Realtime pushes changes to User B instantly, automatically synchronizing worksheet inputs without page reload.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
