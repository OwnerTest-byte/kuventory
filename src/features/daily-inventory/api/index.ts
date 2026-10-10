import { supabase } from '@/lib/supabase';
import type { DailyInventorySession, DailyInventoryEntry } from '../../inventory/types';

export type DailyInventorySessionWithEntries = DailyInventorySession & {
  daily_inventory_entries: (DailyInventoryEntry & {
    items: {
      item_name: string;
      unit: string;
      categories: { id?: string; name: string } | null;
    } | null;
  })[];
};

/**
 * Fetch or create a daily inventory worksheet for the specified date.
 * Uses PostgreSQL create_daily_inventory_draft RPC for atomic generation and automatic beg stock calculation.
 */
export async function fetchOrCreateDailyInventory(date: string): Promise<DailyInventorySessionWithEntries> {
  // 1. Call RPC to ensure a draft exists and items are populated with current physical stock
  const { data: draftId, error: rpcError } = await supabase.rpc('create_daily_inventory_draft', {
    p_target_date: date
  });

  if (rpcError) {
    console.error('create_daily_inventory_draft RPC error:', rpcError);
    // Fallback: try querying directly by inventory_date if already created
  }

  // 2. Fetch session from daily_inventory table
  let query = supabase
    .from('daily_inventory')
    .select(`
      id,
      inventory_date,
      state,
      created_by,
      finalized_by,
      finalized_at,
      created_at,
      daily_inventory_items (
        id,
        daily_inventory_id,
        item_id,
        beg,
        add,
        total,
        am,
        pm,
        ending,
        inventory_items (
          id,
          name,
          unit,
          category_id,
          categories (
            id,
            name
          )
        )
      )
    `);

  if (draftId) {
    query = query.eq('id', draftId);
  } else {
    query = query.eq('inventory_date', date);
  }

  const { data: session, error: fetchError } = await query.single();

  if (fetchError) {
    console.error('Fetch daily inventory error:', fetchError);
    throw fetchError;
  }

  // 3. Map into DailyInventorySessionWithEntries
  const rawItems = (session.daily_inventory_items || []) as any[];
  
  const mappedEntries: (DailyInventoryEntry & {
    items: {
      item_name: string;
      unit: string;
      categories: { id?: string; name: string } | null;
    } | null;
  })[] = rawItems.map((entry: any) => {
    const itemName = entry.inventory_items?.name || 'Unknown Item';
    const unit = entry.inventory_items?.unit || 'pcs';
    const catName = entry.inventory_items?.categories?.name || 'General';
    const catId = entry.inventory_items?.categories?.id || entry.inventory_items?.category_id || null;
    const section = catName.trim() || 'General';

    return {
      id: entry.id,
      session_id: entry.daily_inventory_id,
      item_id: entry.item_id,
      item_name: itemName,
      unit: unit,
      section: section,
      category_id: catId,
      category_name: catName,
      beginning_qty: Math.max(0, Number(entry.beg || 0)),
      add_qty: Math.max(0, Number(entry.add || 0)),
      total_stock: Math.max(0, Number(entry.total ?? (Number(entry.beg || 0) + Number(entry.add || 0)))),
      sales_am: Math.max(0, Number(entry.am || 0)),
      sales_pm: Math.max(0, Number(entry.pm || 0)),
      ending_qty: Math.max(0, Number(entry.ending ?? (Number(entry.beg || 0) + Number(entry.add || 0) - Number(entry.am || 0) - Number(entry.pm || 0)))),
      items: {
        item_name: itemName,
        unit: unit,
        categories: entry.inventory_items?.categories ? {
          id: entry.inventory_items.categories.id,
          name: entry.inventory_items.categories.name
        } : null
      }
    };
  });

  // Sort items logically by category and name
  mappedEntries.sort((a, b) => {
    const catA = a.items?.categories?.name || '';
    const catB = b.items?.categories?.name || '';
    if (catA < catB) return -1;
    if (catA > catB) return 1;
    return (a.item_name || '').localeCompare(b.item_name || '');
  });

  return {
    id: session.id,
    inventory_date: session.inventory_date,
    status: session.state === 'FINALIZED' ? 'FINALIZED' : 'DRAFT',
    prepared_by: session.created_by,
    finalized_by: session.finalized_by,
    finalized_at: session.finalized_at,
    created_at: session.created_at,
    daily_inventory_entries: mappedEntries
  };
}

/**
 * Update daily inventory row quantities (beg, add, am, pm).
 * Note: `total` and `ending` are PostgreSQL GENERATED STORED columns and update automatically!
 */
