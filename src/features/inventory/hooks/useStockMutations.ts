import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addStock, removeStock, adjustStock } from '../api';

export function useStockMutations() {
  const queryClient = useQueryClient();

  const invalidateForMutation = (itemId?: string) => {
    // 1. Core catalog and item totals
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['items'] });
    if (itemId) {
      queryClient.invalidateQueries({ queryKey: ['item', itemId] });
    }

    // 2. Batches and FEFO queues
    queryClient.invalidateQueries({ queryKey: ['batches'] });
    queryClient.invalidateQueries({ queryKey: ['global-stock-batches'] });

    // 3. Daily inventory sheets
    queryClient.invalidateQueries({ queryKey: ['daily-inventory'] });

    // 4. Alerts
    queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
  };

  const add = useMutation({
    mutationFn: addStock,
    onSuccess: (_, variables) => invalidateForMutation(variables.itemId),
  });

  const remove = useMutation({
    mutationFn: removeStock,
    onSuccess: (_, variables) => invalidateForMutation(variables.itemId),
  });

  const adjust = useMutation({
    mutationFn: adjustStock,
    onSuccess: (_, variables) => invalidateForMutation(variables.itemId),
  });

  return {
    add,
    remove,
    adjust,
  };
}
