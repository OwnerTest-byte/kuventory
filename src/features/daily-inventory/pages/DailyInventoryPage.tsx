import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useDailyInventory, useFinalizeDailyInventory, dailyInventoryKeys } from '../hooks/useDailyInventory';
import { InventorySheet } from '../components/InventorySheet';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { 
  Loader2, 
  AlertTriangle, 
  CalendarIcon, 
  RefreshCw, 
  CheckCircle2, 
  Lock, 
  FileText, 
  LayoutDashboard,
  Sparkles
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export function DailyInventoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [showCelebrationModal, setShowCelebrationModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { data: record, isLoading, error } = useDailyInventory(date);
  const finalizeMutation = useFinalizeDailyInventory(date);

  // Calculate completion progress, totals, and discrepancies
  const { completedCount, discrepancies, totalAm, totalPm, totalEnding, totalEntries } = useMemo(() => {
    const entries = record?.daily_inventory_entries || [];
    let completed = 0;
    const disc: typeof entries = [];
    let am = 0, pm = 0, end = 0;

    entries.forEach(e => {
      am += e.sales_am;
      pm += e.sales_pm;
      end += e.ending_qty;

      if (e.ending_qty < 0) {
        disc.push(e);
      }
      if (e.sales_am > 0 || e.sales_pm > 0 || e.add_qty > 0 || e.ending_qty > 0) {
        completed++;
      }
    });

    return {
      completedCount: completed,
      discrepancies: disc,
      totalAm: am,
      totalPm: pm,
      totalEnding: end,
      totalEntries: entries.length
    };
  }, [record?.daily_inventory_entries]);

  const completionPct = totalEntries > 0 ? Math.min(100, Math.round((completedCount / totalEntries) * 100)) : 0;
  const isFinalized = record?.status === 'FINALIZED';

  const [finalizedSnapshot, setFinalizedSnapshot] = useState<{
    totalItems: number;
    salesAm: number;
    salesPm: number;
    endingStock: number;
    reportId?: string;
  } | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.date(date) });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleFinalize = async () => {
    if (!record) return;
    await finalizeMutation.mutateAsync(record.id);
    setShowFinalizeDialog(false);
    setFinalizedSnapshot({
      totalItems: totalEntries,
      salesAm: totalAm,
      salesPm: totalPm,
      endingStock: totalEnding,
      reportId: record.id
    });
    setShowCelebrationModal(true);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-28 sm:pb-16 text-foreground animate-in fade-in">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground uppercase">
              DAILY INVENTORY WORKSHEET
            </h1>
            {record && (
              isFinalized ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/25">
                  <Lock size={12} /> Finalized & Locked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/25">
                  <CheckCircle2 size={12} /> Live Autosave Active
                </span>
              )
            )}
          </div>

          <div className="flex flex-wrap items-center text-sm text-muted-foreground mt-2 gap-3">
            <div className="flex items-center">
              <span className="font-semibold mr-2 text-foreground text-xs sm:text-sm">Worksheet Date:</span>
              <div className="flex items-center border border-border rounded-lg px-2.5 py-1 bg-card relative hover:border-muted-foreground/40 transition-colors shadow-2xs">
                <span className="mr-2 font-medium text-foreground text-xs sm:text-sm">
                  {format(new Date(date + 'T00:00:00'), 'MMM dd, yyyy')}
                </span>
                <CalendarIcon className="w-4 h-4 text-muted-foreground cursor-pointer" />
                <input 
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  aria-label="Select worksheet date"
                />
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="text-muted-foreground hover:text-foreground h-8 px-2 cursor-pointer"
              title="Refresh sheet data from database"
            >
              <RefreshCw size={14} className={`mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Sync
            </Button>
          </div>
        </div>
        
        {/* Top Header Desktop Action Buttons */}
        <div className="hidden sm:flex flex-wrap items-center gap-2 sm:gap-3">
          <Button 
            variant="outline" 
            onClick={() => {
              if (record?.id) {
                navigate(`/reports/${record.id}`);
              } else {
                navigate('/reports');
              }
            }}
            className="border-border text-foreground bg-card font-bold hover:bg-muted cursor-pointer"
          >
            <FileText className="w-4 h-4 mr-1.5 text-muted-foreground" />
            Preview Report
          </Button>
          
          {!isFinalized && (
            <Button 
              onClick={() => setShowFinalizeDialog(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-xs cursor-pointer"
              disabled={isLoading || !record}
            >
              <Lock className="w-4 h-4 mr-1.5" />
              Finalize Day
            </Button>
          )}
        </div>
      </div>

      {/* Progress & Discrepancy Bar (Zeigarnik Effect & Goal-Gradient Effect) */}
      {record && !isLoading && totalEntries > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground uppercase tracking-wider">
                Shift Reconciliation Progress
              </span>
              <span className="font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md font-mono text-[11px]">
                {completedCount} of {totalEntries} SKUs ({completionPct}%)
              </span>
            </div>

            {discrepancies.length > 0 ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{discrepancies.length} item(s) with negative ending balance!</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Zero Discrepancies</span>
              </div>
            )}
          </div>

          <div className="w-full bg-muted rounded-full h-2 overflow-hidden p-0.5 border border-border/70">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out",
                completionPct === 100 ? "bg-emerald-500" : "bg-primary"
              )}
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col items-center justify-center p-16 text-muted-foreground space-y-3 bg-card rounded-xl border border-border shadow-xs">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Loading daily inventory worksheet...</p>
        </div>
      )}
      
      {error && (
        <div className="p-4 bg-rose-500/10 text-rose-500 rounded-xl border border-rose-500/20 shadow-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Error loading inventory worksheet</p>
            <p className="text-sm opacity-90">{(error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-2 text-xs bg-card border-border cursor-pointer">
              Try Again
            </Button>
          </div>
        </div>
      )}

      {record && !isLoading && (
        <InventorySheet 
          session={record} 
          isReadOnly={isFinalized} 
          date={date}
        />
      )}

      {/* Confirmation Finalize Dialog (Postel's Law Error Prevention) */}
      <Dialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <DialogContent className="bg-card text-card-foreground border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-500" />
              Finalize Daily Inventory for {format(new Date(date + 'T00:00:00'), 'MMMM dd, yyyy')}?
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Finalizing permanently locks this day's record, generates an official immutable daily snapshot report, and executes FEFO stock deductions in the database.
            </DialogDescription>
          </DialogHeader>

          {discrepancies.length > 0 ? (
            <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-xl space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Notice: {discrepancies.length} item(s) have negative ending stock!</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Please verify AM and PM sales numbers for: <strong className="text-foreground">{discrepancies.slice(0, 3).map(d => d.items?.item_name).join(', ')}{discrepancies.length > 3 ? '...' : ''}</strong> before finalizing.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl my-1">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                All {totalEntries} items have valid reconciliations with zero negative discrepancies. Ready for official report generation.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setShowFinalizeDialog(false)} 
              disabled={finalizeMutation.isPending} 
              className="border-border text-foreground cursor-pointer"
            >
              Cancel & Review
            </Button>
            <Button 
              onClick={handleFinalize} 
              disabled={finalizeMutation.isPending} 
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
            >
              {finalizeMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Finalizing Day...</>
              ) : (
                "Confirm & Lock Record"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Peak-End Rule: Celebratory Shift Completion Modal */}
      <Dialog open={showCelebrationModal} onOpenChange={setShowCelebrationModal}>
        <DialogContent className="bg-card text-foreground border-border max-w-md text-center">
          <div className="py-2 space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 mx-auto">
              <Sparkles className="w-7 h-7 animate-bounce" />
            </div>

            <div>
              <DialogTitle className="text-xl font-black text-foreground">
                Daily Inventory Finalized!
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Official closing snapshot created for <strong className="text-foreground">{format(new Date(date + 'T00:00:00'), 'MMMM dd, yyyy')}</strong>. FEFO batch consumption complete.
              </DialogDescription>
            </div>

            {finalizedSnapshot && (
              <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-muted/40 border border-border text-xs text-left">
                <div className="p-2.5 rounded-lg bg-card border border-border/70">
                  <span className="text-muted-foreground block text-[11px]">Total SKUs</span>
                  <span className="font-bold text-foreground text-sm font-mono">{finalizedSnapshot.totalItems} Items</span>
                </div>
                <div className="p-2.5 rounded-lg bg-card border border-border/70">
                  <span className="text-muted-foreground block text-[11px]">Sales AM Total</span>
                  <span className="font-bold text-amber-500 text-sm font-mono">{finalizedSnapshot.salesAm}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-card border border-border/70">
                  <span className="text-muted-foreground block text-[11px]">Sales PM Total</span>
                  <span className="font-bold text-amber-500 text-sm font-mono">{finalizedSnapshot.salesPm}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-card border border-border/70">
                  <span className="text-muted-foreground block text-[11px]">Final Ending Balance</span>
                  <span className="font-bold text-emerald-500 text-sm font-mono">{finalizedSnapshot.endingStock}</span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={() => {
                  setShowCelebrationModal(false);
                  if (finalizedSnapshot?.reportId) {
                    navigate(`/reports/${finalizedSnapshot.reportId}`);
                  } else {
                    navigate('/reports');
                  }
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 cursor-pointer shadow-xs"
              >
                <FileText className="w-4 h-4 mr-2" />
                View Official Daily Report
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCelebrationModal(false);
                  navigate('/inventory');
                }}
                className="w-full border-border text-foreground font-semibold h-10 cursor-pointer"
              >
                <LayoutDashboard className="w-4 h-4 mr-2 text-muted-foreground" />
                Return to Dashboard
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Sticky Action Bar (Fitts's Law - Thumb Zone for Mobile Devices) */}
      <div className="fixed bottom-16 left-0 right-0 p-3 bg-card/95 backdrop-blur-md border-t border-border flex items-center justify-between gap-3 sm:hidden z-30 shadow-lg">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-xs font-bold text-foreground truncate">
            {isFinalized ? 'Finalized' : `${completionPct}% Reconciled`}
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">
            ({completedCount}/{totalEntries})
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (record?.id) navigate(`/reports/${record.id}`);
              else navigate('/reports');
            }}
            className="text-xs font-bold h-9 px-3 border-border cursor-pointer"
          >
            Report
          </Button>
          {!isFinalized && (
            <Button
              size="sm"
              onClick={() => setShowFinalizeDialog(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs h-9 px-3.5 shadow-sm cursor-pointer"
              disabled={isLoading || !record}
            >
              <Lock className="w-3 h-3 mr-1" />
              Finalize
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
