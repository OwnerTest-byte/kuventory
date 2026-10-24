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
  ArrowLeft
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
  type LockoutStatus
} from '../services/loginLockoutService';
import {
  fetchPublicSupportContacts,
  type PublicSupportContact
} from '@/features/admin/services/profileService';

export const loginSchema = z.object({
  email: z.string().email('invalid email address'),
  password: z.string().min(6, 'password must be at least 6 characters long'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { sessionLeaseError, clearSessionLeaseError, activateSession } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Lockout State (Server-backed 30-minute lockout on 5 failed attempts)
  const [lockoutState, setLockoutState] = useState<LockoutStatus>({
    is_locked: false,
    seconds_remaining: 0,
    locked_until: null,
    lockout_token: null,
  });
  const [isCheckingLockoutToken, setIsCheckingLockoutToken] = useState(false);
  const [supportContacts, setSupportContacts] = useState<PublicSupportContact[]>([]);

  // Session Takeover State
  const [pendingTakeoverSession, setPendingTakeoverSession] = useState<{
    session: any;
    deviceInfo?: string;
    lastSeen?: string;
  } | null>(null);
  const [isTakingOver, setIsTakingOver] = useState(false);

  // Remember Me State
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('kuventory_remember_me') === 'true');

  // Forgot Password State
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotCooldown, setForgotCooldown] = useState(0);

  const pollIntervalRef = useRef<any>(null);

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

  // Countdown timer effect synchronized against server locked_until
  useEffect(() => {
    if (!lockoutState.is_locked || !lockoutState.locked_until) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const target = new Date(lockoutState.locked_until!).getTime();
      const diffSecs = Math.max(0, Math.ceil((target - now) / 1000));

      if (diffSecs <= 0) {
        clearInterval(timer);
        setLockoutState({
          is_locked: false,
          seconds_remaining: 0,
          locked_until: null,
          lockout_token: null,
        });
        setAuthError('Lockout period has expired. You may now attempt to sign in again.');
      } else {
        setLockoutState(prev => ({ ...prev, seconds_remaining: diffSecs }));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutState.is_locked, lockoutState.locked_until]);

  // Periodic polling using the opaque lockout token (allows locked browser to detect early admin unlock)
  const pollLockoutStatus = useCallback(async () => {
    if (!lockoutState.lockout_token) return;
    try {
      const res = await checkLockoutStatusByToken(lockoutState.lockout_token);
      if (res.was_unlocked || !res.is_locked) {
        setLockoutState({
          is_locked: false,
          seconds_remaining: 0,
          locked_until: null,
          lockout_token: null,
        });
        setAuthError('Your account lockout has been lifted by an administrator. You may now sign in.');
      } else if (res.seconds_remaining !== undefined) {
        setLockoutState(prev => ({
          ...prev,
          seconds_remaining: res.seconds_remaining,
          locked_until: res.locked_until || prev.locked_until,
        }));
      }
    } catch (e) {
      console.warn('Error polling lockout token status:', e);
    }
  }, [lockoutState.lockout_token]);

  useEffect(() => {
    if (lockoutState.is_locked && lockoutState.lockout_token) {
      pollIntervalRef.current = setInterval(pollLockoutStatus, 12000);
      return () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      };
    }
  }, [lockoutState.is_locked, lockoutState.lockout_token, pollLockoutStatus]);

  // Forgot password cooldown timer
  useEffect(() => {
    if (forgotCooldown <= 0) return;
    const cd = setInterval(() => {
      setForgotCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(cd);
  }, [forgotCooldown]);

  const handleManualCheckLockout = async () => {
    setIsCheckingLockoutToken(true);
    await pollLockoutStatus();
    setIsCheckingLockoutToken(false);
  };

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

    try {
      // 1. Server-authoritative pre-check before password verification
      const preCheck = await checkAccountLockout(email);
      if (preCheck.is_locked) {
        setLockoutState(preCheck);
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
        // Record failed attempt on database atomically
        const attemptResult = await recordLoginAttempt(email, false);

        if (attemptResult.is_locked) {
          setLockoutState(attemptResult);
          setAuthError('Account locked for 30 minutes after 5 consecutive failed login attempts.');
        } else {
          const remaining = Math.max(0, 5 - (attemptResult.failed_attempts || 1));
          setAttemptsRemaining(remaining);
          setAuthError(
            remaining > 0
              ? `Invalid email or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before 30-minute lockout.`
              : 'Invalid email or password.'
          );
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
        if (rememberMe) {
          localStorage.setItem('kuventory_remembered_email', email);
          localStorage.setItem('kuventory_remember_me', 'true');
        } else {
          localStorage.removeItem('kuventory_remembered_email');
          localStorage.removeItem('kuventory_remember_me');
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

  // Authoritative forgot password flow
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail || forgotCooldown > 0) return;

    setIsSendingReset(true);
    setForgotError(null);
    setForgotMessage(null);

    const emailToReset = forgotEmail.trim().toLowerCase();

    try {
      // 1. Database-authoritative rate-limited request record
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('request_password_reset', {
        p_email: emailToReset,
      });

      if (rpcErr) {
        console.warn('request_password_reset RPC error:', rpcErr.message);
      } else if (rpcRes?.throttled) {
        setForgotCooldown(rpcRes.seconds_remaining || 120);
        setForgotError(rpcRes.message || 'Please wait before requesting another reset link.');
        setIsSendingReset(false);
        return;
      }

      // 2. Official Supabase Auth recovery email request
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(emailToReset, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetErr) {
        console.warn('Supabase resetPasswordForEmail warning:', resetErr.message);
      }

      setForgotCooldown(120); // 2-minute cooldown
      setForgotMessage(
        'If an account matches this address, a reset link will arrive by email. Check your inbox and spam folder. For your security, this page does not confirm whether the address belongs to an account.'
      );
    } catch (err: any) {
      setForgotError(err?.message || 'Unable to process reset request. Please contact your system administrator.');
    } finally {
      setIsSendingReset(false);
    }
  };

  // Format seconds to MM:SS
  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
      {lockoutState.is_locked ? (
        <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="p-5 rounded-2xl bg-rose-950/80 border border-rose-500/50 shadow-xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-base text-rose-100">Sign-In Temporarily Paused</h3>
              <p className="text-xs text-rose-200/80">
                5 consecutive failed login attempts detected. Access is locked for 30 minutes to protect your account.
              </p>
            </div>

            {/* Countdown Display */}
            <div className="p-3.5 rounded-xl bg-black/40 border border-rose-500/30 flex flex-col items-center justify-center space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-widest text-rose-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Time Remaining
              </span>
              <span className="font-mono text-3xl font-black text-white tracking-wider">
                {formatTimer(lockoutState.seconds_remaining || 0)}
              </span>
              <span className="text-[10px] text-rose-300/70">
                Synced with database security ledger
              </span>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isCheckingLockoutToken}
                onClick={handleManualCheckLockout}
                className="w-full h-9 text-xs rounded-xl border-rose-500/30 text-rose-200 hover:bg-rose-900/40 hover:text-white"
              >
                {isCheckingLockoutToken ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Check Lockout Status Now
              </Button>

              <p className="text-[11px] text-rose-300/60 italic">
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
        /* ------------------------------------------------------------- */
        /* STANDARD LOGIN FORM                                           */
        /* ------------------------------------------------------------- */
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5" aria-label="Sign In Form">
          {((authError && !authError.includes('active on another device')) || 
            (sessionLeaseError && !sessionLeaseError.includes('active on another device') && !sessionLeaseError.includes('ACCOUNT IN USE'))) && (
            <div className="p-3.5 text-sm font-semibold text-rose-200 bg-rose-950/80 border border-rose-500/40 rounded-xl flex items-center gap-2.5 animate-in fade-in" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <div className="text-left">
                <span className="font-bold block tracking-wide">{authError || sessionLeaseError}</span>
                {attemptsRemaining !== null && attemptsRemaining > 0 && (
                  <span className="text-xs text-rose-300 block font-normal mt-0.5">
                    Account locks automatically after {attemptsRemaining} more failed attempt{attemptsRemaining === 1 ? '' : 's'}.
                  </span>
                )}
              </div>
            </div>
          )}

          {pendingTakeoverSession && (
            <div className="p-3.5 text-xs text-amber-200 bg-amber-950/70 border border-amber-500/40 rounded-xl space-y-2.5 animate-in fade-in" role="region" aria-label="Session Takeover Notice">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-100">
                    Active session detected: {parseHumanDeviceInfo(pendingTakeoverSession.deviceInfo)}
                  </p>
                  <p className="text-amber-300/80 mt-0.5">
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
                  className="h-8 px-3 text-xs text-amber-300 hover:text-white hover:bg-amber-900/40 rounded-lg"
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
                  onClick={() => {
                    setForgotEmail(getValues('email') || '');
                    setForgotError(null);
                    setForgotMessage(null);
                    setIsForgotModalOpen(true);
                  }}
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
            <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <span>Remember my email</span>
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
      )}

      {/* ------------------------------------------------------------- */}
      {/* AUTHORITATIVE FORGOT PASSWORD MODAL                           */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isForgotModalOpen} onOpenChange={setIsForgotModalOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl bg-card border-border shadow-2xl">
          <DialogHeader className="space-y-1 text-left border-b border-border/60 pb-3">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
              <KeyRound className="w-5 h-5 text-primary" />
              <span>Password Recovery</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Submit your email to receive an official recovery link or access configured administrator support.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleForgotSubmit} className="space-y-4 py-2" aria-label="Password Reset Form">
            {forgotError && (
              <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-2" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{forgotError}</span>
              </div>
            )}

            {forgotMessage && (
              <div className="p-3.5 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl space-y-1" role="status">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                  <span>Request Dispatched</span>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {forgotMessage}
                </p>
              </div>
            )}

            <div className="space-y-1.5 text-left">
              <Label htmlFor="forgot-email" className="text-xs font-semibold">Your Account Email</Label>
              <Input
                id="forgot-email"
                type="email"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                onFocus={handleScrollToViewOnFocus}
                placeholder="e.g. staff@kuventory.com"
                required
                className="h-11 text-sm rounded-xl"
              />
            </div>

            {/* Configured Support Contact Details */}
            {supportContacts.length > 0 && (
              <div className="p-3.5 rounded-xl bg-muted/30 border border-border/50 text-xs space-y-2 text-left">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground text-xs flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                    <span>Administrator Support</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Official Channels</span>
                </div>

                <div className="space-y-1.5 text-[11px] text-muted-foreground">
                  {supportContacts[0].support_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>Hotline: </span>
                      <a href={`tel:${supportContacts[0].support_phone}`} className="hover:underline font-mono text-foreground font-bold">
                        {supportContacts[0].support_phone}
                      </a>
                    </div>
                  )}

                  {supportContacts[0].support_email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>Email: </span>
                      <a href={`mailto:${supportContacts[0].support_email}`} className="hover:underline text-foreground font-medium">
                        {supportContacts[0].support_email}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="pt-2 gap-2 sm:gap-0 flex-col-reverse sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsForgotModalOpen(false)}
                className="h-10 text-xs rounded-xl"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Sign In
              </Button>

              <Button
                type="submit"
                disabled={isSendingReset || !forgotEmail || forgotCooldown > 0}
                className="h-10 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl"
              >
                {isSendingReset ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                )}
                {forgotCooldown > 0 ? `Resend in ${forgotCooldown}s` : 'Send Reset Link'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
