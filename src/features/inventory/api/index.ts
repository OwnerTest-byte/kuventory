import { supabase } from '@/lib/supabase';
import type { InventoryItem, StockBatch, StockTransaction } from '../types';

/**
 * Fetch all inventory items.
 */
export async function getInventory(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('items')
    .select(`
      *,
      categories(name)
    `)
    .order('item_name');

  if (error) throw error;
  
  return data.map(item => ({
    ...item,
    category_name: item.categories?.name
  })) as InventoryItem[];
}

/**
 * Fetch all stock batches for a specific inventory item.
 */
export async function getBatches(itemId: string): Promise<StockBatch[]> {
  const { data, error } = await supabase
    .from('stock_batches')
    .select('*')
    .eq('item_id', itemId)
    .order('expiry_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as StockBatch[];
}

/**
 * Add physical stock via standard insert.
 * Wait, the backend doesn't have `add_stock` RPC anymore? We need to implement it in JS or recreate the RPC.
 * Actually, doing it via Supabase client is fine since it's just table inserts.
 */
export async function addStock(params: {
  itemId: string;
  quantity: number;
  expiryDate?: string | null;
  receivedDate?: string;
  reason: string;
  userId?: string;
}): Promise<void> {
  // We need to:
  // 1. Get current item balance
  const { data: item } = await supabase.from('items').select('current_qty').eq('id', params.itemId).single();
  const previousBalance = item?.current_qty || 0;
  const newBalance = previousBalance + params.quantity;

  // 2. Create batch
  const { data: batch, error: batchError } = await supabase.from('stock_batches').insert({
    item_id: params.itemId,
    batch_code: `BATCH-${Date.now()}`,
    quantity: params.quantity,
    initial_quantity: params.quantity,
    expiry_date: params.expiryDate || '2099-12-31'
  }).select().single();

  if (batchError) throw batchError;

  // 3. Create transaction
  const { error: txError } = await supabase.from('stock_transactions').insert({
    item_id: params.itemId,
    user_id: params.userId,
    action_type: 'ADD',
    quantity: params.quantity,
    previous_balance: previousBalance,
    new_balance: newBalance,
    batch_id: batch.id,
    reason: params.reason
  });

  if (txError) throw txError;

  // 4. Update item current_qty
  const { error: updateError } = await supabase.from('items')
    .update({ current_qty: newBalance })
    .eq('id', params.itemId);

  if (updateError) throw updateError;
}

/**
 * Remove stock using FEFO in JavaScript.
 */
export async function removeStock(params: {
  itemId: string;
  quantity: number;
  reason: string;
  userId?: string;
}): Promise<void> {
  // Get current item balance
  const { data: item } = await supabase.from('items').select('current_qty').eq('id', params.itemId).single();
  const previousBalance = item?.current_qty || 0;
  
  if (previousBalance < params.quantity) {
    throw new Error('Insufficient total stock');
  }

  // Get batches ordered by expiry
  const batches = await getBatches(params.itemId);
  
  let remainingToRemove = params.quantity;
  
  for (const batch of batches) {
    if (remainingToRemove <= 0) break;
    if (batch.quantity <= 0) continue;

    const toRemoveFromBatch = Math.min(batch.quantity, remainingToRemove);
    
    // Update batch
    await supabase.from('stock_batches')
      .update({ quantity: batch.quantity - toRemoveFromBatch })
      .eq('id', batch.id);

    remainingToRemove -= toRemoveFromBatch;
  }

  const newBalance = previousBalance - params.quantity;

  // Record transaction
  await supabase.from('stock_transactions').insert({
    item_id: params.itemId,
    user_id: params.userId,
    action_type: 'REMOVE',
    quantity: params.quantity,
    previous_balance: previousBalance,
    new_balance: newBalance,
    reason: params.reason
  });

  // Update master item
  await supabase.from('items')
    .update({ current_qty: newBalance })
    .eq('id', params.itemId);
}

export async function getStockMovementHistory(itemId?: string): Promise<StockTransaction[]> {
  let query = supabase
    .from('stock_transactions')
    .select(`
      *,
      items(item_name),
      profiles(first_name, last_name),
      stock_batches(batch_code)
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (itemId) {
    query = query.eq('item_id', itemId);
  }

  const { data, error } = await query;
  if (error) throw error;
  
  return data.map(tx => ({
    ...tx,
    item_name: tx.items?.item_name,
    user_name: tx.profiles ? `${tx.profiles.first_name} ${tx.profiles.last_name}` : 'Unknown',
    batch_code: tx.stock_batches?.batch_code
  })) as StockTransaction[];
}
export async function getItems(): Promise<InventoryItem[]> {
  return getInventory();
}

export async function createItem(data: Omit<InventoryItem, 'id' | 'is_archived' | 'created_at' | 'updated_at' | 'current_qty'>): Promise<InventoryItem> {
  const { data: newItem, error } = await supabase
    .from('items')
    .insert({
      item_code: data.item_code,
      item_name: data.item_name,
      description: data.description,
      category_id: data.category_id,
      inventory_type: data.inventory_type,
      unit: data.unit,
      unit_cost: data.unit_cost,
      supplier_a: data.supplier_a,
      supplier_b: data.supplier_b,
      min_qty: data.min_qty,
      image_path: data.image_path
    })
    .select()
    .single();

  if (error) throw error;
  return newItem as InventoryItem;
}

export async function updateItem(id: string, updates: Partial<Omit<InventoryItem, 'id'>>): Promise<InventoryItem> {
  const { data: updated, error } = await supabase
    .from('items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return updated as InventoryItem;
}

export async function archiveItem(id: string, isArchived: boolean): Promise<void> {
  const { error } = await supabase
    .from('items')
    .update({ is_archived: isArchived })
    .eq('id', id);

  if (error) throw error;
}

export async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name');
  if (error) throw error;
  return data;
}
