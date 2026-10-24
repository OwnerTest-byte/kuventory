import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Eye,
  EyeOff,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Phone,
  Mail,
  Send,
  Clock,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  ArrowLeft,
  AlertTriangle,
  Copy,
  X
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';

import { claimSessionLease, parseHumanDeviceInfo } from '../services/sessionLeaseService';
import { useAuth } from '../context/AuthContext';
import {
  checkAccountLockout,
  recordLoginAttempt,
  checkLockoutStatusByToken,
  type LockoutCheckResult
} from '../services/loginLockoutService';
import {
  fetchPublicSupportContacts,
  type PublicSupportContact
} from '@/features/admin/services/profileService';
import {
  submitAssistedRecoveryTicket,
  checkAssistedRecoveryCooldown,
  checkAssistedRecoveryTicketStatus
} from '../services/passwordResetService';
import {
  computeRemainingSeconds,
  deriveServerOffsetMs,
  formatTimer,
  formatRemainingLabel,
  type ServerClock
} from '../utils/countdown';
import {
  saveRecoveryTicket,
  readRecoveryTicket,
  clearRecoveryTicket,
  type StoredRecoveryTicket
} from '../utils/recoveryTicketStore';

export const loginSchema = z.object({
  email: z.string().email('invalid email address'),
  password: z.string().min(6, 'password must be at least 6 characters long'),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface LockoutUiState {
  /** Authoritative expiry from the database. Never locally decremented. */
  lockedUntil: string;
  secondsRemaining: number;
  lockoutToken: string | null;
}

export function LoginForm() {
  const { sessionLeaseError, clearSessionLeaseError, activateSession } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Lockout State (server-backed 30-minute lockout on 5 failed attempts)
  const [lockout, setLockout] = useState<LockoutUiState | null>(null);
  const [lockoutVerifyError, setLockoutVerifyError] = useState<string | null>(null);
  const [isCheckingLockout, setIsCheckingLockout] = useState(false);
  const [supportContacts, setSupportContacts] = useState<PublicSupportContact[]>([]);

  /** Server-time offset derived from server_now in every lockout RPC response. */
  const serverClockRef = useRef<ServerClock | null>(null);
  const lockoutEmailRef = useRef<string>('');

  // Session Takeover State
  const [pendingTakeoverSession, setPendingTakeoverSession] = useState<{
    session: any;
    deviceInfo?: string;
    lastSeen?: string;
  } | null>(null);
  const [isTakingOver, setIsTakingOver] = useState(false);

  // Remember Me State
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('kuventory_remember_me') === 'true');

  // Account Recovery State (administrator-assisted; @kuventory.com login
  // identifiers have no mailbox, so email reset is not offered as a method)
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [assistedReason, setAssistedReason] = useState('');
  const [assistedTicket, setAssistedTicket] = useState<{
    reference: string;
    credential: string;
  } | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  // Persisted pending-review state (sessionStorage): keeps the
  // "administrators are reviewing your request" card alive across reloads.
  const [storedTicket, setStoredTicket] = useState<StoredRecoveryTicket | null>(null);
  const [ticketStatus, setTicketStatus] = useState<{
    kind: 'PENDING' | 'COMPLETED' | 'REJECTED' | 'EXPIRED';
    status?: string;
    decisionReason?: string | null;
    checkedAt?: string;
  } | null>(null);
  const [ticketCheckFailed, setTicketCheckFailed] = useState(false);

  // Authoritative recovery cooldown (expiry-based, server-decided)
  const [cooldownUntilIso, setCooldownUntilIso] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [cooldownVerified, setCooldownVerified] = useState(true);
  const [isCheckingCooldown, setIsCheckingCooldown] = useState(false);

  // Ticket status check (reference + credential)
  const [statusRef, setStatusRef] = useState('');
  const [statusCred, setStatusCred] = useState('');
  const [statusResult, setStatusResult] = useState<{
    status?: string;
    submittedAt?: string;
    decisionReason?: string;
  } | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: localStorage.getItem('kuventory_remembered_email') || '',
      password: '',
    },
  });

  // Load public support contacts on mount
  useEffect(() => {
    fetchPublicSupportContacts()
      .then(setSupportContacts)
      .catch(err => console.warn('Could not load public support contacts:', err));
  }, []);

  // Clear stale session lease messages
  if (sessionLeaseError?.includes('active on another device') || sessionLeaseError?.includes('ACCOUNT IN USE')) {
    clearSessionLeaseError();
  }

  // -------------------------------------------------------------------------
  // LOCKOUT: authoritative result application + expiry-based countdown
  // -------------------------------------------------------------------------

  const applyServerNow = useCallback((serverNowIso: string | null | undefined) => {
    const offset = deriveServerOffsetMs(serverNowIso);
    if (offset !== null) {
      serverClockRef.current = { offsetMs: offset };
    }
  }, []);

  /** Transition the UI strictly according to a verified server outcome. */
  const applyLockoutResult = useCallback(
    (res: LockoutCheckResult) => {
      applyServerNow(res.serverNow);

      if (res.outcome === 'LOCKED' && res.lockedUntil) {
        setLockoutVerifyError(null);
        // The attempts counter is meaningless once the lockout engages (the
        // locked card replaces the form); drop any stale value.
        setAttemptsRemaining(null);
        setLockout(prev => ({
          lockedUntil: res.lockedUntil!,
          secondsRemaining: computeRemainingSeconds(res.lockedUntil, serverClockRef.current),
          lockoutToken: res.lockoutToken ?? prev?.lockoutToken ?? null,
        }));
        return;
      }

      // Verified non-locked outcomes — only these may clear the locked screen.
      setLockout(null);
      setLockoutVerifyError(null);
      // After expiry/unlock the server starts a fresh 15-minute window, so
      // any previously displayed attempt count is stale and must not survive.
      setAttemptsRemaining(null);
      if (res.outcome === 'ADMIN_UNLOCKED') {
        setAuthError('Your account lockout has been lifted by an administrator. You may now sign in.');
      } else if (res.outcome === 'EXPIRED') {
        setAuthError('The lockout period has ended. You may now attempt to sign in again.');
      } else if (res.outcome === 'NOT_FOUND') {
        setAuthError('This lockout is no longer active. You may now attempt to sign in again.');
      }
      // STATUS_UNKNOWN: caller decides (keeps current state + verify error).
    },
    [applyServerNow]
  );

  /**
   * Authoritative lockout status check. When the opaque token is available it
   * is used (non-enumerating); otherwise a single email-based check is
   * performed. A failed check NEVER clears the locked state.
   */
  const pollLockoutStatus = useCallback(async () => {
    let res: LockoutCheckResult;
    if (lockout?.lockoutToken) {
      res = await checkLockoutStatusByToken(lockout.lockoutToken);
    } else if (lockoutEmailRef.current) {
      res = await checkAccountLockout(lockoutEmailRef.current);
    } else {
      return;
    }

    if (res.outcome === 'STATUS_UNKNOWN') {
      setLockoutVerifyError(
        'We could not verify your lockout status with the server. Your sign-in remains paused; this is usually temporary. Reconnect and check again.'
      );
      return;
    }

    applyLockoutResult(res);
  }, [lockout?.lockoutToken, applyLockoutResult]);

  const handleManualCheckLockout = async () => {
    setIsCheckingLockout(true);
    try {
      await pollLockoutStatus();
    } finally {
      setIsCheckingLockout(false);
    }
  };

  // Expiry-derived countdown: recomputed from the clock every second so
  // background-tab throttling, sleeps, and reloads cannot desync the label.
  useEffect(() => {
    if (!lockout) return;

    const tick = () => {
      const remaining = computeRemainingSeconds(lockout.lockedUntil, serverClockRef.current);
      if (remaining <= 0) {
        // Local deadline reached: confirm with the server instead of
        // assuming the account is unlocked. Stop this fast interval so an
        // unreachable server is retried by the bounded 10s poll, focus,
        // online, and manual checks rather than once per second.
        clearInterval(timer);
        setLockout(prev => (prev ? { ...prev, secondsRemaining: 0 } : prev));
        void pollLockoutStatus();
        return;
      }
      setLockout(prev => (prev && prev.secondsRemaining !== remaining ? { ...prev, secondsRemaining: remaining } : prev));
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [lockout?.lockedUntil, pollLockoutStatus]);

  // Bounded polling (~10s) while locked, using the opaque token only.
  useEffect(() => {
    if (!lockout?.lockoutToken) return;
    const id = setInterval(() => {
      void pollLockoutStatus();
    }, 10000);
    return () => clearInterval(id);
  }, [lockout?.lockoutToken, pollLockoutStatus]);

  // Reconcile immediately when the page becomes visible, focused, or online.
  useEffect(() => {
    if (!lockout) return;
    const recheck = () => {
      setLockout(prev =>
        prev ? { ...prev, secondsRemaining: computeRemainingSeconds(prev.lockedUntil, serverClockRef.current) } : prev
      );
      void pollLockoutStatus();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    window.addEventListener('focus', recheck);
    window.addEventListener('online', recheck);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', recheck);
      window.removeEventListener('online', recheck);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [lockout?.lockedUntil, pollLockoutStatus]);

  // -------------------------------------------------------------------------
  // RECOVERY COOLDOWN: authoritative expiry, reconciled with the server
  // -------------------------------------------------------------------------

  const refreshCooldown = useCallback(async (email: string) => {
    const clean = email.trim().toLowerCase();
    if (!clean || !clean.includes('@')) return;

    setIsCheckingCooldown(true);
    try {
      const res = await checkAssistedRecoveryCooldown(clean);
      if (!res.verified) {
        // Cooldown unknown: keep any active cooldown and surface a retry.
        setCooldownVerified(false);
        return;
      }
      setCooldownVerified(true);
      if (res.canSubmit) {
        setCooldownUntilIso(null);
        setCooldownSeconds(0);
      } else if (res.nextAllowedAt) {
        applyServerNow(res.serverNow);
        setCooldownUntilIso(res.nextAllowedAt);
        setCooldownSeconds(computeRemainingSeconds(res.nextAllowedAt, serverClockRef.current));
      }
    } finally {
      setIsCheckingCooldown(false);
    }
  }, [applyServerNow]);

  // Derive the cooldown label from the authoritative expiry every second.
  useEffect(() => {
    if (!cooldownUntilIso) return;

    const tick = () => {
      const remaining = computeRemainingSeconds(cooldownUntilIso, serverClockRef.current);
      setCooldownSeconds(remaining);
      if (remaining <= 0) {
        // Zero locally: re-verify with the server before enabling submission.
        setCooldownUntilIso(null);
        const email = forgotEmail.trim().toLowerCase();
        if (email.includes('@')) {
          void refreshCooldown(email);
        } else {
          setCooldownVerified(true);
        }
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // forgotEmail intentionally excluded: the running timer must not restart
    // on every keystroke; the next open/submit reconciles with the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cooldownUntilIso, refreshCooldown]);

  const cooldownBlocksSubmit = cooldownSeconds > 0 || isCheckingCooldown || !cooldownVerified;

  // -------------------------------------------------------------------------
  // PENDING RECOVERY TICKET: live "admin is reviewing" status
  // (authoritative via the reference+credential status RPC; bounded polling,
  //  reconciled on focus/visibility/online; never a public subscription)
  // -------------------------------------------------------------------------

  const reconcileTicketStatus = useCallback(async (ticket: StoredRecoveryTicket) => {
    try {
      const res = await checkAssistedRecoveryTicketStatus(ticket.reference, ticket.credential);
      if (!res.valid) {
        // The pair no longer matches a ticket: stop tracking quietly.
        clearRecoveryTicket();
        setStoredTicket(null);
        setTicketStatus(null);
        return;
      }
      setTicketCheckFailed(false);
      const kind: 'PENDING' | 'COMPLETED' | 'REJECTED' | 'EXPIRED' =
        res.status === 'COMPLETED'
          ? 'COMPLETED'
          : res.status === 'REJECTED'
            ? 'REJECTED'
            : res.status === 'EXPIRED'
              ? 'EXPIRED'
              : 'PENDING';
      setTicketStatus({
        kind,
        status: res.status,
        decisionReason: res.decisionReason ?? null,
        checkedAt: new Date().toISOString(),
      });
      if (kind !== 'PENDING') {
        // Outcome decided: stop persisting; the outcome card stays visible
        // until dismissed or the page reloads.
        clearRecoveryTicket();
      }
    } catch {
      // Status unknown (transport): keep the pending card, mark last check
      // failed, retry on the next poll/focus/online.
      setTicketCheckFailed(true);
    }
  }, []);

  // Restore a pending ticket from sessionStorage on first mount.
  useEffect(() => {
    const stored = readRecoveryTicket();
    if (stored) {
      setStoredTicket(stored);
      setTicketStatus(prev => prev ?? { kind: 'PENDING', checkedAt: new Date().toISOString() });
      void reconcileTicketStatus(stored);
    }
  }, [reconcileTicketStatus]);

  const ticketResolved = ticketStatus?.kind === 'COMPLETED' || ticketStatus?.kind === 'REJECTED' || ticketStatus?.kind === 'EXPIRED';

  // Bounded 20s poll while a ticket is being tracked and not yet decided.
  useEffect(() => {
    if (!storedTicket || ticketResolved) return;
    const id = setInterval(() => {
      void reconcileTicketStatus(storedTicket);
    }, 20000);
    return () => clearInterval(id);
  }, [storedTicket, ticketResolved, reconcileTicketStatus]);

  // Reconcile immediately when the page becomes visible, focused, or online.
  useEffect(() => {
    if (!storedTicket || ticketResolved) return;
    const recheck = () => void reconcileTicketStatus(storedTicket);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    window.addEventListener('focus', recheck);
    window.addEventListener('online', recheck);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', recheck);
      window.removeEventListener('online', recheck);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [storedTicket, ticketResolved, reconcileTicketStatus]);

  const dismissTicketCard = () => {
    clearRecoveryTicket();
    setStoredTicket(null);
    setTicketStatus(null);
    setTicketCheckFailed(false);
  };

  // -------------------------------------------------------------------------
  // LOGIN SUBMISSION (server-authoritative pre-check, fail closed)
  // -------------------------------------------------------------------------

  const handleScrollToViewOnFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const target = e.currentTarget;
    setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  };

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setAuthError(null);
    clearSessionLeaseError();

    const email = data.email.trim().toLowerCase();
    lockoutEmailRef.current = email;

    // The remember flag must be settled BEFORE authentication: it decides
    // which storage the auth token is written to during sign-in (remembered
    // -> persists across browser restarts; not remembered -> dies with the
    // browser session).
    if (rememberMe) {
      localStorage.setItem('kuventory_remember_me', 'true');
    } else {
      localStorage.removeItem('kuventory_remember_me');
    }

    try {
      // 1. Server-authoritative pre-check before password verification.
      //    If the status cannot be verified, do NOT proceed as if unlocked.
      const preCheck = await checkAccountLockout(email);
      if (preCheck.outcome === 'STATUS_UNKNOWN') {
        setAuthError(
          'We could not verify your account security status with the server. Please check your connection and try again.'
        );
        setIsLoading(false);
        return;
      }
      if (preCheck.outcome === 'LOCKED') {
        applyLockoutResult(preCheck);
        setAuthError('Your sign-in is temporarily paused after repeated failed attempts.');
        setIsLoading(false);
        return;
      }

      // 2. Authenticate with exact credentials against Supabase Auth
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: data.password,
      });

      // 3. Handle Failed Password Attempt
      if (signInError || !signInData?.session) {
        const attemptResult = await recordLoginAttempt(email, false);

        if (attemptResult.outcome === 'LOCKED') {
          applyLockoutResult(attemptResult);
          setAuthError('Account locked for 30 minutes after 5 consecutive failed login attempts.');
        } else if (attemptResult.outcome === 'STATUS_UNKNOWN') {
          setAuthError(
            'Invalid email or password. (The attempt could not be recorded because the server was unreachable — lockout status unverified. Please retry.)'
          );
        } else {
          // The sub-note under the banner is the single display of the
          // remaining count, always driven by this fresh server response.
          const remaining = Math.max(0, 5 - (attemptResult.failedAttempts || 1));
          setAttemptsRemaining(remaining);
          setAuthError('Invalid email or password.');
        }
        setIsLoading(false);
        return;
      }

      // 4. Handle Successful Password Attempt
      // Reset server failure counter atomically
      await recordLoginAttempt(email, true);
      setAttemptsRemaining(null);

      const activeSession = signInData.session;

      // Maintenance lockdown verification
      const { data: isLocked, error: lockErr } = await supabase.rpc('is_maintenance_locked');
      if (lockErr) {
        console.warn('is_maintenance_locked RPC warning:', lockErr.message);
      }

      if (isLocked) {
        await supabase.auth.signOut();
        localStorage.removeItem('kuventory_browser_session_active');
        sessionStorage.removeItem('kuventory_browser_session_active');
        setAuthError('EMERGENCY MAINTENANCE LOCKDOWN ACTIVE: System access is currently restricted to authorized Super Administrators during database maintenance.');
        return;
      }

      if (activeSession) {
        // Email convenience only — the session-persistence flag was already
        // applied before sign-in (see onSubmit).
        if (rememberMe) {
          localStorage.setItem('kuventory_remembered_email', email);
        } else {
          localStorage.removeItem('kuventory_remembered_email');
        }

        // Deterministic session lease claim: verify if account is already active on another device
        const leaseRes = await claimSessionLease(activeSession.access_token.slice(-16), false);
        if (!leaseRes.success && leaseRes.reason === 'OCCUPIED') {
          setPendingTakeoverSession({
            session: activeSession,
            deviceInfo: leaseRes.occupied_device_info || 'Another Browser/Device',
            lastSeen: leaseRes.last_seen,
          });
          return;
        }

        setPendingTakeoverSession(null);
        activateSession(activeSession);
      }
    } catch (err: any) {
      console.error('Unhandled login error:', err);
      setAuthError(err?.message || 'Connection error. Please verify network access.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmTakeover = async () => {
    if (!pendingTakeoverSession?.session?.access_token) return;
    setIsTakingOver(true);
    try {
      const res = await claimSessionLease(pendingTakeoverSession.session.access_token.slice(-16), true);
      if (res.success) {
        setPendingTakeoverSession(null);
        setAuthError(null);
        clearSessionLeaseError();
        activateSession(pendingTakeoverSession.session);
      } else {
        await supabase.auth.signOut();
        localStorage.removeItem('kuventory_browser_session_active');
        sessionStorage.removeItem('kuventory_browser_session_active');
        setPendingTakeoverSession(null);
        setAuthError(res.message || 'Unable to take over session.');
      }
    } catch {
      setAuthError('Failed to complete session takeover. Please retry.');
    } finally {
      setIsTakingOver(false);
    }
  };

  const handleCancelTakeover = async () => {
    setIsTakingOver(true);
    try {
      await supabase.auth.signOut();
      localStorage.removeItem('kuventory_browser_session_active');
      sessionStorage.removeItem('kuventory_browser_session_active');
      setPendingTakeoverSession(null);
      setAuthError('ACCOUNT IN USE');
    } finally {
      setIsTakingOver(false);
    }
  };

  // -------------------------------------------------------------------------
  // ASSISTED RECOVERY SUBMISSION + TICKET STATUS CHECK
  // -------------------------------------------------------------------------

  const openForgotModal = () => {
    setForgotEmail(getValues('email') || '');
    setForgotError(null);
    setForgotMessage(null);
    setCopyNotice(null);
    setIsForgotModalOpen(true);
    // Reconcile the authoritative cooldown immediately (covers reopen after
    // close, reload, and submissions from other tabs or devices).
    const email = (getValues('email') || '').trim().toLowerCase();
    if (email.includes('@')) {
      void refreshCooldown(email);
    }
  };

  const handleCopy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyNotice(`${label} copied to clipboard.`);
    } catch {
      setCopyNotice(`Copy failed — please select the ${label.toLowerCase()} text and copy manually.`);
    }
    setTimeout(() => setCopyNotice(null), 2500);
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail || cooldownBlocksSubmit || assistedTicket) return;

    setIsSendingReset(true);
    setForgotError(null);
    setForgotMessage(null);

    const emailToRecover = forgotEmail.trim().toLowerCase();

    try {
      const res = await submitAssistedRecoveryTicket(
        emailToRecover,
        assistedReason.trim() || 'Staff account recovery requested from login screen'
      );

      // Both accepted and throttled responses carry the authoritative cooldown.
      if (res.serverNow) applyServerNow(res.serverNow);
      if (res.nextAllowedAt) {
        setCooldownUntilIso(res.nextAllowedAt);
        setCooldownSeconds(computeRemainingSeconds(res.nextAllowedAt, serverClockRef.current));
      }
      setCooldownVerified(true);

      if (res.accepted && res.requestReference && res.statusCredential) {
        const ticket: StoredRecoveryTicket = {
          reference: res.requestReference,
          credential: res.statusCredential,
          submittedAt: new Date().toISOString(),
        };
        saveRecoveryTicket(ticket);
        setStoredTicket(ticket);
        setTicketStatus({ kind: 'PENDING', status: 'RECEIVED', checkedAt: new Date().toISOString() });
        setTicketCheckFailed(false);
        setAssistedTicket({ reference: res.requestReference, credential: res.statusCredential });
        setStatusRef(res.requestReference);
        setForgotMessage(res.message);
        setForgotError(null);
      } else if (res.throttled) {
        setForgotError(
          `${res.message} You can submit again in ${formatRemainingLabel(res.secondsRemaining ?? cooldownSeconds)}.`
        );
      } else {
        setForgotError(res.message || 'Unable to submit recovery request.');
      }
    } catch (err: any) {
      setForgotError(err?.message || 'The recovery request could not be submitted. Please try again.');
      // A failed submission must not bypass the limiter: reconcile with the
      // authoritative cooldown state.
      void refreshCooldown(emailToRecover);
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleStatusCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusRef.trim() || !statusCred.trim()) return;

    setIsCheckingStatus(true);
    setStatusError(null);
    setStatusResult(null);
    try {
      const res = await checkAssistedRecoveryTicketStatus(statusRef, statusCred);
      if (!res.valid) {
        setStatusError(res.message || 'Invalid request reference or status credential. Check both values and retry.');
        return;
      }
      setStatusResult({
        status: res.status,
        submittedAt: res.submittedAt,
        decisionReason: res.decisionReason,
      });
    } catch (err: any) {
      setStatusError(err?.message || 'Status check failed. Please check your connection and retry.');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const statusBadgeTone = (status?: string) => {
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
  };

  return (
    <div className="w-full max-w-sm">
      <div className="text-center space-y-2 mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Welcome Back!</h2>
        <p className="text-muted-foreground text-sm">
          Sign in to your Kuventory account
        </p>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 30-MINUTE LOCKOUT ACTIVE CARD                                 */}
      {/* ------------------------------------------------------------- */}
      {lockout ? (
        <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="p-5 rounded-2xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-500/50 shadow-xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-base text-rose-900 dark:text-rose-100">Sign-In Temporarily Paused</h3>
              <p className="text-xs text-rose-700 dark:text-rose-200/80">
                5 consecutive failed login attempts detected. Access is locked for 30 minutes to protect your account.
              </p>
            </div>

            {/* Countdown Display — derived from the database locked_until timestamp */}
            <div className="p-3.5 rounded-xl bg-rose-100/70 dark:bg-black/40 border border-rose-200 dark:border-rose-500/30 flex flex-col items-center justify-center space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-widest text-rose-600 dark:text-rose-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Time Remaining
              </span>
              <span
                className="font-mono text-3xl font-black text-rose-950 dark:text-white tracking-wider tabular-nums"
                aria-live="polite"
                role="timer"
              >
                {formatTimer(lockout.secondsRemaining || 0)}
              </span>
              <span className="text-[10px] text-rose-600/80 dark:text-rose-300/70">
                Synced with database security ledger
              </span>
            </div>

            {lockoutVerifyError && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-left flex items-start gap-2" role="alert">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                <span className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">{lockoutVerifyError}</span>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isCheckingLockout}
                onClick={handleManualCheckLockout}
                className="w-full h-9 text-xs rounded-xl border-rose-300 dark:border-rose-500/30 text-rose-700 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900/40 dark:hover:text-white"
              >
                {isCheckingLockout ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Check Lockout Status Now
              </Button>

              <p className="text-[11px] text-rose-600/80 dark:text-rose-300/60 italic">
                An administrator can clear your lockout early with an authorized override.
              </p>
            </div>
          </div>

          {/* Configured Support Contacts Card */}
          <div className="p-4 rounded-xl bg-card border border-border/80 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span>Authorized Support Contacts</span>
              </span>
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Assistance</span>
            </div>

            {supportContacts.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2 text-center">
                <p>No public support channels configured.</p>
                <p className="mt-1 text-[11px]">Please contact your branch supervisor directly or wait until the security timer expires.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {supportContacts.map((contact, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">{contact.display_name || 'System Administrator'}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold uppercase">
                        {contact.job_title}
                      </span>
                    </div>

                    <div className="space-y-1 text-muted-foreground text-[11px]">
                      {contact.support_phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-primary shrink-0" />
                          <a href={`tel:${contact.support_phone}`} className="hover:underline font-mono text-foreground font-semibold">
                            {contact.support_phone}
                          </a>
                        </div>
                      )}

                      {contact.support_email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                          <a href={`mailto:${contact.support_email}`} className="hover:underline text-foreground">
                            {contact.support_email}
                          </a>
                        </div>
                      )}
                    </div>

                    {contact.links && contact.links.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/30">
                        {contact.links.map(link => (
                          <a
                            key={link.id}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground border border-border/60 transition-colors"
                          >
                            <span>{link.label}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
        {/* ------------------------------------------------------------- */}
        {/* PENDING RECOVERY REQUEST CARD (live admin-review status)      */}
        {/* ------------------------------------------------------------- */}
        {storedTicket && ticketStatus && (
          <div aria-live="polite" className={
            ticketStatus.kind === 'PENDING'
              ? 'p-4 rounded-2xl bg-primary/5 dark:bg-primary/10 border border-primary/30 shadow-sm space-y-2.5 animate-in fade-in duration-200'
              : ticketStatus.kind === 'COMPLETED'
                ? 'p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/40 shadow-sm space-y-2.5 animate-in fade-in duration-200'
                : 'p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-500/40 shadow-sm space-y-2.5 animate-in fade-in duration-200'
          }>
            <div className="flex items-start gap-3">
              <div className={
                ticketStatus.kind === 'PENDING'
                  ? 'w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0'
                  : ticketStatus.kind === 'COMPLETED'
                    ? 'w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0'
                    : 'w-9 h-9 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0'
              }>
                {ticketStatus.kind === 'PENDING' ? (
                  <Loader2 className="w-4.5 h-4.5 animate-spin" />
                ) : ticketStatus.kind === 'COMPLETED' ? (
                  <CheckCircle2 className="w-4.5 h-4.5" />
                ) : (
                  <ShieldAlert className="w-4.5 h-4.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                {ticketStatus.kind === 'PENDING' ? (
                  <>
                    <p className="text-sm font-bold text-foreground flex items-center gap-2 flex-wrap">
                      Administrators are reviewing your recovery request
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> In Review
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 break-all">
                      Reference <span className="font-mono font-bold text-foreground">{storedTicket.reference}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {ticketCheckFailed
                        ? 'Status check unavailable — retrying automatically when the connection returns.'
                        : ticketStatus.checkedAt
                          ? `Last checked ${new Date(ticketStatus.checkedAt).toLocaleTimeString()}`
                          : 'Checking status…'}
                    </p>
                  </>
                ) : ticketStatus.kind === 'COMPLETED' ? (
                  <>
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Your password was reset by an administrator</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                      Sign in below with the new password your administrator provided for your account.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-rose-900 dark:text-rose-100">Your recovery request was {ticketStatus.kind === 'REJECTED' ? 'declined' : 'closed'}</p>
                    <p className="text-[11px] text-rose-700 dark:text-rose-200/80 leading-relaxed mt-1 break-words">
                      {ticketStatus.decisionReason || 'No reason was provided. Contact your administrator through the official channels for next steps.'}
                    </p>
                  </>
                )}
              </div>
              {ticketStatus.kind !== 'PENDING' && (
                <button
                  type="button"
                  onClick={dismissTicketCard}
                  aria-label="Dismiss recovery notice"
                  className="p-1 rounded-lg text-rose-500 dark:text-rose-300 hover:text-rose-700 dark:hover:text-rose-100 hover:bg-rose-100 dark:hover:bg-rose-900/40 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* STANDARD LOGIN FORM                                           */}
        {/* ------------------------------------------------------------- */}
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5" aria-label="Sign In Form">
          {((authError && !authError.includes('active on another device')) ||
            (sessionLeaseError && !sessionLeaseError.includes('active on another device') && !sessionLeaseError.includes('ACCOUNT IN USE'))) && (
            <div className="p-3.5 text-sm font-semibold text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-500/40 rounded-xl flex items-center gap-2.5 animate-in fade-in" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
              <div className="text-left">
                <span className="font-bold block tracking-wide">{authError || sessionLeaseError}</span>
                {attemptsRemaining !== null && attemptsRemaining > 0 && (
                  <span className="text-xs text-rose-600 dark:text-rose-300 block font-normal mt-0.5">
                    {attemptsRemaining} attempt{attemptsRemaining === 1 ? '' : 's'} remaining before the account locks automatically.
                  </span>
                )}
              </div>
            </div>
          )}

          {pendingTakeoverSession && (
            <div className="p-3.5 text-xs text-amber-900 dark:text-amber-200 bg-amber-500/15 dark:bg-amber-950/70 border border-amber-600/30 dark:border-amber-500/40 rounded-xl space-y-2.5 animate-in fade-in" role="region" aria-label="Session Takeover Notice">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-950 dark:text-amber-100">
                    Active session detected: {parseHumanDeviceInfo(pendingTakeoverSession.deviceInfo)}
                  </p>
                  <p className="text-amber-900/90 dark:text-amber-200/90 mt-0.5 font-medium">
                    Would you like to end the previous device's session and continue here?
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  disabled={isTakingOver}
                  onClick={handleConfirmTakeover}
                  className="h-8 px-3 text-xs bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg"
                >
                  {isTakingOver ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Continue Here & End Other Session
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isTakingOver}
                  onClick={handleCancelTakeover}
                  className="h-8 px-3 text-xs text-amber-900 dark:text-amber-200 hover:text-amber-950 dark:hover:text-white hover:bg-amber-500/20 dark:hover:bg-amber-900/40 rounded-lg"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2 text-left">
              <Label htmlFor="email" className="text-sm font-semibold inline-block py-1">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                autoComplete="email"
                aria-required="true"
                {...register('email')}
                onFocus={handleScrollToViewOnFocus}
                name="email"
                required
                aria-invalid={!!errors.email}
                className="h-12 min-h-12 text-base rounded-xl transition-all duration-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 focus-visible:outline-none"
              />
              {errors.email && (
                <p className="text-sm text-destructive" id="email-error">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2 text-left">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-semibold inline-block py-1">Password</Label>
                <button
                  type="button"
                  onClick={openForgotModal}
                  className="text-xs font-semibold text-primary hover:underline hover:text-primary/90 focus:outline-none cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>

              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  aria-required="true"
                  {...register('password')}
                  onFocus={handleScrollToViewOnFocus}
                  name="password"
                  required
                  aria-invalid={!!errors.password}
                  className="h-12 min-h-12 text-base rounded-xl pr-10 transition-all duration-200 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 focus-visible:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none p-1 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <Eye className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive" id="password-error">
                  {errors.password.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between py-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground select-none" title="Keeps you signed in on this device after closing the browser, and remembers your email. Unchecked, your session ends when the browser closes.">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <span>Remember me on this device</span>
            </label>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 min-h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition-all duration-200 shadow-md hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <KeyRound className="w-5 h-5" />
                <span>Sign In</span>
              </>
            )}
          </Button>
        </form>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* ACCOUNT RECOVERY MODAL (administrator-assisted)                */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isForgotModalOpen} onOpenChange={open => {
        setIsForgotModalOpen(open);
        if (!open) {
          setAssistedTicket(null);
          setForgotMessage(null);
          setForgotError(null);
          setCopyNotice(null);
          setStatusResult(null);
          setStatusError(null);
        }
      }}>
        <DialogContent className="max-w-md p-6 rounded-2xl bg-card border-border shadow-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="space-y-1 text-left border-b border-border/60 pb-3">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
              <KeyRound className="w-5 h-5 text-primary" />
              <span>Account Recovery</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              KUVENTORY login identifiers are system addresses without mailboxes, so reset links cannot be
              delivered by email. Recovery is completed through administrator-assisted identity verification.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleForgotSubmit} className="space-y-4 py-1" aria-label="Assisted Account Recovery Form">
            {assistedTicket ? (
              <>
                <div className="p-3.5 text-xs bg-blue-500/10 dark:bg-blue-950/40 border border-blue-500/30 rounded-xl text-left space-y-1">
                  <p className="font-bold text-blue-900 dark:text-blue-100 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>Save these two values before closing</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    The status credential is shown only this once and cannot be reissued. Keep it private — anyone
                    with both values can view this ticket's status.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/40 text-left space-y-3">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Recovery Ticket Logged</span>
                  </div>
                  {ticketStatus && (
                    <div aria-live="polite" className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border w-fit">
                      {ticketStatus.kind === 'PENDING' ? (
                        <span className="flex items-center gap-1.5 bg-muted text-foreground border-border">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Administrators reviewing
                        </span>
                      ) : ticketStatus.kind === 'COMPLETED' ? (
                        <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">Password reset completed</span>
                      ) : (
                        <span className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30">
                          Request {ticketStatus.kind === 'REJECTED' ? 'declined' : 'closed'}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-emerald-700 dark:text-emerald-200/90 leading-relaxed">
                    Your recovery request is safely recorded. An administrator will verify your identity through the
                    official channels below before any password change is made.
                  </p>

                  <div className="p-3 rounded-lg bg-white/70 dark:bg-black/50 border border-emerald-200 dark:border-emerald-500/30 space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400">Request Reference</span>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-base font-black text-foreground select-all break-all">{assistedTicket.reference}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[10px] shrink-0 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                        onClick={() => handleCopy('Reference', assistedTicket.reference)}
                        aria-label="Copy request reference"
                      >
                        <Copy className="w-3 h-3 mr-1" /> Copy
                      </Button>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-black/50 border border-amber-200 dark:border-amber-500/30 space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400">Status Credential (shown once)</span>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-xs font-bold text-foreground select-all break-all">{assistedTicket.credential}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[10px] shrink-0 border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                        onClick={() => handleCopy('Credential', assistedTicket.credential)}
                        aria-label="Copy status credential"
                      >
                        <Copy className="w-3 h-3 mr-1" /> Copy
                      </Button>
                    </div>
                  </div>

                  {copyNotice && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-300" role="status">{copyNotice}</p>
                  )}

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Share your reference with your branch supervisor or administrator through the official channels
                    to verify your identity. Check the ticket status with both values using "Check Ticket Status"
                    below — the status only changes after an administrator completes a verified review.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="p-3.5 text-xs bg-amber-500/15 dark:bg-amber-950/60 border border-amber-600/30 dark:border-amber-500/40 rounded-xl text-left space-y-1">
                  <p className="font-bold text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                    <span>Administrator-assisted recovery</span>
                  </p>
                  <p className="text-[11px] text-amber-900 dark:text-amber-200/90 leading-relaxed font-medium">
                    Submit a recovery ticket for administrator review. An administrator verifies your identity, then
                    performs the authorized password reset. You can safely close this browser after submitting.
                  </p>
                </div>

                {forgotError && (
                  <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-2 text-left" role="alert">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{forgotError}</span>
                  </div>
                )}

                {forgotMessage && (
                  <div className="p-3.5 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl space-y-1 text-left" role="status">
                    <div className="flex items-center gap-1.5 font-bold">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                      <span>Request Submitted</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {forgotMessage}
                    </p>
                  </div>
                )}

                {!cooldownVerified && (
                  <div className="p-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2 text-left" role="alert">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      Cooldown status could not be verified with the server. Submission stays unavailable until the
                      check succeeds.
                    </span>
                  </div>
                )}

                <div className="space-y-1.5 text-left">
                  <Label htmlFor="forgot-email" className="text-xs font-bold text-foreground">
                    Account Login Identifier (Email)
                  </Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    onBlur={() => {
                      const clean = forgotEmail.trim().toLowerCase();
                      if (clean.includes('@')) void refreshCooldown(clean);
                    }}
                    onFocus={handleScrollToViewOnFocus}
                    placeholder="e.g. staff@kuventory.com"
                    required
                    className="h-11 text-sm rounded-xl border-input text-foreground font-medium bg-background placeholder:text-muted-foreground/70"
                  />
                </div>

                <div className="space-y-1.5 text-left">
                  <Label htmlFor="assisted-reason" className="text-xs font-bold text-foreground">
                    Reason for Request (Optional)
                  </Label>
                  <Input
                    id="assisted-reason"
                    type="text"
                    value={assistedReason}
                    onChange={e => setAssistedReason(e.target.value)}
                    placeholder="e.g. Forgot password, no email mailbox access"
                    className="h-10 text-xs rounded-xl border-input text-foreground font-medium bg-background placeholder:text-muted-foreground/70"
                  />
                </div>
              </>
            )}

            {/* Configured Support Contact Details — each row renders only when
                the administrator actually provided that detail; the card hides
                entirely when no contact carries any public method. */}
            {supportContacts.some(c => c.support_phone || c.support_email || (c.links && c.links.length > 0)) && (
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 text-xs space-y-2.5 text-left">
                <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                  <span className="font-bold text-foreground text-xs flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                    <span>Administrator Support</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Official Channels</span>
                </div>

                {supportContacts.map((contact, idx) => (
                  <div key={idx} className="space-y-1.5">
                    {(contact.support_phone || contact.support_email || (contact.links && contact.links.length > 0)) && (
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {contact.display_name || 'System Administrator'}
                        {contact.job_title ? ` — ${contact.job_title}` : ''}
                      </p>
                    )}

                    <div className="space-y-1.5 text-[11px] text-foreground/80">
                      {contact.support_phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="font-medium text-muted-foreground">Hotline: </span>
                          <a href={`tel:${contact.support_phone}`} className="hover:underline font-mono text-foreground font-bold">
                            {contact.support_phone}
                          </a>
                        </div>
                      )}

                      {contact.support_email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="font-medium text-muted-foreground">Email: </span>
                          <a href={`mailto:${contact.support_email}`} className="hover:underline text-foreground font-semibold">
                            {contact.support_email}
                          </a>
                        </div>
                      )}

                      {contact.links && contact.links.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {contact.links.map(link => (
                            <a
                              key={link.id}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground border border-border/60 transition-colors"
                            >
                              <span>{link.label}</span>
                              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <DialogFooter className="pt-2 gap-2 sm:gap-0 flex-col-reverse sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsForgotModalOpen(false);
                  setAssistedTicket(null);
                  setForgotMessage(null);
                  setForgotError(null);
                  setCopyNotice(null);
                  setStatusResult(null);
                  setStatusError(null);
                }}
                className="h-10 text-xs font-semibold rounded-xl cursor-pointer border-border hover:bg-muted text-foreground"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Sign In
              </Button>

              {!assistedTicket && (
                <Button
                  type="submit"
                  disabled={isSendingReset || !forgotEmail || cooldownBlocksSubmit}
                  className="h-10 text-xs font-bold rounded-xl cursor-pointer shadow-xs"
                >
                  {isSendingReset ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {isCheckingCooldown
                    ? 'Verifying availability…'
                    : !cooldownVerified
                      ? 'Cooldown unverified'
                      : cooldownSeconds > 0
                        ? `Wait ${formatTimer(cooldownSeconds)} to resubmit`
                        : 'Submit Recovery Ticket'}
                </Button>
              )}
            </DialogFooter>
          </form>

          {/* Ticket status check: the requester's own ticket only, via the
              reference + secret credential pair. */}
          <form onSubmit={handleStatusCheck} className="space-y-3 pt-1 border-t border-border/60 mt-2" aria-label="Recovery Ticket Status Check">
            <div className="flex items-center gap-1.5 pt-2">
              <RefreshCw className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-bold text-foreground">Check Ticket Status</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Input
                aria-label="Request reference"
                placeholder="Request Reference (e.g. REF-20261025-A1B2C3)"
                value={statusRef}
                onChange={e => setStatusRef(e.target.value)}
                className="h-9 text-[11px] rounded-lg font-mono"
              />
              <Input
                aria-label="Status credential"
                placeholder="Status Credential (ST-…)"
                value={statusCred}
                onChange={e => setStatusCred(e.target.value)}
                className="h-9 text-[11px] rounded-lg font-mono"
              />
            </div>

            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={isCheckingStatus || !statusRef.trim() || !statusCred.trim()}
              className="h-8 text-[11px] font-bold w-full sm:w-auto"
            >
              {isCheckingStatus ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : null}
              Check Status
            </Button>

            {statusError && (
              <p className="text-[11px] text-destructive" role="alert">{statusError}</p>
            )}

            {statusResult && (
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60 text-left space-y-1.5" role="status">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusBadgeTone(statusResult.status)}`}>
                    {statusResult.status}
                  </span>
                  {statusResult.submittedAt && (
                    <span className="text-[10px] text-muted-foreground">
                      submitted {new Date(statusResult.submittedAt).toLocaleString()}
                    </span>
                  )}
                </div>
                {statusResult.decisionReason && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{statusResult.decisionReason}</p>
                )}
                {statusResult.status !== 'COMPLETED' && (
                  <p className="text-[10px] text-muted-foreground">
                    The ticket closes as COMPLETED only after an administrator completes the authorized password
                    reset.
                  </p>
                )}
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
