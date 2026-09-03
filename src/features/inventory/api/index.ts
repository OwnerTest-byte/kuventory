import { supabase } from '@/lib/supabase';
import type { InventoryStock, StockMovement, StockBatch } from '../types';

/**
 * Fetch all inventory items and their aggregated physical stock.
 */
export async function getInventory(): Promise<InventoryStock[]> {
  const { data, error } = await supabase
    .from('inventory_stock_view')
    .select('*')
    .order('name');

  if (error) throw error;
  return data as InventoryStock[];
}

/**
 * Fetch all stock batches for a specific inventory item.
 * Results are ordered by FEFO priority (earliest expiry first, received date tie-break).
 */
export async function getBatches(itemId: string): Promise<StockBatch[]> {
  const { data, error } = await supabase
    .from('stock_batches')
    .select('*')
    .eq('item_id', itemId)
    .order('expiry_date', { ascending: true, nullsFirst: false })
    .order('received_date', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return data as StockBatch[];
}

/**
 * Add physical stock via atomic RPC.
 */
export async function addStock(params: {
  itemId: string;
  quantity: number;
  expiryDate: string | null;
  receivedDate: string;
  reason: string;
}): Promise<void> {
  const { error } = await supabase.rpc('add_stock', {
    p_item_id: params.itemId,
    p_quantity: params.quantity,
    p_expiry_date: params.expiryDate,
    p_received_date: params.receivedDate,
    p_reason: params.reason,
  });

  if (error) throw error;
}

/**
 * Remove physical stock using FEFO consumption.
 */
export async function removeStock(params: {
  itemId: string;
  quantity: number;
  reason: string;
}): Promise<void> {
  const { error } = await supabase.rpc('consume_stock', {
    p_item_id: params.itemId,
    p_quantity: params.quantity,
    p_reason: params.reason,
  });

  if (error) throw error;
}

/**
 * Directly adjust a specific physical batch quantity (for audits, losses).
 */
export async function adjustStock(params: {
  batchId: string;
  newQuantity: number;
  reason: string;
}): Promise<void> {
  const { error } = await supabase.rpc('adjust_stock', {
    p_batch_id: params.batchId,
    p_new_quantity: params.newQuantity,
    p_reason: params.reason,
  });

  if (error) throw error;
}

/**
 * Fetch historical stock movements.
 */
export async function getStockHistory(): Promise<StockMovement[]> {
  const { data, error } = await supabase
    .from('stock_history_view')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100); // hard limit for now

  if (error) throw error;
  return data as StockMovement[];
}
