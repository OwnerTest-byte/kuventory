import { supabase } from '@/lib/supabase';

export interface PasswordResetRequest {
  id: string;
  request_code: string;
  email: string;
  user_id?: string | null;
  status: 'NEW' | 'NOTIFIED' | 'IN REVIEW' | 'RESOLVED' | 'EXPIRED' | 'FAILED';
  notification_status: string;
  review_notes?: string | null;
  reviewed_by?: string | null;
  requested_at: string;
  resolved_at?: string | null;
  created_at?: string;
}

/**
 * Submit a safe password reset request using the canonical database RPC and Supabase Auth.
 * Generic messaging protects account enumeration privacy.
 */
export async function submitPasswordResetRequest(
  email: string
): Promise<{ success: boolean; message: string; requestCode?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    throw new Error('Please enter a valid email address.');
  }

  // 1. Authoritative rate-limited request record via database RPC
  const { data: rpcData, error: rpcErr } = await supabase.rpc('request_password_reset', {
    p_email: cleanEmail,
  });

  if (rpcErr) {
    throw new Error('Unable to record reset request. Please contact your system administrator.');
  }

  if (rpcData?.throttled) {
    return {
      success: true,
      message: rpcData.message || 'A reset request was recently submitted. Please wait before requesting another link.',
      requestCode: rpcData.request_code,
    };
  }

  // 2. Trigger official Supabase Auth recovery email
  const { error: resetErr } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: `${window.location.origin}/reset-password`,
  });

  if (resetErr) {
    throw new Error(
      'We could not submit the recovery request right now. Please try again later or contact your system administrator.'
    );
  }

  return {
    success: true,
    message:
      'If an account matches this address, a reset link will arrive by email. Check your inbox and spam folder. For your security, this page does not confirm whether the address belongs to an account.',
    requestCode: rpcData?.request_code,
  };
}

/**
 * Submit an assisted account recovery ticket when the user cannot access a registered recovery mailbox
 * or holds a synthetic @kuventory.com login identifier.
 */
export async function submitAssistedRecoveryTicket(
  email: string,
  reason: string
): Promise<{ success: boolean; requestReference?: string; statusCredential?: string; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid account email identifier.');
  }

  const { data, error } = await supabase.rpc('submit_assisted_recovery_request', {
    p_email: cleanEmail,
    p_reason: reason.trim() || 'User cannot access registered recovery channel',
  });

  if (error) {
    throw new Error(error.message || 'Unable to submit recovery ticket. Please contact support directly.');
  }

  return {
    success: data?.success ?? true,
    requestReference: data?.request_reference,
    statusCredential: data?.status_credential,
    message: data?.message || 'Your recovery request has been submitted for administrator review.',
  };
}

/**
 * Check status of an assisted recovery ticket without leaking account identity.
 */
export async function checkAssistedRecoveryTicketStatus(
  requestReference: string,
  statusCredential: string
): Promise<{ valid: boolean; status?: string; submittedAt?: string; decisionReason?: string; message?: string }> {
  const { data, error } = await supabase.rpc('check_assisted_recovery_status', {
    p_request_reference: requestReference.trim(),
    p_status_credential: statusCredential.trim(),
  });

  if (error) {
    throw new Error(error.message || 'Failed to verify recovery status.');
  }

  return {
    valid: data?.valid ?? false,
    status: data?.status,
    submittedAt: data?.submitted_at,
    decisionReason: data?.decision_reason,
    message: data?.message,
  };
}

/**
 * Fetch password reset request log for Administrators and Super Administrators.
 * Queries the authoritative password_reset_requests table.
 */
export async function fetchPasswordResetRequests(): Promise<PasswordResetRequest[]> {
  try {
    const { data, error } = await supabase
      .from('password_reset_requests')
      .select('*')
      .order('requested_at', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('Error querying password_reset_requests:', error.message);
      return [];
    }

    return (data as PasswordResetRequest[]) || [];
  } catch (err) {
    console.warn('Error fetching password reset requests:', err);
    return [];
  }
}

/**
 * Update request status (e.g. IN REVIEW, RESOLVED, FAILED) on the authoritative table.
 */
export async function updatePasswordResetRequestStatus(
  requestId: string,
  status: PasswordResetRequest['status'],
  reviewNotes?: string
): Promise<void> {
  const resolvedAt = status === 'RESOLVED' ? new Date().toISOString() : null;

  const { error } = await supabase
    .from('password_reset_requests')
    .update({
      status,
      review_notes: reviewNotes || null,
      resolved_at: resolvedAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (error) {
    throw new Error(error.message || 'Failed to update password reset request status.');
  }

  // Audit log record
  try {
    const { data: authData } = await supabase.auth.getUser();
    await supabase.from('audit_logs').insert({
      actor_id: authData?.user?.id,
      action: 'PASSWORD_RESET_STATUS_UPDATE',
      target_table: 'password_reset_requests',
      target_id: requestId,
      new_data: { status, review_notes: reviewNotes },
    } as any);
  } catch (e) {
    console.warn('Audit error on password reset status update:', e);
  }
}
