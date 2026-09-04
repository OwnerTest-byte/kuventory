import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';

export function LoginPage() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
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
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center bg-[#0B132B] text-white p-12 relative overflow-hidden">
        
        <div className="relative z-10 flex flex-col items-center gap-6">
          <img src="/pics/logo-transparent.png" alt="KUVENTORY Logo" className="h-48 w-auto object-contain brightness-0 invert" />
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-widest text-slate-100">KUVENTORY</h1>
            <p className="text-lg text-slate-400 mt-2 font-light">Inventory Management System</p>
          </div>
        </div>

        <div className="absolute bottom-8 text-sm text-slate-500">
          &copy; {new Date().getFullYear()} KUVENTORY. All rights reserved.
        </div>
      </div>

      {/* Right Login Panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 bg-slate-50 relative z-10">
        {/* Mobile Logo */}
        <div className="lg:hidden mb-8 flex flex-col items-center gap-2">
          <img src="/pics/logo-transparent.png" alt="Logo" className="h-16 w-auto" />
          <span className="font-bold text-2xl text-slate-900 tracking-tight">KUVENTORY</span>
        </div>
        
        <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-sm border border-slate-200">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
            <p className="text-sm text-slate-500 mt-2">Please enter your details to sign in.</p>
          </div>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
