import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addStock, removeStock } from '../api';

export function useStockMutations() {
  const queryClient = useQueryClient();

  const add = useMutation({
    mutationFn: addStock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'batches'] });
    },
  });

  const remove = useMutation({
    mutationFn: removeStock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'batches'] });
    },
  });

  return {
    add,
    remove,
  };
}
