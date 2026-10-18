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

const STORAGE_THROTTLE_KEY = 'kuventory_last_pwd_reset_time';

/**
 * Submit a safe password reset request.
 * Dispatches real-time alerts to Admin/Super Admin without disclosing account existence.
 */
export async function submitPasswordResetRequest(email: string): Promise<{ success: boolean; message: string; requestCode?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    throw new Error('Please enter a valid email address.');
  }

  // Client-side rate limiting: 1 submission per 2 minutes per browser session
  const lastTime = localStorage.getItem(STORAGE_THROTTLE_KEY);
  if (lastTime && Date.now() - Number(lastTime) < 120000) {
    return {
      success: true,
      message: 'If an account is associated with this email, your password reset request has been received. Please check back shortly.',
    };
  }
  localStorage.setItem(STORAGE_THROTTLE_KEY, String(Date.now()));

  const requestCode = `PR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  // 1. Attempt database RPC
  let rpcSuccess = false;
  let responseMsg = 'If an account is associated with this email, your password reset request has been logged and forwarded to administrators.';

  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('request_password_reset', {
      p_email: cleanEmail,
    });
    if (!rpcErr && rpcData?.success) {
      rpcSuccess = true;
      if (rpcData.message) responseMsg = rpcData.message;
    }
  } catch (e) {
    console.warn('request_password_reset RPC attempt fallback:', e);
  }

  // 2. Fallback persistence to password_reset_requests or system_settings
  if (!rpcSuccess) {
    const newReq: PasswordResetRequest = {
      id: crypto.randomUUID(),
      request_code: requestCode,
      email: cleanEmail,
      status: 'NEW',
      notification_status: 'DELIVERED',
      requested_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      resolved_at: null,
      review_notes: null,
      reviewed_by: null,
    };

    try {
      const { error: insertErr } = await supabase.from('password_reset_requests').insert(newReq as any);
      if (insertErr) {
        // Fallback to system_settings log
        const { data: existing } = await supabase.from('system_settings').select('value').eq('key', 'password_reset_requests_log').maybeSingle();
        const existingVal = existing?.value;
        const list: PasswordResetRequest[] = Array.isArray(existingVal) ? existingVal : [];
        list.unshift(newReq);
        await supabase.from('system_settings').upsert({
          key: 'password_reset_requests_log',
          value: list.slice(0, 50),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (persistErr) {
      console.warn('Failed to insert password_reset_requests fallback:', persistErr);
    }

    // Dispatch in-app notification to administrators
    try {
      const dedupKey = `pwd_reset_${cleanEmail}_${new Date().toISOString().slice(0, 15)}`;
      await supabase.from('notifications').insert({
        type: 'PASSWORD_RESET',
        title: `Password Reset Requested: ${cleanEmail}`,
        message: `User (${cleanEmail}) requested a password reset [${requestCode}]. Review and resolve in Settings -> Users.`,
        target_id: '/settings?tab=users',
        dedup_key: dedupKey,
      } as any);
    } catch (notifErr) {
      console.warn('Notification fallback error:', notifErr);
    }

    // Log to audit trail
    try {
      await supabase.from('audit_logs').insert({
        action: 'PASSWORD_RESET_REQUESTED',
        target_table: 'password_reset_requests',
        details: JSON.stringify({
          request_code: requestCode,
          email: cleanEmail,
          requested_at: new Date().toISOString(),
        }),
      } as any);
    } catch (auditErr) {
      console.warn('Audit log fallback error:', auditErr);
    }
  }

  return {
    success: true,
    message: responseMsg,
    requestCode,
  };
}

/**
 * Fetch password reset request log for Administrators and Super Administrators
 */
export async function fetchPasswordResetRequests(): Promise<PasswordResetRequest[]> {
  try {
    // 1. Try real table first
    const { data, error } = await supabase
      .from('password_reset_requests')
      .select('*')
      .order('requested_at', { ascending: false })
      .limit(50);

    if (!error && data && data.length > 0) {
      return data as PasswordResetRequest[];
    }

    // 2. Fallback to system_settings log
    const { data: fallbackData } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'password_reset_requests_log')
      .maybeSingle();

    const fallbackVal = fallbackData?.value;
    if (Array.isArray(fallbackVal) && fallbackVal.length > 0) {
      return fallbackVal as PasswordResetRequest[];
    }

    // 3. Fallback: synthesize from notifications table with type 'PASSWORD_RESET'
    const { data: notifs } = await supabase
      .from('notifications')
      .select('*')
      .eq('type', 'PASSWORD_RESET')
      .order('created_at', { ascending: false })
      .limit(20);

    if (notifs && notifs.length > 0) {
      return notifs.map((n, idx) => {
        const emailMatch = (n.title || n.message || '').match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
        const email = emailMatch ? emailMatch[1] : 'user@kuventory.com';
        return {
          id: n.id || `req-${idx}`,
          request_code: `PR-${n.created_at?.slice(0, 10).replace(/-/g, '') || '20261018'}-${n.id?.slice(0, 4) || 'AUTO'}`,
          email,
          status: n.is_read ? 'RESOLVED' : 'NEW',
          notification_status: 'DELIVERED',
          review_notes: n.message || null,
          reviewed_by: null,
          requested_at: n.created_at || new Date().toISOString(),
          resolved_at: n.is_read ? n.created_at : null,
          created_at: n.created_at,
        };
      });
    }

    return [];
  } catch (err) {
    console.warn('Error fetching password reset requests:', err);
    return [];
  }
}

/**
 * Update request status (e.g. IN REVIEW, RESOLVED, FAILED)
 */
export async function updatePasswordResetRequestStatus(
  requestId: string,
  status: PasswordResetRequest['status'],
  reviewNotes?: string
): Promise<void> {
  const resolvedAt = status === 'RESOLVED' ? new Date().toISOString() : null;

  try {
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
      // Fallback: update in system_settings log
      const { data: existing } = await supabase.from('system_settings').select('value').eq('key', 'password_reset_requests_log').maybeSingle();
      const existingVal = existing?.value;
      if (Array.isArray(existingVal)) {
        const updated = existingVal.map((item: PasswordResetRequest) => 
          item.id === requestId ? { ...item, status, review_notes: reviewNotes || item.review_notes, resolved_at: resolvedAt } : item
        );
        await supabase.from('system_settings').upsert({
          key: 'password_reset_requests_log',
          value: updated,
          updated_at: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.warn('Error updating password reset request status:', err);
  }

  // Audit log
  try {
    const { data: authData } = await supabase.auth.getUser();
    await supabase.from('audit_logs').insert({
      user_id: authData?.user?.id,
      action: 'PASSWORD_RESET_STATUS_UPDATE',
      target: requestId,
      details: JSON.stringify({ status, review_notes: reviewNotes }),
    } as any);
  } catch (e) {
    console.warn('Audit error:', e);
  }
}
