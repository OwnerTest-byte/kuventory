import { supabase } from '@/lib/supabase';

/**
 * Explicit lockout verification outcomes.
 *
 * A status lookup must never collapse "the server could not be reached" into
 * "the account is unlocked". STATUS_UNKNOWN is returned for every transport /
 * RPC failure so callers can fail closed and offer a retry.
 */
export type LockoutOutcome =
  | 'LOCKED'
  | 'UNLOCKED'
  | 'EXPIRED'
  | 'ADMIN_UNLOCKED'
  | 'NOT_FOUND'
  | 'STATUS_UNKNOWN';

export interface LockoutCheckResult {
  outcome: LockoutOutcome;
  /** Authoritative expiry of the active lockout (ISO string) when locked. */
  lockedUntil?: string | null;
  /** Server clock at response time (ISO string); used to derive a server-time offset. */
  serverNow?: string | null;
  secondsRemaining?: number;
  failedAttempts?: number;
  /** Opaque token for non-enumerating polling; only present when issued. */
  lockoutToken?: string | null;
  /**
   * True when the account is in the administrator-verification state (set on
   * the first failed attempt after a lockout expired within 24 hours). Absent
   * or false means not escalated — the flag is never guessed true.
   */
  escalationRequired?: boolean;
  message?: string;
}

export interface LockoutStatus {
  is_locked: boolean;
  locked_until?: string | null;
  seconds_remaining?: number;
  failed_attempts?: number;
  lockout_token?: string | null;
  escalation_required?: boolean;
  message?: string;
}

export interface LockedAccountRecord {
  id: string;
  email_lookup: string;
  email_masked: string;
  failed_attempts: number;
  window_started_at: string | null;
  last_failed_at: string | null;
  locked_until: string | null;
  lockout_status: string;
  seconds_remaining: number;
  verification_required: boolean;
  last_lockout_at: string | null;
  display_name: string | null;
  user_role: string;
  updated_at: string;
}

const UNKNOWN: LockoutCheckResult = { outcome: 'STATUS_UNKNOWN', escalationRequired: false };

/**
 * Normalize a lockout RPC payload into the typed contract. Tolerates responses
 * from database versions predating the explicit `status` field by inferring
 * from is_locked / was_unlocked, but never maps missing data to "unlocked".
 */
export function mapLockoutRpc(data: any): LockoutCheckResult {
  if (!data || typeof data !== 'object') {
    return { ...UNKNOWN };
  }

  const base: LockoutCheckResult = {
    outcome: 'STATUS_UNKNOWN',
    lockedUntil: data.locked_until ?? data.lockedUntil ?? null,
    serverNow: data.server_now ?? data.serverNow ?? null,
    secondsRemaining:
      typeof data.seconds_remaining === 'number'
        ? data.seconds_remaining
        : typeof data.secondsRemaining === 'number'
          ? data.secondsRemaining
          : undefined,
    failedAttempts:
      typeof data.failed_attempts === 'number' ? data.failed_attempts : undefined,
    lockoutToken: data.lockout_token ?? data.lockoutToken ?? null,
    escalationRequired: data.escalation_required === true,
    message: data.message,
  };

  if (typeof data.status === 'string' && data.status.length > 0) {
    const st = data.status.toUpperCase();
    if (st === 'LOCKED' || st === 'UNLOCKED' || st === 'EXPIRED' || st === 'ADMIN_UNLOCKED' || st === 'NOT_FOUND') {
      return { ...base, outcome: st };
    }
    return { ...UNKNOWN };
  }

  // Legacy shape inference (no explicit status): only confident signals map.
  if (data.is_locked === true) return { ...base, outcome: 'LOCKED' };
  if (data.was_unlocked === true) return { ...base, outcome: 'ADMIN_UNLOCKED' };
  if (data.is_locked === false && (data.token_valid === true || data.locked_until === null)) {
    return { ...base, outcome: 'EXPIRED' };
  }
  return { ...UNKNOWN };
}

/**
 * Pre-check whether an account is currently locked before submitting
 * credentials. Fails closed: any RPC/network failure yields STATUS_UNKNOWN.
 */
export async function checkAccountLockout(email: string, ip?: string): Promise<LockoutCheckResult> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { ...UNKNOWN };
  }

  try {
    const { data, error } = await supabase.rpc('check_account_lockout', {
      p_email: cleanEmail,
      p_ip: ip || null,
    });

    if (error) {
      console.warn('check_account_lockout RPC error:', error.message);
      return { ...UNKNOWN, message: 'Lockout status could not be verified.' };
    }

    return mapLockoutRpc(data);
  } catch (err) {
    console.warn('check_account_lockout network error:', err);
    return { ...UNKNOWN, message: 'Lockout status could not be verified.' };
  }
}

/**
 * Record a failed login attempt atomically on the server (anon caller).
 * Policy: 5 failures within a 15-minute window trigger a 30-minute lockout.
 * A recording failure is surfaced as STATUS_UNKNOWN — it is never reported as
 * a successful increment or as an unlocked state.
 */
export async function recordFailedLoginAttempt(
  email: string,
  ip?: string,
  userAgent?: string
): Promise<LockoutCheckResult> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { ...UNKNOWN };
  }

  try {
    const { data, error } = await supabase.rpc('record_failed_login_attempt', {
      p_email: cleanEmail,
      p_ip: ip || null,
      p_user_agent: userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : null),
    });

    if (error) {
      console.warn('record_failed_login_attempt RPC error:', error.message);
      return { ...UNKNOWN, message: 'The failed attempt could not be recorded securely.' };
    }

    return mapLockoutRpc(data);
  } catch (err) {
    console.warn('record_failed_login_attempt network error:', err);
    return { ...UNKNOWN, message: 'The failed attempt could not be recorded securely.' };
  }
}

/**
 * Reset lockout counters after confirmed authentication (authenticated caller,
 * own account only — enforced server-side by reset_my_login_lockout).
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
 * Record a login attempt with the enforced trust boundary: only a confirmed
 * authenticated session may reset counters; failures go through the atomic
 * server-side recorder.
 */
export async function recordLoginAttempt(
  email: string,
  success: boolean,
  ip?: string,
  userAgent?: string
): Promise<LockoutCheckResult> {
  if (success) {
    await resetMyLoginLockout();
    return { outcome: 'UNLOCKED', secondsRemaining: 0, failedAttempts: 0 };
  }
  return recordFailedLoginAttempt(email, ip, userAgent);
}

/**
 * Poll lockout status using the opaque, cryptographically random token.
 * Non-enumerating: never sends an email address. Fails closed: transport and
 * RPC errors return STATUS_UNKNOWN instead of resembling an unlocked account.
 */
export async function checkLockoutStatusByToken(token: string): Promise<LockoutCheckResult> {
  if (!token || !token.trim()) {
    return { ...UNKNOWN, message: 'No lockout token available for this session.' };
  }

  try {
    const { data, error } = await supabase.rpc('check_lockout_status_by_token', {
      p_token: token.trim(),
    });

    if (error) {
      console.warn('check_lockout_status_by_token RPC error:', error.message);
      return { ...UNKNOWN, message: 'Lockout status could not be verified.' };
    }

    return mapLockoutRpc(data);
  } catch (err) {
    console.warn('check_lockout_status_by_token network error:', err);
    return { ...UNKNOWN, message: 'Lockout status could not be verified.' };
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
 * Authoritative password reset request with server-side throttling
 * (legacy email-mailbox path; synthetic @kuventory.com identifiers are
 * routed to assisted recovery instead).
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
