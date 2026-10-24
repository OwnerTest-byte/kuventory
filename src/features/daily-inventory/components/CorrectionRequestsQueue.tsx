import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  fetchCorrectionRequests,
  adminReviewCorrectionRequest,
  superAdminReviewCorrectionRequest,
  type DailyInventoryCorrectionRequest,
} from '../services/correctionRequestService';
import { useAuth } from '@/features/auth/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  User,
  Eye
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface CorrectionRequestsQueueProps {
  dailyInventoryId?: string;
  onCorrectionApplied?: () => void;
}

export function CorrectionRequestsQueue({ dailyInventoryId, onCorrectionApplied }: CorrectionRequestsQueueProps = {}) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const [requests, setRequests] = useState<DailyInventoryCorrectionRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Selected request for review
  const [selectedRequest, setSelectedRequest] = useState<DailyInventoryCorrectionRequest | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVE' | 'FORWARD' | 'RETURN' | 'REJECT' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isProcessingDecision, setIsProcessingDecision] = useState(false);

  const isSuperAdmin = profile?.role === 'SUPER_ADMIN' || profile?.role === 'MASTER_ADMIN';
  const isAdmin = profile?.role === 'ADMIN' || isSuperAdmin;

  const loadRequests = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchCorrectionRequests(dailyInventoryId);
      setRequests(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load correction requests.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleOpenReview = (req: DailyInventoryCorrectionRequest, decision: 'APPROVE' | 'FORWARD' | 'RETURN' | 'REJECT') => {
    setSelectedRequest(req);
    setReviewDecision(decision);
    setReviewNotes('');
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleConfirmDecision = async () => {
    if (!selectedRequest || !reviewDecision) return;

    setIsProcessingDecision(true);
    setErrorMessage(null);

    try {
      if (reviewDecision === 'FORWARD') {
        const res = await adminReviewCorrectionRequest(
          selectedRequest.id,
          'APPROVE_AND_FORWARD',
          reviewNotes.trim() || 'Verified by Admin'
        );
        setSuccessMessage(res.message);
      } else if (reviewDecision === 'RETURN') {
        if (!reviewNotes.trim()) {
          setErrorMessage('Notes are required when returning a request to the requester.');
          setIsProcessingDecision(false);
          return;
        }
        const res = await adminReviewCorrectionRequest(
          selectedRequest.id,
          'RETURN',
          reviewNotes.trim()
        );
        setSuccessMessage(res.message);
      } else if (reviewDecision === 'REJECT') {
        if (!reviewNotes.trim()) {
          setErrorMessage('A rejection reason is required.');
          setIsProcessingDecision(false);
          return;
        }
        if (selectedRequest.status === 'PENDING_ADMIN') {
          const res = await adminReviewCorrectionRequest(selectedRequest.id, 'REJECT', reviewNotes.trim());
          setSuccessMessage(res.message);
        } else {
          const res = await superAdminReviewCorrectionRequest(selectedRequest.id, 'REJECT', reviewNotes.trim());
          setSuccessMessage(res.message);
        }
      } else if (reviewDecision === 'APPROVE') {
        // Super Admin Stage 2 final approval & atomic application
        const res = await superAdminReviewCorrectionRequest(
          selectedRequest.id,
          'APPROVE',
          reviewNotes.trim() || 'Final approval granted'
        );
        setSuccessMessage(res.message);
        await queryClient.invalidateQueries({ queryKey: ['reports'] });
        await queryClient.invalidateQueries({ queryKey: ['inventory'] });
        await queryClient.invalidateQueries({ queryKey: ['batches'] });
        onCorrectionApplied?.();
      }

      setSelectedRequest(null);
      await loadRequests();
    } catch (err: any) {
      setErrorMessage(err.message || 'Action failed.');
    } finally {
      setIsProcessingDecision(false);
    }
  };

  const getStatusBadge = (status: DailyInventoryCorrectionRequest['status']) => {
    switch (status) {
      case 'PENDING_ADMIN':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            Pending Admin Review (Stage 1)
          </span>
        );
      case 'PENDING_SUPER_ADMIN':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            Pending Super Admin Approval (Stage 2)
          </span>
        );
      case 'APPLIED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            Applied Revision
          </span>
        );
      case 'RETURNED_TO_REQUESTER':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            Returned for Information
          </span>
        );
      case 'REJECTED_BY_ADMIN':
      case 'REJECTED_BY_SUPER_ADMIN':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            Rejected
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">
              Finalized Inventory Correction Queue
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Two-stage approval governance: Staff request → Admin review (Stage 1) → Super Admin final approval & atomic stock reconciliation (Stage 2).
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isLoading}
          onClick={loadRequests}
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

      {/* Queue Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        {requests.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-muted text-muted-foreground mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-sm text-foreground">No Correction Requests in Queue</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              There are currently no pending correction requests for finalized daily sheets.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Worksheet Date</th>
                  <th className="px-4 py-3">Requester</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {requests.map(req => {
                  const isRequester = req.requested_by === user?.id;

                  return (
                    <tr key={req.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-foreground">
                        {req.inventory_date}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-foreground font-medium">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{req.profiles?.display_name || 'Staff Member'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(req.status)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs truncate" title={req.reason}>
                        {req.reason}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                        {new Date(req.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Stage 1 Actions (Admin/Super Admin, but NOT self-approval) */}
                          {req.status === 'PENDING_ADMIN' && isAdmin && (
                            <>
                              {isRequester ? (
                                <span className="text-[10px] text-muted-foreground italic">
                                  Self-review prohibited
                                </span>
                              ) : (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handleOpenReview(req, 'FORWARD')}
                                    className="h-7 px-2.5 text-[11px] bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg"
                                  >
                                    Verify & Forward
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleOpenReview(req, 'RETURN')}
                                    className="h-7 px-2 text-[11px] rounded-lg"
                                  >
                                    Return
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenReview(req, 'REJECT')}
                                    className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 rounded-lg"
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}
                            </>
                          )}

                          {/* Stage 2 Actions (Super Admin Only, NOT self-approval) */}
                          {req.status === 'PENDING_SUPER_ADMIN' && isSuperAdmin && (
                            <>
                              {isRequester ? (
                                <span className="text-[10px] text-muted-foreground italic">
                                  Self-review prohibited
                                </span>
                              ) : (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handleOpenReview(req, 'APPROVE')}
                                    className="h-7 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg"
                                  >
                                    Approve & Apply
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenReview(req, 'REJECT')}
                                    className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 rounded-lg"
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}
                            </>
                          )}

                          {/* Read details button */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedRequest(req)}
                            className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                            title="View request details and before/after diff"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review & Details Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={open => !open && setSelectedRequest(null)}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl bg-card border-border shadow-2xl">
          <DialogHeader className="p-6 border-b border-border/60 bg-muted/20 text-left">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">
                  Correction Request Details ({selectedRequest?.inventory_date})
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Requested by <span className="font-semibold text-foreground">{selectedRequest?.profiles?.display_name || 'Staff Member'}</span> on{' '}
                  {selectedRequest?.created_at && new Date(selectedRequest.created_at).toLocaleString()}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedRequest && (
            <div className="p-6 space-y-5 text-left text-xs">
              {/* Reason card */}
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-1">
                <span className="font-bold text-foreground text-xs block">Audit Rationale & Discrepancy Reason:</span>
                <p className="text-muted-foreground leading-relaxed italic">
                  "{selectedRequest.reason}"
                </p>
              </div>

              {/* Status and Review Trail */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-card border border-border/80 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Current State</span>
                  <div>{getStatusBadge(selectedRequest.status)}</div>
                </div>

                {selectedRequest.admin_notes && (
                  <div className="p-3.5 rounded-xl bg-card border border-border/80 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Admin Review Notes</span>
                    <p className="text-foreground">{selectedRequest.admin_notes}</p>
                  </div>
                )}
              </div>

              {/* Proposed Items Comparison */}
              <div className="space-y-2">
                <span className="font-bold text-foreground text-xs block">Item Adjustment Comparison (Proposed Values)</span>
                <div className="border border-border rounded-xl overflow-x-auto">
                  <table className="w-full text-xs text-left min-w-115">
                    <thead className="bg-muted/40 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-3 py-2">Item Name</th>
                        <th className="px-2 py-2 text-center">Beg</th>
                        <th className="px-2 py-2 text-center">Add</th>
                        <th className="px-2 py-2 text-center">AM</th>
                        <th className="px-2 py-2 text-center">PM</th>
                        <th className="px-3 py-2 text-center font-bold">Ending</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {selectedRequest.proposed_items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium text-foreground">
                            {item.item_name || 'Item'}
                          </td>
                          <td className="px-2 py-2 text-center font-mono">{item.beg}</td>
                          <td className="px-2 py-2 text-center font-mono">{item.add}</td>
                          <td className="px-2 py-2 text-center font-mono">{item.am}</td>
                          <td className="px-2 py-2 text-center font-mono">{item.pm}</td>
                          <td className="px-3 py-2 text-center font-mono font-bold text-primary">
                            {item.ending}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action input when taking a decision */}
              {reviewDecision && (
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <Label htmlFor="review-notes" className="text-xs font-bold text-foreground">
                    {reviewDecision === 'REJECT' || reviewDecision === 'RETURN'
                      ? 'Decision Notes / Required Information *'
                      : 'Optional Decision Notes'}
                  </Label>
                  <Input
                    id="review-notes"
                    placeholder="Enter review explanation..."
                    value={reviewNotes}
                    onChange={e => setReviewNotes(e.target.value)}
                    className="h-10 text-xs rounded-xl"
                  />
                </div>
              )}

              <DialogFooter className="pt-4 border-t border-border/60 flex items-center justify-between sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedRequest(null)}
                  className="h-9 text-xs rounded-xl"
                >
                  Close
                </Button>

                {reviewDecision && (
                  <Button
                    type="button"
                    disabled={isProcessingDecision}
                    onClick={handleConfirmDecision}
                    className={`h-9 px-4 text-xs font-bold rounded-xl text-white ${
                      reviewDecision === 'APPROVE'
                        ? 'bg-emerald-600 hover:bg-emerald-500'
                        : reviewDecision === 'FORWARD'
                        ? 'bg-purple-600 hover:bg-purple-500'
                        : reviewDecision === 'RETURN'
                        ? 'bg-blue-600 hover:bg-blue-500'
                        : 'bg-rose-600 hover:bg-rose-500'
                    }`}
                  >
                    {isProcessingDecision ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : null}
                    Confirm {reviewDecision === 'APPROVE' ? 'Approval & Atomic Apply' : reviewDecision}
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
