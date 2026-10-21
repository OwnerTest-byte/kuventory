import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, KeyRound, CheckCircle2, AlertCircle, Loader2, ShieldCheck, Phone, MessageSquare, Mail, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import { claimSessionLease, parseHumanDeviceInfo } from '../services/sessionLeaseService';
import { useAuth } from '../context/AuthContext';
import { submitPasswordResetRequest } from '@/features/auth/services/passwordResetService';

export const loginSchema = z.object({
  email: z.string().min(1, 'invalid email address').email('invalid email address'),
  password: z.string().min(6, 'password must be at least 6 characters long'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { sessionLeaseError, clearSessionLeaseError, activateSession } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Session Takeover State
  const [pendingTakeoverSession, setPendingTakeoverSession] = useState<{
    session: any;
    deviceInfo?: string;
    lastSeen?: string;
  } | null>(null);
  const [isTakingOver, setIsTakingOver] = useState(false);

  // Remember Me State (wired to persistence preference)
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('kuventory_remember_me') === 'true');

  // Forgot Password State
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: localStorage.getItem('kuventory_remembered_email') || '',
      password: '',
    },
  });

  // Automatically clear stale "active on another device" message
  if (sessionLeaseError?.includes('active on another device') || sessionLeaseError?.includes('ACCOUNT IN USE')) {
    clearSessionLeaseError();
  }

  const handleScrollToViewOnFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Ensure on-screen mobile keyboard does not block the active input field
    const target = e.currentTarget;
    setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  };

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setAuthError(null);
    clearSessionLeaseError();

    try {
      const email = data.email.trim().toLowerCase();

      // Authenticate with exact credentials provided
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: data.password,
      });

      if (signInError || !signInData?.session) {
        setAuthError(signInError?.message || 'Invalid email or password.');
        setIsLoading(false);
        return;
      }

      const activeSession = signInData.session;

      // Server-authoritative maintenance lockdown check
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
        // Wire Remember Me preference
        if (rememberMe) {
          localStorage.setItem('kuventory_remembered_email', email);
          localStorage.setItem('kuventory_remember_me', 'true');
        } else {
          localStorage.removeItem('kuventory_remembered_email');
          localStorage.removeItem('kuventory_remember_me');
        }

        // Register session lease in background and activate session immediately
        claimSessionLease(activeSession.access_token.slice(-16), true).catch(() => {});
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

  const SUPER_ADMIN_HOTLINE = '09917101298';
  const SUPER_ADMIN_EMAIL = 'superadmin@kuventory.com';

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setIsSendingReset(true);
    setForgotError(null);
    setForgotMessage(null);

    const emailToReset = forgotEmail.trim().toLowerCase();

    try {
      const result = await submitPasswordResetRequest(emailToReset);

      // Also trigger Supabase auth reset email as background fallback
      try {
        await supabase.auth.resetPasswordForEmail(emailToReset, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
      } catch (authErr) {
        console.warn('Direct SMTP reset skipped or unconfigured:', authErr);
      }

      setForgotMessage(result.message);
    } catch (err: any) {
      setForgotError(err.message || `Unable to send reset request. Please contact the Super Admin directly at ${SUPER_ADMIN_HOTLINE}.`);
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="text-center space-y-2 mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Welcome Back!</h2>
        <p className="text-muted-foreground">
          Sign in to your account
        </p>
      </div>
      
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5" aria-label="Sign In Form">
        {((authError && !authError.includes('active on another device')) || 
          (sessionLeaseError && !sessionLeaseError.includes('active on another device') && !sessionLeaseError.includes('ACCOUNT IN USE'))) && (
          <div className="p-3.5 text-sm font-semibold text-rose-200 bg-rose-950/80 border border-rose-500/40 rounded-xl flex items-center gap-2.5 animate-in fade-in" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <div className="text-left">
              <span className="font-bold block tracking-wide">{authError || sessionLeaseError}</span>
              {authError === 'INVALID LOGIN' && (
                <span className="text-xs text-rose-300 block font-normal mt-0.5">Invalid credentials</span>
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
              className="h-12 min-h-12 text-base rounded-xl transition-all duration-200 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-0 focus-visible:outline-none"
            />
            {errors.email && (
              <p className="text-sm text-destructive" id="email-error">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2 text-left">
            <Label htmlFor="password" className="text-sm font-semibold inline-block py-1">Password</Label>
            <div className={cn(
              "flex items-center h-12 min-h-12 w-full rounded-xl border border-input bg-card transition-all duration-200",
              "focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-0 focus-within:outline-none",
              errors.password ? "border-destructive ring-1 ring-destructive" : ""
            )}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                aria-required="true"
                {...register('password')}
                onFocus={handleScrollToViewOnFocus}
                name="password"
                required
                aria-invalid={!!errors.password}
                className="flex-1 h-full px-3.5 py-2 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 focus:border-transparent min-w-0"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="h-12 w-12 min-h-12 min-w-12 flex items-center justify-center text-muted-foreground hover:text-foreground focus:outline-none focus-visible:outline-none rounded-r-xl cursor-pointer shrink-0"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-destructive" id="password-error">
                {errors.password.message}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 gap-8">
          <div className="flex items-center space-x-2.5 min-h-12 py-1">
            <input 
              type="checkbox" 
              id="remember" 
              name="remember" 
              checked={rememberMe}
              onChange={(e) => {
                const checked = e.target.checked;
                setRememberMe(checked);
                if (checked) {
                  localStorage.setItem('kuventory_remember_me', 'true');
                } else {
                  localStorage.removeItem('kuventory_remember_me');
                  localStorage.removeItem('kuventory_remembered_email');
                }
              }}
              className="rounded border-input text-primary focus:ring-primary h-5 w-5 min-h-5 min-w-5 cursor-pointer" 
            />
            <label htmlFor="remember" className="font-medium cursor-pointer select-none py-3 text-sm min-h-12 flex items-center">
              Remember me
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              setForgotEmail('');
              setForgotMessage(null);
              setForgotError(null);
              setIsForgotModalOpen(true);
            }}
            className="text-primary hover:underline font-semibold min-h-12 px-3 py-3 flex items-center text-sm cursor-pointer"
          >
            Forgot password?
          </button>
        </div>

        <Button
          type="submit"
          className="w-full h-12 min-h-12 text-base font-bold cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          disabled={isLoading}
        >
          {isLoading ? "Signing in..." : "Sign In"}
        </Button>
      </form>

      {/* Forgot Password Dialog */}
      <Dialog open={isForgotModalOpen} onOpenChange={setIsForgotModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Reset Password
            </DialogTitle>
            <DialogDescription>
              Enter your account email to receive a password reset link, or contact the warehouse administrator.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleForgotSubmit} className="space-y-4 py-2" aria-label="Password Reset Form">
            {forgotError && (
              <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {forgotError}
              </div>
            )}
            {forgotMessage && (
              <div className="p-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md font-bold flex items-center gap-2" role="status">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                {forgotMessage}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="forgot-email" className="text-xs font-bold">Your Email Address</Label>
              <Input
                id="forgot-email"
                name="forgotEmail"
                type="email"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                onFocus={handleScrollToViewOnFocus}
                placeholder="e.g. staff@kuventory.com"
                required
                aria-required="true"
                className="h-11"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 text-xs text-foreground space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-primary flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                  Super Admin Direct Hotline
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  Priority Support
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
                <div>
                  <p className="text-[11px] text-muted-foreground font-medium">Hotline / Mobile:</p>
                  <a 
                    href={`tel:${SUPER_ADMIN_HOTLINE}`} 
                    className="font-mono text-base font-black text-primary hover:underline flex items-center gap-1.5"
                    aria-label={`Call Super Admin at ${SUPER_ADMIN_HOTLINE}`}
                  >
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    {SUPER_ADMIN_HOTLINE}
                  </a>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={`tel:${SUPER_ADMIN_HOTLINE}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-colors shadow-2xs"
                  >
                    <Phone className="w-3 h-3" /> Call
                  </a>
                  <a
                    href={`sms:${SUPER_ADMIN_HOTLINE}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground font-bold text-xs hover:bg-muted transition-colors shadow-2xs"
                  >
                    <MessageSquare className="w-3 h-3" /> SMS
                  </a>
                </div>
              </div>

              <div className="pt-1 border-t border-primary/10 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Email Assistance:</span>
                <a 
                  href={`mailto:${SUPER_ADMIN_EMAIL}`}
                  className="font-mono text-primary hover:underline flex items-center gap-1 font-semibold"
                >
                  <Mail className="w-3 h-3" />
                  {SUPER_ADMIN_EMAIL}
                </a>
              </div>
            </div>

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsForgotModalOpen(false)}
                className="min-h-11"
              >
                Close
              </Button>
              <Button
                type="submit"
                disabled={isSendingReset || !forgotEmail}
                className="font-bold min-h-11 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isSendingReset ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Dispatch to Super Admin
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
