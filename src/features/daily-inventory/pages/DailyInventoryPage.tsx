import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useDailyInventory, useFinalizeDailyInventory, dailyInventoryKeys } from '../hooks/useDailyInventory';
import { InventorySheet } from '../components/InventorySheet';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { 
  Loader2, 
  AlertTriangle, 
  CalendarIcon, 
  RefreshCw, 
  CheckCircle2, 
  Lock, 
  FileText, 
  LayoutDashboard,
  Sparkles,
  Edit3,
  History,
  Save
} from 'lucide-react';
import { format } from 'date-fns';
import { cn, formatUserDisplayName } from '@/lib/utils';
import { useAuth } from '@/features/auth/context/AuthContext';
import { 
  correctFinalizedDailyInventory, 
  fetchDailyInventoryRevisions, 
  type DailyInventoryRevision 
} from '../services/correctionService';

export function DailyInventoryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();
  // All authenticated users (Staff, Admins, Super Admins) are authorized to correct a finalized day with an audit reason
  const isAuthorizedToCorrect = !!user;

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [showCelebrationModal, setShowCelebrationModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Correction Mode & Revision History States
  const [isCorrectionMode, setIsCorrectionMode] = useState(false);
  const [showCorrectionPrompt, setShowCorrectionPrompt] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [showSaveCorrectionDialog, setShowSaveCorrectionDialog] = useState(false);
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);
  const [correctionResult, setCorrectionResult] = useState<{ revisionNumber: number; message: string } | null>(null);
  const [showCorrectionSuccessModal, setShowCorrectionSuccessModal] = useState(false);
  const [showRevisionHistoryModal, setShowRevisionHistoryModal] = useState(false);
  const [revisions, setRevisions] = useState<DailyInventoryRevision[]>([]);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
  
  const { data: record, isLoading, error } = useDailyInventory(date);
  const finalizeMutation = useFinalizeDailyInventory(date);

  // Automatically trigger correction prompt if navigated with ?correct=true
  useEffect(() => {
    if (searchParams.get('correct') === 'true' && record?.status === 'FINALIZED' && isAuthorizedToCorrect) {
      setShowCorrectionPrompt(true);
      const next = new URLSearchParams(searchParams);
      next.delete('correct');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, record?.status, isAuthorizedToCorrect, setSearchParams]);

  // Realtime synchronization across devices and automated 30-day sheet archival
  useEffect(() => {
    // 1. Automated 30-day archival
    Promise.resolve(supabase.rpc('archive_old_daily_inventory_sheets')).catch(() => {});

    // 2. Realtime channel subscription
    const channel = supabase.channel(`daily-sheet-sync-${date}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_inventory' },
        () => {
          queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.date(date) });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_inventory_items' },
        () => {
          queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.date(date) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [date, queryClient]);

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

  const handleOpenRevisionHistory = async () => {
    if (!record?.id) return;
    setIsLoadingRevisions(true);
    setShowRevisionHistoryModal(true);
    try {
      const data = await fetchDailyInventoryRevisions(record.id);
      setRevisions(data);
    } catch (e) {
      console.warn('Error fetching revisions:', e);
    } finally {
      setIsLoadingRevisions(false);
    }
  };

  const handleStartCorrection = () => {
    if (!correctionReason.trim()) {
      alert('Please enter a reason for correcting this finalized day.');
      return;
    }
    setShowCorrectionPrompt(false);
    setIsCorrectionMode(true);
  };

  const handleSaveCorrectionSubmit = async () => {
    if (!record?.id) return;
    setIsSubmittingCorrection(true);
    try {
      const entries = record.daily_inventory_entries || [];
      const correctedItems = entries.map(e => ({
        id: e.id,
        item_id: e.item_id,
        item_name: e.item_name,
        unit: e.unit,
        beg: e.beginning_qty,
        add: e.add_qty,
        am: e.sales_am,
        pm: e.sales_pm,
        ending: e.ending_qty,
      }));

      const res = await correctFinalizedDailyInventory({
        dailyInventoryId: record.id,
        inventoryDate: record.inventory_date,
        reason: correctionReason || 'Audit reconciliation correction',
        correctedItems,
        userProfile: {
          id: profile?.id || user?.id,
          email: user?.email,
          displayName: formatUserDisplayName(profile, user?.email),
        }
      });

      setCorrectionResult({
        revisionNumber: res.revisionNumber,
        message: res.message,
      });

      await queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.all });
      await queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.date(date) });
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['items'] });
      await queryClient.invalidateQueries({ queryKey: ['batches'] });
      await queryClient.invalidateQueries({ queryKey: ['today-inventory-session'] });

      setShowSaveCorrectionDialog(false);
      setIsCorrectionMode(false);
      setCorrectionReason('');
      setShowCorrectionSuccessModal(true);
    } catch (err: any) {
      alert(err.message || 'Failed to save correction');
    } finally {
      setIsSubmittingCorrection(false);
    }
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 pb-28 sm:pb-16 text-foreground">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground uppercase">
              DAILY INVENTORY
            </h1>
            {record && (
              isFinalized ? (
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/25">
                    <Lock size={12} /> {isCorrectionMode ? 'CORRECTION IN PROGRESS' : 'FINALIZED'}
                  </span>
                  {revisions.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      REV {revisions[0]?.revision_number || revisions.length}
                    </span>
                  )}
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/25">
                  <CheckCircle2 size={12} /> DRAFT
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
        
        {/* Top Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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

          {isFinalized && (
            <Button
              variant="outline"
              onClick={handleOpenRevisionHistory}
              className="border-border text-foreground bg-card font-bold hover:bg-muted cursor-pointer"
              title="View revision audit history for this sheet"
            >
              <History className="w-4 h-4 mr-1.5 text-primary" />
              Revisions
            </Button>
          )}

          {isFinalized && isAuthorizedToCorrect && !isCorrectionMode && (
            <Button
              onClick={() => {
                setCorrectionReason('');
                setShowCorrectionPrompt(true);
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer shadow-xs"
            >
              <Edit3 className="w-4 h-4 mr-1.5" />
              Correct Finalized Day
            </Button>
          )}

          {isCorrectionMode && (
            <>
              <Button
                variant="outline"
                onClick={() => setIsCorrectionMode(false)}
                className="border-border text-foreground font-semibold hover:bg-muted cursor-pointer"
              >
                Cancel Edit
              </Button>
              <Button
                onClick={() => setShowSaveCorrectionDialog(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer shadow-xs"
              >
                <Save className="w-4 h-4 mr-1.5" />
                Save Finalized Correction
              </Button>
            </>
          )}
          
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

      {/* Correction Mode Active Banner */}
      {isCorrectionMode && (
        <div className="bg-amber-500/15 border-2 border-amber-500/40 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">CORRECTION MODE ACTIVE</span>
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/25 text-amber-600 dark:text-amber-400">
                  Auditable Revision
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reason: <strong className="text-foreground">{correctionReason || 'Post-finalization correction'}</strong>. Adjust values below. Changes are reconciled against FEFO stock ledger upon save.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCorrectionMode(false)}
              className="text-xs font-semibold border-border text-foreground hover:bg-muted cursor-pointer"
            >
              Cancel Edit
            </Button>
            <Button
              size="sm"
              onClick={() => setShowSaveCorrectionDialog(true)}
              disabled={isSubmittingCorrection}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              Save Finalized Correction
            </Button>
          </div>
        </div>
      )}

      {/* Progress & Discrepancy Bar (Zeigarnik Effect & Goal-Gradient Effect) */}
      {record && !isLoading && totalEntries > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground uppercase tracking-wider">
                Shift Reconciliation Progress
              </span>
              <span className="font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md font-mono text-[11px]">
                {completedCount} of {totalEntries} items ({completionPct}%)
              </span>
            </div>

            {discrepancies.length > 0 ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
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
          isReadOnly={isFinalized && !isCorrectionMode} 
          date={date}
        />
      )}

      {/* Modal 1: Prompt Reason for Entering Correction Mode */}
      <Dialog open={showCorrectionPrompt} onOpenChange={setShowCorrectionPrompt}>
        <DialogContent className="bg-card text-foreground border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Edit3 className="w-5 h-5 text-amber-500" />
              Correct Finalized Inventory
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs leading-relaxed">
              You are unlocking the finalized sheet for <strong>{format(new Date(date + 'T00:00:00'), 'MMMM dd, yyyy')}</strong> in auditable correction mode. All modified quantities will be differentials-reconciled against the stock ledger.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                Audit Reason for Correction <span className="text-rose-500">*</span>
              </label>
              <Input
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="e.g. Recounted PM bar usage / adjusted misplaced stock"
                className="text-xs bg-card border-border text-foreground h-10"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                This explanation will be permanently recorded in the revision history.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCorrectionPrompt(false)}
              className="border-border text-foreground cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleStartCorrection}
              disabled={!correctionReason.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
            >
              Enter Correction Mode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Confirm Saving Finalized Day Correction */}
      <Dialog open={showSaveCorrectionDialog} onOpenChange={setShowSaveCorrectionDialog}>
        <DialogContent className="bg-card text-foreground border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Save className="w-5 h-5 text-amber-500" />
              Save Finalized Sheet Correction?
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs leading-relaxed">
              Saving will atomically compute net stock changes, apply non-duplicate FEFO ledger adjustments, freeze a new official revision, and lock the sheet.
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 bg-muted/40 rounded-xl border border-border text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reporting Date:</span>
              <span className="font-bold text-foreground">{date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Audit Reason:</span>
              <span className="font-semibold text-foreground max-w-xs truncate">{correctionReason || 'Post-finalization adjustment'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Corrected By:</span>
              <span className="font-semibold text-foreground">{formatUserDisplayName(profile, user?.email)}</span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowSaveCorrectionDialog(false)}
              disabled={isSubmittingCorrection}
              className="border-border text-foreground cursor-pointer"
            >
              Keep Editing
            </Button>
            <Button
              type="button"
              onClick={handleSaveCorrectionSubmit}
              disabled={isSubmittingCorrection}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
            >
              {isSubmittingCorrection ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving & Reconciling...
                </>
              ) : (
                'Confirm & Save Revision'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 3: Celebratory Correction Success Modal */}
      <Dialog open={showCorrectionSuccessModal} onOpenChange={setShowCorrectionSuccessModal}>
        <DialogContent className="bg-card text-foreground border-border max-w-md text-center">
          <div className="py-2 space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/25 mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <div>
              <DialogTitle className="text-xl font-black text-foreground">
                CORRECTION RECORDED
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Revision <strong className="text-foreground">{correctionResult?.revisionNumber || 1}</strong> applied for <strong className="text-foreground">{format(new Date(date + 'T00:00:00'), 'MMMM dd, yyyy')}</strong>.
              </DialogDescription>
            </div>

            <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-xl border border-border">
              {correctionResult?.message || 'Inventory items and stock ledger have been reconciled with zero duplicate deductions.'}
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={() => {
                  setShowCorrectionSuccessModal(false);
                  if (record?.id) {
                    navigate(`/reports/${record.id}`);
                  }
                }}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-10 cursor-pointer shadow-xs"
              >
                <FileText className="w-4 h-4 mr-2" />
                View Updated Report
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCorrectionSuccessModal(false)}
                className="w-full border-border text-foreground font-semibold h-10 cursor-pointer"
              >
                Back to Worksheet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal 4: Revision History Inspection Modal */}
      <Dialog open={showRevisionHistoryModal} onOpenChange={setShowRevisionHistoryModal}>
        <DialogContent className="bg-card text-foreground border-border max-w-2xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader className="shrink-0 pb-3 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <History className="w-5 h-5 text-primary" />
              Revision History: {format(new Date(date + 'T00:00:00'), 'MMMM dd, yyyy')}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Complete audit trail of all corrections made to this finalized worksheet.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-3 space-y-4">
            {isLoadingRevisions ? (
              <div className="text-center py-10 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary mb-2" />
                Loading revision history...
              </div>
            ) : revisions.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-xs font-medium">
                No corrections have been recorded for this report. This sheet retains its original finalized snapshot.
              </div>
            ) : (
              revisions.map((rev) => (
                <div key={rev.id} className="p-4 rounded-xl bg-muted/40 border border-border space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      Revision {rev.revision_number}
                    </span>
                    <span className="text-muted-foreground">
                      {format(new Date(rev.created_at), 'MMM dd, yyyy HH:mm')}
                    </span>
                  </div>

                  <div className="text-xs space-y-1">
                    <p className="text-muted-foreground">
                      Corrected By: <strong className="text-foreground">{rev.corrected_by_name || 'Administrator'}</strong>
                    </p>
                    <p className="text-muted-foreground">
                      Audit Reason: <strong className="text-foreground">{rev.reason}</strong>
                    </p>
                  </div>

                  {rev.stock_adjustments && rev.stock_adjustments.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-border/60">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Reconciled Stock Adjustments ({rev.stock_adjustments.length} items)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        {rev.stock_adjustments.map((adj, aIdx) => (
                          <div key={aIdx} className="p-2 rounded bg-card border border-border flex items-center justify-between">
                            <span className="font-medium text-foreground truncate max-w-36">{adj.item_name}</span>
                            <div className="font-mono font-bold flex items-center gap-1.5">
                              {adj.delta_consumption !== 0 && (
                                <span className={adj.delta_consumption > 0 ? "text-rose-500" : "text-emerald-500"}>
                                  Usage: {adj.delta_consumption > 0 ? `+${adj.delta_consumption}` : adj.delta_consumption}
                                </span>
                              )}
                              {adj.delta_add !== 0 && (
                                <span className={adj.delta_add > 0 ? "text-emerald-500" : "text-rose-500"}>
                                  Add: {adj.delta_add > 0 ? `+${adj.delta_add}` : adj.delta_add}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <DialogFooter className="shrink-0 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowRevisionHistoryModal(false)}
              className="w-full sm:w-auto border-border text-foreground cursor-pointer"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <Sparkles className="w-7 h-7" />
            </div>

            <div>
              <DialogTitle className="text-xl font-black text-foreground">
                FINALIZED
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Date: <strong className="text-foreground">{format(new Date(date + 'T00:00:00'), 'MMMM dd, yyyy')}</strong>
              </DialogDescription>
            </div>

            {finalizedSnapshot && (
              <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-muted/40 border border-border text-xs text-left">
                <div className="p-2.5 rounded-lg bg-card border border-border/70">
                  <span className="text-muted-foreground block text-[11px]">Total Items</span>
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
            {isFinalized ? (isCorrectionMode ? 'Correcting' : 'Finalized') : `${completionPct}% Reconciled`}
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

          {isFinalized && isAuthorizedToCorrect && !isCorrectionMode && (
            <Button
              size="sm"
              onClick={() => {
                setCorrectionReason('');
                setShowCorrectionPrompt(true);
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-9 px-3 shadow-sm cursor-pointer"
            >
              Correct Finalized Day
            </Button>
          )}

          {isCorrectionMode && (
            <Button
              size="sm"
              onClick={() => setShowSaveCorrectionDialog(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-9 px-3 shadow-sm cursor-pointer"
            >
              Save
            </Button>
          )}

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
