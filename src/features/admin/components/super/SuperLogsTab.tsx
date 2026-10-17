import { useState, useMemo } from 'react';
import { 
  FileText, Search, RefreshCw, Loader2 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface SuperLogsTabProps {
  auditLogs: any[];
  isLoadingAuditLogs: boolean;
  onRefreshAudits: () => void;
}

export function SuperLogsTab({
  auditLogs,
  isLoadingAuditLogs,
  onRefreshAudits
}: SuperLogsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');

  const actionTypes = useMemo(() => {
    const set = new Set<string>();
    auditLogs.forEach(l => {
      if (l.action) set.add(l.action);
    });
    return Array.from(set);
  }, [auditLogs]);

  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || 
        String(log.action || '').toLowerCase().includes(q) ||
        String(log.target_table || '').toLowerCase().includes(q) ||
        String(log.target_id || '').toLowerCase().includes(q) ||
        JSON.stringify(log.details || '').toLowerCase().includes(q);

      const matchesAction = selectedAction === 'ALL' || log.action === selectedAction;

      return matchesSearch && matchesAction;
    });
  }, [auditLogs, searchQuery, selectedAction]);

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-500 flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  System Audit Trail & Diagnostic Logs
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary border border-primary/30">
                  Immutable
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                PostgreSQL database mutation stream, privileged Super Admin actions, and background execution traces
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefreshAudits}
            disabled={isLoadingAuditLogs}
            className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer shrink-0"
          >
            {isLoadingAuditLogs ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            Refresh Logs
          </Button>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="p-4 rounded-xl bg-card border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by action, table, or details..."
            className="text-xs pl-9 h-10 bg-muted/40 border-border"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-muted-foreground font-semibold shrink-0">Action:</span>
          <select
            value={selectedAction}
            onChange={e => setSelectedAction(e.target.value)}
            className="text-xs rounded-lg bg-muted border border-border px-3 py-2 text-foreground font-semibold"
          >
            <option value="ALL">All Actions ({auditLogs.length})</option>
            {actionTypes.map(act => (
              <option key={act} value={act}>{act}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 3. Audit Logs Table */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="pb-3 font-semibold">Timestamp</th>
                <th className="pb-3 font-semibold">Action</th>
                <th className="pb-3 font-semibold">Target Entity</th>
                <th className="pb-3 font-semibold">Entity ID</th>
                <th className="pb-3 font-semibold">Audit Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-medium">
              {isLoadingAuditLogs ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading system audit records...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No matching audit logs found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 font-mono text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), 'MMM dd, yyyy hh:mm:ss a')}
                    </td>
                    <td className="py-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px]",
                        log.action?.includes('DELETE') || log.action?.includes('ROLLBACK')
                          ? "bg-destructive/15 text-destructive border border-destructive/20"
                          : log.action?.includes('INSERT') || log.action?.includes('CREATE')
                          ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/20"
                          : "bg-primary/15 text-primary border border-primary/20"
                      )}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 font-mono font-bold text-foreground">
                      {log.target_table || 'system'}
                    </td>
                    <td className="py-3 font-mono text-muted-foreground text-[11px]">
                      {log.target_id ? String(log.target_id).substring(0, 12) + '...' : '—'}
                    </td>
                    <td className="py-3 text-muted-foreground max-w-xs truncate" title={JSON.stringify(log.details || log.reason || '')}>
                      {log.details ? (typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)) : log.reason || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
