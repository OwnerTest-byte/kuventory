import { useState } from 'react';
import { 
  Shield, Lock, CheckCircle2, RefreshCw, Loader2, ShieldAlert, AlertTriangle, 
  Copy, Check, ChevronDown, ChevronRight, User, Laptop
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, formatSafeDate } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { 
  getActiveUserSessions, 
  parseHumanDeviceInfo, 
  revokeSessionLease 
} from '@/features/auth/services/sessionLeaseService';
import type { ActiveSessionRecord } from '@/features/auth/services/sessionLeaseService';

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
  const [filterMode, setFilterMode] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const [expandedDiagnostics, setExpandedDiagnostics] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Authoritative Active Session Leases Query via RPC
  const { 
    data: allSessions = [], 
    isLoading: isLoadingSessions, 
    isError: isSessionsError,
    error: sessionsError,
    refetch: refetchSessions 
  } = useQuery<ActiveSessionRecord[]>({
    queryKey: ['active-session-leases-rpc'],
    queryFn: async () => {
      return await getActiveUserSessions();
    },
    staleTime: 5000,
  });

  // Filter based on selected view mode
  const displayedSessions = allSessions.filter((s) => {
    if (filterMode === 'ACTIVE') {
      return s.status === 'ACTIVE' && new Date(s.lease_expires_at).getTime() > Date.now();
    }
    return true;
  });

  const activeCount = allSessions.filter(
    (s) => s.status === 'ACTIVE' && new Date(s.lease_expires_at).getTime() > Date.now()
  ).length;

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
  const [selectedSessionForRevoke, setSelectedSessionForRevoke] = useState<ActiveSessionRecord | null>(null);
  const [revocationReason, setRevocationReason] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeSuccess, setRevokeSuccess] = useState<string | null>(null);

  // Maintenance Lockdown Modal State
  const [isLockdownModalOpen, setIsLockdownModalOpen] = useState(false);
  const [lockdownReason, setLockdownReason] = useState('');

  const toggleDiagnostic = (id: string) => {
    setExpandedDiagnostics((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyDiagnostics = (s: ActiveSessionRecord) => {
    const text = JSON.stringify({
      lease_id: s.lease_id,
      user_id: s.user_id,
      client_id: s.client_id,
      email: s.email,
      device_info: s.device_info,
      status: s.status,
      expires_at: s.lease_expires_at,
    }, null, 2);
    navigator.clipboard.writeText(text);
    setCopiedId(s.client_id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevokeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionForRevoke) return;
    if (!revocationReason.trim()) {
      setRevokeError('A mandatory reason is required to end a remote session lease.');
      return;
    }

    setIsRevoking(true);
    setRevokeError(null);
    setRevokeSuccess(null);
    try {
      await revokeSessionLease(selectedSessionForRevoke.client_id, revocationReason.trim());
      const personLabel = selectedSessionForRevoke.display_name || selectedSessionForRevoke.email || 'the user';
      const deviceLabel = parseHumanDeviceInfo(selectedSessionForRevoke.device_info);
      setRevokeSuccess(`Session ended for ${personLabel} on ${deviceLabel}. They will be signed out when the next verification reaches their browser.`);
      setSelectedSessionForRevoke(null);
      setRevocationReason('');
      await refetchSessions();
      queryClient.invalidateQueries({ queryKey: ['active-session-leases-rpc'] });
      queryClient.invalidateQueries({ queryKey: ['active-session-leases'] });
    } catch (err: any) {
      setRevokeError(err.message || 'Session termination failed');
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
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Security Clearance & Session Lease Management
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                  Tier 0 Protected
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  Single-Session Strict
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                KUVENTORY permits one active session per account. Ending a session immediately revokes access and signs that device out after the next server verification.
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
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-500 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{revokeSuccess}</span>
          </div>
        )}

        {/* Defense Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 text-xs">
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center justify-between">
            <span className="text-muted-foreground font-semibold">Active Sessions</span>
            <span className="font-bold text-foreground font-mono">
              {activeCount} Live
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Active Browser & Device Session Leases
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Active Session Leases (First Session Wins Enforcement) · Active Single-Session Device Leases
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border text-xs">
              <button
                type="button"
                onClick={() => setFilterMode('ACTIVE')}
                className={cn(
                  "px-2.5 py-1 rounded-md font-semibold transition-colors",
                  filterMode === 'ACTIVE' 
                    ? "bg-background text-foreground shadow-xs" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Active Only ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('ALL')}
                className={cn(
                  "px-2.5 py-1 rounded-md font-semibold transition-colors",
                  filterMode === 'ALL' 
                    ? "bg-background text-foreground shadow-xs" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                All Recent ({allSessions.length})
              </button>
            </div>
          </div>
        </div>

        {isSessionsError && (
          <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Could not load session leases: {(sessionsError as any)?.message || 'Server error'}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="pb-3 font-semibold">Person / Account</th>
                <th className="pb-3 font-semibold">Device</th>
                <th className="pb-3 font-semibold">Last Active</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Expires</th>
                <th className="pb-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-medium">
              {isLoadingSessions ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1 text-primary" />
                    Loading active sessions...
                  </td>
                </tr>
              ) : displayedSessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    {filterMode === 'ACTIVE' 
                      ? 'No active remote leases. Only current tab session active.' 
                      : 'No recorded session leases found in history.'}
                  </td>
                </tr>
              ) : (
                displayedSessions.map((s) => {
                  const isExpanded = !!expandedDiagnostics[s.client_id];
                  const isExpired = s.status === 'EXPIRED' || new Date(s.lease_expires_at).getTime() <= Date.now();
                  const isRevoked = s.status === 'REVOKED';
                  const isActive = !isExpired && !isRevoked && s.status === 'ACTIVE';

                  return (
                    <tr key={s.lease_id || s.client_id} className="hover:bg-muted/30 transition-colors group">
                      <td className="py-3 font-bold text-foreground">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                            <User className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="block text-foreground font-semibold">
                              {s.display_name || s.email?.split('@')[0] || 'Unknown User'}
                            </span>
                            <span className="text-[11px] text-muted-foreground block font-normal font-mono">
                              {s.email}
                            </span>
                          </div>
                          <span className={cn(
                            "ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                            s.role === 'SUPER_ADMIN' || s.role === 'MASTER_ADMIN'
                              ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                              : s.role === 'ADMIN'
                              ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                              : "bg-muted text-muted-foreground border border-border"
                          )}>
                            {s.role}
                          </span>
                        </div>

                        {/* Expandable diagnostics drawer */}
                        {isExpanded && (
                          <div className="mt-2 p-2.5 rounded-lg bg-muted/60 border border-border text-[11px] font-mono space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground font-semibold">Diagnostics Details:</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopyDiagnostics(s)}
                                className="h-6 px-2 text-[10px] text-primary hover:text-primary"
                              >
                                {copiedId === s.client_id ? (
                                  <>
                                    <Check className="w-3 h-3 mr-1 text-emerald-500" />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 mr-1" />
                                    Copy JSON
                                  </>
                                )}
                              </Button>
                            </div>
                            <div className="text-muted-foreground truncate">Client ID: <span className="text-foreground">{s.client_id}</span></div>
                            <div className="text-muted-foreground truncate">User UUID: <span className="text-foreground">{s.user_id}</span></div>
                            <div className="text-muted-foreground truncate">Raw UA: <span className="text-foreground">{s.device_info}</span></div>
                          </div>
                        )}
                      </td>

                      <td className="py-3 text-foreground">
                        <div className="flex items-center gap-1.5">
                          <Laptop className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-foreground">
                            {parseHumanDeviceInfo(s.device_info)}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 text-muted-foreground font-mono">
                        {formatSafeDate(s.last_heartbeat_at, 'hh:mm:ss a')}
                      </td>

                      <td className="py-3">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                          isActive && "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
                          isExpired && "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
                          isRevoked && "bg-rose-500/15 text-rose-500 border-rose-500/30"
                        )}>
                          {isActive ? 'Active' : isRevoked ? 'Revoked' : 'Expired'}
                        </span>
                      </td>

                      <td className="py-3 text-muted-foreground font-mono">
                        {formatSafeDate(s.lease_expires_at, 'hh:mm:ss a')}
                      </td>

                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleDiagnostic(s.client_id)}
                            className="text-[11px] h-7 px-2 text-muted-foreground hover:text-foreground"
                            title="Toggle technical diagnostics"
                          >
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            <span className="sr-only sm:not-sr-only">Details</span>
                          </Button>

                          {isActive && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedSessionForRevoke(s);
                                setRevocationReason('');
                                setRevokeError(null);
                              }}
                              className="text-xs h-7 px-2.5 border-destructive/30 text-destructive hover:bg-destructive/10 cursor-pointer font-semibold"
                            >
                              <Lock className="w-3 h-3 mr-1" />
                              End session
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
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

      {/* End Session Dialog */}
      <Dialog open={!!selectedSessionForRevoke} onOpenChange={(open) => !open && setSelectedSessionForRevoke(null)}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Lock className="w-5 h-5" />
              End Remote Session
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              End session for <strong className="text-foreground">{selectedSessionForRevoke?.display_name || selectedSessionForRevoke?.email}</strong> on <strong className="text-foreground">{parseHumanDeviceInfo(selectedSessionForRevoke?.device_info)}</strong>.
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
              <Label className="text-xs font-bold text-foreground">Mandatory Reason</Label>
              <Input
                value={revocationReason}
                onChange={e => setRevocationReason(e.target.value)}
                placeholder="e.g. Unrecognized device login reported by staff"
                className="text-xs h-10 bg-card border-border"
                required
              />
            </div>

            <p className="text-[11px] text-muted-foreground">
              The targeted client lease will immediately transition to <code>REVOKED</code>. The client will be signed out on its next heartbeat and locked from mutating inventory sheets. This action is audited under <code>{userEmail}</code>.
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
                Authorize End Session
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
