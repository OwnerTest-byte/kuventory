import { useQuery } from '@tanstack/react-query';
import { getMaintenanceStatus, type MaintenanceStatus } from '@/features/admin/services/maintenanceService';
import { useAuth } from '@/features/auth/context/AuthContext';

export function useMaintenanceStatus() {
  const { role } = useAuth();
  const isSuperUser = role === 'SUPER_ADMIN';

  const { data: maintenance = {
    status: 'NORMAL' as const,
    locked: false,
    reason: '',
    locked_at: null,
    locked_by: null,
  }, isLoading, refetch } = useQuery<MaintenanceStatus>({
    queryKey: ['system-maintenance-lock'],
    queryFn: getMaintenanceStatus,
    staleTime: 10000,
    refetchInterval: 30000,
  });

  // Emergency lockdown applies to all non-Super Admin users
  const isEnforced = maintenance.locked && !isSuperUser;

  return {
    maintenance,
    isLocked: maintenance.locked,
    isEnforced,
    isSuperUser,
    isLoading,
    refetch,
  };
}
