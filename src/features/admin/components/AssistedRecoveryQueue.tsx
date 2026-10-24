import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, RefreshCw, Loader2, ShieldCheck, XCircle, HelpCircle, Eye, EyeOff, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatSafeDate } from '@/lib/utils';
import {
  fetchAssistedRecoveryRequests,
  reviewAssistedRecoveryRequest,
  type AssistedRecoveryRequest,
  type AssistedRecoveryDecision
} from '@/features/auth/services/passwordResetService';

type ReviewDialog = {
  request: AssistedRecoveryRequest;
  decision: Extract<AssistedRecoveryDecision, 'RESOLVE_RESET' | 'REJECT' | 'NEEDS_INFORMATION' | 'HUMAN_REVIEW'>;
};

const OPEN_STATUSES = new Set(['RECEIVED', 'HUMAN_REVIEW', 'NEEDS_INFORMATION']);

function statusBadgeTone(status: string) {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    case 'REJECTED':
      return 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30';
    case 'NEEDS_INFORMATION':
    case 'HUMAN_REVIEW':
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
    default:
      return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
  }
}

function generateRandomPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}

/**
 * Private administrator review queue for assisted account recovery tickets
 * (account_recovery_requests). Row access is authorized server-side by RLS;
 * every decision is applied through the review_assisted_recovery_request RPC,
 * which performs the authorized password reset and closes the ticket as
 * COMPLETED only when that reset actually succeeds.
 */
