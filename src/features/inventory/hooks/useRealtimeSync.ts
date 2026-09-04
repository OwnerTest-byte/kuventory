import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Channel for real-time inventory and operations updates
    const channel = supabase
      .channel('inventory-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items' },
        () => {
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
          queryClient.invalidateQueries({ queryKey: ['batches'] });
          queryClient.invalidateQueries({ queryKey: ['inventory'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_movements' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['global-stock-history'] });
          queryClient.invalidateQueries({ queryKey: ['stock-history'] });
          queryClient.invalidateQueries({ queryKey: ['inventory'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_inventory' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['daily-inventory'] });
          queryClient.invalidateQueries({ queryKey: ['reports'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_inventory_items' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['daily-inventory'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
