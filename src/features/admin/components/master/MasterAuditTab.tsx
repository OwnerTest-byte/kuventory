import { useState } from 'react';
import { format } from 'date-fns';
import { 
  Activity, Search, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface MasterAuditTabProps {
  auditLogs: any[];
  isLoadingAuditLogs: boolean;
  onRefreshAudits: () => void;
}

export function MasterAuditTab({
  auditLogs,
  isLoadingAuditLogs,
  onRefreshAudits,
}: MasterAuditTabProps) {
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredLogs = auditLogs.filter((log) => {
    const matchesAction = filterAction === 'ALL' || log.action?.toUpperCase().includes(filterAction);
    const matchesSearch = !searchTerm || 
      (log.action && log.action.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.target_table && log.target_table.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.user_id && log.user_id.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesAction && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Master Security & Administrative Audit Trail
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Immutable ledger of all high-risk operations, user role modifications, emergency overrides, and inventory mutations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefreshAudits}
              disabled={isLoadingAuditLogs}
              className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isLoadingAuditLogs && "animate-spin")} />
              Refresh Audit Trail
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by action, table, or user ID..."
              className="pl-9 h-10 text-xs bg-muted/30 border-border"
            />
          </div>

          <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
            {['ALL', 'USER', 'INVENTORY', 'OVERRIDE', 'MAINTENANCE'].map((act) => (
              <button
                key={act}
                onClick={() => setFilterAction(act)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  filterAction === act
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
              >
                {act}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">Audit Log Entries</h3>
          <span className="text-xs text-muted-foreground font-mono">
            Showing {filteredLogs.length} of {auditLogs.length} events
          </span>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/60 border-b border-border">
              <TableRow>
                <TableHead className="font-bold text-foreground">Timestamp</TableHead>
                <TableHead className="font-bold text-foreground">Action</TableHead>
                <TableHead className="font-bold text-foreground">Target Entity</TableHead>
                <TableHead className="font-bold text-foreground">Actor ID</TableHead>
                <TableHead className="font-bold text-foreground">Metadata / Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingAuditLogs ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground font-medium">
                    Loading audit trail from database...
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground font-medium">
                    No matching audit log events found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log: any) => (
                  <TableRow key={log.id} className="hover:bg-muted/40">
                    <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {log.created_at ? format(new Date(log.created_at), 'MMM dd, yyyy HH:mm:ss') : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-primary/15 text-primary border border-primary/20">
                        {log.action || 'MUTATION'}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground font-semibold">
                      {log.target_table || 'system'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.user_id ? `${String(log.user_id).substring(0, 8)}...` : 'system'}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground max-w-xs truncate">
                      {log.details ? (typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)) : 'No details'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
