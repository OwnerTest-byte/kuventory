import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createItem, createItemWithInitialStock } from '../api';
import type { InventoryItem } from '../types';

export function useCreateItem() {
  const queryClient = useQueryClient();

  const createWithStockMutation = useMutation({
    mutationFn: (params: {
      item_name: string;
      category_id: string;
      unit: string;
      initial_quantity: number;
      expiry_date: string;
      item_code?: string;
      description?: string;
      unit_cost?: number;
      min_quantity?: number;
      supplier_a?: string;
      supplier_b?: string;
      image_path?: string | null;
    }) => createItemWithInitialStock(params),
    onSuccess: (newItem) => {
      // Targeted cache invalidation
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['global-stock-batches'] });
      queryClient.invalidateQueries({ queryKey: ['today-inventory-session'] });
      queryClient.invalidateQueries({ queryKey: ['dailyInventory'] });
      queryClient.invalidateQueries({ queryKey: ['daily-inventory'] });
      queryClient.setQueryData(['item', newItem.id], newItem);
    },
  });

  const createMasterOnlyMutation = useMutation({
    mutationFn: (data: Omit<InventoryItem, 'id' | 'is_archived' | 'created_at' | 'updated_at' | 'current_qty'>) =>
      createItem(data),
    onSuccess: (newItem) => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.setQueryData(['item', newItem.id], newItem);
    },
  });

  return {
    createItemWithStock: createWithStockMutation.mutateAsync,
    isCreatingWithStock: createWithStockMutation.isPending,
    createItem: createMasterOnlyMutation.mutateAsync,
    isCreating: createMasterOnlyMutation.isPending,
  };
}
