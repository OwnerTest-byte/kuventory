import { useState } from 'react';
import { format } from 'date-fns';
import { 
  Shield, Crown, Lock, CheckCircle2, KeyRound, 
  Users, UserCheck, ShieldAlert, Loader2, Laptop, 
  UserX, RefreshCw, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getActiveUserSessions, revokeUserSessionByAdmin, type ActiveSessionRecord } from '@/features/auth/services/sessionLeaseService';

interface MasterSecurityTabProps {
  maintenanceSetting: { locked: boolean; reason: string; locked_at?: string } | undefined;
  onToggleMaintenance: () => void;
  isMaintenanceToggling: boolean;
  privilegedUsers: Array<{
    id: string;
    role: string;
    display_name: string | null;
    created_at: string;
  }>;
  visitorLogs: any[];
  onOpenResetPassword: (user: any) => void;
}

export function MasterSecurityTab({
  maintenanceSetting,
  onToggleMaintenance,
  isMaintenanceToggling,
  privilegedUsers,
  visitorLogs,
  onOpenResetPassword,
}: MasterSecurityTabProps) {
  const queryClient = useQueryClient();

  // Active Sessions Query
  const { data: activeSessions = [], isLoading: isLoadingSessions, refetch: refetchSessions } = useQuery({
    queryKey: ['active-user-sessions'],
    queryFn: getActiveUserSessions,
    refetchInterval: 10000, // Auto refresh every 10s
  });

  // Revocation Modal State
  const [selectedSession, setSelectedSession] = useState<ActiveSessionRecord | null>(null);
  const [revocationReason, setRevocationReason] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const handleRevokeConfirm = async () => {
    if (!selectedSession) return;
    setIsRevoking(true);
    setRevokeError(null);

    try {
      await revokeUserSessionByAdmin(
        selectedSession.user_id,
        revocationReason.trim() || 'Revoked by Master Administrator from Security Control Center'
      );
      await refetchSessions();
      queryClient.invalidateQueries({ queryKey: ['active-user-sessions'] });
      setSelectedSession(null);
      setRevocationReason('');
    } catch (err: any) {
      setRevokeError(err.message || 'Failed to revoke session.');
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-500" />
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Security, Access Control & Privileged Sessions
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Zero-Trust clearance enforcement, atomic single-session leases (First Session Wins), maintenance lockout barriers, and active device inspection.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Zero-Trust Active
            </span>
          </div>
        </div>

        {/* Security Posture Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs pt-2">
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[11px]">Tier 0 Master Admin</span>
              <span className="text-[10px] font-mono font-bold text-amber-500 uppercase px-1.5 py-0.5 rounded bg-amber-500/10">1 / 1 (Fixed)</span>
            </div>
            <span className="font-bold text-amber-500 text-sm mt-1 flex items-center gap-1.5">
              <Crown className="w-4 h-4" /> 1 Master Admin (Root)
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[11px]">Level 1 Operational Admins</span>
              <span className="text-[10px] font-mono font-bold text-primary uppercase px-1.5 py-0.5 rounded bg-primary/10">
                {privilegedUsers.filter(u => u.role === 'ADMIN').length} / 3 Max Quota
              </span>
            </div>
            <span className="font-bold text-foreground text-sm mt-1 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-primary" /> {privilegedUsers.filter(u => u.role === 'ADMIN').length} Store Admins
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[11px]">Active Session Leases</span>
              <span className="text-[10px] font-mono font-bold text-emerald-500 uppercase px-1.5 py-0.5 rounded bg-emerald-500/10">
                {activeSessions.filter(s => s.is_occupied_now).length} Active
              </span>
            </div>
            <span className="font-bold text-foreground text-sm mt-1 flex items-center gap-1.5">
              <Laptop className="w-4 h-4 text-emerald-500" /> Single-Session Strict
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[11px]">Emergency Lockout</span>
              <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-muted">Status</span>
            </div>
            <span className={cn("font-bold text-sm mt-1 flex items-center gap-1.5", maintenanceSetting?.locked ? "text-rose-500" : "text-emerald-500")}>
              <Lock className="w-4 h-4" /> {maintenanceSetting?.locked ? "LOCKED (Read-Only)" : "OFF (Normal Flow)"}
            </span>
          </div>
        </div>
      </div>

      {/* Contingency 1: Active User Session Leases & Instant Revocation (Rule 11-17) */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Laptop className="w-5 h-5 text-primary" />
            <div>
              <h3 className="text-base font-bold text-foreground">
                Active Session Leases (First Session Wins Enforcement)
              </h3>
              <p className="text-xs text-muted-foreground">
                Enforcing single active human session per account. Device B login is denied if Device A is active.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchSessions()}
            disabled={isLoadingSessions}
            className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer shrink-0"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isLoadingSessions && "animate-spin")} />
            Refresh Leases
          </Button>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/60 border-b border-border">
              <TableRow>
                <TableHead className="font-bold text-foreground">User / Identity</TableHead>
                <TableHead className="font-bold text-foreground">Role</TableHead>
                <TableHead className="font-bold text-foreground">Device / Browser</TableHead>
                <TableHead className="font-bold text-foreground">Last Heartbeat</TableHead>
                <TableHead className="font-bold text-foreground">Lease Status</TableHead>
                <TableHead className="text-right font-bold text-foreground">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeSessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                    No session leases registered yet.
                  </TableCell>
                </TableRow>
              ) : (
                activeSessions.map((session) => {
                  const isOccupied = session.is_occupied_now;
                  const isRevoked = session.status === 'REVOKED';
                  const isMaster = session.role === 'MASTER_ADMIN';

                  return (
                    <TableRow key={session.lease_id} className="hover:bg-muted/40">
                      <TableCell>
                        <div className="font-bold text-foreground">{session.display_name}</div>
                        <span className="font-mono text-[11px] text-muted-foreground">{session.email}</span>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                          isMaster 
                            ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30" 
                            : session.role === 'ADMIN'
                            ? "bg-primary/15 text-primary border border-primary/20"
                            : "bg-muted text-muted-foreground border border-border"
                        )}>
                          {session.role}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-foreground truncate max-w-[220px]" title={session.device_info}>
                          {session.device_info || 'Standard Browser Client'}
                        </div>
                        <span className="font-mono text-[10px] text-muted-foreground">{session.client_id}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {session.last_heartbeat_at ? format(new Date(session.last_heartbeat_at), 'HH:mm:ss') : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                          isOccupied
                            ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                            : isRevoked
                            ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                            : "bg-muted text-muted-foreground border border-border"
                        )}>
                          {isOccupied ? 'OCCUPIED (Active)' : isRevoked ? 'REVOKED' : 'EXPIRED / INACTIVE'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {isOccupied && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setSelectedSession(session)}
                            className="text-xs font-bold cursor-pointer shadow-xs"
                          >
                            <UserX className="w-3.5 h-3.5 mr-1" />
                            Revoke Session
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Contingency 2: System Maintenance Mode Lock */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            <h3 className="text-base font-bold text-foreground">
              Emergency System Maintenance Lockout
            </h3>
          </div>
          <span className={cn(
            "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
            maintenanceSetting?.locked 
              ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30" 
              : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
          )}>
            {maintenanceSetting?.locked ? 'MAINTENANCE MODE ACTIVE' : 'SYSTEM OPERATING NORMALLY'}
          </span>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Placing KUVENTORY into maintenance mode instantly restricts floor staff from creating or editing daily inventory worksheets, receiving shipments, or modifying catalog records during emergency audits.
        </p>

        <div className="pt-1">
          <Button
            variant={maintenanceSetting?.locked ? "destructive" : "default"}
            size="sm"
            onClick={onToggleMaintenance}
            disabled={isMaintenanceToggling}
            className="text-xs font-bold px-5 py-2 cursor-pointer shadow-xs"
          >
            {isMaintenanceToggling ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Lock className="w-3.5 h-3.5 mr-1.5" />}
            {maintenanceSetting?.locked ? "Lift Maintenance Lock" : "Activate Emergency Maintenance Lock"}
          </Button>
        </div>
      </div>

      {/* Privileged Accounts Inspection Table */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-primary" />
            <h3 className="text-base font-bold text-foreground">
              Privileged Administrator Accounts
            </h3>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {privilegedUsers.length} privileged users
          </span>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/60 border-b border-border">
              <TableRow>
                <TableHead className="font-bold text-foreground">Identity & Name</TableHead>
                <TableHead className="font-bold text-foreground">Role Clearance</TableHead>
                <TableHead className="font-bold text-foreground">Account Created</TableHead>
                <TableHead className="text-right font-bold text-foreground">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {privilegedUsers.map((u) => {
                const isMaster = u.role === 'MASTER_ADMIN' || u.id === '9fd39214-7728-4e89-b388-3970f5c60f5b';
                return (
                  <TableRow key={u.id} className="hover:bg-muted/40">
                    <TableCell>
                      <div className="font-bold text-foreground flex items-center gap-2">
                        {isMaster ? <Crown className="w-3.5 h-3.5 text-amber-500" /> : <Shield className="w-3.5 h-3.5 text-primary" />}
                        {u.display_name || 'Administrator'}
                      </div>
                      <span className="font-mono text-[11px] text-muted-foreground">{u.id}</span>
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                        isMaster 
                          ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30" 
                          : "bg-primary/15 text-primary border border-primary/20"
                      )}>
                        {isMaster ? 'MASTER_ADMIN (Tier 0)' : 'ADMIN (Level 1)'}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(u.created_at), 'MMM dd, yyyy HH:mm')}
                    </TableCell>
                    <TableCell className="text-right">
                      {!isMaster && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenResetPassword(u)}
                          className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer"
                        >
                          <KeyRound className="w-3 h-3 mr-1 text-primary" />
                          Reset Password
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Staff Logins & Access Audit */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-bold text-foreground">
              Recent Authentication & Staff Session Activity
            </h3>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {visitorLogs.length} events
          </span>
        </div>

        <div className="rounded-xl border border-border overflow-hidden max-h-60 overflow-y-auto">
          {visitorLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No recent session logs recorded.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {visitorLogs.slice(0, 10).map((log: any) => (
                <div key={log.id} className="p-3 text-xs flex items-center justify-between hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground border border-border shrink-0">
                      {log.method || 'AUTH'}
                    </span>
                    <span className="font-medium text-foreground truncate">
                      {log.path || log.action || 'Session authenticated'}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0 ml-3">
                    {log.visited_at ? format(new Date(log.visited_at), 'MMM dd, HH:mm:ss') : 'Just now'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Revocation Confirmation Dialog */}
      <Dialog open={!!selectedSession} onOpenChange={(open) => !open && setSelectedSession(null)}>
        <DialogContent className="max-w-md bg-card border border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500 font-bold">
              <UserX className="w-5 h-5" /> Revoke User Session
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              This will immediately invalidate the active lease for <strong className="text-foreground">{selectedSession?.email}</strong>. The user's device will be disconnected and returned to the login screen.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-1">
              <div><span className="text-muted-foreground">User:</span> <strong className="text-foreground">{selectedSession?.display_name} ({selectedSession?.email})</strong></div>
              <div><span className="text-muted-foreground">Device:</span> <span className="font-mono text-[11px]">{selectedSession?.device_info}</span></div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Revocation Audit Reason (Required)
              </label>
              <Textarea
                placeholder="e.g. Lost device report / suspicious concurrent activity"
                value={revocationReason}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRevocationReason(e.target.value)}
                className="text-xs min-h-[70px]"
              />
            </div>

            {revokeError && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" /> {revokeError}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedSession(null)}
              disabled={isRevoking}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRevokeConfirm}
              disabled={isRevoking}
              className="text-xs font-bold"
            >
              {isRevoking ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <UserX className="w-3.5 h-3.5 mr-1" />}
              Confirm Revocation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
