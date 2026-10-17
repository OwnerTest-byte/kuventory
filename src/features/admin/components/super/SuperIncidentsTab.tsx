import { useState, useMemo } from 'react';
import { 
  AlertTriangle, CheckCircle2, RotateCcw, Loader2 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { IncidentRecord } from '../../services/superAdminService';

interface SuperIncidentsTabProps {
  incidents: IncidentRecord[];
  onResolveIncident: (incidentId: string) => Promise<void>;
  finalizedSheets: any[];
  isLoadingFinalizedSheets: boolean;
  onOpenForceOverride: (sheet: any) => void;
  overrideSuccess: string | null;
  overrideError: string | null;
  onRefresh: () => void;
}

export function SuperIncidentsTab({
  incidents,
  onResolveIncident,
  finalizedSheets,
  isLoadingFinalizedSheets,
  onOpenForceOverride,
  overrideSuccess,
  overrideError,
  onRefresh
}: SuperIncidentsTabProps) {
  const [filterType, setFilterType] = useState<'ALL' | 'INCIDENTS' | 'ERRORS' | 'SECURITY'>('ALL');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const filteredIncidents = useMemo(() => {
    if (filterType === 'ALL') return incidents;
    if (filterType === 'INCIDENTS') return incidents.filter(i => i.severity === 'CRITICAL' || i.severity === 'WARNING');
    if (filterType === 'ERRORS') return incidents.filter(i => i.component.toLowerCase().includes('inventory') || i.component.toLowerCase().includes('sync'));
    if (filterType === 'SECURITY') return incidents.filter(i => i.component.toLowerCase().includes('auth') || i.component.toLowerCase().includes('security'));
    return incidents;
  }, [incidents, filterType]);

  const handleResolve = async (id: string) => {
    setResolvingId(id);
    try {
      await onResolveIncident(id);
    } catch (err: any) {
      alert(`Error resolving incident: ${err.message || 'Unknown error'}`);
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-destructive/15 border border-destructive/30 text-destructive flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Incident Management & Operational Override
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                  {incidents.filter(i => i.status !== 'RESOLVED').length} Active
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Investigate reported system errors, track resolution milestones, or unlock finalized worksheets
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer shrink-0"
          >
            Refresh Feed
          </Button>
        </div>

        {overrideSuccess && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-500 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {overrideSuccess}
          </div>
        )}
        {overrideError && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs font-bold text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {overrideError}
          </div>
        )}
      </div>

      {/* 2. Incidents & Event Stream matching mockup */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Recorded System Incidents & Alerts</h3>
            <p className="text-xs text-muted-foreground">Historical records of operational anomalies, job failures, and mitigations</p>
          </div>

          {/* Filter Pills */}
          <div className="inline-flex rounded-xl bg-muted p-1 border border-border">
            {(['ALL', 'INCIDENTS', 'ERRORS', 'SECURITY'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilterType(tab)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  filterType === tab 
                    ? "bg-primary text-primary-foreground shadow-xs" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filteredIncidents.length === 0 ? (
            <div className="p-6 rounded-xl bg-muted/40 border border-border text-center text-muted-foreground text-xs">
              No incidents found matching the selected filter.
            </div>
          ) : (
            filteredIncidents.map(inc => {
              const isResolving = resolvingId === inc.id;
              const isResolved = inc.status === 'RESOLVED';
              return (
                <div 
                  key={inc.id}
                  className="p-4 rounded-xl bg-muted/30 border border-border flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                      inc.severity === 'CRITICAL' ? "bg-destructive/15 text-destructive" :
                      inc.severity === 'WARNING' ? "bg-amber-500/15 text-amber-500" :
                      "bg-blue-500/15 text-blue-500"
                    )}>
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-foreground">{inc.title}</h4>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border">
                          {inc.component}
                        </span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                          isResolved 
                            ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                            : "bg-destructive/15 text-destructive border border-destructive/30"
                        )}>
                          {inc.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{inc.description}</p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-1">
                        Detected: {format(new Date(inc.createdAt), 'MMM dd, yyyy hh:mm a')}
                        {inc.resolvedAt && ` · Resolved: ${format(new Date(inc.resolvedAt), 'hh:mm a')} by ${inc.resolvedBy || 'Super Admin'}`}
                      </p>
                    </div>
                  </div>

                  {!isResolved && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleResolve(inc.id)}
                      disabled={isResolving}
                      className="text-xs h-8 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 cursor-pointer shrink-0"
                    >
                      {isResolving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                      Mark Resolved
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. Operational Override: Finalized Sheet Unlock */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Tier 0 Emergency Override: Finalized Worksheets</h3>
          <p className="text-xs text-muted-foreground">Unlock locked daily inventory sheets back to DRAFT state for verified discrepancy recounts</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="pb-2.5 font-semibold">Inventory Date</th>
                <th className="pb-2.5 font-semibold">State</th>
                <th className="pb-2.5 font-semibold">Finalized Timestamp</th>
                <th className="pb-2.5 font-semibold text-right">Super Admin Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-medium">
              {isLoadingFinalizedSheets ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">Loading sheets...</td>
                </tr>
              ) : finalizedSheets.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">No finalized sheets currently in archive.</td>
                </tr>
              ) : (
                finalizedSheets.map(sheet => (
                  <tr key={sheet.id} className="hover:bg-muted/30">
                    <td className="py-3 font-bold text-foreground">{sheet.inventory_date}</td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-500 border border-blue-500/30">
                        {sheet.state}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {format(new Date(sheet.finalized_at || sheet.created_at), 'PPpp')}
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenForceOverride(sheet)}
                        className="text-xs h-7 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" /> Reopen to DRAFT
                      </Button>
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
