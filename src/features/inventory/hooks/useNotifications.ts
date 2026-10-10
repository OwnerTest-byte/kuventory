import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AppNotification } from '../types';

/**
 * Real-Time Notifications Hook with Zero-Latency Cache Injection
 * Automatically subscribes to Supabase Realtime changes on the notifications table,
 * applies instant in-memory cache updates, and guarantees single-channel lifecycle cleanup.
 */
export function useNotifications() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Generate unique channel instance to prevent callback collisions and subscription race conditions
    const channelName = `notifs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newNotif = payload.new as AppNotification;
            // Instant 0ms cache injection: notification appears immediately in UI
            queryClient.setQueryData<AppNotification[]>(['notifications'], (old: AppNotification[] | undefined) => {
              const current = old || [];
              if (current.some((n: AppNotification) => n.id === newNotif.id)) return current;
              return [newNotif, ...current];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedNotif = payload.new as AppNotification;
            queryClient.setQueryData<AppNotification[]>(['notifications'], (old: AppNotification[] | undefined) => {
              const current = old || [];
              return current.map((n: AppNotification) => (n.id === updatedNotif.id ? { ...n, ...updatedNotif } : n));
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any)?.id;
            if (deletedId) {
              queryClient.setQueryData<AppNotification[]>(['notifications'], (old: AppNotification[] | undefined) => {
                const current = old || [];
                return current.filter((n: AppNotification) => n.id !== deletedId);
              });
            }
          }

          // Background sync to ensure parity with database constraints
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        throw error;
      }

      return data as AppNotification[];
    },
    staleTime: 1000 * 30, // 30 seconds fresh; realtime events handle instantaneous updates
  });
}

/**
 * Optimistically marks a single notification as read on the frontend
 * for instantaneous UI updates while the backend resolves.
 */
export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

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

      // 2. Snapshot previous value for rollback
      const previousNotifications = queryClient.getQueryData<AppNotification[]>(['notifications']);

      // 3. Optimistically set is_read = true in cache immediately
      if (previousNotifications) {
        queryClient.setQueryData<AppNotification[]>(
          ['notifications'],
          previousNotifications.map((n) =>
            n.id === notificationId ? { ...n, is_read: true } : n
          )
        );
      }

      return { previousNotifications };
    },
    onError: (_err, _notificationId, context) => {
      // Rollback to previous state on failure
      if (context?.previousNotifications) {
        queryClient.setQueryData(['notifications'], context.previousNotifications);
      }
    },
    onSettled: () => {
      // Re-sync with backend
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/**
 * Optimistically marks all notifications as read across the UI instantaneously.
 */
export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_all_notifications_as_read');
      if (error) throw error;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });

      const previousNotifications = queryClient.getQueryData<AppNotification[]>(['notifications']);

      if (previousNotifications) {
        queryClient.setQueryData<AppNotification[]>(
          ['notifications'],
          previousNotifications.map((n) => ({ ...n, is_read: true }))
        );
      }

      return { previousNotifications };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(['notifications'], context.previousNotifications);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
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
