import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useMaintenanceStatus } from '../hooks/useMaintenanceStatus';
import { EmergencyMaintenanceScreen } from '@/components/common/EmergencyMaintenanceScreen';

export function RequireAuth() {
  const { session, isLoading } = useAuth();
  const { isEnforced, maintenance, refetch } = useMaintenanceStatus();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground font-medium">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Emergency Maintenance Backend/Frontend Lockdown Gate
  if (isEnforced) {
    return <EmergencyMaintenanceScreen maintenance={maintenance} onRefresh={refetch} />;
  }

  return <Outlet />;
}

export function RequireAdmin() {
  const { session, role, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground font-medium">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN' && role !== 'MASTER_ADMIN') {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background px-4">
        <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
        <p className="text-muted-foreground text-center max-w-md">
          You do not have the required permissions to view this page. If you believe this is an error, please contact your administrator.
        </p>
      </div>
    );
  }

  return <Outlet />;
}

export function RequireSuperAdmin() {
  const { session, role, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground font-medium">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isSuperUser = role === 'SUPER_ADMIN' || role === 'MASTER_ADMIN';
  if (!isSuperUser) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background px-4">
        <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Super Admin authorization required.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
