import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addStock, removeStock, adjustStock } from '../api';
import { inventoryKeys } from './useInventory';

export function useStockMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
  };

  const add = useMutation({
    mutationFn: addStock,
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: removeStock,
    onSuccess: invalidate,
  });

  const adjust = useMutation({
    mutationFn: adjustStock,
    onSuccess: invalidate,
  });

  return { add, remove, adjust };
}
