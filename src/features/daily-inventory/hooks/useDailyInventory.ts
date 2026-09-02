import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchOrCreateDailyInventory, updateDailyInventoryItem, finalizeDailyInventory } from '../api';

export const dailyInventoryKeys = {
  all: ['dailyInventory'] as const,
  date: (date: string) => [...dailyInventoryKeys.all, date] as const,
};

export function useDailyInventory(date: string) {
  return useQuery({
    queryKey: dailyInventoryKeys.date(date),
    queryFn: () => fetchOrCreateDailyInventory(date),
    // Re-fetch when the date changes, but avoid constant background fetching
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useUpsertDailyItem(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateDailyInventoryItem,
    onSuccess: (updatedItem) => {
      queryClient.setQueryData(dailyInventoryKeys.date(date), (oldData: any) => {
        if (!oldData || !oldData.daily_inventory_items) return oldData;
        return {
          ...oldData,
          daily_inventory_items: oldData.daily_inventory_items.map((item: any) =>
            item.id === updatedItem.id ? { ...item, ...updatedItem } : item
          )
        };
      });
    },
  });
}

export function useFinalizeDailyInventory(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: finalizeDailyInventory,
    onSuccess: () => {
      // Invalidate the daily inventory
      queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.date(date) });
      // Also invalidate the live inventory since stock was consumed
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}
