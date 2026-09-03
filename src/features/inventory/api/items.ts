import { supabase } from '@/lib/supabase';
import type { InventoryItem } from '../types';

export async function getItems(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .order('name');
    
  if (error) throw error;
  return data as InventoryItem[];
}

export async function createItem(item: Omit<InventoryItem, 'id' | 'is_active' | 'is_archived'>): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from('inventory_items')
    .insert([{ ...item }])
    .select()
    .single();

  if (error) throw error;
  return data as InventoryItem;
}

export async function updateItem(id: string, updates: Partial<Omit<InventoryItem, 'id'>>): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from('inventory_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as InventoryItem;
}

export async function archiveItem(id: string, isArchived: boolean): Promise<void> {
  const { error } = await supabase
    .from('inventory_items')
    .update({ is_archived: isArchived })
    .eq('id', id);

  if (error) throw error;
}
