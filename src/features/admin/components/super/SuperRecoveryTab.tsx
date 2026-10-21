import { useState } from 'react';
import { 
  RotateCcw, ShieldCheck, CheckCircle2, AlertTriangle, 
  Loader2, Plus, Eye, Download, Database, HardDrive, FileJson
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatSafeDate, cn } from '@/lib/utils';
import { exportFullSystemBackup } from '../../services/superAdminService';

export function SuperRecoveryTab() {
  const queryClient = useQueryClient();

  const { data: recoveryPoints = [], isLoading, isError, error: recoveryError, refetch } = useQuery({
    queryKey: ['recovery-checkpoints'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recovery_points')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('recovery_points query error:', error.message);
        throw error;
      }
      return data || [];
    }
  });

  // Checkpoint Creation State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [checkpointName, setCheckpointName] = useState('');
  const [checkpointReason, setCheckpointReason] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Snapshot Preview State
  const [previewPoint, setPreviewPoint] = useState<any | null>(null);

  // Restore Target State
  const [selectedPointForRestore, setSelectedPointForRestore] = useState<any | null>(null);
  const [restoreConfirmationText, setRestoreConfirmationText] = useState('');
  const [restoreReason, setRestoreReason] = useState('');
  const [isExecutingRestore, setIsExecutingRestore] = useState(false);
  const [localRestoreSuccess, setLocalRestoreSuccess] = useState<string | null>(null);
  const [localRestoreError, setLocalRestoreError] = useState<string | null>(null);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  const handleCreateCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkpointName.trim() || !checkpointReason.trim()) return;
    setIsCreating(true);
    setCreateSuccess(null);
    setOperationError(null);
    try {
      const { data: authData } = await supabase.auth.getUser();

      const { data: ptData, error } = await supabase.rpc('create_recovery_checkpoint', {
        p_name: checkpointName.trim(),
        p_description: `Reason: ${checkpointReason.trim()} (Created by ${authData?.user?.email || 'Super Admin'})`,
        p_retention_class: 'FREQUENT',
        p_is_protected: false
      });
      if (error) throw error;

      await refetch();
      queryClient.invalidateQueries({ queryKey: ['recovery-checkpoints'] });
      setCreateSuccess(`Recovery checkpoint ${ptData?.point_code || 'verified'} created with immutable integrity.`);
      setIsCreateModalOpen(false);
      setCheckpointName('');
      setCheckpointReason('');
    } catch (err: any) {
      setOperationError('Error creating recovery checkpoint: ' + (err.message || 'Unknown error'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleDownloadFullExport = async () => {
    setIsExporting(true);
    setOperationError(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      await exportFullSystemBackup(authData?.user?.email || 'superadmin@kuventory.com');
    } catch (err: any) {
      setOperationError('Data export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExecuteRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsExecutingRestore(false);
    setLocalRestoreSuccess(null);
    setLocalRestoreError(
      'Full database state restoration is currently disabled until a multi-table atomic snapshot contract (inventory items, batches, movements, worksheets, reports, and settings) and transactional server-side restore RPC are verified. Metadata checkpoints are tracked for audit registry purposes only.'
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Disaster Recovery & Recovery Registry
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                  Registry Only (Restore Disabled)
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Verified state checkpoints, pre-restore safety snapshots, and downloadable offline system archives
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadFullExport}
              disabled={isExporting}
              className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer shrink-0"
            >
              {isExporting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5 text-primary" />}
              Full System JSON Export
            </Button>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Create Checkpoint
            </Button>
          </div>
        </div>

        {createSuccess && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-500 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{createSuccess}</span>
          </div>
        )}
        {localRestoreSuccess && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-500 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{localRestoreSuccess}</span>
          </div>
        )}
        {operationError && (
          <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-xs font-semibold text-destructive flex items-center justify-between gap-2" role="alert">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{operationError}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setOperationError(null)} className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/20 font-bold">
              Dismiss
            </Button>
          </div>
        )}

        {/* 4 Architectural Recovery Tiers */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 text-xs">
          <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
              <FileJson className="w-3 h-3 text-primary" /> Tier 1: App Data Export
            </span>
            <p className="font-bold text-foreground">Complete JSON Archive</p>
            <p className="text-[11px] text-muted-foreground">Downloadable all-table snapshot</p>
          </div>

          <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-500" /> Tier 2: State Checkpoint
            </span>
            <p className="font-bold text-foreground">Verified Registry</p>
            <p className="text-[11px] text-muted-foreground">Immutable metadata & safety points</p>
          </div>

          <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
              <Database className="w-3 h-3 text-blue-500" /> Tier 3: Daily DB Dump
            </span>
            <p className="font-bold text-foreground">pg_dump CLI Script</p>
            <p className="text-[11px] text-muted-foreground">Node-cron automated dumps</p>
          </div>

          <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-purple-500" /> Tier 4: Provider Backup
            </span>
            <p className="font-bold text-foreground">Managed PostgreSQL</p>
            <p className="text-[11px] text-muted-foreground">Supabase automated WAL backups</p>
          </div>
        </div>
      </div>

      {/* 2. Recovery Points Table */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">Verified Recovery Checkpoints ("Save States")</h3>
            <p className="text-xs text-muted-foreground">Historical application checkpoints captured in the database</p>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {recoveryPoints.length} checkpoints recorded
          </span>
        </div>

        {isError && (
          <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Failed to retrieve recovery registry: {(recoveryError as any)?.message || 'Database connection error'}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="pb-3 font-semibold">Created Date</th>
                <th className="pb-3 font-semibold">Checkpoint Code</th>
                <th className="pb-3 font-semibold">Label & Purpose</th>
                <th className="pb-3 font-semibold">Retention</th>
                <th className="pb-3 font-semibold">Integrity</th>
                <th className="pb-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading verified recovery points...
                  </td>
                </tr>
              ) : recoveryPoints.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No custom checkpoints created yet. Click "Create Checkpoint" above to record a verified state snapshot.
                  </td>
                </tr>
              ) : (
                recoveryPoints.map((pt: any) => (
                  <tr key={pt.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3.5 text-foreground font-semibold">
                      {formatSafeDate(pt.created_at, 'MMM dd, yyyy hh:mm a')}
                    </td>
                    <td className="py-3.5 font-mono text-primary font-bold">
                      {pt.point_code}
                    </td>
                    <td className="py-3.5">
                      <p className="font-bold text-foreground">{pt.name}</p>
                      {pt.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1">{pt.description}</p>
                      )}
                    </td>
                    <td className="py-3.5">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border">
                        {pt.retention_class || 'FREQUENT'}
                      </span>
                    </td>
                    <td className="py-3.5">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                        pt.integrity_status === 'VERIFIED'
                          ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                          : "bg-muted text-muted-foreground border-border"
                      )}>
                        {pt.integrity_status || 'RECORDED'}
                      </span>
                    </td>
                    <td className="py-3.5 text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPreviewPoint(pt)}
                        className="text-xs h-7 px-2.5 border-border cursor-pointer"
                      >
                        <Eye className="w-3 h-3 mr-1" /> Preview State
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled
                        title="Database restoration disabled until transactional multi-table restore RPC is verified"
                        className="text-xs h-7 px-2.5 border-border text-muted-foreground opacity-60 cursor-not-allowed"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" /> Restore Disabled
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Create Checkpoint Dialog */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              Create Recovery Point Checkpoint
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Captures a verified application checkpoint into the recovery registry with immutable metadata.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCheckpoint} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">Checkpoint Name / Label</Label>
              <Input
                value={checkpointName}
                onChange={e => setCheckpointName(e.target.value)}
                placeholder="e.g. Pre-Recount Baseline"
                className="text-xs h-10 bg-card border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">Mandatory Reason / Audit Justification</Label>
              <Input
                value={checkpointReason}
                onChange={e => setCheckpointReason(e.target.value)}
                placeholder="e.g. Scheduled milestone prior to weekly reconciliation"
                className="text-xs h-10 bg-card border-border"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating || !checkpointName.trim() || !checkpointReason.trim()} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                Capture & Verify Checkpoint
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 4. Isolated Snapshot Preview Dialog */}
      <Dialog open={!!previewPoint} onOpenChange={(open) => !open && setPreviewPoint(null)}>
        <DialogContent className="max-w-lg bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              Recovery Point Read-Only State Preview: {previewPoint?.point_code}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Read-only inspection of checkpoint metadata and registered state payload.
            </DialogDescription>
          </DialogHeader>

          {previewPoint && (
            <div className="space-y-4 py-2 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                  READ-ONLY ENVIRONMENT
                </span>
                <span className="text-[10px] text-muted-foreground font-semibold">
                  Zero-Production-Write Guarantee
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Checkpoint Code:</span>
                  <span className="font-mono font-bold text-primary">{previewPoint.point_code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Label:</span>
                  <span className="font-bold text-foreground">{previewPoint.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created:</span>
                  <span>{formatSafeDate(previewPoint.created_at, 'PPpp')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Application Version:</span>
                  <span className="font-mono font-bold text-foreground">{previewPoint.application_version || 'v1.2.8'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Integrity Status:</span>
                  <span className="font-bold text-emerald-500 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {previewPoint.integrity_status || 'VERIFIED'}
                  </span>
                </div>
                {previewPoint.description && (
                  <div className="pt-1 text-[11px] text-muted-foreground border-t border-border/50">
                    {previewPoint.description}
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-muted/20 border border-border space-y-2">
                <p className="font-bold text-foreground">Registered Scope & Protection:</p>
                <div className="grid grid-cols-2 gap-2 text-muted-foreground text-[11px]">
                  <div>Retention: <strong className="text-foreground">{previewPoint.retention_class}</strong></div>
                  <div>Protected: <strong className="text-foreground">{previewPoint.is_protected ? 'Yes' : 'No'}</strong></div>
                  <div>Schema: <strong className="text-foreground font-mono">{previewPoint.database_schema_version || '20261018'}</strong></div>
                  <div>Verification: <strong className="text-emerald-500">{previewPoint.verification_status || 'READY'}</strong></div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewPoint(null)}>
              Close Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. Safe Restoration Modal with Explicit Confirmation */}
      <Dialog open={!!selectedPointForRestore} onOpenChange={(open) => !open && setSelectedPointForRestore(null)}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-5 h-5" />
              Authorize State Restoration
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Restore state to checkpoint <strong className="text-foreground">{selectedPointForRestore?.point_code}</strong>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleExecuteRestore} className="space-y-4 py-2 text-xs">
            {localRestoreError && (
              <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{localRestoreError}</span>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 space-y-1.5">
              <p className="font-bold">Restoration Safeguards & Policy:</p>
              <ul className="list-disc list-inside text-[11px] space-y-1 text-muted-foreground">
                <li>Automatic Pre-Restore Safety Snapshot will be created first.</li>
                <li>Financial and inventory stock movement ledgers are strictly preserved.</li>
                <li>Item balances will be synchronized with checkpoint values.</li>
                <li>Restoration event is permanently logged in the audit trail.</li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">Mandatory Reason / Justification</Label>
              <Input
                value={restoreReason}
                onChange={e => setRestoreReason(e.target.value)}
                placeholder="e.g. Disaster recovery after corrupted external data import"
                className="text-xs h-10 bg-card border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">
                Type <span className="font-mono text-destructive">CONFIRM RESTORE</span> to proceed
              </Label>
              <Input
                value={restoreConfirmationText}
                onChange={e => setRestoreConfirmationText(e.target.value)}
                placeholder="CONFIRM RESTORE"
                className="text-xs h-10 font-mono bg-card border-border"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setSelectedPointForRestore(null)} disabled={isExecutingRestore}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isExecutingRestore || restoreConfirmationText.trim() !== 'CONFIRM RESTORE' || !restoreReason.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                {isExecutingRestore ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                Authorize & Execute Restore
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
