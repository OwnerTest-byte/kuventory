import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchOrCreateDailyInventory, updateDailyInventoryItem, finalizeDailyInventory } from '../api';
import { useAuth } from '@/features/auth/context/AuthContext';

export const dailyInventoryKeys = {
  all: ['dailyInventory'] as const,
  date: (date: string) => [...dailyInventoryKeys.all, date] as const,
};

export function useDailyInventory(date: string) {
  return useQuery({
    queryKey: dailyInventoryKeys.date(date),
    queryFn: () => fetchOrCreateDailyInventory(date),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useUpsertDailyItem(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateDailyInventoryItem,
    onSuccess: (updatedItem) => {
      queryClient.setQueryData(dailyInventoryKeys.date(date), (oldData: any) => {
        if (!oldData || !oldData.daily_inventory_entries) return oldData;
        return {
          ...oldData,
          daily_inventory_entries: oldData.daily_inventory_entries.map((item: any) =>
            item.id === updatedItem.id ? { ...item, ...updatedItem } : item
          )
        };
      });
    },
  });
}

export function useFinalizeDailyInventory(date: string) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: (sessionId: string) => finalizeDailyInventory(sessionId, profile?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.date(date) });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}
