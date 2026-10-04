import { format } from 'date-fns';
import { 
  Shield, Crown, Lock, CheckCircle2, KeyRound, 
  Users, UserCheck, ShieldAlert, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

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
              Zero-Trust clearance enforcement, privileged administrator accounts, maintenance lockout barriers, and staff authentication logs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Zero-Trust Active
            </span>
          </div>
        </div>

        {/* Security Posture Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2">
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border">
            <span className="text-muted-foreground text-[11px] block">Tier 0 Clearances</span>
            <span className="font-bold text-amber-500 text-sm mt-0.5 block flex items-center gap-1.5">
              <Crown className="w-4 h-4" /> 1 Master Admin (Root)
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border">
            <span className="text-muted-foreground text-[11px] block">Level 1 Operational Admins</span>
            <span className="font-bold text-foreground text-sm mt-0.5 block flex items-center gap-1.5">
              <Users className="w-4 h-4 text-primary" /> {Math.max(0, privilegedUsers.length - 1)} Store Administrators
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border">
            <span className="text-muted-foreground text-[11px] block">Maintenance Barrier</span>
            <span className={cn("font-bold text-sm mt-0.5 block flex items-center gap-1.5", maintenanceSetting?.locked ? "text-rose-500" : "text-emerald-500")}>
              <Lock className="w-4 h-4" /> {maintenanceSetting?.locked ? "LOCKED (Read-Only)" : "OFF (Normal Flow)"}
            </span>
          </div>
        </div>
      </div>

      {/* Contingency 1: System Maintenance Mode Lock */}
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
    </div>
  );
}
