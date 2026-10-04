import { 
  RotateCcw, UploadCloud, FileSpreadsheet, CheckCircle2, 
  AlertTriangle, AlertCircle, Loader2, ShieldAlert
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
              Multi-step verified recovery procedure to restore catalog items, batch quantities, and worksheet history from verified backup snapshots.
            </p>
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" /> High-Risk Operation
          </span>
        </div>

        {/* Workflow Steps Indicator */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 text-xs">
          <div className="p-3 rounded-xl bg-muted/40 border border-border">
            <span className="font-bold text-foreground block">1. Select Archive</span>
            <span className="text-[11px] text-muted-foreground">Load .json snapshot</span>
          </div>
          <div className="p-3 rounded-xl bg-muted/40 border border-border">
            <span className="font-bold text-foreground block">2. Dry-Run Validation</span>
            <span className="text-[11px] text-muted-foreground">Verify schema & counts</span>
          </div>
          <div className="p-3 rounded-xl bg-muted/40 border border-border">
            <span className="font-bold text-foreground block">3. Safety Confirmation</span>
            <span className="text-[11px] text-muted-foreground">Review consequences</span>
          </div>
          <div className="p-3 rounded-xl bg-muted/40 border border-border">
            <span className="font-bold text-foreground block">4. Atomic Restore</span>
            <span className="text-[11px] text-muted-foreground">Execute & verify</span>
          </div>
        </div>
      </div>

      {/* Restore Workflow Container */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-6">
        <div className="space-y-2">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-amber-500" /> Step 1: Select Verified System Backup File
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
    </div>
  );
}
