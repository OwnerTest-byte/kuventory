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
      <main id="main-content" className="flex h-screen items-center justify-center bg-background safe-top safe-bottom">
        <div className="text-muted-foreground font-medium">Loading...</div>
      </main>
    );
  }

  // Redirect role-specifically if already logged in (Admin -> Dashboard, Staff -> Daily Inventory)
  if (session) {
    const landingPath = role === 'ADMIN' ? '/inventory' : '/daily-inventory';
    return <Navigate to={landingPath} replace />;
  }

  return (
    <main id="main-content" className="flex min-h-screen bg-background login-container safe-top safe-bottom">
      {/* Left Branding Panel (Hidden on mobile) */}
      <aside aria-label="Brand Overview" className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center bg-slate-950 text-white p-12 relative overflow-hidden">
        
        <div className="relative z-10 flex flex-col items-center gap-6">
          <img 
            src="/pics/logo-transparent.png" 
            alt="KUVENTORY Logo" 
            width={240}
            height={192}
            className="h-48 w-auto object-contain" 
            onError={(e) => { e.currentTarget.style.display = 'none'; }} 
          />
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-widest text-slate-100">KUVENTORY</h1>
            <p className="text-lg text-slate-300 mt-2 font-light">Inventory Management System</p>
          </div>
        </div>

        <footer aria-label="Site Information Desktop" className="absolute bottom-8 flex flex-col items-center gap-2 text-xs text-slate-300">
          <div>&copy; {new Date().getFullYear()} KUVENTORY. All rights reserved.</div>
          <nav aria-label="Legal Desktop" className="flex items-center gap-6 text-slate-200">
            <button 
              type="button"
              onClick={() => setLegalType('privacy')} 
              className="hover:text-white transition-colors underline-offset-4 hover:underline min-h-[48px] min-w-[48px] px-3 py-3 flex items-center cursor-pointer"
            >
              Privacy Policy
            </button>
            <span aria-hidden="true">•</span>
            <button 
              type="button"
              onClick={() => setLegalType('terms')} 
              className="hover:text-white transition-colors underline-offset-4 hover:underline min-h-[48px] min-w-[48px] px-3 py-3 flex items-center cursor-pointer"
            >
              Terms of Service
            </button>
          </nav>
        </footer>
      </aside>

      {/* Right Login Panel */}
      <section aria-label="Authentication" className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 bg-background relative z-10 pt-16 pb-8 sm:py-12">
        {/* Mobile Logo & Heading */}
        <div className="lg:hidden mb-6 flex flex-col items-center gap-2">
          <img 
            src="/pics/logo-icon.png" 
            alt="KUVENTORY Icon" 
            width={64}
            height={64}
            className="h-16 w-auto object-contain" 
            onError={(e) => { e.currentTarget.style.display = 'none'; }} 
          />
          <h1 className="font-bold text-2xl text-foreground tracking-tight">KUVENTORY</h1>
          <p className="text-sm text-muted-foreground font-medium">Inventory Management System</p>
        </div>
        
        <div className="w-full max-w-md bg-card p-6 sm:p-8 rounded-xl shadow-sm border border-border">
          <LoginForm />
        </div>

        <footer aria-label="Site Information Mobile" className="lg:hidden mt-8 flex flex-col items-center gap-2 text-xs text-slate-600 dark:text-slate-300 font-medium">
          <div>&copy; {new Date().getFullYear()} KUVENTORY. All rights reserved.</div>
          <nav aria-label="Legal Mobile" className="flex items-center gap-6">
            <button 
              type="button"
              onClick={() => setLegalType('privacy')} 
              className="hover:text-foreground text-slate-700 dark:text-slate-200 transition-colors underline-offset-4 hover:underline min-h-[48px] min-w-[48px] px-3 py-3 flex items-center cursor-pointer"
            >
              Privacy Policy
            </button>
            <span aria-hidden="true">•</span>
            <button 
              type="button"
              onClick={() => setLegalType('terms')} 
              className="hover:text-foreground text-slate-700 dark:text-slate-200 transition-colors underline-offset-4 hover:underline min-h-[48px] min-w-[48px] px-3 py-3 flex items-center cursor-pointer"
            >
              Terms of Service
            </button>
          </nav>
        </footer>
      </section>

      <LegalModal type={legalType} onClose={() => setLegalType(null)} />
    </main>
  );
}
