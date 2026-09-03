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
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col items-center">
        <img src="/logo-transparent.png" alt="KUVENTORY" className="h-14 w-auto drop-shadow-sm" />
      </div>
      <LoginForm />
    </div>
  );
}
