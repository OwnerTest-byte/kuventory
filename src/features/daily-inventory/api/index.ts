import { supabase } from '@/lib/supabase';
import type { DailyInventory } from '../types';

export async function fetchOrCreateDailyInventory(date: string): Promise<DailyInventory> {
  // First, call the RPC to ensure a draft exists and items are populated
  // If it's already finalized, the RPC simply returns the existing ID
  const { error: rpcError } = await supabase.rpc('create_daily_inventory_draft', {
    p_target_date: date
  });

  if (rpcError) throw rpcError;

  // Then fetch the full record with all items
  const { data, error } = await supabase
    .from('daily_inventory')
    .select(`
      *,
      daily_inventory_items (
        *,
        inventory_items (
          name,
          unit,
          categories ( name )
        )
      )
    `)
    .eq('inventory_date', date)
    .single();

  if (error) throw error;
  
  // Sort items logically by category then name
  if (data && data.daily_inventory_items) {
    data.daily_inventory_items.sort((a: any, b: any) => {
      const catA = a.inventory_items?.categories?.name || '';
      const catB = b.inventory_items?.categories?.name || '';
      if (catA < catB) return -1;
      if (catA > catB) return 1;
      const nameA = a.inventory_items?.name || '';
      const nameB = b.inventory_items?.name || '';
      return nameA.localeCompare(nameB);
    });
  }

  return data as DailyInventory;
}

export async function updateDailyInventoryItem(
  params: { id: string; beg: number; add?: number; am: number; pm: number }
): Promise<any> {
  const payload: any = { beg: params.beg, am: params.am, pm: params.pm };
  if (params.add !== undefined) {
    payload.add = params.add;
  }

  const { data, error } = await supabase
    .from('daily_inventory_items')
    .update(payload)
    .eq('id', params.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function finalizeDailyInventory(id: string): Promise<void> {
  const { error } = await supabase.rpc('finalize_daily_inventory', {
    p_daily_inventory_id: id
  });

  if (error) throw error;
}
