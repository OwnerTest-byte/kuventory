import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { dailyInventoryKeys } from '@/features/daily-inventory/hooks/useDailyInventory';
import { useAuth } from '@/features/auth/context/AuthContext';

export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    // Only subscribe to real-time events for authenticated sessions
    if (!user) return;

    // Channel for real-time inventory and operations updates
    const channelName = `realtime-sync-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
          queryClient.invalidateQueries({ queryKey: ['inventory'] });
          queryClient.invalidateQueries({ queryKey: ['items'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_batches' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['global-stock-batches'] });
          queryClient.invalidateQueries({ queryKey: ['expiring-batches'] });
          queryClient.invalidateQueries({ queryKey: ['active-expiring-batches'] });
          queryClient.invalidateQueries({ queryKey: ['active-expired-batches'] });
          queryClient.invalidateQueries({ queryKey: ['batches'] });
          queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
          queryClient.invalidateQueries({ queryKey: ['inventory'] });
          queryClient.invalidateQueries({ queryKey: ['items'] });
          queryClient.invalidateQueries({ queryKey: ['item'] });
          queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.all });
          queryClient.invalidateQueries({ queryKey: ['daily-inventory'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_movements' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['global-stock-history'] });
          queryClient.invalidateQueries({ queryKey: ['stock-history'] });
          queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
          queryClient.invalidateQueries({ queryKey: ['inventory'] });
          queryClient.invalidateQueries({ queryKey: ['items'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newNotif = payload.new as any;
            queryClient.setQueryData<any[]>(['notifications'], (old: any[] | undefined) => {
              const current = old || [];
              if (current.some((n: any) => n.id === newNotif.id)) return current;
              return [newNotif, ...current];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedNotif = payload.new as any;
            queryClient.setQueryData<any[]>(['notifications'], (old: any[] | undefined) => {
              const current = old || [];
              return current.map((n: any) => (n.id === updatedNotif.id ? { ...n, ...updatedNotif } : n));
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any)?.id;
            if (deletedId) {
              queryClient.setQueryData<any[]>(['notifications'], (old: any[] | undefined) => {
                const current = old || [];
                return current.filter((n: any) => n.id !== deletedId);
              });
            }
          }
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_inventory' },
        () => {
          queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.all });
          queryClient.invalidateQueries({ queryKey: ['daily-inventory'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_inventory_items' },
        () => {
          queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.all });
          queryClient.invalidateQueries({ queryKey: ['daily-inventory'] });
          queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
          queryClient.invalidateQueries({ queryKey: ['inventory'] });
          queryClient.invalidateQueries({ queryKey: ['items'] });
          queryClient.invalidateQueries({ queryKey: ['batches'] });
          queryClient.invalidateQueries({ queryKey: ['global-stock-batches'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['categories'] });
          queryClient.invalidateQueries({ queryKey: ['dailyInventory'] });
          queryClient.invalidateQueries({ queryKey: ['daily-inventory'] });
          queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
          queryClient.invalidateQueries({ queryKey: ['inventory'] });
          queryClient.invalidateQueries({ queryKey: ['items'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['profile'] });
          queryClient.invalidateQueries({ queryKey: ['profiles'] });
          queryClient.invalidateQueries({ queryKey: ['user-roles'] });
          queryClient.invalidateQueries({ queryKey: ['user-list'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_user_sessions' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
          queryClient.invalidateQueries({ queryKey: ['active-user-sessions'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'audit_logs' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
          queryClient.invalidateQueries({ queryKey: ['system-audit-logs'] });
          queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['system-settings'] });
          queryClient.invalidateQueries({ queryKey: ['system_setting'] });
          queryClient.invalidateQueries({ queryKey: ['system-maintenance-lock'] });
          queryClient.invalidateQueries({ queryKey: ['super-automations'] });
          queryClient.invalidateQueries({ queryKey: ['super-deployments'] });
          queryClient.invalidateQueries({ queryKey: ['super-incidents'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_session_leases' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['active-session-leases'] });
          queryClient.invalidateQueries({ queryKey: ['user-session-leases'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recovery_points' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['recovery-points'] });
          queryClient.invalidateQueries({ queryKey: ['super-recovery-points'] });
        }
      )
      .subscribe();

    // Missed-event reconciliation on network recovery and tab visibility regain
    const handleReconcile = () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['global-stock-batches'] });
      queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: ['daily-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleReconcile();
      }
    };

    window.addEventListener('online', handleReconcile);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleReconcile);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [queryClient, user]);
}
