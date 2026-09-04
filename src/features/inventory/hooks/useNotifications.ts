import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AppNotification } from '../types';

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      // For KUVENTORY, our notifications are currently global (user_id IS NULL)
      // We also could fetch notifications for this user specifically.
      // So we fetch where user_id IS NULL OR user_id = auth.uid()
      // But we can just fetch all accessible to us via RLS.
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50); // Get latest 50 notifications

      if (error) {
        throw error;
      }

      return data as AppNotification[];
    },
  });
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase.rpc('mark_notification_as_read', {
        p_notification_id: notificationId
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Using secure RPC
      const { error } = await supabase.rpc('mark_all_notifications_as_read');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
