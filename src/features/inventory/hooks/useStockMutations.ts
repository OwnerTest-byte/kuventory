import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addStock, removeStock, adjustStock } from '../api';

export function useStockMutations() {
  const queryClient = useQueryClient();

  const add = useMutation({
    mutationFn: addStock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'batches'] });
      queryClient.invalidateQueries({ queryKey: ['global-stock-batches'] });
      queryClient.invalidateQueries({ queryKey: ['global-stock-history'] });
    },
  });

  const remove = useMutation({
    mutationFn: removeStock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'batches'] });
      queryClient.invalidateQueries({ queryKey: ['global-stock-batches'] });
      queryClient.invalidateQueries({ queryKey: ['global-stock-history'] });
    },
  });

  const adjust = useMutation({
    mutationFn: adjustStock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'batches'] });
      queryClient.invalidateQueries({ queryKey: ['global-stock-batches'] });
      queryClient.invalidateQueries({ queryKey: ['global-stock-history'] });
    },
  });

  return {
    add,
    remove,
    adjust,
  };
}
