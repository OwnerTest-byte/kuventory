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
    const section = row.category_name || 'General';

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
      supplier_a: row.supplier_a || '',
      supplier_b: row.supplier_b || '',
      min_qty: Number(row.min_quantity || 0),
      current_qty: Number(row.total_quantity || 0),
      image_path: row.image_path || null,
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

  const section = data.category_name || 'General';

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
    supplier_a: data.supplier_a || '',
    supplier_b: data.supplier_b || '',
    min_qty: Number(data.min_quantity || 0),
    current_qty: Number(data.total_quantity || 0),
    image_path: data.image_path || null,
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
    .gt('quantity', 0)
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
      supplier_a: data.supplier_a || '',
      supplier_b: data.supplier_b || '',
      min_quantity: data.min_qty,
      image_path: data.image_path || null,
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
  if (updates.description !== undefined) mapped.description = updates.description || '';
  if (updates.category_id !== undefined) mapped.category_id = updates.category_id;
  if (updates.unit !== undefined) mapped.unit = updates.unit;
  if (updates.unit_cost !== undefined) mapped.unit_cost = updates.unit_cost;
  if (updates.supplier_a !== undefined) mapped.supplier_a = updates.supplier_a || '';
  if (updates.supplier_b !== undefined) mapped.supplier_b = updates.supplier_b || '';
  if (updates.min_qty !== undefined) mapped.min_quantity = updates.min_qty;
  if (updates.image_path !== undefined) mapped.image_path = updates.image_path || null;
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
 * Permanently delete an item and any associated records atomically.
 */
export async function deleteItem(id: string): Promise<void> {
  const { error: rpcError } = await supabase.rpc('remove_inventory_item', {
    p_item_id: id,
  });

  if (rpcError) {
    await supabase.from('daily_inventory_items').delete().eq('item_id', id);
    await supabase.from('stock_batches').delete().eq('item_id', id);
    await supabase.from('stock_movements').delete().eq('item_id', id);
    await supabase.from('notifications').delete().eq('item_id', id);
    const { error } = await supabase.from('inventory_items').delete().eq('id', id);
    if (error) {
      console.error('deleteItem error:', error);
      throw error;
    }
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

export interface Top3DashboardStats {
  best_sellers: Array<{
    id: string;
    item_name: string;
    category_name: string;
    unit: string;
    sold_quantity: number;
  }>;
  most_stocked: Array<{
    id: string;
    item_name: string;
    category_name: string;
    unit: string;
    current_stock: number;
  }>;
  least_stocked: Array<{
    id: string;
    item_name: string;
    category_name: string;
    unit: string;
    current_stock: number;
    min_quantity: number;
  }>;
}

/**
 * Fetch strictly active expiring batches (quantity > 0 and expiry within daysThreshold).
 * Excludes all depleted batches (quantity <= 0).
 */
export async function getActiveExpiringBatches(daysThreshold = 14) {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + daysThreshold);

  const { data, error } = await supabase
    .from('stock_batches')
    .select(`
      id,
      quantity,
      expiry_date,
      received_date,
      created_at,
      inventory_items (
        id,
        name,
        unit,
        unit_cost
      )
    `)
    .gt('quantity', 0) // ZERO-STOCK EXPIRY RULE: strictly positive quantity
    .not('expiry_date', 'is', null)
    .gte('expiry_date', now.toISOString().split('T')[0])
    .lte('expiry_date', future.toISOString().split('T')[0])
    .order('expiry_date', { ascending: true });

  if (error) {
    console.error('getActiveExpiringBatches error:', error);
    throw error;
  }
  return data || [];
}

/**
 * Fetch strictly active expired batches (quantity > 0 and expiry before today).
 * Excludes all depleted batches (quantity <= 0).
 */
export async function getActiveExpiredBatches() {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('stock_batches')
    .select(`
      id,
      quantity,
      expiry_date,
      received_date,
      created_at,
      inventory_items (
        id,
        name,
        unit,
        unit_cost
      )
    `)
    .gt('quantity', 0) // ZERO-STOCK EXPIRY RULE: strictly positive quantity
    .not('expiry_date', 'is', null)
    .lt('expiry_date', today)
    .order('expiry_date', { ascending: true });

  if (error) {
    console.error('getActiveExpiredBatches error:', error);
    throw error;
  }
  return data || [];
}

/**
 * Fetch Top 3 statistics widget data:
 * - Top 3 Most Outgoing / Used Items (Order by outgoing_quantity DESC LIMIT 3)
 * - Top 3 Most Stocked (Order by current_stock DESC LIMIT 3)
 * - Top 3 Least Stocked (Order by current_stock ASC LIMIT 3)
 */
export async function getDashboardTop3Stats(): Promise<Top3DashboardStats> {
  try {
    // Try operational RPC first
    const { data: opData, error: opErr } = await supabase.rpc('get_operational_top3_stats');
    if (!opErr && opData && (opData.most_outgoing || opData.best_sellers)) {
      const best = opData.most_outgoing || opData.best_sellers;
      return {
        best_sellers: best.map((b: any) => ({
          ...b,
          sold_quantity: b.outgoing_quantity ?? b.sold_quantity ?? 0
        })),
        most_stocked: opData.most_stocked,
        least_stocked: opData.least_stocked
      };
    }

    const { data, error } = await supabase.rpc('get_dashboard_top3_stats');
    if (!error && data && data.best_sellers) {
      return data as Top3DashboardStats;
    }
  } catch (err) {
    console.warn('RPC top3 stats fallback to direct query:', err);
  }

  // Robust direct fallback based strictly on actual inventory outflows (AM OUT + PM OUT / REMOVE movements)
  const [itemsRes, movementsRes] = await Promise.all([
    supabase.from('inventory_stock_view').select('*').eq('is_active', true),
    supabase.from('stock_movements').select('item_id, quantity_change').eq('type', 'REMOVE')
  ]);

  const allItems = (itemsRes.data || []).filter((i: any) => !i.is_archived);
  const allMovements = movementsRes.data || [];

  const outgoingMap = new Map<string, number>();
  allMovements.forEach((m: any) => {
    const qty = Math.abs(Number(m.quantity_change) || 0);
    outgoingMap.set(m.item_id, (outgoingMap.get(m.item_id) || 0) + qty);
  });

  const best_sellers = [...allItems]
    .map(i => ({
      id: i.id,
      item_name: i.name,
      category_name: i.category_name || 'General',
      unit: i.unit || 'pcs',
      sold_quantity: outgoingMap.get(i.id) || 0,
    }))
    .sort((a, b) => b.sold_quantity - a.sold_quantity)
    .slice(0, 3);

  const most_stocked = [...allItems]
    .map(i => ({
      id: i.id,
      item_name: i.name,
      category_name: i.category_name || 'General',
      unit: i.unit || 'pcs',
      current_stock: Number(i.total_quantity || 0),
    }))
    .sort((a, b) => b.current_stock - a.current_stock)
    .slice(0, 3);

  const least_stocked = [...allItems]
    .map(i => ({
      id: i.id,
      item_name: i.name,
      category_name: i.category_name || 'General',
      unit: i.unit || 'pcs',
      current_stock: Number(i.total_quantity || 0),
      min_quantity: Number(i.min_quantity || 0),
    }))
    .sort((a, b) => a.current_stock - b.current_stock)
    .slice(0, 3);

  return { best_sellers, most_stocked, least_stocked };
}

