import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClipboardList, Eye, Loader2, CheckCircle2, RotateCcw, XCircle, ArrowRight } from 'lucide-react';
import {
  fetchStaffChangeRequests,
  reviewStaffChangeRequest,
  STAFF_REQUEST_TYPE_LABELS,
  type StaffChangeRequest,
  type StaffChangeDecision,
} from '../services/staffRequestService';
import { useRealtimeTableSync } from '@/features/admin/hooks/useRealtimeTableSync';

function statusBadge(status: string) {
  switch (status) {
    case 'PENDING':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
    case 'APPROVED':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    case 'REJECTED':
      return 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30';
    case 'RETURNED':
      return 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30';
    case 'FAILED':
      return 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

interface ReviewTarget {
  request: StaffChangeRequest;
  decision: StaffChangeDecision;
}

/**
 * ADMIN review queue for staff change requests — mirrors the finalized-sheet
 * CorrectionRequestsQueue: realtime table, review dialog with the full
 * requested context, and three actions (Approve & Apply / Return / Reject).
 * Approval applies the change server-side in the same transaction.
 */
export function StaffChangeRequestsQueue() {
  const [selectedRequest, setSelectedRequest] = useState<StaffChangeRequest | null>(null);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [notes, setNotes] = useState('');
  const [isDeciding, setIsDeciding] = useState(false);
  const [decisionResult, setDecisionResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: ['staff-change-requests'],
    queryFn: fetchStaffChangeRequests,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const { isLive } = useRealtimeTableSync({
    table: 'staff_change_requests',
    channelName: 'staff-change-requests-admin-sync',
    onEvent: () => {
      void refetch();
    },
  });

  const pending = requests.filter(r => r.status === 'PENDING');
  const resolved = requests.filter(r => r.status !== 'PENDING');

  const openReview = (request: StaffChangeRequest, decision: StaffChangeDecision) => {
    setReviewTarget({ request, decision });
    setNotes('');
    setDecisionResult(null);
  };

  const handleDecision = async () => {
    if (!reviewTarget) return;
    setIsDeciding(true);
    setDecisionResult(null);
    try {
      const res = await reviewStaffChangeRequest(reviewTarget.request.id, reviewTarget.decision, notes);
      setDecisionResult({ ok: res.success, message: res.message });
      await refetch();
      if (res.success) {
        setTimeout(() => {
          setReviewTarget(null);
          setSelectedRequest(null);
        }, 1800);
      }
    } catch (err: any) {
      setDecisionResult({ ok: false, message: err?.message || 'The decision could not be applied.' });
    } finally {
      setIsDeciding(false);
    }
  };

  const renderRequestDetails = (req: StaffChangeRequest) => (
    <div className="space-y-3">
      <div className="p-3 rounded-xl bg-muted/30 border border-border/50 space-y-1">
        <span className="text-[10px] font-bold uppercase text-muted-foreground">Requester's reason</span>
        <p className="text-xs text-foreground/90 italic">“{req.reason}”</p>
      </div>

      {/* Requested payload, human-readable per type */}
      <div className="p-3 rounded-xl bg-card border border-border/70 space-y-1.5">
        <span className="text-[10px] font-bold uppercase text-muted-foreground">Requested change</span>
        {req.request_type === 'ADD_ITEM' && (
          <ul className="text-xs text-foreground space-y-0.5">
            <li><strong>Name:</strong> {String(req.payload?.name ?? '—')}</li>
            <li><strong>Unit:</strong> {String(req.payload?.unit ?? '—')}</li>
            <li><strong>Station:</strong> {req.payload?.category_id ? String(req.payload.category_id) : 'Unassigned'}</li>
            <li><strong>Initial stock:</strong> {String(req.payload?.initial_quantity ?? 0)}{req.payload?.expiry_date ? ` · expires ${String(req.payload.expiry_date)}` : ''}</li>
            <li><strong>Min quantity:</strong> {String(req.payload?.min_quantity ?? 0)}</li>
          </ul>
        )}
        {req.request_type === 'EDIT_ITEM' && (
          <ul className="text-xs text-foreground space-y-0.5">
            {req.payload?.changes?.name !== undefined && <li><strong>Name →</strong> {String(req.payload.changes.name)}</li>}
            {req.payload?.changes?.unit !== undefined && <li><strong>Unit →</strong> {String(req.payload.changes.unit)}</li>}
            {req.payload?.changes?.min_quantity !== undefined && <li><strong>Min quantity →</strong> {String(req.payload.changes.min_quantity)}</li>}
          </ul>
        )}
        {req.request_type === 'ADJUST_STOCK' && (
          <p className="text-xs text-foreground">
            <strong>Target quantity →</strong> {String(req.payload?.target_quantity ?? '—')}
            {req.payload?.reason ? ` · note: ${String(req.payload.reason)}` : ''}
          </p>
        )}
        {req.request_type === 'REASSIGN_TABLE' && (
          <p className="text-xs text-foreground flex items-center gap-1.5 flex-wrap">
            <strong>Move to station:</strong>
            <span className="font-mono text-[10px] break-all">{String(req.payload?.target_category_id ?? '—')}</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">(station id — verify it in the Stations list)</span>
          </p>
        )}
        {req.request_type === 'ADD_CATEGORY' && (
          <p className="text-xs text-foreground"><strong>New station name:</strong> {String(req.payload?.name ?? '—')}</p>
        )}
        {(req.request_type === 'ARCHIVE_ITEM' || req.request_type === 'REMOVE_FROM_SHEET') && (
          <p className="text-xs text-foreground">
            {req.request_type === 'ARCHIVE_ITEM' ? 'Archive this item (hides it from the worksheet and catalog).' : 'Remove this entry from the draft worksheet (the item itself stays in the catalog).'}
            {req.payload?.item_name ? ` — ${String(req.payload.item_name)}` : ''}
          </p>
        )}
      </div>

      {req.applied_at && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
          <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Applied to the system</span>
          <p className="text-xs text-foreground">{String(req.result_summary?.action ?? 'Change applied.')}</p>
          <p className="text-[10px] text-muted-foreground">{new Date(req.applied_at).toLocaleString()}</p>
        </div>
      )}
      {req.status === 'FAILED' && req.decision_reason && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
          <p className="text-xs text-rose-600 dark:text-rose-400">{req.decision_reason}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Staff Change Requests</h3>
          {pending.length > 0 && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              {pending.length} pending
            </span>
          )}
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${isLive ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-muted text-muted-foreground border-border'}`}>
          {isLive ? 'Live' : 'Polling 30s'}
        </span>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-xs text-muted-foreground">Loading requests…</div>
      ) : requests.length === 0 ? (
        <div className="p-8 text-center space-y-1">
          <p className="text-xs text-muted-foreground">No staff change requests yet.</p>
          <p className="text-[11px] text-muted-foreground/70">Staff submit requests from the daily worksheet (“Request a change”).</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.length > 0 && (
            <div className="space-y-2" aria-label="Pending change requests">
              {pending.map(req => (
                <div key={req.id} className="p-3.5 rounded-xl bg-card border border-amber-500/30 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        {STAFF_REQUEST_TYPE_LABELS[req.request_type] || req.request_type}
                      </span>
                      <span className="text-xs font-semibold text-foreground">{req.requested_by_name || 'Staff Member'}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(req.created_at).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button type="button" size="sm" onClick={() => openReview(req, 'APPROVE')} className="h-7 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg">
                        Approve & Apply
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => openReview(req, 'RETURN')} className="h-7 px-2 text-[11px] rounded-lg">
                        Return
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => openReview(req, 'REJECT')} className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 rounded-lg">
                        Reject
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedRequest(req)} className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground" title="View full request details">
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground italic line-clamp-2">“{req.reason}”</p>
                </div>
              ))}
            </div>
          )}

          {resolved.length > 0 && (
            <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden" aria-label="Resolved change requests">
              {resolved.map(req => (
                <div key={req.id} className="p-3 flex items-center justify-between gap-2 flex-wrap bg-card">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${statusBadge(req.status)}`}>
                      {req.status}
                    </span>
                    <span className="text-xs font-medium text-foreground">{STAFF_REQUEST_TYPE_LABELS[req.request_type] || req.request_type}</span>
                    <span className="text-[10px] text-muted-foreground">by {req.requested_by_name || 'Staff'} · {new Date(req.created_at).toLocaleDateString()}</span>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedRequest(req)} className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground" title="View request details">
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Review dialog (decision) */}
      <Dialog open={!!reviewTarget} onOpenChange={open => !open && setReviewTarget(null)}>
        <DialogContent className="w-[95vw] max-w-md p-5 rounded-2xl bg-card border-border shadow-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="space-y-1 text-left border-b border-border/60 pb-3">
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
              {reviewTarget?.decision === 'APPROVE' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
              {reviewTarget?.decision === 'RETURN' && <RotateCcw className="w-5 h-5 text-sky-500" />}
              {reviewTarget?.decision === 'REJECT' && <XCircle className="w-5 h-5 text-rose-500" />}
              <span>
                {reviewTarget?.decision === 'APPROVE' ? 'Approve & Apply' : reviewTarget?.decision === 'RETURN' ? 'Return for changes' : 'Reject request'}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {STAFF_REQUEST_TYPE_LABELS[reviewTarget?.request.request_type as keyof typeof STAFF_REQUEST_TYPE_LABELS] || ''} · by {reviewTarget?.request.requested_by_name || 'Staff Member'}
            </DialogDescription>
          </DialogHeader>

          {reviewTarget && (
            <div className="py-2 space-y-3 text-left">
              {renderRequestDetails(reviewTarget.request)}

              <div className="space-y-1.5">
                <Label htmlFor="review-notes" className="text-xs font-semibold">
                  Review notes {reviewTarget.decision !== 'APPROVE' ? '(required)' : '(optional)'}
                </Label>
                <Input
                  id="review-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={reviewTarget.decision === 'APPROVE' ? 'e.g. Verified with the delivery receipt.' : 'e.g. Please include the supplier name and exact quantity.'}
                  className="h-10 text-xs rounded-xl"
                />
              </div>

              {decisionResult && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-start gap-2 ${decisionResult.ok ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-destructive/10 border border-destructive/20 text-destructive'}`}
                  role="alert"
                >
                  {decisionResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                  <span>{decisionResult.message}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setReviewTarget(null)} className="h-9 text-xs rounded-xl">
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isDeciding || (reviewTarget.decision !== 'APPROVE' && !notes.trim())}
                  onClick={handleDecision}
                  className={`h-9 text-xs font-bold rounded-xl text-white ${reviewTarget.decision === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-500' : reviewTarget.decision === 'RETURN' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-rose-600 hover:bg-rose-500'}`}
                >
                  {isDeciding ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                  {reviewTarget.decision === 'APPROVE' ? 'Approve & Apply' : reviewTarget.decision === 'RETURN' ? 'Return to Staff' : 'Reject'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Details-only dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={open => !open && setSelectedRequest(null)}>
        <DialogContent className="w-[95vw] max-w-md p-5 rounded-2xl bg-card border-border shadow-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="space-y-1 text-left border-b border-border/60 pb-3">
            <DialogTitle className="text-base font-bold text-foreground">
              {STAFF_REQUEST_TYPE_LABELS[selectedRequest?.request_type as keyof typeof STAFF_REQUEST_TYPE_LABELS] || ''} Request
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Requested by <span className="font-semibold text-foreground">{selectedRequest?.requested_by_name || 'Staff Member'}</span> on{' '}
              {selectedRequest && new Date(selectedRequest.created_at).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="py-2 text-left">
              <div className="mb-3">
                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusBadge(selectedRequest.status)}`}>
                  {selectedRequest.status}
                </span>
              </div>
              {renderRequestDetails(selectedRequest)}
              {selectedRequest.review_notes && (
                <div className="mt-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Admin notes</span>
                  <p className="text-xs text-foreground">{selectedRequest.review_notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