export function AssistedRecoveryQueue() {
  const queryClient = useQueryClient();
  const [reviewDialog, setReviewDialog] = useState<ReviewDialog | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const {
    data: requests = [],
    isLoading,
    refetch,
    isRefetching,
    error: loadError,
  } = useQuery({
    queryKey: ['assisted-recovery-requests'],
    queryFn: fetchAssistedRecoveryRequests,
    refetchInterval: 15000,
  });

  const reviewMutation = useMutation({
    mutationFn: async (params: {
      requestId: string;
      decision: AssistedRecoveryDecision;
      notes?: string;
      newPassword?: string;
    }) => reviewAssistedRecoveryRequest(params),
    onSuccess: res => {
      queryClient.invalidateQueries({ queryKey: ['assisted-recovery-requests'] });
      setActionSuccess(res.message);
      setActionError(null);
      setReviewDialog(null);
      setReviewNotes('');
      setNewPassword('');
    },
    onError: (err: Error) => {
      setActionError(err.message);
    },
  });

  const openReview = (request: AssistedRecoveryRequest, decision: ReviewDialog['decision']) => {
    setActionError(null);
    setReviewNotes('');
    setNewPassword(decision === 'RESOLVE_RESET' ? generateRandomPassword() : '');
    setShowPassword(false);
    setReviewDialog({ request, decision });
  };

  const submitReview = () => {
    if (!reviewDialog) return;
    const { request, decision } = reviewDialog;
    const notes = reviewNotes.trim();
    const pw = newPassword;

    if ((decision === 'RESOLVE_RESET' || decision === 'REJECT') && !notes) {
      setActionError(
        decision === 'RESOLVE_RESET'
          ? 'An identity-verification note is required (how identity was confirmed).'
          : 'A rejection reason is required.'
      );
      return;
    }
    if (decision === 'RESOLVE_RESET' && (!pw || pw.length < 8)) {
      setActionError('A new password of at least 8 characters is required.');
      return;
    }

    reviewMutation.mutate({
      requestId: request.id,
      decision,
      notes,
      newPassword: decision === 'RESOLVE_RESET' ? pw : undefined,
    });
  };

  const dialogTitles: Record<ReviewDialog['decision'], string> = {
    RESOLVE_RESET: 'Identity Verified — Authorized Password Reset',
    REJECT: 'Reject Recovery Request',
    NEEDS_INFORMATION: 'Mark as Needs Information',
    HUMAN_REVIEW: 'Escalate to Human Review',
  };

  return (
    <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden mt-6">
      <div className="p-4 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <ClipboardCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">Assisted Recovery Queue</h3>
              <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
                {requests.filter(r => OPEN_STATUSES.has(r.status)).length} Open
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Identity-verified password recovery for accounts without mailboxes. A ticket is only closed as
              COMPLETED after the authorized reset actually succeeds.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading || isRefetching}
          className="text-xs font-semibold border-border text-foreground hover:bg-muted"
        >
          <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', (isLoading || isRefetching) && 'animate-spin')} />
          Refresh Queue
        </Button>
      </div>

      {actionSuccess && (
        <div className="px-4 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-b border-emerald-500/20">
          {actionSuccess}
        </div>
      )}
      {actionError && (
        <div className="px-4 py-2 text-xs font-semibold text-destructive bg-destructive/10 border-b border-destructive/20" role="alert">
          {actionError}
        </div>
      )}
      {loadError ? (
        <div className="px-4 py-3 text-xs text-destructive">
          The recovery queue could not be loaded: {(loadError as Error).message}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/60 border-b border-border">
            <TableRow>
              <TableHead className="font-bold text-foreground text-xs">Reference</TableHead>
              <TableHead className="font-bold text-foreground text-xs">Account Identifier</TableHead>
              <TableHead className="font-bold text-foreground text-xs">Reason</TableHead>
              <TableHead className="font-bold text-foreground text-xs">Submitted</TableHead>
              <TableHead className="font-bold text-foreground text-xs text-center">Status</TableHead>
              <TableHead className="font-bold text-foreground text-xs">Decision</TableHead>
              <TableHead className="font-bold text-foreground text-xs text-right">Administrative Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-medium text-xs">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary mb-2" />
                  Loading assisted recovery requests...
                </TableCell>
              </TableRow>
            ) : requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-medium text-xs">
                  No assisted recovery requests submitted.
                </TableCell>
              </TableRow>
            ) : (
              requests.map(req => (
                <TableRow key={req.id} className="hover:bg-muted/40">
                  <TableCell className="font-mono text-xs font-bold text-foreground whitespace-nowrap">
                    {req.request_reference}
                  </TableCell>
                  <TableCell className="text-xs font-semibold text-foreground">
                    {req.email_lookup}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate" title={req.reason || ''}>
                    {req.reason || '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatSafeDate(req.created_at, 'MMM dd, yyyy HH:mm')}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap',
                      statusBadgeTone(req.status)
                    )}>
                      {req.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate" title={req.decision_reason || ''}>
                    {req.resolved_at ? formatSafeDate(req.resolved_at, 'MMM dd, HH:mm') : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {OPEN_STATUSES.has(req.status) ? (
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <Button
                          size="sm"
                          className="h-7 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => openReview(req, 'RESOLVE_RESET')}
                          disabled={reviewMutation.isPending}
                          title="Verify identity, set a new password, and complete recovery"
                        >
                          <KeyRound className="w-3 h-3 mr-1" /> Verify & Reset
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] font-bold border-border text-foreground hover:bg-muted"
                          onClick={() => openReview(req, 'NEEDS_INFORMATION')}
                          disabled={reviewMutation.isPending}
                        >
                          <HelpCircle className="w-3 h-3 mr-1" /> Need Info
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] font-bold border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                          onClick={() => openReview(req, 'REJECT')}
                          disabled={reviewMutation.isPending}
                        >
                          <XCircle className="w-3 h-3 mr-1" /> Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">Decision final</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!reviewDialog} onOpenChange={open => {
        if (!open) setReviewDialog(null);
      }}>
        <DialogContent className="max-w-md p-6 rounded-2xl bg-card border-border shadow-2xl">
          <DialogHeader className="space-y-1 text-left border-b border-border/60 pb-3">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              {reviewDialog?.decision === 'RESOLVE_RESET' ? (
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
              ) : (
                <ClipboardCheck className="w-5 h-5 text-primary" />
              )}
              {reviewDialog ? dialogTitles[reviewDialog.decision] : ''}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {reviewDialog?.request.request_reference} — {reviewDialog?.request.email_lookup}
            </DialogDescription>
          </DialogHeader>

          {reviewDialog?.decision === 'RESOLVE_RESET' && (
            <div className="space-y-3">
              <div className="p-3 text-[11px] text-amber-900 dark:text-amber-200 bg-amber-500/15 border border-amber-500/30 rounded-xl leading-relaxed">
                Confirm the requester's identity through an official channel before proceeding. This performs the
                authorized password reset, revokes all of the account's active sessions, and clears any login
                lockout. The ticket is marked COMPLETED only if the entire operation succeeds.
              </div>

              <div className="space-y-1.5 text-left">
                <Label htmlFor="recovery-new-password" className="text-xs font-bold text-foreground">
                  New Password (min 8 characters)
                </Label>
                <div className="relative">
                  <Input
                    id="recovery-new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="h-10 text-xs rounded-xl font-mono pr-10"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] font-bold"
                  onClick={() => setNewPassword(generateRandomPassword())}
                >
                  <RefreshCw className="w-3 h-3 mr-1" /> Generate Random
                </Button>
              </div>

              <div className="space-y-1.5 text-left">
                <Label htmlFor="recovery-verify-notes" className="text-xs font-bold text-foreground">
                  Identity Verification Note (required)
                </Label>
                <Input
                  id="recovery-verify-notes"
                  type="text"
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="e.g. Verified in person with branch supervisor + ID"
                  className="h-10 text-xs rounded-xl"
                />
              </div>
            </div>
          )}

          {reviewDialog?.decision === 'REJECT' && (
            <div className="space-y-3">
              <div className="p-3 text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-xl leading-relaxed">
                The ticket is closed as REJECTED. The decision reason is the only text shown to the requester —
                never include internal notes or another account's information.
              </div>
              <div className="space-y-1.5 text-left">
                <Label htmlFor="recovery-reject-reason" className="text-xs font-bold text-foreground">
                  Rejection Reason (required)
                </Label>
                <Input
                  id="recovery-reject-reason"
                  type="text"
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="e.g. Identity could not be verified"
                  className="h-10 text-xs rounded-xl"
                />
              </div>
            </div>
          )}

          {reviewDialog?.decision === 'NEEDS_INFORMATION' && (
            <div className="space-y-3">
              <div className="p-3 text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-xl leading-relaxed">
                Keeps the ticket open and flags that the requester must be contacted for more information before a
                decision.
              </div>
              <div className="space-y-1.5 text-left">
                <Label htmlFor="recovery-info-notes" className="text-xs font-bold text-foreground">
                  Note for the requester (optional)
                </Label>
                <Input
                  id="recovery-info-notes"
                  type="text"
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="e.g. Please contact the hotline to verify your identity"
                  className="h-10 text-xs rounded-xl"
                />
              </div>
            </div>
          )}

          {actionError && (
            <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl" role="alert">
              {actionError}
            </div>
          )}

          <DialogFooter className="pt-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReviewDialog(null)}
              className="h-10 text-xs font-semibold rounded-xl border-border hover:bg-muted text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={reviewMutation.isPending}
              onClick={submitReview}
              className={cn(
                'h-10 text-xs font-bold rounded-xl text-white',
                reviewDialog?.decision === 'REJECT'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              )}
            >
              {reviewMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
              )}
              {reviewDialog?.decision === 'RESOLVE_RESET'
                ? 'Complete Authorized Reset'
                : reviewDialog?.decision === 'REJECT'
                  ? 'Confirm Rejection'
                  : 'Apply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
