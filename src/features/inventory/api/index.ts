import { supabase } from '@/lib/supabase';
import type { InventoryItem, StockBatch, StockTransaction, Category } from '../types';

/**
 * Fetch all inventory items with aggregated live stock from inventory_stock_view.
 */
export async function getInventory(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_stock_view')
    .select('*')
    .order('name');

  if (error) {
    console.error('getInventory error:', error);
    throw error;
  }
  
  return (data || []).map((row: any) => {
    const cat = (row.category_name || '').toUpperCase();
    let section: 'GRILLED STOCK' | 'PORTION STOCK' | 'PER CASES' = 'PORTION STOCK';
    if (cat.includes('GRILL')) section = 'GRILLED STOCK';
    else if (cat.includes('CASE')) section = 'PER CASES';

    return {
      id: row.id,
      item_code: row.id.substring(0, 8).toUpperCase(),
      item_name: row.name,
      description: row.description || '',
      category_id: row.category_id,
      category_name: row.category_name || 'General',
      inventory_type: section as any,
      unit: row.unit || 'pcs',
      unit_cost: Number(row.unit_cost || 0),
      supplier_a: row.supplier_a || null,
      supplier_b: row.supplier_b || null,
      min_qty: Number(row.min_quantity || 0),
      current_qty: Number(row.total_quantity || 0),
      image_path: null,
      is_archived: !row.is_active || !!row.is_archived,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }) as InventoryItem[];
}

export async function getItems(): Promise<InventoryItem[]> {
  return getInventory();
}

/**
 * Fetch single item by ID with live stock balance.
 */
export async function getItemById(id: string): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from('inventory_stock_view')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('getItemById error:', error);
    throw error;
  }

  const cat = (data.category_name || '').toUpperCase();
  let section: 'GRILLED STOCK' | 'PORTION STOCK' | 'PER CASES' = 'PORTION STOCK';
  if (cat.includes('GRILL')) section = 'GRILLED STOCK';
  else if (cat.includes('CASE')) section = 'PER CASES';

  return {
    id: data.id,
    item_code: data.id.substring(0, 8).toUpperCase(),
    item_name: data.name,
    description: data.description || '',
    category_id: data.category_id,
    category_name: data.category_name || 'General',
    inventory_type: section as any,
    unit: data.unit || 'pcs',
    unit_cost: Number(data.unit_cost || 0),
    supplier_a: data.supplier_a || null,
    supplier_b: data.supplier_b || null,
    min_qty: Number(data.min_quantity || 0),
    current_qty: Number(data.total_quantity || 0),
    image_path: null,
    is_archived: !data.is_active || !!data.is_archived,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as InventoryItem;
}

/**
 * Fetch all active stock batches for an item ordered by FEFO (earliest expiry first).
 */
export async function getBatches(itemId: string): Promise<StockBatch[]> {
  const { data, error } = await supabase
    .from('stock_batches')
    .select('*')
    .eq('item_id', itemId)
    .order('expiry_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('getBatches error:', error);
    throw error;
  }

  return (data || []).map((b: any) => ({
    id: b.id,
    item_id: b.item_id,
    batch_code: `BATCH-${b.id.substring(0, 6).toUpperCase()}`,
    quantity: Number(b.quantity || 0),
    initial_quantity: Number(b.quantity || 0),
    expiry_date: b.expiry_date || '2099-12-31',
    created_at: b.created_at,
  })) as StockBatch[];
}

/**
 * Add physical stock via backend RPC (creates batch and logs movement).
 */
