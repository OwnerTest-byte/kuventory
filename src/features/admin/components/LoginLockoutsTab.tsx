import { useState, useEffect } from 'react';
import { fetchLockedAccounts, unlockAccount, type LockedAccountRecord } from '@/features/auth/services/loginLockoutService';
import { useAuth } from '@/features/auth/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ShieldCheck,
  RefreshCw,
  Unlock,
  Clock,
  User,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';

export function LoginLockoutsTab() {
  const { profile } = useAuth();
  const [lockedAccounts, setLockedAccounts] = useState<LockedAccountRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Unlock Modal State
  const [selectedAccount, setSelectedAccount] = useState<LockedAccountRecord | null>(null);
  const [unlockReason, setUnlockReason] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';

  const loadAccounts = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchLockedAccounts();
      setLockedAccounts(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load locked accounts.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
    const interval = setInterval(loadAccounts, 30000); // Poll every 30s
    // No realtime here by design: account_security_state RLS deliberately
    // blocks all client reads, so bounded polling is the safe mechanism.
    // Reconcile immediately when the tab regains focus or connectivity.
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadAccounts();
    };
    window.addEventListener('focus', loadAccounts);
    window.addEventListener('online', loadAccounts);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', loadAccounts);
      window.removeEventListener('online', loadAccounts);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const handleOpenUnlock = (acc: LockedAccountRecord) => {
    setSelectedAccount(acc);
    setUnlockReason('');
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleConfirmUnlock = async () => {
    if (!selectedAccount || !unlockReason.trim()) return;

    setIsUnlocking(true);
    setErrorMessage(null);
    try {
      const res = await unlockAccount(selectedAccount.id, unlockReason.trim());
      setSuccessMessage(res.message);
      setSelectedAccount(null);
      await loadAccounts();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to unlock account.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const formatSeconds = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}m ${rem}s`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Login Lockouts & Security Controls</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enforces 5-failure / 30-minute lockouts. Authorized administrators can lift locks with documented reasons.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isLoading}
          onClick={loadAccounts}
          className="h-9 px-3 text-xs rounded-xl self-start sm:self-auto"
        >
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Refresh
        </Button>
      </div>

      {errorMessage && (
        <div className="p-3.5 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Accounts Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        {lockedAccounts.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-sm text-foreground">No Accounts Currently Locked</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              No failed attempt thresholds have been exceeded. All user accounts are operating normally.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-140">
              <thead className="bg-muted/40 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Failed Attempts</th>
                  <th className="px-4 py-3">Release</th>
                  <th className="px-4 py-3">Last Failed At</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {lockedAccounts.map(acc => {
                  const canUnlock = isSuperAdmin || acc.user_role === 'STAFF';
                  return (
                    <tr key={acc.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div className="flex items-center gap-2 flex-wrap">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{acc.display_name || acc.email_masked}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">({acc.email_masked})</span>
                          {acc.verification_required && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                              Verification required
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                          {acc.user_role}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-rose-500">
                        {acc.failed_attempts} failures
                      </td>
                      <td className="px-4 py-3">
                        {acc.verification_required ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                            <Clock className="w-3 h-3" />
                            Admin unlock only
                          </span>
                        ) : acc.locked_until ? (
                          <span className="inline-flex items-center gap-1 font-mono text-amber-500 font-bold">
                            <Clock className="w-3 h-3" />
                            Cooldown {formatSeconds(acc.seconds_remaining)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-[11px]">
                        {acc.last_failed_at ? new Date(acc.last_failed_at).toLocaleTimeString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canUnlock ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleOpenUnlock(acc)}
                            className="h-8 px-3 text-xs bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg"
                          >
                            <Unlock className="w-3 h-3 mr-1" />
                            Unlock Account
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">
                            Super Admin Required
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Unlock Confirmation Modal */}
      <Dialog open={!!selectedAccount} onOpenChange={open => !open && setSelectedAccount(null)}>
        <DialogContent className="w-[95vw] max-w-md p-6 rounded-2xl bg-card border-border shadow-2xl">
          <DialogHeader className="space-y-1 text-left border-b border-border/60 pb-3">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Unlock className="w-5 h-5 text-rose-500" />
              <span>Lift Account Lockout</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Early unlock requires identity verification and an immutable audit reason.
            </DialogDescription>
          </DialogHeader>

          {selectedAccount && (
            <div className="space-y-4 py-2 text-left">
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60 text-xs space-y-1">
                <div><span className="text-muted-foreground">Target Account: </span><span className="font-bold text-foreground">{selectedAccount.email_masked}</span></div>
                <div><span className="text-muted-foreground">Role: </span><span className="font-semibold text-primary">{selectedAccount.user_role}</span></div>
                <div><span className="text-muted-foreground">Release: </span><span className="font-semibold text-amber-600 dark:text-amber-400">Administrator unlock only — no timer</span></div>
                {selectedAccount.verification_required && (
                  <div className="pt-1 text-amber-600 dark:text-amber-400 font-semibold leading-relaxed">
                    Administrator verification required — verify the person first; unlocking clears the
                    verification requirement together with the lock.
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="unlock-reason" className="text-xs font-semibold">Mandatory Unlock Reason *</Label>
                <Input
                  id="unlock-reason"
                  placeholder="e.g. Employee verified via phone and password reset issued."
                  value={unlockReason}
                  onChange={e => setUnlockReason(e.target.value)}
                  className="h-10 text-xs rounded-xl"
                  required
                />
              </div>

              <DialogFooter className="pt-2 gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedAccount(null)}
                  className="h-9 text-xs rounded-xl"
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  disabled={isUnlocking || !unlockReason.trim()}
                  onClick={handleConfirmUnlock}
                  className="h-9 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl flex items-center gap-1.5"
                >
                  {isUnlocking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
                  Confirm Early Unlock
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
