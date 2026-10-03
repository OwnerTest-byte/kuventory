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

  // Redirect role-specifically if already logged in (Admin / Master Admin -> Dashboard, Staff -> Daily Inventory)
  if (session) {
    const landingPath = (role === 'ADMIN' || role === 'MASTER_ADMIN') ? '/inventory' : '/daily-inventory';
    return <Navigate to={landingPath} replace />;
  }

  return (
    <main id="main-content" className="flex min-h-screen min-h-[100dvh] w-full overflow-y-auto bg-background login-container safe-top safe-bottom">
      {/* Left Branding Panel (Hidden on mobile) */}
      <aside aria-label="Brand Overview" className="hidden lg:flex lg:w-1/2 flex-col justify-between items-center bg-[#1F1816] text-[#FAF7F2] p-12 relative overflow-hidden border-r border-[#2E2320]">
        {/* Subtle warm artisanal ambient backdrop */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#3A2A24]/40 via-transparent to-transparent pointer-events-none" />

        <div className="w-full flex items-center justify-start z-10">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#2A201C] border border-[#3E302A] text-xs font-semibold text-[#DFB748]">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
            Kape Uno Bistro · Operations Portal
          </div>
        </div>
        
        <div className="relative z-10 flex flex-col items-center gap-6 text-center my-auto">
          <div className="w-32 h-32 rounded-3xl bg-[#2A201C] border border-[#3E302A] p-4 flex items-center justify-center shadow-2xl">
            <img 
              src="/pics/logo-transparent.png" 
              alt="KUVENTORY Logo" 
              width={200}
              height={160}
              className="h-24 w-auto object-contain drop-shadow" 
              onError={(e) => { e.currentTarget.style.display = 'none'; }} 
            />
          </div>
          <div>
            <span className="text-xs uppercase tracking-[0.25em] font-bold text-[#C5A059] block mb-2">
              Artisanal Coffee & Kitchen
            </span>
            <h1 className="text-4xl font-serif font-black tracking-tight text-[#FAF7F2]">
              KUVENTORY
            </h1>
            <p className="text-base text-[#D5CEC5] mt-2 font-medium">
              Enterprise Inventory Management System
            </p>
            <p className="text-xs italic text-[#A89E93] mt-1 font-serif">
              "Keep track. Keep it fresh."
            </p>
          </div>
        </div>

        <footer aria-label="Site Information Desktop" className="relative z-10 flex flex-col items-center gap-2 text-xs text-[#8C8075]">
          <div>&copy; {new Date().getFullYear()} Kape Uno Bistro · KUVENTORY. All rights reserved.</div>
          <nav aria-label="Legal Desktop" className="flex items-center gap-6 text-[#A89E93]">
            <button 
              type="button"
              onClick={() => setLegalType('privacy')} 
              className="hover:text-[#FAF7F2] transition-colors underline-offset-4 hover:underline min-h-[48px] min-w-[48px] px-3 py-3 flex items-center cursor-pointer"
            >
              Privacy Policy
            </button>
            <span aria-hidden="true">•</span>
            <button 
              type="button"
              onClick={() => setLegalType('terms')} 
              className="hover:text-[#FAF7F2] transition-colors underline-offset-4 hover:underline min-h-[48px] min-w-[48px] px-3 py-3 flex items-center cursor-pointer"
            >
              Terms of Service
            </button>
          </nav>
        </footer>
      </aside>

      {/* Right Login Panel */}
      <section aria-label="Authentication" className="flex-1 flex flex-col justify-between items-center px-4 sm:px-6 lg:px-8 bg-background relative z-10 py-6 sm:py-12 w-full min-h-[100dvh] overflow-y-auto">
        <div className="w-full flex-1 flex flex-col items-center justify-center my-auto max-w-md">
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
          
          <div className="w-full bg-card p-6 sm:p-8 rounded-xl shadow-sm border border-border">
            <LoginForm />
          </div>
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
