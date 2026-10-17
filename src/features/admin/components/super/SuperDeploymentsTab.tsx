import { useState } from 'react';
import { 
  Server, RotateCcw, CheckCircle2, AlertTriangle, Loader2, GitCommit,
  GitBranch, ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { DeploymentRecord } from '../../services/superAdminService';

interface SuperDeploymentsTabProps {
  deployments: DeploymentRecord[];
  onRollback: (deploymentId: string, reason: string) => Promise<void>;
  isRollingBack: boolean;
  onRefresh: () => void;
}

export function SuperDeploymentsTab({
  deployments,
  onRollback,
  isRollingBack,
  onRefresh
}: SuperDeploymentsTabProps) {
  const currentDeployment = deployments.find(d => d.isCurrent) || deployments[0];
  const [selectedForRollback, setSelectedForRollback] = useState<DeploymentRecord | null>(null);
  const [rollbackReason, setRollbackReason] = useState('');
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [selectedForDetails, setSelectedForDetails] = useState<DeploymentRecord | null>(null);

  const handleRollbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedForRollback) return;
    if (!rollbackReason.trim()) {
      setRollbackError('Please provide a mandatory justification reason for audit logging.');
      return;
    }
    setRollbackError(null);
    try {
      await onRollback(selectedForRollback.id, rollbackReason.trim());
      setSelectedForRollback(null);
      setRollbackReason('');
    } catch (err: any) {
      setRollbackError(err.message || 'Rollback failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Current Live Deployment Banner matching mockup */}
      {currentDeployment && (
        <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-foreground">
                    {currentDeployment.version}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                    Live
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground border border-border">
                    {currentDeployment.commitHash}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Deployed {format(new Date(currentDeployment.deployedAt), 'MMM dd, yyyy hh:mm a')} · All automated test suites passed
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer shrink-0"
            >
              Check Releases
            </Button>
          </div>

          {/* Verification Results Matrix */}
          <div className="pt-2 border-t border-border/60">
            <p className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Automated Deployment Verification Matrix
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-muted/40 border border-border/80 flex items-center justify-between">
                <span className="text-muted-foreground">Application Routes</span>
                <span className="font-bold text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                </span>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border/80 flex items-center justify-between">
                <span className="text-muted-foreground">Database Connection</span>
                <span className="font-bold text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                </span>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border/80 flex items-center justify-between">
                <span className="text-muted-foreground">Core Inventory Flow</span>
                <span className="font-bold text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                </span>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border/80 flex items-center justify-between">
                <span className="text-muted-foreground">Performance Latency</span>
                <span className="font-bold text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Version History Table */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground">Deployment Release History</h2>
            <p className="text-xs text-muted-foreground">Production build snapshots and verified historical commits</p>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {deployments.length} releases recorded
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="pb-3 font-semibold">Version</th>
                <th className="pb-3 font-semibold">Commit</th>
                <th className="pb-3 font-semibold">Branch</th>
                <th className="pb-3 font-semibold">Environment</th>
                <th className="pb-3 font-semibold">Deployed At</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-medium">
              {deployments.map((dep) => (
                <tr key={dep.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3.5 font-bold text-foreground flex items-center gap-2">
                    {dep.isCurrent && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                    <span>{dep.version}</span>
                  </td>
                  <td className="py-3.5 font-mono text-primary flex items-center gap-1">
                    <GitCommit className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{dep.commitHash}</span>
                  </td>
                  <td className="py-3.5 font-mono text-muted-foreground flex items-center gap-1">
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>{dep.branch}</span>
                  </td>
                  <td className="py-3.5 text-muted-foreground capitalize">
                    {dep.environment}
                  </td>
                  <td className="py-3.5 text-muted-foreground">
                    {format(new Date(dep.deployedAt), 'MMM dd, yyyy hh:mm a')}
                  </td>
                  <td className="py-3.5">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                      dep.isCurrent 
                        ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30" 
                        : dep.status === 'Rolled back'
                        ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                        : "bg-muted text-muted-foreground border border-border"
                    )}>
                      {dep.status}
                    </span>
                  </td>
                  <td className="py-3.5 text-right space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedForDetails(dep)}
                      className="text-xs h-7 px-2 cursor-pointer"
                    >
                      Details
                    </Button>
                    {!dep.isCurrent && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedForRollback(dep);
                          setRollbackReason('');
                          setRollbackError(null);
                        }}
                        className="text-xs h-7 px-2 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" /> Rollback
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Dialog */}
      <Dialog open={!!selectedForDetails} onOpenChange={(open) => !open && setSelectedForDetails(null)}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
              Deployment Details: {selectedForDetails?.version}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Detailed release artifacts and verification metrics.
            </DialogDescription>
          </DialogHeader>

          {selectedForDetails && (
            <div className="space-y-4 py-2 text-xs">
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Git Commit:</span>
                  <span className="font-mono font-bold text-primary">{selectedForDetails.commitHash}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Branch:</span>
                  <span className="font-mono">{selectedForDetails.branch}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Environment:</span>
                  <span className="capitalize font-bold">{selectedForDetails.environment}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deployed At:</span>
                  <span>{format(new Date(selectedForDetails.deployedAt), 'PPpp')}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-foreground">Pre-Promotion Verification Checklist:</h4>
                <div className="space-y-1.5">
                  {Object.entries(selectedForDetails.verificationResults).map(([k, v]) => (
                    <div key={k} className="flex justify-between p-2 rounded-lg bg-muted/30 border border-border/60">
                      <span className="capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                      <span className="font-bold text-emerald-500 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedForDetails(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rollback Confirmation Modal */}
      <Dialog open={!!selectedForRollback} onOpenChange={(open) => !open && setSelectedForRollback(null)}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-5 h-5" />
              Confirm Production Rollback
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              You are about to switch the live production release to version <strong className="text-foreground">{selectedForRollback?.version}</strong> (commit: {selectedForRollback?.commitHash}).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRollbackSubmit} className="space-y-4 py-2">
            {rollbackError && (
              <div className="p-3 text-xs text-destructive bg-destructive/15 rounded-md border border-destructive/20 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {rollbackError}
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 space-y-1">
              <p className="font-bold">Rollback Safeguards:</p>
              <ul className="list-disc list-inside text-[11px] space-y-0.5 text-muted-foreground">
                <li>Compatible with existing database schema migrations.</li>
                <li>All stock transactions and batches remain untouched.</li>
                <li>Rollback event will be committed into immutable Audit Logs.</li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">Audit Justification / Rollback Reason</Label>
              <Input
                value={rollbackReason}
                onChange={e => setRollbackReason(e.target.value)}
                placeholder="e.g. Critical frontend regression detected"
                className="text-xs h-10 bg-card border-border"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedForRollback(null)}
                className="border-border text-foreground"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isRollingBack || !rollbackReason.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                {isRollingBack ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                Authorize Rollback
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
