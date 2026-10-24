import { supabase } from '@/lib/supabase';

export interface ProposedCorrectionItem {
  id?: string;
  item_id: string;
  item_name?: string;
  unit?: string;
  beg: number;
  add: number;
  am: number;
  pm: number;
  ending: number;
}

export interface DailyInventoryCorrectionRequest {
  id: string;
  daily_inventory_id: string;
  inventory_date: string;
  requested_by: string;
  requested_at: string;
  reason: string;
  expected_revision: number;
  proposed_items: ProposedCorrectionItem[];
  baseline_items: any[];
  status:
    | 'PENDING_ADMIN'
    | 'RETURNED_TO_REQUESTER'
    | 'REJECTED_BY_ADMIN'
    | 'APPLIED'
    | 'CONFLICT_REQUIRES_RESUBMISSION'
    | 'FAILED_REQUIRES_REVIEW'
    | 'CANCELLED';
  admin_reviewer_id?: string | null;
  admin_reviewed_at?: string | null;
  admin_notes?: string | null;
  applied_at?: string | null;
  applied_revision_id?: string | null;
  idempotency_key?: string | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    display_name?: string;
    role?: string;
  };
}

/**
 * Submit a correction request for a finalized daily inventory sheet.
 * Leaves physical stock, inventory batches, movements, and sheets UNTOUCHED.
 */
export async function submitCorrectionRequest(
  dailyInventoryId: string,
  reason: string,
  proposedItems: ProposedCorrectionItem[],
  idempotencyKey?: string
): Promise<{ success: boolean; requestId: string; status: string; message: string }> {
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('A legitimate reason is required to submit a finalized sheet correction request.');
  }

  if (!dailyInventoryId) {
    throw new Error('Worksheet ID is required.');
  }

  if (!proposedItems || proposedItems.length === 0) {
    throw new Error('At least one proposed item correction must be specified.');
  }

  const clientKey = idempotencyKey || `idem_corr_${dailyInventoryId}_${crypto.randomUUID()}`;

  const payload = proposedItems.map(item => ({
    item_id: item.item_id,
    item_name: item.item_name || 'Item',
    unit: item.unit || 'pcs',
    beg: Number(item.beg) || 0,
    add: Number(item.add) || 0,
    am: Number(item.am) || 0,
    pm: Number(item.pm) || 0,
    ending: Math.max(0, (Number(item.beg) || 0) + (Number(item.add) || 0) - (Number(item.am) || 0) - (Number(item.pm) || 0)),
  }));

  const { data, error } = await supabase.rpc('submit_correction_request', {
    p_daily_inventory_id: dailyInventoryId,
    p_reason: cleanReason,
    p_proposed_items: payload,
    p_idempotency_key: clientKey,
  });

  if (error) {
    throw new Error(error.message || 'Failed to submit correction request.');
  }

  return {
    success: true,
    requestId: data.request_id,
    status: data.status,
    message: data.message,
  };
}

/**
 * Fetch all correction requests (filtered by sheet ID if provided).
 */
export async function fetchCorrectionRequests(
  dailyInventoryId?: string
): Promise<DailyInventoryCorrectionRequest[]> {
  let query = supabase
    .from('daily_inventory_correction_requests')
    .select('*, profiles:requested_by (display_name, role)')
    .order('created_at', { ascending: false });

  if (dailyInventoryId) {
    query = query.eq('daily_inventory_id', dailyInventoryId);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('fetchCorrectionRequests error:', error.message);
    return [];
  }

  return (data as any[]) || [];
}

/**
 * Admin review and decision on a finalized-sheet correction request.
 * Enforces separation of duties: requester cannot review or approve own request.
 */
export async function adminReviewCorrectionRequest(
  requestId: string,
  decision: 'APPROVE' | 'RETURN' | 'REJECT' | 'APPROVE_AND_FORWARD',
  notes: string
): Promise<{ success: boolean; status?: string; revision_number?: number; message: string }> {
  const { data, error } = await supabase.rpc('admin_review_correction_request', {
    p_request_id: requestId,
    p_decision: decision,
    p_notes: notes.trim(),
  });

  if (error) {
    throw new Error(error.message || 'Admin review failed.');
  }

  return data;
}

/**
 * Direct approval and atomic application of a finalized sheet correction by an authorized Administrator.
 */
export async function approveAndApplyCorrection(
  requestId: string,
  adminNotes?: string
): Promise<{ success: boolean; revision_number: number; message: string }> {
  const { data, error } = await supabase.rpc('apply_approved_daily_inventory_correction', {
    p_request_id: requestId,
    p_admin_notes: (adminNotes || '').trim(),
  });

  if (error) {
    throw new Error(error.message || 'Failed to approve and apply correction.');
  }

  return data;
}

/**
 * Super Admin review compatibility wrapper (delegates to authoritative Admin review).
 */
export async function superAdminReviewCorrectionRequest(
  requestId: string,
  decision: 'APPROVE' | 'REJECT',
  notes: string
): Promise<{ success: boolean; revision_number?: number; message: string }> {
  return adminReviewCorrectionRequest(requestId, decision, notes);
}
