import { supabase } from '@/lib/supabase';

export interface LockoutStatus {
  is_locked: boolean;
  locked_until?: string | null;
  seconds_remaining?: number;
  failed_attempts?: number;
  lockout_token?: string | null;
  message?: string;
}

export interface LockedAccountRecord {
  id: string;
  email_lookup: string;
  email_masked: string;
  failed_attempts: number;
  window_started_at: string | null;
  last_failed_at: string | null;
  locked_until: string;
  lockout_status: string;
  seconds_remaining: number;
  display_name: string | null;
  user_role: string;
  updated_at: string;
}

/**
 * Pre-check whether an account is currently locked before submitting credentials.
 */
export async function checkAccountLockout(email: string, ip?: string): Promise<LockoutStatus> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { is_locked: false, seconds_remaining: 0, failed_attempts: 0 };
  }

  try {
    const { data, error } = await supabase.rpc('check_account_lockout', {
      p_email: cleanEmail,
      p_ip: ip || null,
    });

    if (error) {
      console.warn('check_account_lockout RPC error:', error.message);
      return { is_locked: false, seconds_remaining: 0, failed_attempts: 0 };
    }

    return data as LockoutStatus;
  } catch (err) {
    console.warn('check_account_lockout network error:', err);
    return { is_locked: false, seconds_remaining: 0, failed_attempts: 0 };
  }
}

/**
 * Record a failed login attempt atomically on the server (Unauthenticated / Public).
 * On 5 failed attempts within 15 minutes, initiates a 30-minute lockout.
 */
export async function recordFailedLoginAttempt(
  email: string,
  ip?: string,
  userAgent?: string
): Promise<LockoutStatus> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { is_locked: false, seconds_remaining: 0, failed_attempts: 0 };
  }

  try {
    const { data, error } = await supabase.rpc('record_failed_login_attempt', {
      p_email: cleanEmail,
      p_ip: ip || null,
      p_user_agent: userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : null),
    });

    if (error) {
      console.warn('record_failed_login_attempt RPC error (fallback to record_login_attempt):', error.message);
      // Compatibility fallback
      const { data: fbData } = await supabase.rpc('record_login_attempt', {
        p_email: cleanEmail,
        p_success: false,
        p_ip: ip || null,
        p_user_agent: userAgent || null,
      });
      return (fbData as LockoutStatus) || { is_locked: false, seconds_remaining: 0, failed_attempts: 0 };
    }

    return data as LockoutStatus;
  } catch (err) {
    console.warn('record_failed_login_attempt network error:', err);
    return { is_locked: false, seconds_remaining: 0, failed_attempts: 0 };
  }
}

/**
 * Reset lockout counters after confirmed authentication (Authenticated caller only).
 */
export async function resetMyLoginLockout(): Promise<{ success: boolean; message?: string }> {
  try {
    const { data, error } = await supabase.rpc('reset_my_login_lockout');
    if (error) {
      console.warn('reset_my_login_lockout RPC error:', error.message);
      return { success: false, message: error.message };
    }
    return (data as { success: boolean; message?: string }) || { success: true };
  } catch (err) {
    console.warn('reset_my_login_lockout network error:', err);
    return { success: false };
  }
}

/**
 * Record login attempt with enforced trust boundary.
 */
export async function recordLoginAttempt(
  email: string,
  success: boolean,
  ip?: string,
  userAgent?: string
): Promise<LockoutStatus> {
  if (success) {
    await resetMyLoginLockout();
    return { is_locked: false, seconds_remaining: 0, failed_attempts: 0 };
  } else {
    return recordFailedLoginAttempt(email, ip, userAgent);
  }
}

/**
 * Poll lockout status using the opaque, cryptographically random token.
 * Non-enumerating: never requires sending an email address.
 */
export async function checkLockoutStatusByToken(token: string): Promise<{
  is_locked: boolean;
  locked_until?: string | null;
  seconds_remaining: number;
  was_unlocked: boolean;
}> {
  if (!token) {
    return { is_locked: false, seconds_remaining: 0, was_unlocked: false };
  }

  try {
    const { data, error } = await supabase.rpc('check_lockout_status_by_token', {
      p_token: token.trim(),
    });

    if (error) {
      console.warn('check_lockout_status_by_token RPC error:', error.message);
      return { is_locked: false, seconds_remaining: 0, was_unlocked: false };
    }

    return data;
  } catch (err) {
    console.warn('check_lockout_status_by_token network error:', err);
    return { is_locked: false, seconds_remaining: 0, was_unlocked: false };
  }
}

/**
 * Unlock an account through hierarchical RBAC enforcement.
 * Admin may unlock Staff; Super Admin may unlock Staff and Admin.
 */
export async function unlockAccount(
  accountSecurityId: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('A legitimate reason is required to unlock an account.');
  }

  const { data, error } = await supabase.rpc('unlock_account', {
    p_account_security_id: accountSecurityId,
    p_reason: cleanReason,
  });

  if (error) {
    throw new Error(error.message || 'Failed to unlock account.');
  }

  return data;
}

/**
 * Fetch all currently locked accounts for the Security Management Console.
 */
export async function fetchLockedAccounts(): Promise<LockedAccountRecord[]> {
  const { data, error } = await supabase.rpc('get_locked_accounts');
  if (error) {
    console.warn('get_locked_accounts error:', error.message);
    return [];
  }
  return (data as LockedAccountRecord[]) || [];
}

/**
 * Authoritative password reset request with server-side throttling.
 */
export async function requestPasswordResetAuth(
  email: string,
  reason?: string
): Promise<{ success: boolean; message: string; cooldown_seconds?: number }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error('Email address is required.');
  }

  const { data, error } = await supabase.rpc('request_password_reset', {
    p_email: cleanEmail,
    p_reason: reason || 'User requested password reset from login screen',
  });

  if (error) {
    throw new Error(error.message || 'Failed to submit password reset request.');
  }

  return data;
}
