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

  // Redirect to dashboard if already logged in
  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col items-center">
        {/* Placeholder for Logo */}
        <div className="h-12 w-12 rounded-lg bg-blue-600 flex items-center justify-center mb-4 shadow-sm">
          <span className="text-white font-bold text-xl">K</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          KUVENTORY
        </h1>
      </div>
      <LoginForm />
    </div>
  );
}
