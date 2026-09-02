import { useQuery } from '@tanstack/react-query';
import { getInventory, getStockHistory } from '../api';

export const inventoryKeys = {
  all: ['inventory'] as const,
  lists: () => [...inventoryKeys.all, 'list'] as const,
  history: () => [...inventoryKeys.all, 'history'] as const,
};

export function useInventory() {
  return useQuery({
    queryKey: inventoryKeys.lists(),
    queryFn: getInventory,
  });
}

export function useStockHistory() {
  return useQuery({
    queryKey: inventoryKeys.history(),
    queryFn: getStockHistory,
  });
}
