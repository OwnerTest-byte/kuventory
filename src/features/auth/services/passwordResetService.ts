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

export interface AssistedRecoverySubmitResult {
  /** True only when the server actually created (or authorized) a ticket. */
  accepted: boolean;
  throttled: boolean;
  /** False when the identifier matches no account (structured rejection). */
  accountExists?: boolean;
  /** Wrong-identifier attempts left before the short cooldown starts. */
  attemptsRemaining?: number;
  /** True when throttled by the wrong-identifier cooldown (not a lockout). */
  unknownCooldown?: boolean;
  /** Present when accepted: shown to the requester exactly once. */
  requestReference?: string;
  statusCredential?: string;
  message: string;
  serverNow?: string | null;
  /** Authoritative cooldown expiry (ISO) — set on accept AND throttle. */
  nextAllowedAt?: string | null;
  secondsRemaining?: number;
}

export interface AssistedRecoveryCooldown {
  /** False when the check itself failed: the cooldown is then unknown. */
  verified: boolean;
  canSubmit: boolean;
  serverNow?: string | null;
  nextAllowedAt?: string | null;
  secondsRemaining: number;
  message?: string;
}

/**
 * Submit an assisted account recovery ticket. KUVENTORY login identifiers
 * (admin-created @kuventory.com aliases) have no mailbox, so administrator-
 * assisted recovery is the real recovery workflow for these accounts.
 *
 * The database enforces the cooldown atomically; this wrapper throws on any
 * RPC/network failure so a transport error is never presented as success.
 */
export async function submitAssistedRecoveryTicket(
  email: string,
  reason: string
): Promise<AssistedRecoverySubmitResult> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid account login identifier.');
  }

  let data: any;
  try {
    const res = await supabase.rpc('submit_assisted_recovery_request', {
      p_email: cleanEmail,
      p_reason: reason.trim() || 'User cannot access registered recovery channel',
    });
    if (res.error) throw new Error(res.error.message);
    data = res.data;
  } catch (err: any) {
    console.warn('submit_assisted_recovery_request failed:', err?.message || err);
    throw new Error(
      err?.message ||
        'The recovery request could not be submitted because the server could not be reached. Please check your connection and try again.'
    );
  }

  if (!data || typeof data !== 'object') {
    throw new Error('The server returned an unreadable response. No recovery request was confirmed.');
  }

  // Unknown-identifier rejections are structured data, not transport errors:
  // the dialog must render the server message plus the attempts countdown.
  if (data.accepted === false && data.account_exists === false) {
    return {
      accepted: false,
      throttled: false,
      accountExists: false,
      attemptsRemaining: typeof data.attempts_remaining === 'number' ? data.attempts_remaining : undefined,
      message: data.message || 'No KUVENTORY account matches this identifier.',
      serverNow: data.server_now ?? null,
      nextAllowedAt: null,
    };
  }

  if (data.accepted === false && !data.throttled) {
    throw new Error(data.message || data.error || 'Unable to submit recovery request.');
  }

  return {
    accepted: data.accepted === true,
    throttled: data.throttled === true,
    unknownCooldown: data.unknown_identifier_cooldown === true,
    requestReference: data.request_reference,
    statusCredential: data.status_credential,
    message: data.message || 'Your recovery request has been submitted for administrator review.',
    serverNow: data.server_now ?? null,
    nextAllowedAt: data.next_allowed_at ?? null,
    secondsRemaining: typeof data.seconds_remaining === 'number' ? data.seconds_remaining : undefined,
  };
}

/**
 * Read the authoritative assisted-recovery cooldown WITHOUT creating a ticket.
 * Used when the recovery dialog opens, when it is reopened, after a reload,
 * and whenever the local countdown reaches zero (before re-enabling submit).
 *
 * A failed check returns verified: false — callers must keep any active
 * cooldown and surface a retry, never assume the cooldown expired.
 */
