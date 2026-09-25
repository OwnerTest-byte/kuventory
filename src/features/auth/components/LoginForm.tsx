import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, KeyRound, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

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

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setAuthError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      const isInvalidCreds = 
        error.message.toLowerCase().includes('invalid') || 
        error.message.toLowerCase().includes('credential') || 
        error.message.toLowerCase().includes('user not found');
      setAuthError(isInvalidCreds ? 'invalid credentials' : error.message);
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setIsSendingReset(true);
    setForgotError(null);
    setForgotMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotMessage('Password reset link has been dispatched to your email.');
    } catch (err: any) {
      setForgotError(err.message || 'Unable to send reset email. Contact operations administrator directly.');
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
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" aria-label="Sign In Form" noValidate>
        {authError && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md" role="alert">
            {authError}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2 text-left">
            <Label htmlFor="email" className="text-sm font-semibold">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              autoComplete="email"
              aria-required="true"
              {...register('email')}
              name="email"
              required
              aria-invalid={!!errors.email}
              className="h-12 text-base"
            />
            {errors.email && (
              <p className="text-sm text-destructive" id="email-error">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2 text-left relative">
            <Label htmlFor="password" className="text-sm font-semibold">Password</Label>
            <div className="relative flex items-center">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                aria-required="true"
                {...register('password')}
                name="password"
                required
                aria-invalid={!!errors.password}
                className="h-12 text-base pr-12"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md p-2 cursor-pointer"
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

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 gap-6">
          <div className="flex items-center space-x-2 min-h-[44px]">
            <input 
              type="checkbox" 
              id="remember" 
              name="remember" 
              className="rounded border-input text-primary focus:ring-primary h-5 w-5 cursor-pointer" 
            />
            <label htmlFor="remember" className="font-medium cursor-pointer select-none py-2 text-xs sm:text-sm">
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
            className="text-primary hover:underline font-medium min-h-[44px] px-2 py-2 flex items-center text-xs sm:text-sm cursor-pointer"
          >
            Forgot password?
          </button>
        </div>

        <Button
          type="submit"
          className="w-full h-12 text-base font-semibold cursor-pointer"
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
                placeholder="e.g. staff@kuventory.com"
                required
                aria-required="true"
                className="h-11"
              />
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <p className="font-semibold text-slate-800 dark:text-slate-200">Admin Hotline Assistance:</p>
              <p>Email: <span className="font-mono text-slate-900 dark:text-slate-100">operations@kuventory.com</span></p>
              <p>Warehouse Tel: <span className="font-mono text-slate-900 dark:text-slate-100">+63 (02) 8921-4567</span></p>
            </div>

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsForgotModalOpen(false)}
                className="min-h-[44px]"
              >
                Close
              </Button>
              <Button
                type="submit"
                disabled={isSendingReset || !forgotEmail}
                className="font-bold min-h-[44px]"
              >
                {isSendingReset ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
                Send Reset Link
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
