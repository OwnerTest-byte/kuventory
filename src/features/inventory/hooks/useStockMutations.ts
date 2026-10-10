import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addStock, removeStock, adjustStock } from '../api';

export function useStockMutations() {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['items'] });
    queryClient.invalidateQueries({ queryKey: ['item'] });
    queryClient.invalidateQueries({ queryKey: ['batches'] });
    queryClient.invalidateQueries({ queryKey: ['inventory', 'batches'] });
    queryClient.invalidateQueries({ queryKey: ['global-stock-batches'] });
    queryClient.invalidateQueries({ queryKey: ['global-stock-history'] });
    queryClient.invalidateQueries({ queryKey: ['expiring-batches'] });
    queryClient.invalidateQueries({ queryKey: ['active-expiring-batches'] });
    queryClient.invalidateQueries({ queryKey: ['active-expired-batches'] });
    queryClient.invalidateQueries({ queryKey: ['dailyInventory'] });
    queryClient.invalidateQueries({ queryKey: ['daily-inventory'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
  };

  const add = useMutation({
    mutationFn: addStock,
    onSuccess: invalidateAll,
  });

  const remove = useMutation({
    mutationFn: removeStock,
    onSuccess: invalidateAll,
  });

  const adjust = useMutation({
    mutationFn: adjustStock,
    onSuccess: invalidateAll,
  });

  return {
    add,
    remove,
    adjust,
  };
}