export async function addStock(params: {
  itemId: string;
  quantity: number;
  expiryDate?: string | null;
  receivedDate?: string;
  reason: string;
  userId?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('add_stock', {
    p_item_id: params.itemId,
    p_quantity: params.quantity,
    p_expiry_date: params.expiryDate || '2099-12-31',
    p_received_date: params.receivedDate || new Date().toISOString().split('T')[0],
    p_reason: params.reason || 'Stock Received',
  });

  if (error) {
    console.error('addStock RPC error:', error);
    throw error;
  }
}

/**
 * Remove stock using automated FEFO consumption via backend RPC.
 */
export async function removeStock(params: {
  itemId: string;
  quantity: number;
  reason: string;
  userId?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('consume_stock', {
    p_item_id: params.itemId,
    p_quantity: params.quantity,
    p_reason: params.reason || 'Stock Consumption / Sales',
  });

  if (error) {
    console.error('removeStock RPC error:', error);
    throw error;
  }
}

/**
 * Adjust physical stock count up or down.
 */
export async function adjustStock(params: {
  itemId: string;
  targetQuantity: number;
  reason: string;
  userId?: string;
}): Promise<void> {
  const item = await getItemById(params.itemId);
  const diff = params.targetQuantity - item.current_qty;
  if (diff === 0) return;

  if (diff > 0) {
    await addStock({
      itemId: params.itemId,
      quantity: diff,
      reason: params.reason || 'Physical Count Adjustment (Up)',
    });
  } else {
    await removeStock({
      itemId: params.itemId,
      quantity: Math.abs(diff),
      reason: params.reason || 'Physical Count Adjustment (Down)',
    });
  }
}

/**
 * Fetch complete stock movement history from stock_history_view.
 */
export async function getStockMovementHistory(itemId?: string): Promise<StockTransaction[]> {
  let query = supabase
    .from('stock_history_view')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (itemId) {
    query = query.eq('item_id', itemId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('getStockMovementHistory error:', error);
    throw error;
  }

  return (data || []).map((m: any) => ({
    id: m.movement_id,
    item_id: m.item_id,
    item_name: m.item_name,
    user_id: m.actor_id,
    user_name: m.actor_name || 'Staff User',
    action_type: m.type === 'ADD' ? 'ADD' : m.type === 'REMOVE' ? 'REMOVE' : 'ADJUST',
    quantity: Math.abs(Number(m.quantity_change || 0)),
    previous_balance: Number(m.quantity_before || 0),
    new_balance: Number(m.quantity_after || 0),
    batch_id: m.batch_id,
    batch_code: m.batch_id ? `BATCH-${m.batch_id.substring(0, 6).toUpperCase()}` : undefined,
    reason: m.reason || 'Stock Movement',
    created_at: m.created_at,
  })) as StockTransaction[];
}

/**
 * Create a new master inventory item in inventory_items.
 */
export async function createItem(data: Omit<InventoryItem, 'id' | 'is_archived' | 'created_at' | 'updated_at' | 'current_qty'>): Promise<InventoryItem> {
  const { data: newItem, error } = await supabase
    .from('inventory_items')
    .insert({
      category_id: data.category_id,
      name: data.item_name,
      description: data.description || '',
      unit: data.unit,
      unit_cost: data.unit_cost,
      supplier_a: data.supplier_a || null,
      supplier_b: data.supplier_b || null,
      min_quantity: data.min_qty,
      is_active: true,
      is_archived: false,
    })
    .select()
    .single();

  if (error) {
    console.error('createItem error:', error);
    throw error;
  }

  return getItemById(newItem.id);
}

/**
 * Update an existing inventory item in inventory_items.
 */
export async function updateItem(id: string, updates: Partial<Omit<InventoryItem, 'id'>>): Promise<InventoryItem> {
  const mapped: any = {};
  if (updates.item_name !== undefined) mapped.name = updates.item_name;
  if (updates.description !== undefined) mapped.description = updates.description;
  if (updates.category_id !== undefined) mapped.category_id = updates.category_id;
  if (updates.unit !== undefined) mapped.unit = updates.unit;
  if (updates.unit_cost !== undefined) mapped.unit_cost = updates.unit_cost;
  if (updates.supplier_a !== undefined) mapped.supplier_a = updates.supplier_a;
  if (updates.supplier_b !== undefined) mapped.supplier_b = updates.supplier_b;
  if (updates.min_qty !== undefined) mapped.min_quantity = updates.min_qty;
  if (updates.is_archived !== undefined) {
    mapped.is_archived = updates.is_archived;
    mapped.is_active = !updates.is_archived;
  }

  const { error } = await supabase
    .from('inventory_items')
    .update(mapped)
    .eq('id', id);

  if (error) {
    console.error('updateItem error:', error);
    throw error;
  }

  return getItemById(id);
}

/**
 * Archive or unarchive an item.
 */
export async function archiveItem(id: string, isArchived: boolean): Promise<void> {
  const { error } = await supabase
    .from('inventory_items')
    .update({ is_archived: isArchived, is_active: !isArchived })
    .eq('id', id);

  if (error) {
    console.error('archiveItem error:', error);
    throw error;
  }
}

/**
 * Permanently delete an item and any associated records.
 */
export async function deleteItem(id: string): Promise<void> {
  await supabase.from('stock_batches').delete().eq('item_id', id);
  await supabase.from('stock_movements').delete().eq('item_id', id);
  const { error } = await supabase.from('inventory_items').delete().eq('id', id);
  if (error) {
    console.error('deleteItem error:', error);
    throw error;
  }
}

/**
 * Fetch all categories.
 */
export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name');

  if (error) {
    console.error('getCategories error:', error);
    throw error;
  }

  return data as Category[];
}
