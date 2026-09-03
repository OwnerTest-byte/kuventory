import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';

export function LoginPage() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  // Redirect to inventory if already logged in
  if (session) {
    return <Navigate to="/inventory" replace />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Left Branding Panel (Hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-[#0f172a] text-white p-12 relative overflow-hidden">
        {/* Background Pattern/Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-800 z-0 opacity-50" />
        
        <div className="relative z-10 flex items-center gap-3">
          <img src="/logo-transparent.png" alt="Logo" className="h-10 w-auto brightness-0 invert" />
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center flex-1 py-12">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4 tracking-tight">INVENTORY KIOSK AND BODEGA</h1>
            <p className="text-xl text-slate-400">Inventory Management System</p>
          </div>
          
          {/* Placeholder for the store illustration shown in mockup */}
          <div className="w-full max-w-md bg-slate-800/50 rounded-xl p-8 border border-slate-700 backdrop-blur-sm shadow-2xl flex items-center justify-center aspect-video">
            <img src="/logo-transparent.png" alt="Illustration placeholder" className="h-32 opacity-20 brightness-0 invert" />
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-sm text-slate-500">
            &copy; 2025 KUVENTORY. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right Login Panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 bg-white relative z-10">
        {/* Mobile Logo */}
        <div className="lg:hidden mb-8 flex items-center gap-2">
          <img src="/logo-icon.png" alt="Logo" className="h-10 w-auto" />
          <span className="font-bold text-2xl text-slate-900 tracking-tight">KUVENTORY</span>
        </div>
        
        <LoginForm />
      </div>
    </div>
  );
}
