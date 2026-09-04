import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  lead_time_days: number;
  payment_terms: string;
  notes: string;
  is_active: boolean;
  created_at: string;
}

/**
 * Fetch all registered suppliers.
 */
export async function getSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('getSuppliers error:', error);
    throw error;
  }

  return (data || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    contact_person: s.contact_person || '',
    phone: s.phone || '',
    email: s.email || '',
    address: s.address || '',
    lead_time_days: Number(s.lead_time_days || 1),
    payment_terms: s.payment_terms || 'COD',
    notes: s.notes || '',
    is_active: s.is_active !== false,
    created_at: s.created_at,
  }));
}

/**
 * Hook to retrieve suppliers.
 */
export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: getSuppliers,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook for supplier mutations.
 */
export function useSupplierMutations() {
  const queryClient = useQueryClient();

  const createSupplier = useMutation({
    mutationFn: async (supplier: Omit<Supplier, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('suppliers')
        .insert(supplier)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  const updateSupplier = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Supplier> & { id: string }) => {
      const { data, error } = await supabase
        .from('suppliers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  const deleteSupplier = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  return {
    createSupplier,
    updateSupplier,
    deleteSupplier,
  };
}
