import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Clock, CheckCircle2, XCircle, AlertTriangle, RotateCcw } from 'lucide-react';
import { fetchStaffChangeRequests, STAFF_REQUEST_TYPE_LABELS, type StaffChangeRequestStatus } from '../services/staffRequestService';
import { useRealtimeTableSync } from '@/features/admin/hooks/useRealtimeTableSync';

function statusBadge(status: StaffChangeRequestStatus) {
  switch (status) {
    case 'PENDING':
      return { icon: Clock, className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30', label: 'Pending review' };
    case 'APPROVED':
      return { icon: CheckCircle2, className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', label: 'Approved & applied' };
    case 'REJECTED':
      return { icon: XCircle, className: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30', label: 'Rejected' };
    case 'RETURNED':
      return { icon: RotateCcw, className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30', label: 'Returned — needs changes' };
    case 'FAILED':
      return { icon: AlertTriangle, className: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30', label: 'Apply failed' };
    default:
      return { icon: Clock, className: 'bg-muted text-muted-foreground border-border', label: status };
  }
}

/**
 * STAFF-facing panel on the daily worksheet: the user's own change requests
 * with their live decision state. RLS returns only own rows; realtime events
 * plus a 30s refetch keep it in sync — the fetched response is the truth.
 */
export function MyRequestsPanel() {
  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: ['staff-change-requests'],
    queryFn: fetchStaffChangeRequests,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const { isLive } = useRealtimeTableSync({
    table: 'staff_change_requests',
    channelName: 'staff-change-requests-sync',
    onEvent: () => {
      void refetch();
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 rounded-xl bg-card border border-border/70 text-xs text-muted-foreground" aria-live="polite">
        Loading your requests…
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-card border border-border/70 space-y-3" aria-label="My Change Requests">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <ClipboardList className="w-4 h-4 text-primary" />
          My Requests
        </span>
        <span className="text-[10px] uppercase font-semibold text-muted-foreground">
          {isLive ? 'Live' : 'Auto-sync 30s'}
        </span>
      </div>

      {requests.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">
          No change requests yet. Use “Request a change” on any worksheet row — an administrator reviews every request.
        </p>
      ) : (
        <ul className="space-y-2">
          {requests.slice(0, 8).map(req => {
            const badge = statusBadge(req.status);
            const BadgeIcon = badge.icon;
            return (
              <li key={req.id} className="p-2.5 rounded-lg bg-muted/30 border border-border/50 space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-foreground">
                    {STAFF_REQUEST_TYPE_LABELS[req.request_type] || req.request_type}
                    {req.payload?.name ? `: ${req.payload.name}` : req.payload?.item_name ? `: ${req.payload.item_name}` : ''}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${badge.className}`}>
                    <BadgeIcon className="w-3 h-3" />
                    {badge.label}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(req.created_at).toLocaleString()}
                </p>
                {req.decision_reason && (
                  <p className="text-[10px] text-foreground/80 italic">
                    “{req.decision_reason}”
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
