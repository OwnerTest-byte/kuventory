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
    <main id="main-content" className="flex min-h-screen min-h-[100dvh] w-full bg-background login-container">
      {/* Left Branding Panel (Desktop & Laptop) */}
      <aside aria-label="Brand Overview" className="hidden lg:flex lg:w-1/2 flex-col justify-between items-center bg-[#1F1816] text-[#FAF7F2] p-8 xl:p-12 relative overflow-hidden border-r border-[#2E2320]">
        {/* Subtle warm artisanal ambient backdrop */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#3A2A24]/50 via-transparent to-transparent pointer-events-none" />

        <div className="w-full flex items-center justify-between z-10">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#2A201C] border border-[#3E302A] text-xs font-semibold text-[#DFB748]">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
            Kape Uno Bistro · Operations Portal
          </div>
          <span className="text-[11px] text-[#A89E93] font-medium tracking-wide">
            FEFO Certified · 2026
          </span>
        </div>
        
        <div className="relative z-10 flex flex-col items-center gap-4 text-center my-auto w-full max-w-sm">
          {/* Brand Emblem - Kape Uno Official Logo */}
          <div className="relative group">
            <div className="w-36 h-36 rounded-3xl overflow-hidden border-2 border-[#D4AF37]/60 shadow-2xl ring-4 ring-[#D4AF37]/20 bg-[#FAF7F2] flex items-center justify-center p-3 transition-transform duration-300 group-hover:scale-105">
              <img 
                src="/pics/logo-original.png" 
                alt="Kape Uno Bistro Logo" 
                width={144}
                height={144}
                className="w-full h-full object-contain" 
                onError={(e) => { 
                  // Fallback to transparent logo if original fails to load
                  e.currentTarget.src = '/pics/logo-transparent.png'; 
                }} 
              />
            </div>
          </div>

          <div>
            <h1 className="text-3xl xl:text-4xl font-serif font-black tracking-tight text-[#FAF7F2]">
              KUVENTORY
            </h1>
            <p className="text-xs text-[#D5CEC5] mt-1 font-medium">
              Enterprise Inventory Management System
            </p>
          </div>
        </div>

        <footer aria-label="Site Information Desktop" className="relative z-10 flex flex-col items-center gap-2 text-xs text-[#8C8075]">
          <div>&copy; {new Date().getFullYear()} Kape Uno Bistro · KUVENTORY. All rights reserved.</div>
          <nav aria-label="Legal Desktop" className="flex items-center gap-6 text-[#A89E93]">
            <button 
              type="button"
              onClick={() => setLegalType('privacy')} 
              className="hover:text-[#FAF7F2] transition-colors underline-offset-4 hover:underline min-h-11 min-w-11 px-3 py-2 flex items-center cursor-pointer"
            >
              Privacy Policy
            </button>
            <span aria-hidden="true">•</span>
            <button 
              type="button"
              onClick={() => setLegalType('terms')} 
              className="hover:text-[#FAF7F2] transition-colors underline-offset-4 hover:underline min-h-11 min-w-11 px-3 py-2 flex items-center cursor-pointer"
            >
              Terms of Service
            </button>
          </nav>
        </footer>
      </aside>

      {/* Right Login Panel (Responsive: Phone, Tablet, Laptop, PC) */}
      <section 
        aria-label="Authentication" 
        className="flex-1 flex flex-col justify-between items-center px-4 sm:px-6 lg:px-8 bg-background relative z-10 py-6 sm:py-8 w-full min-h-[100dvh] login-vertical-slider"
      >
        <div className="w-full flex-1 flex flex-col items-center justify-center my-auto py-2 max-w-md">
          {/* Mobile Header: Compact & Direct */}
          <div className="lg:hidden mb-4 flex flex-col items-center gap-1.5 w-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#FAF7F2] border-2 border-[#D4AF37]/50 p-2 flex items-center justify-center shadow-md mb-0.5">
              <img 
                src="/pics/logo-original.png" 
                alt="Kape Uno Bistro Logo" 
                width={64}
                height={64}
                className="w-full h-full object-contain" 
                onError={(e) => { e.currentTarget.src = '/pics/logo-transparent.png'; }} 
              />
            </div>
            <h1 className="font-bold text-2xl text-foreground tracking-tight">KUVENTORY</h1>
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
              Kape Uno Bistro · Operations Portal
            </p>
          </div>
          
          {/* Centered Login Form Card */}
          <div className="w-full bg-card p-6 sm:p-8 rounded-2xl shadow-sm border border-border">
            <LoginForm />
          </div>
        </div>

        <footer aria-label="Site Information Mobile" className="lg:hidden mt-4 pb-2 flex flex-col items-center gap-2 text-xs text-slate-600 dark:text-slate-300 font-medium">
          <div>&copy; {new Date().getFullYear()} KUVENTORY. All rights reserved.</div>
          <nav aria-label="Legal Mobile" className="flex items-center gap-6">
            <button 
              type="button"
              onClick={() => setLegalType('privacy')} 
              className="hover:text-foreground text-slate-700 dark:text-slate-200 transition-colors underline-offset-4 hover:underline min-h-11 px-2 py-2 flex items-center cursor-pointer"
            >
              Privacy Policy
            </button>
            <span aria-hidden="true">•</span>
            <button 
              type="button"
              onClick={() => setLegalType('terms')} 
              className="hover:text-foreground text-slate-700 dark:text-slate-200 transition-colors underline-offset-4 hover:underline min-h-11 px-2 py-2 flex items-center cursor-pointer"
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
