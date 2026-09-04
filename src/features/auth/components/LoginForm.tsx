import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      setAuthError(error.message);
      setIsLoading(false);
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
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {authError && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            {authError}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2 text-left">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              autoComplete="email"
              {...register('email')}
              aria-invalid={!!errors.email}
              className="h-11"
            />
            {errors.email && (
              <p className="text-sm text-destructive" id="email-error">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2 text-left relative">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                {...register('password')}
                aria-invalid={!!errors.password}
                className="h-11 pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-destructive" id="password-error">
                {errors.password.message}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center space-x-2">
            <input type="checkbox" id="remember" className="rounded border-input text-primary focus:ring-primary h-4 w-4" />
            <label htmlFor="remember" className="font-medium cursor-pointer">Remember me</label>
          </div>
          <span className="text-slate-400">
            Forgot password? Contact Administrator
          </span>
        </div>

        <Button
          type="submit"
          className="w-full h-11 text-base font-semibold"
          disabled={isLoading}
        >
          {isLoading ? "Signing in..." : "Sign In"}
        </Button>
      </form>
    </div>
  );
}
