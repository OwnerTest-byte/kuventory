import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { LegalModal } from '@/components/common/LegalModal';

export function LoginPage() {
  const { session, role, isLoading } = useAuth();
  const [legalType, setLegalType] = useState<'privacy' | 'terms' | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Redirect role-specifically if already logged in (Admin -> Dashboard, Staff -> Daily Inventory)
  if (session) {
    const landingPath = role === 'ADMIN' ? '/inventory' : '/daily-inventory';
    return <Navigate to={landingPath} replace />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left Branding Panel (Hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center bg-slate-950 text-white p-12 relative overflow-hidden">
        
        <div className="relative z-10 flex flex-col items-center gap-6">
          <img src="/pics/logo-transparent.png" alt="KUVENTORY Logo" className="h-48 w-auto object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-widest text-slate-100">KUVENTORY</h1>
            <p className="text-lg text-slate-400 mt-2 font-light">Inventory Management System</p>
          </div>
        </div>

        <div className="absolute bottom-8 flex flex-col items-center gap-2 text-xs text-slate-500">
          <div>&copy; {new Date().getFullYear()} KUVENTORY. All rights reserved.</div>
          <div className="flex items-center gap-4 text-slate-400">
            <button onClick={() => setLegalType('privacy')} className="hover:text-white transition-colors underline-offset-4 hover:underline">Privacy Policy</button>
            <span>•</span>
            <button onClick={() => setLegalType('terms')} className="hover:text-white transition-colors underline-offset-4 hover:underline">Terms of Service</button>
          </div>
        </div>
      </div>

      {/* Right Login Panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 bg-background relative z-10 py-12">
        {/* Mobile Logo */}
        <div className="lg:hidden mb-8 flex flex-col items-center gap-2">
          <img src="/pics/logo-icon.png" alt="Logo" className="h-16 w-auto" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span className="font-bold text-2xl text-foreground tracking-tight">KUVENTORY</span>
        </div>
        
        <div className="w-full max-w-md bg-card p-8 rounded-xl shadow-sm border border-border">
          <LoginForm />
        </div>

        <div className="lg:hidden mt-8 flex flex-col items-center gap-2 text-xs text-muted-foreground">
          <div>&copy; {new Date().getFullYear()} KUVENTORY. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <button onClick={() => setLegalType('privacy')} className="hover:text-foreground transition-colors underline-offset-4 hover:underline">Privacy Policy</button>
            <span>•</span>
            <button onClick={() => setLegalType('terms')} className="hover:text-foreground transition-colors underline-offset-4 hover:underline">Terms of Service</button>
          </div>
        </div>
      </div>

      <LegalModal type={legalType} onClose={() => setLegalType(null)} />
    </div>
  );
}
