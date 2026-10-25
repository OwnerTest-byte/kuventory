import { supabase } from '@/lib/supabase';

/** The seven structural change types a STAFF member can request. */
export type StaffChangeRequestType =
  | 'ADD_ITEM'
  | 'EDIT_ITEM'
  | 'ARCHIVE_ITEM'
  | 'ADJUST_STOCK'
  | 'REASSIGN_TABLE'
  | 'ADD_CATEGORY'
  | 'REMOVE_FROM_SHEET';

export type StaffChangeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED' | 'FAILED';

export interface StaffChangeRequest {
  id: string;
  request_type: StaffChangeRequestType;
  payload: Record<string, any>;
  reason: string;
  status: StaffChangeRequestStatus;
  requested_by: string;
  requested_by_name?: string | null;
  requested_by_role?: string | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
  decision_reason?: string | null;
  applied_at?: string | null;
  result_summary?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitStaffChangeRequestParams {
  requestType: StaffChangeRequestType;
  payload: Record<string, any>;
  reason: string;
}

/**
 * Submit a structural change request. The database validates the payload per
 * type, blocks duplicate pending requests for the same target, and notifies
 * every administrator. Throws on failure — the caller shows the honest error.
 */
export async function submitStaffChangeRequest({
  requestType,
  payload,
  reason,
}: SubmitStaffChangeRequestParams): Promise<{ submitted: boolean; requestId?: string; message: string }> {
  const { data, error } = await supabase.rpc('submit_staff_change_request', {
    p_request_type: requestType,
    p_payload: payload,
    p_reason: reason.trim(),
  });

  if (error) {
    throw new Error(error.message || 'The change request could not be submitted. Please try again.');
  }

  return {
    submitted: data?.submitted === true,
    requestId: data?.request_id ?? undefined,
    message: data?.message || 'Request submitted for administrator review.',
  };
}

/**
 * Fetch requests: administrators receive the whole queue, STAFF receive only
 * their own (RLS enforces the same split server-side).
 */
export async function fetchStaffChangeRequests(): Promise<StaffChangeRequest[]> {
  const { data, error } = await supabase
    .from('staff_change_requests')
    .select(
      `id, request_type, payload, reason, status, requested_by, reviewed_by,
       review_notes, decision_reason, applied_at, result_summary, created_at, updated_at,
       requester:profiles!staff_change_requests_requested_by_fkey (display_name, role)`
    )
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message || 'Failed to load change requests.');
  }

  return (data as any[]).map(row => ({
    ...row,
    requested_by_name: row.requester?.display_name ?? null,
    requested_by_role: row.requester?.role ?? null,
  })) as StaffChangeRequest[];
}

export type StaffChangeDecision = 'APPROVE' | 'RETURN' | 'REJECT';

/**
 * Administrator decision. APPROVE applies the change server-side in the same
 * transaction; RETURN/REJECT require notes. The result carries the applied
 * summary or the honest failure reason (status FAILED).
 */
export async function reviewStaffChangeRequest(
  requestId: string,
  decision: StaffChangeDecision,
  notes?: string
): Promise<{ success: boolean; applied: boolean; status: string; message: string }> {
  const { data, error } = await supabase.rpc('review_staff_change_request', {
    p_request_id: requestId,
    p_decision: decision,
    p_notes: notes?.trim() || null,
  });

  if (error) {
    throw new Error(error.message || 'The review decision could not be applied.');
  }

  return {
    success: data?.success === true,
    applied: data?.applied === true,
    status: data?.status || '',
    message: data?.message || 'Decision applied.',
  };
}

/** Human-readable label per request type (queue + modals + panels). */
export const STAFF_REQUEST_TYPE_LABELS: Record<StaffChangeRequestType, string> = {
  ADD_ITEM: 'Add Item',
  EDIT_ITEM: 'Edit Item',
  ARCHIVE_ITEM: 'Archive Item',
  ADJUST_STOCK: 'Adjust Stock',
  REASSIGN_TABLE: 'Reassign Table',
  ADD_CATEGORY: 'New Station',
  REMOVE_FROM_SHEET: 'Remove from Worksheet',
};
