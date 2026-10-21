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
    onSuccess: (newItem, variables) => {
      // Targeted cache invalidation
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['global-stock-batches'] });
      queryClient.invalidateQueries({ queryKey: ['today-inventory-session'] });
      queryClient.invalidateQueries({ queryKey: ['dailyInventory'] });
      queryClient.invalidateQueries({ queryKey: ['daily-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
      queryClient.setQueryData(['item', newItem.id], newItem);

      // Real-time zero-latency toast notification if initial stock is at or below minimum threshold
      if (typeof window !== 'undefined') {
        const minQty = Math.max(0, Number(variables.min_quantity ?? 0));
        const initialQty = Math.max(0, Number(variables.initial_quantity ?? 0));
        if (minQty > 0 && initialQty <= minQty) {
          const isOos = initialQty === 0;
          const type = isOos ? 'OUT_OF_STOCK' : 'LOW_STOCK';
          const title = isOos ? `Out of Stock: ${variables.item_name}` : `Low Stock: ${variables.item_name}`;
          const message = isOos
            ? `${variables.item_name} has completely run out of stock.`
            : `${variables.item_name} is below the minimum threshold of ${minQty} (Current: ${initialQty}).`;

          window.dispatchEvent(
            new CustomEvent('kuventory:show-toast', {
              detail: {
                id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                type,
                title,
                message,
                item_id: newItem.id,
                is_read: false,
                created_at: new Date().toISOString(),
              },
            })
          );
        }
      }
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