export async function checkAssistedRecoveryCooldown(email: string): Promise<AssistedRecoveryCooldown> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { verified: false, canSubmit: false, secondsRemaining: 0, message: 'Enter your account login identifier.' };
  }

  try {
    const { data, error } = await supabase.rpc('check_assisted_recovery_cooldown', {
      p_email: cleanEmail,
    });

    if (error) {
      console.warn('check_assisted_recovery_cooldown RPC error:', error.message);
      return {
        verified: false,
        canSubmit: false,
        secondsRemaining: 0,
        message: 'Cooldown status could not be verified. Please retry.',
      };
    }

    return {
      verified: true,
      canSubmit: data?.can_submit === true,
      serverNow: data?.server_now ?? null,
      nextAllowedAt: data?.next_allowed_at ?? null,
      secondsRemaining: typeof data?.seconds_remaining === 'number' ? data.seconds_remaining : 0,
      message: data?.message,
    };
  } catch (err) {
    console.warn('check_assisted_recovery_cooldown network error:', err);
    return {
      verified: false,
      canSubmit: false,
      secondsRemaining: 0,
      message: 'Cooldown status could not be verified. Please retry.',
    };
  }
}

/**
 * Check the status of an assisted recovery ticket without leaking account
 * identity: requires BOTH the public reference and the secret status
 * credential issued at submission time.
 */
export async function checkAssistedRecoveryTicketStatus(
  requestReference: string,
  statusCredential: string
): Promise<{
  valid: boolean;
  status?: string;
  submittedAt?: string;
  resolvedAt?: string | null;
  decisionReason?: string;
  message?: string;
}> {
  const { data, error } = await supabase.rpc('check_assisted_recovery_status', {
    p_request_reference: requestReference.trim(),
    p_status_credential: statusCredential.trim(),
  });

  if (error) {
    throw new Error(error.message || 'Failed to verify recovery status. Please check your connection and retry.');
  }

  return {
    valid: data?.valid ?? false,
    status: data?.status,
    submittedAt: data?.submitted_at,
    resolvedAt: data?.resolved_at ?? null,
    decisionReason: data?.decision_reason,
    message: data?.message,
  };
}

// ---------------------------------------------------------------------------
// Administrator review queue (account_recovery_requests)
// ---------------------------------------------------------------------------

export type AssistedRecoveryStatus =
  | 'RECEIVED'
  | 'HUMAN_REVIEW'
  | 'NEEDS_INFORMATION'
  | 'REJECTED'
  | 'COMPLETED'
  | 'EXPIRED';

export interface AssistedRecoveryRequest {
  id: string;
  request_reference: string;
  email_lookup: string;
  user_id: string | null;
  status: AssistedRecoveryStatus;
  reason: string | null;
  admin_reviewer_id: string | null;
  admin_reviewed_at: string | null;
  decision_reason: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AssistedRecoveryDecision = 'HUMAN_REVIEW' | 'NEEDS_INFORMATION' | 'REJECT' | 'RESOLVE_RESET';

/**
 * Fetch the private assisted-recovery review queue. Server-side RLS restricts
 * rows to ADMIN and SUPER_ADMIN; the status credential hash is never selected.
 */
export async function fetchAssistedRecoveryRequests(): Promise<AssistedRecoveryRequest[]> {
  const { data, error } = await supabase
    .from('account_recovery_requests')
    .select(
      'id, request_reference, email_lookup, user_id, status, reason, admin_reviewer_id, admin_reviewed_at, decision_reason, resolved_at, created_at, updated_at'
    )
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message || 'Failed to load assisted recovery requests.');
  }

  return (data as AssistedRecoveryRequest[]) || [];
}

/**
 * Apply an authorized administrative decision to a recovery ticket.
 * RESOLVE_RESET performs the verified password reset server-side and marks
 * the ticket COMPLETED only if that reset actually succeeded.
 */
export async function reviewAssistedRecoveryRequest(params: {
  requestId: string;
  decision: AssistedRecoveryDecision;
  notes?: string;
  newPassword?: string;
}): Promise<{ success: boolean; status: string; message: string }> {
  const { requestId, decision, notes, newPassword } = params;

  const { data, error } = await supabase.rpc('review_assisted_recovery_request', {
    p_request_id: requestId,
    p_decision: decision,
    p_notes: notes?.trim() || null,
    p_new_password: newPassword || null,
  });

  if (error) {
    throw new Error(error.message || 'The review decision could not be applied.');
  }

  return {
    success: data?.success === true,
    status: data?.status || '',
    message: data?.message || 'Decision applied.',
  };
}

// ---------------------------------------------------------------------------
// Legacy email reset request log (real-mailbox accounts only)
// ---------------------------------------------------------------------------

/**
 * Fetch the password reset request log for Administrators and Super
 * Administrators. Legacy log for the email-reset path; synthetic
 * @kuventory.com identifiers use assisted recovery instead.
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
 * Update legacy request status (e.g. IN REVIEW, RESOLVED, FAILED) on the
 * authoritative table.
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
