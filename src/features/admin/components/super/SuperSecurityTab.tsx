import { useState } from 'react';
import { 
  Shield, Lock, CheckCircle2, Smartphone, RefreshCw, Loader2, ShieldAlert, AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, formatSafeDate } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { revokeSessionLease } from '../../services/superAdminService';

interface SuperSecurityTabProps {
  maintenanceLocked: boolean;
  onToggleMaintenance: (reason?: string) => void;
  isMaintenanceToggling: boolean;
  userEmail: string;
}

export function SuperSecurityTab({
  maintenanceLocked,
  onToggleMaintenance,
  isMaintenanceToggling,
  userEmail,
}: SuperSecurityTabProps) {
  const queryClient = useQueryClient();

  // Active Session Leases Query
  const { data: activeSessions = [], isLoading: isLoadingSessions, refetch: refetchSessions } = useQuery({
    queryKey: ['active-session-leases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_session_leases')
        .select('*')
        .gt('lease_expires_at', new Date().toISOString())
        .order('last_heartbeat_at', { ascending: false });
      if (error) {
        console.warn('user_session_leases query error:', error.message);
        return [];
      }
      return data || [];
    }
  });

  // Privileged Accounts Query
  const { data: privilegedUsers = [], refetch: refetchUsers } = useQuery({
    queryKey: ['privileged-users-security'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['SUPER_ADMIN', 'MASTER_ADMIN', 'ADMIN'])
        .order('role');
      if (error) return [];
      return data || [];
    }
  });

  // Session Revocation Modal State
  const [selectedSessionForRevoke, setSelectedSessionForRevoke] = useState<any | null>(null);
  const [revocationReason, setRevocationReason] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeSuccess, setRevokeSuccess] = useState<string | null>(null);

  // Maintenance Lockdown Modal State
  const [isLockdownModalOpen, setIsLockdownModalOpen] = useState(false);
  const [lockdownReason, setLockdownReason] = useState('');

  const handleRevokeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionForRevoke) return;
    if (!revocationReason.trim()) {
      setRevokeError('A mandatory reason is required to revoke a remote session lease.');
      return;
    }

    setIsRevoking(true);
    setRevokeError(null);
    setRevokeSuccess(null);
    try {
      await revokeSessionLease(selectedSessionForRevoke.client_id, revocationReason.trim());
      setRevokeSuccess(`Session lease ${selectedSessionForRevoke.client_id} successfully revoked.`);
      setSelectedSessionForRevoke(null);
      setRevocationReason('');
      await refetchSessions();
      queryClient.invalidateQueries({ queryKey: ['active-session-leases'] });
    } catch (err: any) {
      setRevokeError(err.message || 'Session revocation failed');
    } finally {
      setIsRevoking(false);
    }
  };

  const handleConfirmLockdown = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lockdownReason.trim()) return;
    onToggleMaintenance(lockdownReason.trim());
    setIsLockdownModalOpen(false);
    setLockdownReason('');
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Security, Zero-Trust & Access Governance
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                  Tier 0 Protected
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Single active session leases, heartbeat expiration, verified revocation, and emergency maintenance controls
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { refetchSessions(); refetchUsers(); }}
              className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Sync Sessions
            </Button>
          </div>
        </div>

        {revokeSuccess && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-500 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{revokeSuccess}</span>
          </div>
        )}

        {/* Defense Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 text-xs">
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center justify-between">
            <span className="text-muted-foreground font-semibold">Active Sessions</span>
            <span className="font-bold text-foreground font-mono">
              {activeSessions.length} Live
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center justify-between">
            <span className="text-muted-foreground font-semibold">Privileged Roles</span>
            <span className="font-bold text-primary font-mono">
              {privilegedUsers.length} Accounts
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center justify-between">
            <span className="text-muted-foreground font-semibold">Session Policy</span>
            <span className="font-bold text-emerald-500 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Single Lease
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center justify-between">
            <span className="text-muted-foreground font-semibold">Maintenance Mode</span>
            <span className={cn(
              "font-bold px-2 py-0.5 rounded text-[10px]",
              maintenanceLocked ? "bg-rose-500/20 text-rose-500" : "bg-emerald-500/20 text-emerald-500"
            )}>
              {maintenanceLocked ? 'ACTIVE' : 'OFF'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Emergency Maintenance Mode Switch */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-500" />
              Emergency Maintenance Lockdown Mode
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              When active, non-admin accounts receive a maintenance overlay preventing accidental mutations during database upgrades or critical repairs.
            </p>
          </div>

          <Button
            size="sm"
            onClick={() => {
              if (maintenanceLocked) {
                onToggleMaintenance();
              } else {
                setIsLockdownModalOpen(true);
              }
            }}
            disabled={isMaintenanceToggling}
            className={cn(
              "font-bold text-xs cursor-pointer shrink-0",
              maintenanceLocked ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"
            )}
          >
            {isMaintenanceToggling ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : maintenanceLocked ? (
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
            ) : (
              <ShieldAlert className="w-4 h-4 mr-1.5" />
            )}
            {maintenanceLocked ? 'Deactivate Maintenance Mode' : 'Activate Maintenance Lockdown'}
          </Button>
        </div>
      </div>

      {/* 3. Live Session Leases Table */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">Active Browser & Device Session Leases</h3>
            <p className="text-xs text-muted-foreground">Enforces single-active-session governance. Expired sessions auto-terminate.</p>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {activeSessions.length} active sessions
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="pb-3 font-semibold">Client Device</th>
                <th className="pb-3 font-semibold">Client ID</th>
                <th className="pb-3 font-semibold">Lease Expires</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-medium">
              {isLoadingSessions ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1 text-primary" />
                    Loading active sessions...
                  </td>
                </tr>
              ) : activeSessions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No active remote leases. Only current tab session active.
                  </td>
                </tr>
              ) : (
                activeSessions.map((s: any) => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 font-bold text-foreground flex items-center gap-2">
                      <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="truncate max-w-50">{s.device_info || 'Browser Client'}</span>
                    </td>
                    <td className="py-3 font-mono text-primary text-[11px]">
                      {s.client_id}
                    </td>
                    <td className="py-3 text-muted-foreground font-mono">
                      {formatSafeDate(s.lease_expires_at, 'hh:mm:ss a')}
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                        {s.status || 'Active'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedSessionForRevoke(s);
                          setRevocationReason('');
                          setRevokeError(null);
                        }}
                        className="text-xs h-7 px-2 border-destructive/30 text-destructive hover:bg-destructive/10 cursor-pointer"
                      >
                        <Lock className="w-3 h-3 mr-1" />
                        Revoke
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Privileged Accounts Matrix */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Privileged Administrator Accounts</h3>
          <p className="text-xs text-muted-foreground">Verified profile roles with administrative authority</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {privilegedUsers.map((u: any) => (
            <div key={u.id} className="p-3.5 rounded-xl bg-muted/30 border border-border flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground">{u.display_name || u.first_name || 'Administrator'}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{u.id.substring(0, 8)}... · {u.role}</p>
              </div>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                u.role === 'SUPER_ADMIN' || u.role === 'MASTER_ADMIN'
                  ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                  : "bg-blue-500/15 text-blue-500 border border-blue-500/30"
              )}>
                {u.role === 'SUPER_ADMIN' || u.role === 'MASTER_ADMIN' ? 'Super Admin' : 'Admin'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Revoke Session Dialog */}
      <Dialog open={!!selectedSessionForRevoke} onOpenChange={(open) => !open && setSelectedSessionForRevoke(null)}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Lock className="w-5 h-5" />
              Revoke Remote Session Lease
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Revoke session lease <strong className="font-mono text-foreground">{selectedSessionForRevoke?.client_id}</strong> ({selectedSessionForRevoke?.device_info || 'Browser'}).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRevokeSubmit} className="space-y-4 py-2 text-xs">
            {revokeError && (
              <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{revokeError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">Mandatory Revocation Reason</Label>
              <Input
                value={revocationReason}
                onChange={e => setRevocationReason(e.target.value)}
                placeholder="e.g. Unrecognized device login reported by staff"
                className="text-xs h-10 bg-card border-border"
                required
              />
            </div>

            <p className="text-[11px] text-muted-foreground">
              The targeted client lease will immediately terminate. The client will be locked from mutating inventory sheets. This action is recorded in the audit logs under <code>{userEmail}</code>.
            </p>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setSelectedSessionForRevoke(null)} disabled={isRevoking}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isRevoking || !revocationReason.trim()}
                className="bg-destructive hover:bg-destructive/90 text-white font-bold"
              >
                {isRevoking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                Authorize Revocation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Emergency Lockdown Confirmation Dialog */}
      <Dialog open={isLockdownModalOpen} onOpenChange={setIsLockdownModalOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-5 h-5" />
              Activate Emergency Maintenance Lockdown
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              You are about to place KUVENTORY under emergency lockdown.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmLockdown} className="space-y-4 py-2 text-xs">
            <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive space-y-1">
              <p className="font-bold">Lockdown Impact:</p>
              <ul className="list-disc list-inside text-[11px] space-y-0.5 text-muted-foreground">
                <li>Non-admin users will receive an emergency maintenance overlay.</li>
                <li>Daily worksheet mutations will be paused to prevent data drift.</li>
                <li>Audit broadcast alert will be dispatched to all connected clients.</li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">Lockdown Reason / Announcement</Label>
              <Input
                value={lockdownReason}
                onChange={e => setLockdownReason(e.target.value)}
                placeholder="e.g. Critical database maintenance pass in progress"
                className="text-xs h-10 bg-card border-border"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsLockdownModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!lockdownReason.trim()}
                className="bg-destructive hover:bg-destructive/90 text-white font-bold"
              >
                Authorize Lockdown
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
