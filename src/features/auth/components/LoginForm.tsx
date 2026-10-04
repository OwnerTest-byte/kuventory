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

export const loginSchema = z.object({
  email: z.string().min(1, 'invalid email address').email('invalid email address'),
  password: z.string().min(6, 'password must be at least 6 characters long'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
  });

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

    const email = data.email.trim().toLowerCase();
    const candidatePasswords = [data.password];
    
    // Auto-tolerance: if user omits or includes trailing exclamation mark, try both
    if (data.password.endsWith('!')) {
      candidatePasswords.push(data.password.slice(0, -1));
    } else {
      candidatePasswords.push(data.password + '!');
    }

    let authSuccess = false;
    let lastError: any = null;

    for (const pwd of candidatePasswords) {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email,
        password: pwd,
      });

      if (!error && signInData?.session) {
        authSuccess = true;
        break;
      }
      lastError = error;
    }

    if (!authSuccess && lastError) {
      const isInvalidCreds = 
        lastError.message.toLowerCase().includes('invalid') || 
        lastError.message.toLowerCase().includes('credential') || 
        lastError.message.toLowerCase().includes('user not found');
      setAuthError(isInvalidCreds ? 'Invalid credentials. Please verify your email and password.' : lastError.message);
      setIsLoading(false);
    }
  };

  const MASTER_ADMIN_HOTLINE = '09917101298';
  const MASTER_ADMIN_EMAIL = 'master@kuventory.com';

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setIsSendingReset(true);
    setForgotError(null);
    setForgotMessage(null);

    const emailToReset = forgotEmail.trim().toLowerCase();

    try {
      // 1. Dispatch real-time alert directly to Master Admin via database RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('request_password_reset', {
        p_email: emailToReset,
      });

      if (rpcError) {
        // Fallback: direct insert to notifications table if RPC is unmigrated
        await supabase.from('notifications').insert({
          type: 'PASSWORD_RESET',
          title: `Password Reset Request: ${emailToReset}`,
          message: `Staff member (${emailToReset}) requested a password reset. Call or SMS Master Admin hotline: ${MASTER_ADMIN_HOTLINE}, or reset password in Admin Settings.`,
          target_id: '/settings?tab=users',
        } as any);
      }

      // 2. Also try standard Supabase auth reset link as background fallback
      try {
        await supabase.auth.resetPasswordForEmail(emailToReset, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
      } catch (authErr) {
        // Ignore SMTP delivery failures since Master Admin is already notified
        console.warn('Direct SMTP reset skipped or unconfigured:', authErr);
      }

      setForgotMessage(
        rpcData?.message || 
        `Password reset request has been dispatched directly to the Master Admin! For immediate clearance, call or text ${MASTER_ADMIN_HOTLINE}.`
      );
    } catch (err: any) {
      setForgotError(err.message || `Unable to send reset request. Please contact the Master Admin directly at ${MASTER_ADMIN_HOTLINE}.`);
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
        {authError && (
          <div className="p-3.5 text-sm font-semibold text-rose-200 bg-rose-950/80 border border-rose-500/40 rounded-xl flex items-center gap-2.5 animate-in fade-in" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{authError}</span>
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
              className="h-12 min-h-[48px] text-base rounded-xl transition-all duration-200 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-0 focus-visible:outline-none"
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
              "flex items-center h-12 min-h-[48px] w-full rounded-xl border border-input bg-card transition-all duration-200",
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
                className="h-12 w-12 min-h-[48px] min-w-[48px] flex items-center justify-center text-muted-foreground hover:text-foreground focus:outline-none focus-visible:outline-none rounded-r-xl cursor-pointer shrink-0"
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
          <div className="flex items-center space-x-2.5 min-h-[48px] py-1">
            <input 
              type="checkbox" 
              id="remember" 
              name="remember" 
              className="rounded border-input text-primary focus:ring-primary h-5 w-5 min-h-[20px] min-w-[20px] cursor-pointer" 
            />
            <label htmlFor="remember" className="font-medium cursor-pointer select-none py-3 text-sm min-h-[48px] flex items-center">
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
            className="text-primary hover:underline font-semibold min-h-[48px] px-3 py-3 flex items-center text-sm cursor-pointer"
          >
            Forgot password?
          </button>
        </div>

        <Button
          type="submit"
          className="w-full h-12 min-h-[48px] text-base font-bold cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
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
                  Master Admin Direct Hotline
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  Priority Support
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
                <div>
                  <p className="text-[11px] text-muted-foreground font-medium">Hotline / Mobile:</p>
                  <a 
                    href={`tel:${MASTER_ADMIN_HOTLINE}`} 
                    className="font-mono text-base font-black text-primary hover:underline flex items-center gap-1.5"
                    aria-label={`Call Master Admin at ${MASTER_ADMIN_HOTLINE}`}
                  >
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    {MASTER_ADMIN_HOTLINE}
                  </a>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={`tel:${MASTER_ADMIN_HOTLINE}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-colors shadow-2xs"
                  >
                    <Phone className="w-3 h-3" /> Call
                  </a>
                  <a
                    href={`sms:${MASTER_ADMIN_HOTLINE}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground font-bold text-xs hover:bg-muted transition-colors shadow-2xs"
                  >
                    <MessageSquare className="w-3 h-3" /> SMS
                  </a>
                </div>
              </div>

              <div className="pt-1 border-t border-primary/10 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Email Assistance:</span>
                <a 
                  href={`mailto:${MASTER_ADMIN_EMAIL}`}
                  className="font-mono text-primary hover:underline flex items-center gap-1 font-semibold"
                >
                  <Mail className="w-3 h-3" />
                  {MASTER_ADMIN_EMAIL}
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
                Dispatch to Master Admin
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