export async function updateDailyInventoryItem(params: {
  id: string;
  beg: number;
  add: number;
  am: number;
  pm: number;
}): Promise<any> {
  // Strict non-negative inventory rule: inputs cannot be negative, clamp to 0
  const safeBeg = Math.max(0, Number(params.beg) || 0);
  const safeAdd = Math.max(0, Number(params.add) || 0);
  const safeAm = Math.max(0, Number(params.am) || 0);
  const safePm = Math.max(0, Number(params.pm) || 0);

  const { data, error } = await supabase
    .from('daily_inventory_items')
    .update({
      beg: safeBeg,
      add: safeAdd,
      am: safeAm,
      pm: safePm
    })
    .eq('id', params.id)
    .select('*, inventory_items(id, name, unit, min_quantity)')
    .single();

  if (error) {
    console.error('updateDailyInventoryItem error:', error);
    throw error;
  }

  // Trigger Out of Stock / Deficit Auto-Zero / Low Stock real-time notification
  try {
    const total = safeBeg + safeAdd;
    const sales = safeAm + safePm;
    const rawEnding = total - sales;
    const ending = Math.max(0, rawEnding);
    const hasDeficit = rawEnding < 0;
    const deficitAmount = Math.abs(rawEnding);

    const rawItem = data?.inventory_items as any;
    const itemName = rawItem?.name || 'Item';
    const itemId = rawItem?.id || data?.item_id;
    const unit = rawItem?.unit || 'pcs';
    const today = new Date().toISOString().split('T')[0];

    // 1. Deficit Auto-Zero Notification: sales exceeded available stock
    if (hasDeficit && itemId) {
      await supabase.from('notifications').upsert({
        type: 'STOCK_DISCREPANCY',
        title: `Invalid Stock: ${itemName}`,
        message: `Sales for ${itemName} (${sales} ${unit}) exceeded total stock (${total} ${unit}) by ${deficitAmount} ${unit}. Invalid entry has been zeroed to 0.`,
        item_id: itemId,
        target_id: '/daily-inventory',
        dedup_key: `DEFICIT_${itemId}_${today}`,
        is_read: false,
        created_at: new Date().toISOString()
      }, { onConflict: 'dedup_key' });
    }

    // 2. Out of Stock Notification
    if (ending <= 0 && itemId) {
      await supabase.from('notifications').upsert({
        type: 'OUT_OF_STOCK',
        title: `Out of Stock: ${itemName}`,
        message: `${itemName} has reached 0 stock in daily inventory (ending: 0 ${unit}). Reorder recommended.`,
        item_id: itemId,
        target_id: `/items/${itemId}`,
        dedup_key: `OOS_${itemId}_${today}`,
        is_read: false,
        created_at: new Date().toISOString()
      }, { onConflict: 'dedup_key' });
    } else if (rawItem?.min_quantity && ending <= Number(rawItem.min_quantity) && itemId) {
      await supabase.from('notifications').upsert({
        type: 'LOW_STOCK',
        title: `Low Stock: ${itemName}`,
        message: `${itemName} is running low at ${ending} ${unit} (minimum threshold: ${rawItem.min_quantity}).`,
        item_id: itemId,
        target_id: `/items/${itemId}`,
        dedup_key: `LOW_${itemId}_${today}`,
        is_read: false,
        created_at: new Date().toISOString()
      }, { onConflict: 'dedup_key' });
    }

    // 3. Real-time FEFO Batch Synchronization:
    // Ensures physical stock batches in Inventory Catalog match the daily ending stock.
    // When sales occur, deducts batches that expire earliest first (FEFO).
    if (itemId) {
      const { data: batches } = await supabase
        .from('stock_batches')
        .select('*')
        .eq('item_id', itemId)
        .order('expiry_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      const currentBatchesTotal = (batches || []).reduce((sum: number, b: any) => sum + Number(b.quantity || 0), 0);
      const targetStock = ending;
      const diff = currentBatchesTotal - targetStock;

      if (diff > 0) {
        // Sales deduction: consume diff from earliest expiring batches (FEFO)
        let remainingToDeduct = diff;
        for (const b of (batches || [])) {
          if (remainingToDeduct <= 0) break;
          const bQty = Number(b.quantity || 0);
          if (bQty <= 0) continue;

          const deductAmt = Math.min(bQty, remainingToDeduct);
          const newQty = Math.max(0, bQty - deductAmt);

          await supabase
            .from('stock_batches')
            .update({ quantity: newQty, version: (b.version || 1) + 1 })
            .eq('id', b.id);

          await supabase
            .from('stock_movements')
            .insert({
              item_id: itemId,
              batch_id: b.id,
              type: 'REMOVE',
              quantity_before: bQty,
              quantity_change: -deductAmt,
              quantity_after: newQty,
              reason: 'Daily Inventory Sales Deduction (FEFO)'
            });

          remainingToDeduct -= deductAmt;
        }
      } else if (diff < 0) {
        // Balance increased: restore stock to active batch
        const toAdd = Math.abs(diff);
        if (batches && batches.length > 0) {
          const targetBatch = batches[batches.length - 1];
          const oldQty = Number(targetBatch.quantity || 0);
          const newQty = oldQty + toAdd;

          await supabase
            .from('stock_batches')
            .update({ quantity: newQty, version: (targetBatch.version || 1) + 1 })
            .eq('id', targetBatch.id);

          await supabase
            .from('stock_movements')
            .insert({
              item_id: itemId,
              batch_id: targetBatch.id,
              type: 'ADD',
              quantity_before: oldQty,
              quantity_change: toAdd,
              quantity_after: newQty,
              reason: 'Daily Inventory Stock Adjustment'
            });
        } else {
          // No batches existed, create initial batch with 30-day default expiry
          const defaultExpiry = new Date();
          defaultExpiry.setDate(defaultExpiry.getDate() + 30);
          await supabase
            .from('stock_batches')
            .insert({
              item_id: itemId,
              quantity: toAdd,
              expiry_date: defaultExpiry.toISOString().split('T')[0],
              received_date: today,
              version: 1
            });
        }
      }
    }
  } catch (notifErr) {
    console.warn('Failed to dispatch inventory notification or sync batches:', notifErr);
  }

  return data;
}

/**
 * Finalize daily inventory worksheet via PostgreSQL RPC.
 * Automatically freezes report snapshot and executes FEFO stock consumption.
 */
export async function finalizeDailyInventory(sessionId: string, _userId?: string): Promise<void> {
  const { error } = await supabase.rpc('finalize_daily_inventory', {
    p_daily_inventory_id: sessionId
  });

  if (error) {
    console.error('finalizeDailyInventory RPC error:', error);
    throw error;
  }
}
