import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AppNotification } from '../types';
import { useAuth } from '@/features/auth/context/AuthContext';
import { filterAuthorizedNotifications } from '../utils/notificationSecurity';

/**
 * Real-Time Notifications Hook with Zero-Trust Security Scoping
 * Scoped to active user and role to prevent cross-account cache leakage,
 * applies defense-in-depth authorization filtering, and invalidates on auth changes.
 */
export function useNotifications() {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ['notifications', user?.id, role],
    queryFn: async () => {
      if (!user) return [] as AppNotification[];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        throw error;
      }

      // Enforce zero-trust client filtering in addition to database RLS
      return filterAuthorizedNotifications(data as AppNotification[], user.id, role);
    },
    enabled: !!user,
    staleTime: 1000 * 30, // 30 seconds fresh; realtime events handle instantaneous updates
  });
}

/**
 * Optimistically marks a single notification as read on the frontend
 * for instantaneous UI updates while the backend resolves.
 */
export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase.rpc('mark_notification_as_read', {
        p_notification_id: notificationId,
      });

      if (error) throw error;
    },
    onMutate: async (notificationId: string) => {
      // 1. Cancel any outgoing refetches so they don't overwrite optimistic update
      await queryClient.cancelQueries({ queryKey: ['notifications'] });

      const scopedKey = ['notifications', user?.id, role];

      // 2. Snapshot previous value for rollback
      const previousNotifications = 
        queryClient.getQueryData<AppNotification[]>(scopedKey) ||
        queryClient.getQueryData<AppNotification[]>(['notifications']);

      // 3. Optimistically set is_read = true in cache immediately
      if (previousNotifications) {
        const updater = (prev: AppNotification[] | undefined) =>
          prev ? prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)) : [];

        queryClient.setQueryData<AppNotification[]>(scopedKey, updater);
        queryClient.setQueryData<AppNotification[]>(['notifications'], updater);
      }

      return { previousNotifications };
    },
    onError: (_err, _notificationId, context) => {
      // Rollback to previous state on failure
      if (context?.previousNotifications) {
        queryClient.setQueryData(['notifications', user?.id, role], context.previousNotifications);
        queryClient.setQueryData(['notifications'], context.previousNotifications);
      }
    },
    onSettled: () => {
      // Re-sync with backend
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
    },
  });
}

/**
 * Optimistically marks all authorized notifications as read across the UI instantaneously.
 */
export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_all_notifications_as_read');
      if (error) throw error;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });

      const scopedKey = ['notifications', user?.id, role];
      const previousNotifications = 
        queryClient.getQueryData<AppNotification[]>(scopedKey) ||
        queryClient.getQueryData<AppNotification[]>(['notifications']);

      if (previousNotifications) {
        const updater = (prev: AppNotification[] | undefined) =>
          prev ? prev.map((n) => ({ ...n, is_read: true })) : [];

        queryClient.setQueryData<AppNotification[]>(scopedKey, updater);
        queryClient.setQueryData<AppNotification[]>(['notifications'], updater);
      }

      return { previousNotifications };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(['notifications', user?.id, role], context.previousNotifications);
        queryClient.setQueryData(['notifications'], context.previousNotifications);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
    },
  });
}

/**
 * Returns the count of unread notifications reactively.
 */
export function useUnreadNotificationsCount(): number {
  const { data: notifications = [] } = useNotifications();
  return notifications.filter((n) => !n.is_read).length;
}
