import { useState, useMemo } from 'react';
import { 
  AlertTriangle, CheckCircle2, Loader2, Plus, Search, ShieldAlert, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, formatSafeDate } from '@/lib/utils';
import { 
  createManualIncident, 
  updateIncidentStatus, 
  type IncidentRecord 
} from '../../services/superAdminService';

interface SuperIncidentsTabProps {
  incidents: IncidentRecord[];
  onRefresh: () => void;
  userEmail: string;
}

export function SuperIncidentsTab({
  incidents,
  onRefresh,
  userEmail
}: SuperIncidentsTabProps) {
  const [filterType, setFilterType] = useState<'ALL' | 'OPEN' | 'INVESTIGATING' | 'RESOLVED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Create Incident Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSeverity, setNewSeverity] = useState<'CRITICAL' | 'WARNING' | 'INFO'>('WARNING');
  const [newComponent, setNewComponent] = useState('Daily Inventory');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Resolution Modal State
  const [selectedIncidentForResolve, setSelectedIncidentForResolve] = useState<IncidentRecord | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Transition to Investigating
  const [investigatingId, setInvestigatingId] = useState<string | null>(null);

  const filteredIncidents = useMemo(() => {
    return incidents.filter(i => {
      const matchesFilter = filterType === 'ALL' || i.status === filterType;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || 
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.component.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [incidents, filterType, searchQuery]);

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim()) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      await createManualIncident({
        title: newTitle.trim(),
        description: newDescription.trim(),
        severity: newSeverity,
        component: newComponent,
      });
      setIsCreateModalOpen(false);
      setNewTitle('');
      setNewDescription('');
      onRefresh();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create incident');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSetInvestigating = async (incident: IncidentRecord) => {
    setInvestigatingId(incident.id);
    try {
      await updateIncidentStatus(incident.id, 'INVESTIGATING', undefined, userEmail);
      onRefresh();
    } catch (err: any) {
      alert(`Error updating incident: ${err.message || 'Unknown error'}`);
    } finally {
      setInvestigatingId(null);
    }
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncidentForResolve) return;
    if (!resolutionNote.trim()) {
      setResolveError('A mandatory resolution note is required to close an incident.');
      return;
    }

    setIsResolving(true);
    setResolveError(null);
    try {
      await updateIncidentStatus(
        selectedIncidentForResolve.id, 
        'RESOLVED', 
        resolutionNote.trim(), 
        userEmail
      );
      setSelectedIncidentForResolve(null);
      setResolutionNote('');
      onRefresh();
    } catch (err: any) {
      setResolveError(err.message || 'Failed to resolve incident');
    } finally {
      setIsResolving(false);
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
                  System Incident Management & Operational Triage
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                  {incidents.filter(i => i.status !== 'RESOLVED').length} Active
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Report operational anomalies, record technical investigations, and enforce documented resolution milestones
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer shrink-0"
            >
              Sync Incidents
            </Button>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Report Incident
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Incidents & Filter Stream */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search incidents by title, component..."
              className="text-xs pl-9 h-9 bg-muted/40 border-border"
            />
          </div>

          {/* Filter Pills */}
          <div className="inline-flex rounded-xl bg-muted p-1 border border-border">
            {(['ALL', 'OPEN', 'INVESTIGATING', 'RESOLVED'] as const).map(tab => (
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
            <div className="p-8 rounded-xl bg-muted/40 border border-border text-center text-muted-foreground text-xs space-y-1">
              <CheckCircle2 className="w-5 h-5 mx-auto text-emerald-500 mb-1" />
              <p className="font-bold text-foreground">No Incidents Found</p>
              <p className="text-[11px]">All subsystems are operating normally or matched no filter criteria.</p>
            </div>
          ) : (
            filteredIncidents.map(inc => {
              const isResolved = inc.status === 'RESOLVED';
              const isInvestigating = inc.status === 'INVESTIGATING';
              return (
                <div 
                  key={inc.id}
                  className="p-4 rounded-xl bg-muted/30 border border-border flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                      inc.severity === 'CRITICAL' ? "bg-destructive/15 text-destructive" :
                      inc.severity === 'WARNING' ? "bg-amber-500/15 text-amber-500" :
                      "bg-blue-500/15 text-blue-500"
                    )}>
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-xs font-bold text-foreground">{inc.title}</h4>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border">
                          {inc.component}
                        </span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                          isResolved 
                            ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                            : isInvestigating
                            ? "bg-blue-500/15 text-blue-500 border border-blue-500/30"
                            : "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                        )}>
                          {inc.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{inc.description}</p>
                      {inc.resolutionNote && (
                        <p className="text-[11px] text-emerald-500 font-semibold bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                          Resolution: {inc.resolutionNote} {inc.resolvedBy && `(by ${inc.resolvedBy})`}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-[11px] text-muted-foreground font-mono">
                        <span>Reported: {formatSafeDate(inc.createdAt, 'MMM dd, yyyy hh:mm a')}</span>
                        {inc.resolvedAt && (
                          <span>Resolved: {formatSafeDate(inc.resolvedAt, 'MMM dd, hh:mm a')}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    {!isResolved && !isInvestigating && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSetInvestigating(inc)}
                        disabled={investigatingId === inc.id}
                        className="text-xs h-8 border-blue-500/30 text-blue-500 hover:bg-blue-500/10 cursor-pointer"
                      >
                        {investigatingId === inc.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ShieldAlert className="w-3 h-3 mr-1" />}
                        Investigate
                      </Button>
                    )}

                    {!isResolved && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedIncidentForResolve(inc);
                          setResolutionNote('');
                          setResolveError(null);
                        }}
                        className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        Resolve Incident
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Create Incident Dialog */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Report Operational System Incident
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Record an authoritative incident in the database to track system anomalies and mitigations.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateIncident} className="space-y-4 py-2 text-xs">
            {createError && (
              <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">Incident Title</Label>
              <Input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Sync job timeout on 30-day archival run"
                className="text-xs h-10 bg-card border-border"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">Severity</Label>
                <select
                  value={newSeverity}
                  onChange={e => setNewSeverity(e.target.value as any)}
                  className="w-full text-xs h-10 rounded-md bg-card border border-border px-3 text-foreground font-semibold"
                >
                  <option value="CRITICAL">CRITICAL (System Impact)</option>
                  <option value="WARNING">WARNING (Degraded)</option>
                  <option value="INFO">INFO (Operational Note)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground">Subsystem Component</Label>
                <select
                  value={newComponent}
                  onChange={e => setNewComponent(e.target.value)}
                  className="w-full text-xs h-10 rounded-md bg-card border border-border px-3 text-foreground font-semibold"
                >
                  <option value="Daily Inventory">Daily Inventory</option>
                  <option value="Database">Database</option>
                  <option value="Storage">Storage</option>
                  <option value="Auth">Auth & Sessions</option>
                  <option value="Automations">Automations</option>
                  <option value="Realtime">Realtime WebSockets</option>
                  <option value="General System">General System</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">Detailed Description & Context</Label>
              <textarea
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                rows={3}
                placeholder="Describe the failure, observed error messages, and initial triage steps..."
                className="w-full text-xs p-3 rounded-md bg-card border border-border text-foreground resize-none"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)} disabled={isCreating}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isCreating || !newTitle.trim() || !newDescription.trim()}
                className="bg-destructive hover:bg-destructive/90 text-white font-bold"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
                Log Incident
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Resolve Incident Dialog */}
      <Dialog open={!!selectedIncidentForResolve} onOpenChange={(open) => !open && setSelectedIncidentForResolve(null)}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-500">
              <CheckCircle2 className="w-5 h-5" />
              Resolve Operational Incident
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Close incident <strong className="text-foreground">{selectedIncidentForResolve?.title}</strong> with an authoritative resolution note.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResolveSubmit} className="space-y-4 py-2 text-xs">
            {resolveError && (
              <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{resolveError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">Mandatory Resolution Note / Root Cause</Label>
              <textarea
                value={resolutionNote}
                onChange={e => setResolutionNote(e.target.value)}
                rows={3}
                placeholder="e.g. Issue resolved: Re-ran automated threshold pass and confirmed batch reconciliations in database."
                className="w-full text-xs p-3 rounded-md bg-card border border-border text-foreground resize-none"
                required
              />
            </div>

            <p className="text-[11px] text-muted-foreground">
              This resolution note and closing timestamp will be permanently written to the <code>system_incidents</code> database table and recorded in the audit logs under <code>{userEmail}</code>.
            </p>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setSelectedIncidentForResolve(null)} disabled={isResolving}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isResolving || !resolutionNote.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                {isResolving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                Authorize & Close Incident
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
