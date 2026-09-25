import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Shield, KeyRound, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, ArrowRight } from 'lucide-react';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSessionValid, setIsSessionValid] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if recovery session is active or hash params contain access token
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsSessionValid(true);
      } else {
        // Listen for auth state change if the hash is currently being parsed by Supabase client
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
          if (event === 'PASSWORD_RECOVERY' || s) {
            setIsSessionValid(true);
          }
        });
        // Give client a moment to parse the URL hash
        setTimeout(() => {
          setIsSessionValid((prev) => prev ?? false);
        }, 1500);

        return () => subscription.unsubscribe();
      }
    };
    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setSuccessMessage('Password has been reset successfully! Redirecting...');
      setTimeout(() => {
        navigate('/inventory');
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update password. Your reset link may have expired.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-2">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Set New Password</h1>
          <p className="text-xs text-muted-foreground">
            Create a secure password for your KUVENTORY account.
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 text-xs text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{successMessage}</span>
          </div>
        )}

        {isSessionValid === false && !successMessage && (
          <div className="p-3.5 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Reset Link Expired or Invalid
            </div>
            <p className="text-muted-foreground text-[11px]">
              The password reset link may have already been used or expired. Please request a new link from the login page.
            </p>
            <Link to="/login" className="inline-flex items-center gap-1 text-primary hover:underline font-bold pt-1">
              Back to Sign In <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-foreground">New Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters..."
                className="pr-10 bg-card border-border text-foreground h-11"
                required
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-foreground">Confirm New Password</Label>
            <div className="relative flex items-center">
              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password..."
                className="pr-10 bg-card border-border text-foreground h-11"
                required
              />
              <button
                type="button"
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-11 font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground"
            disabled={isLoading || !newPassword || !confirmPassword}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
            Update Password & Sign In
          </Button>
        </form>

        <div className="text-center pt-2 border-t border-border">
          <Link to="/login" className="text-xs text-muted-foreground hover:text-foreground">
            Remember your credentials? <span className="font-semibold text-primary underline">Sign In</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
