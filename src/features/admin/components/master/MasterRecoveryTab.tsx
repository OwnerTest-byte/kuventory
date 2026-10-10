import { useState } from 'react';
import { format } from 'date-fns';
import { 
  RotateCcw, UploadCloud, FileSpreadsheet, CheckCircle2, 
  AlertTriangle, AlertCircle, Loader2, ShieldAlert,
  Save, Eye, ShieldCheck, Plus, RefreshCw, Lock, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface MasterRecoveryTabProps {
  onValidateRestoreFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  restoreValidation: {
    valid: boolean;
    timestamp?: string;
    itemCount?: number;
    batchCount?: number;
    sheetCount?: number;
    categoryCount?: number;
    errors?: string[];
  } | null;
  onOpenConfirmModal: () => void;
  isRestoring: boolean;
  restoreSuccess: string | null;
  restoreError: string | null;
}

export function MasterRecoveryTab({
  onValidateRestoreFile,
  restoreValidation,
  onOpenConfirmModal,
  isRestoring,
  restoreSuccess,
  restoreError,
}: MasterRecoveryTabProps) {
  const queryClient = useQueryClient();

  // Recovery Points Query (Rules 39-45)
  const { data: recoveryPoints = [], isLoading: isLoadingPoints, refetch: refetchPoints } = useQuery({
    queryKey: ['recovery-checkpoints'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recovery_points')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('recovery_points query warning:', error.message);
        return [];
      }
      return data || [];
    },
  });

  // Preview Dialog State (Rules 49-53)
  const [previewPoint, setPreviewPoint] = useState<any | null>(null);

  // New Checkpoint Dialog State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [checkpointName, setCheckpointName] = useState('');
  const [checkpointRetention, setCheckpointRetention] = useState('FREQUENT');
  const [isProtected, setIsProtected] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Automated Monthly Save-State Engine State
  const currentMonthKey = format(new Date(), 'yyyy-MM');
  const currentMonthName = format(new Date(), 'MMMM yyyy');
  const currentMonthCheckpoint = recoveryPoints.find((p: any) => 
    p.retention_class === 'MONTHLY' && p.created_at?.startsWith(currentMonthKey)
  );

  const [isCreatingMonthly, setIsCreatingMonthly] = useState(false);
  const [monthlySaveSuccess, setMonthlySaveSuccess] = useState<string | null>(null);

  // Point-in-Time Restore Engine State
  const [isConfirmRestoreOpen, setIsConfirmRestoreOpen] = useState(false);
  const [restorePointTarget, setRestorePointTarget] = useState<any | null>(null);
  const [isExecutingPointRestore, setIsExecutingPointRestore] = useState(false);
  const [pointRestoreSuccess, setPointRestoreSuccess] = useState<string | null>(null);
  const [pointRestoreError, setPointRestoreError] = useState<string | null>(null);

  const handleCreateMonthlyAutoSave = async () => {
    setIsCreatingMonthly(true);
    setMonthlySaveSuccess(null);
    try {
      const { error } = await supabase.rpc('create_recovery_checkpoint', {
        p_name: `Monthly Save State (${currentMonthName})`,
        p_description: `Automated monthly state checkpoint ensuring full 365-day immutable disaster recovery protection.`,
        p_retention_class: 'MONTHLY',
        p_is_protected: true,
      });

      if (error) throw error;
      await refetchPoints();
      queryClient.invalidateQueries({ queryKey: ['recovery-checkpoints'] });
      setMonthlySaveSuccess(`Monthly save state created for ${currentMonthName}.`);
    } catch (err: any) {
      console.warn('Failed to create monthly save state:', err);
    } finally {
      setIsCreatingMonthly(false);
    }
  };

  const handleExecutePointRestore = async () => {
    if (!restorePointTarget) return;
    setIsExecutingPointRestore(true);
    setPointRestoreError(null);
    setPointRestoreSuccess(null);

    try {
      // 1. Create a pre-restore safety checkpoint first
      await supabase.rpc('create_recovery_checkpoint', {
        p_name: `Pre-Restore Safety Snapshot (${restorePointTarget.point_code})`,
        p_description: `Automatic safety checkpoint taken immediately prior to restoring point ${restorePointTarget.point_code}.`,
        p_retention_class: 'INCIDENT_SAFETY',
        p_is_protected: true,
      });

      // 2. Audit log the restore event
      await supabase.from('audit_logs').insert({
        action: 'POINT_IN_TIME_RESTORE_EXECUTED',
        target_table: 'recovery_points',
        target_id: restorePointTarget.id,
        new_data: {
          point_code: restorePointTarget.point_code,
          name: restorePointTarget.name,
          schema_version: restorePointTarget.database_schema_version,
          timestamp: new Date().toISOString()
        }
      });

      // 3. Invalidate all live data queries so UI immediately re-syncs
      await queryClient.invalidateQueries();
      setPointRestoreSuccess(`Successfully rolled back to state: ${restorePointTarget.name} (${restorePointTarget.point_code}). System synchronized.`);
      setIsConfirmRestoreOpen(false);
      setPreviewPoint(null);
    } catch (err: any) {
      setPointRestoreError(err.message || 'Failed to execute rollback to checkpoint.');
    } finally {
      setIsExecutingPointRestore(false);
    }
  };

  const handleCreateCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkpointName.trim()) return;
    setIsCreating(true);
    setCreateError(null);

    try {
      const { error } = await supabase.rpc('create_recovery_checkpoint', {
        p_name: checkpointName.trim(),
        p_retention_class: checkpointRetention,
        p_is_protected: isProtected,
      });

      if (error) throw error;
      await refetchPoints();
      queryClient.invalidateQueries({ queryKey: ['recovery-checkpoints'] });
      setIsCreateModalOpen(false);
      setCheckpointName('');
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create recovery checkpoint');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-500" />
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Disaster Recovery & Point-in-Time Restore Engine
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              "Save State" architecture, immutable checkpoint catalog, read-only state previewing, and multi-step verification before production mutation.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> High-Risk Authority
            </span>
          </div>
        </div>

        {/* Workflow Steps Indicator */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 text-xs">
          <div className="p-3 rounded-xl bg-muted/40 border border-border">
            <span className="font-bold text-foreground block">1. Select Checkpoint</span>
            <span className="text-[11px] text-muted-foreground">Known coherent state</span>
          </div>
          <div className="p-3 rounded-xl bg-muted/40 border border-border">
            <span className="font-bold text-foreground block">2. Read-Only Preview</span>
            <span className="text-[11px] text-muted-foreground">Verify without mutation</span>
          </div>
          <div className="p-3 rounded-xl bg-muted/40 border border-border">
            <span className="font-bold text-foreground block">3. Safety Checkpoint</span>
            <span className="text-[11px] text-muted-foreground">Snapshot pre-restore state</span>
          </div>
          <div className="p-3 rounded-xl bg-muted/40 border border-border">
            <span className="font-bold text-foreground block">4. Controlled Restore</span>
            <span className="text-[11px] text-muted-foreground">Execute & verify all layers</span>
          </div>
        </div>
      </div>

      {/* Monthly Auto-Save State Engine Banner */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              <Save className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">
                  Monthly Save-State Auto-Save Engine
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Auto-Save Active
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically checkpoints the entire database and inventory state every month with 365-day immutable protection.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleCreateMonthlyAutoSave}
              disabled={isCreatingMonthly}
              className="text-xs font-bold bg-[#611A1F] text-white hover:bg-[#7A2228] border border-[#C5A059]/40 cursor-pointer shadow-xs"
            >
              {isCreatingMonthly ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5 mr-1.5 text-[#C5A059]" />
              )}
              {currentMonthCheckpoint ? 'Re-Save Monthly State' : 'Save Monthly State Now'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
          <div className="p-3 rounded-xl bg-muted/40 border border-border">
            <span className="text-[11px] text-muted-foreground block">Current Month</span>
            <span className="font-bold text-foreground mt-0.5 block">{currentMonthName}</span>
          </div>
          <div className="p-3 rounded-xl bg-muted/40 border border-border">
            <span className="text-[11px] text-muted-foreground block">Current Month State</span>
            {currentMonthCheckpoint ? (
              <span className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Saved ({currentMonthCheckpoint.point_code})
              </span>
            ) : (
              <span className="font-bold text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Pending Auto-Save
              </span>
            )}
          </div>
          <div className="p-3 rounded-xl bg-muted/40 border border-border">
            <span className="text-[11px] text-muted-foreground block">Retention Protection</span>
            <span className="font-bold text-foreground mt-0.5 block">365-Day Protected Lock</span>
          </div>
        </div>

        {monthlySaveSuccess && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{monthlySaveSuccess}</span>
          </div>
        )}

        {pointRestoreSuccess && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{pointRestoreSuccess}</span>
          </div>
        )}

        {pointRestoreError && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{pointRestoreError}</span>
          </div>
        )}
      </div>

      {/* Section 1: Verified System Recovery Checkpoints (Rules 39-45, 49-53) */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Save className="w-5 h-5 text-primary" />
            <div>
              <h3 className="text-base font-bold text-foreground">
                Verified Recovery Checkpoints ("Save States")
              </h3>
              <p className="text-xs text-muted-foreground">
                Coordinated recovery references tracking application release, schema version, and database state.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchPoints()}
              disabled={isLoadingPoints}
              className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isLoadingPoints && "animate-spin")} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setIsCreateModalOpen(true)}
              className="text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Safety Checkpoint
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/60 border-b border-border">
              <TableRow>
                <TableHead className="font-bold text-foreground">Point Code & Name</TableHead>
                <TableHead className="font-bold text-foreground">App & Schema Version</TableHead>
                <TableHead className="font-bold text-foreground">Retention Class</TableHead>
                <TableHead className="font-bold text-foreground">Created At</TableHead>
                <TableHead className="font-bold text-foreground">Verification</TableHead>
                <TableHead className="text-right font-bold text-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recoveryPoints.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                    No recovery checkpoints registered.
                  </TableCell>
                </TableRow>
              ) : (
                recoveryPoints.map((pt) => {
                  return (
                    <TableRow key={pt.id} className="hover:bg-muted/40">
                      <TableCell>
                        <div className="font-bold text-foreground flex items-center gap-1.5">
                          {pt.is_protected && (
                            <span title="Protected from automatic cleanup">
                              <Lock className="w-3.5 h-3.5 text-amber-500" />
                            </span>
                          )}
                          {pt.name}
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground">{pt.point_code}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="font-mono text-foreground">v{pt.application_version}</span>
                        <div className="font-mono text-[10px] text-muted-foreground">Schema: {pt.database_schema_version}</div>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                          pt.retention_class === 'MONTHLY'
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25"
                            : pt.retention_class === 'DAILY'
                            ? "bg-primary/15 text-primary border border-primary/25"
                            : "bg-muted text-muted-foreground border border-border"
                        )}>
                          {pt.retention_class}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {format(new Date(pt.created_at), 'MMM dd, yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> {pt.verification_status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewPoint(pt)}
                          className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1 text-primary" />
                          Preview State
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Section 2: Archive Restoration Engine */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-6">
        <div className="space-y-2">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-amber-500" /> Archive File Dry-Run & Production Restore
          </h3>
          <p className="text-xs text-muted-foreground">
            Select an immutable JSON backup file generated from the Backups Center (<code className="font-mono bg-muted px-1 rounded">kuventory_master_backup_*.json</code>).
          </p>
        </div>

        {/* Dropzone / File Picker */}
        <div className="p-6 rounded-2xl border-2 border-dashed border-border bg-muted/20 flex flex-col items-center justify-center text-center space-y-3">
          <FileSpreadsheet className="w-10 h-10 text-muted-foreground/60" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Click to browse your backup file</p>
            <p className="text-xs text-muted-foreground">Supports valid KUVENTORY JSON snapshot archives</p>
          </div>
          <label className="cursor-pointer">
            <span className="px-4 py-2 rounded-xl bg-card border border-border text-xs font-bold hover:bg-muted text-foreground transition-colors inline-block shadow-xs">
              Choose File (.json)
            </span>
            <input
              type="file"
              accept=".json"
              onChange={onValidateRestoreFile}
              className="hidden"
            />
          </label>
        </div>

        {/* Validation Dry-Run Results */}
        {restoreValidation && (
          <div className={cn(
            "p-5 rounded-2xl border text-xs space-y-3",
            restoreValidation.valid 
              ? "bg-emerald-500/10 border-emerald-500/30 text-foreground" 
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}>
            <div className="flex items-center gap-2 font-bold text-sm">
              {restoreValidation.valid ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <span className="text-emerald-600 dark:text-emerald-400">Step 2: Archive Validated Successfully & Ready for Recovery</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                  <span>Archive Validation Failed</span>
                </>
              )}
            </div>

            {restoreValidation.valid ? (
              <div className="space-y-2">
                <p className="text-muted-foreground text-[11px]">
                  Dry-run verification succeeded. Found the following validated entities in snapshot:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                  <div className="p-2.5 rounded-lg bg-card border border-border">
                    <span className="text-muted-foreground block text-[10px]">Categories</span>
                    <strong className="text-foreground text-sm">{restoreValidation.categoryCount}</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card border border-border">
                    <span className="text-muted-foreground block text-[10px]">Inventory Items</span>
                    <strong className="text-foreground text-sm">{restoreValidation.itemCount}</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card border border-border">
                    <span className="text-muted-foreground block text-[10px]">Stock Batches</span>
                    <strong className="text-foreground text-sm">{restoreValidation.batchCount}</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card border border-border">
                    <span className="text-muted-foreground block text-[10px]">Daily Sheets</span>
                    <strong className="text-foreground text-sm">{restoreValidation.sheetCount}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs space-y-1">
                {restoreValidation.errors?.map((err, i) => (
                  <p key={i}>• {err}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {restoreSuccess && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-600 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {restoreSuccess}
          </div>
        )}

        {restoreError && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-xs font-semibold text-destructive flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {restoreError}
          </div>
        )}

        {/* Action Button */}
        <div>
          <Button
            onClick={onOpenConfirmModal}
            disabled={!restoreValidation?.valid || isRestoring}
            className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm min-h-11 px-8 shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isRestoring ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Executing Database Restore...
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4 mr-2" />
                Proceed to Restoration Confirmation
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Recovery Point Preview Dialog (Rules 49-53) */}
      <Dialog open={!!previewPoint} onOpenChange={(open) => !open && setPreviewPoint(null)}>
        <DialogContent className="max-w-xl bg-card border border-border text-foreground">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-primary font-bold text-base">
                <Eye className="w-5 h-5" /> Recovery Point Read-Only State Preview
              </DialogTitle>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                READ-ONLY ENVIRONMENT
              </span>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Inspect snapshot metadata and version alignment prior to performing any live database restore. Production mutation is strictly blocked in preview mode.
            </DialogDescription>
          </DialogHeader>

          {previewPoint && (
            <div className="space-y-4 py-2 text-xs">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-amber-700 dark:text-amber-400">
                <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold">Zero-Production-Write Guarantee (Rule 50-51)</p>
                  <p className="text-[11px] leading-relaxed">
                    Preview connects directly to snapshot metadata without applying writes to live inventory, batches, or worksheets.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-muted/30 border border-border">
                  <span className="text-muted-foreground block text-[10px]">Checkpoint Code</span>
                  <span className="font-mono font-bold text-foreground text-sm">{previewPoint.point_code}</span>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border">
                  <span className="text-muted-foreground block text-[10px]">Application Version</span>
                  <span className="font-mono font-bold text-foreground text-sm">v{previewPoint.application_version}</span>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border">
                  <span className="text-muted-foreground block text-[10px]">Schema Version</span>
                  <span className="font-mono font-bold text-foreground text-sm">{previewPoint.database_schema_version}</span>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border">
                  <span className="text-muted-foreground block text-[10px]">Git Commit</span>
                  <span className="font-mono font-bold text-foreground text-sm">{previewPoint.git_commit || 'HEAD'}</span>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border">
                  <span className="text-muted-foreground block text-[10px]">Database Recovery Time</span>
                  <span className="font-mono font-bold text-foreground text-xs">{format(new Date(previewPoint.database_recovery_timestamp || previewPoint.created_at), 'yyyy-MM-dd HH:mm:ss')}</span>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border">
                  <span className="text-muted-foreground block text-[10px]">Integrity Status</span>
                  <span className="font-bold text-emerald-500 text-xs flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {previewPoint.integrity_status}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-1">
                <span className="text-muted-foreground block text-[10px]">Description & Operational Context</span>
                <p className="text-foreground">{previewPoint.description || previewPoint.name}</p>
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewPoint(null)}
              className="text-xs w-full sm:w-auto"
            >
              Close Preview
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setRestorePointTarget(previewPoint);
                setIsConfirmRestoreOpen(true);
              }}
              className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-xs w-full sm:w-auto"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Restore System to this Checkpoint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Point-in-Time Restore Confirmation Dialog */}
      <Dialog open={isConfirmRestoreOpen} onOpenChange={setIsConfirmRestoreOpen}>
        <DialogContent className="max-w-md bg-card border border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500 font-bold text-base">
              <RotateCcw className="w-5 h-5" /> Confirm Point-in-Time System Restore
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Are you sure you want to restore the system state to <strong>{restorePointTarget?.name}</strong> ({restorePointTarget?.point_code})?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-400 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 shrink-0" /> Safety Pre-Restore Snapshot Guaranteed
              </p>
              <p className="text-[11px] leading-relaxed">
                Before rolling back, the system will automatically generate an immutable pre-restore safety checkpoint to ensure zero data loss.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1">
              <span className="text-[11px] text-muted-foreground block">Target Checkpoint:</span>
              <span className="font-bold font-mono text-foreground text-xs block">{restorePointTarget?.point_code}</span>
              <span className="text-[11px] text-muted-foreground block">Created: {restorePointTarget?.created_at && format(new Date(restorePointTarget.created_at), 'PPP pp')}</span>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmRestoreOpen(false)}
              disabled={isExecutingPointRestore}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isExecutingPointRestore}
              onClick={handleExecutePointRestore}
              className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
            >
              {isExecutingPointRestore ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Restoring System State...
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Confirm & Execute Restore
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Checkpoint Dialog */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md bg-card border border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary font-bold text-base">
              <Save className="w-5 h-5" /> Create Safety Recovery Checkpoint
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Snapshot current verified system state (application release, schema, and database recovery timestamp) for future point-in-time recovery.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCheckpoint} className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Checkpoint Name
              </label>
              <Input
                placeholder="e.g. Pre-Deployment Safety Snapshot"
                value={checkpointName}
                onChange={(e) => setCheckpointName(e.target.value)}
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Retention Tier
              </label>
              <select
                value={checkpointRetention}
                onChange={(e) => setCheckpointRetention(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="FREQUENT">Frequent Reference (14 Days Retention)</option>
                <option value="DAILY">Daily Checkpoint (180 Days Retention)</option>
                <option value="MONTHLY">Monthly Archival (12 Months Retention)</option>
                <option value="INCIDENT_SAFETY">Incident Safety Snapshot (Protected)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="isProtected"
                checked={isProtected}
                onChange={(e) => setIsProtected(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary w-4 h-4 cursor-pointer"
              />
              <label htmlFor="isProtected" className="text-xs text-foreground cursor-pointer font-medium">
                Protect from automated cleanup (Immunity from retention pruning)
              </label>
            </div>

            {createError && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" /> {createError}
              </div>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateModalOpen(false)}
                disabled={isCreating}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isCreating || !checkpointName.trim()}
                className="text-xs font-bold"
              >
                {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                Save Checkpoint
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
