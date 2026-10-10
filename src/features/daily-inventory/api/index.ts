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
      beginning_qty: Number(entry.beg || 0),
      add_qty: Number(entry.add || 0),
      total_stock: Number(entry.total ?? (Number(entry.beg || 0) + Number(entry.add || 0))),
      sales_am: Number(entry.am || 0),
      sales_pm: Number(entry.pm || 0),
      ending_qty: Number(entry.ending ?? (Number(entry.beg || 0) + Number(entry.add || 0) - Number(entry.am || 0) - Number(entry.pm || 0))),
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
  const { data, error } = await supabase
    .from('daily_inventory_items')
    .update({
      beg: params.beg,
      add: params.add,
      am: params.am,
      pm: params.pm
    })
    .eq('id', params.id)
    .select('*, inventory_items(id, name, unit, min_quantity)')
    .single();

  if (error) {
    console.error('updateDailyInventoryItem error:', error);
    throw error;
  }

  // Trigger Out of Stock / Low Stock real-time notification
  try {
    const ending = (Number(params.beg) + Number(params.add)) - (Number(params.am) + Number(params.pm));
    const rawItem = data?.inventory_items as any;
    const itemName = rawItem?.name || 'Item';
    const itemId = rawItem?.id || data?.item_id;
    const unit = rawItem?.unit || 'pcs';
    const today = new Date().toISOString().split('T')[0];

    if (ending <= 0 && itemId) {
      await supabase.from('notifications').upsert({
        type: 'OUT_OF_STOCK',
        title: `Out of Stock: ${itemName}`,
        message: `${itemName} has reached 0 stock in daily inventory (ending: 0 ${unit}). Reorder recommended.`,
        item_id: itemId,
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
        dedup_key: `LOW_${itemId}_${today}`,
        is_read: false,
        created_at: new Date().toISOString()
      }, { onConflict: 'dedup_key' });
    }
  } catch (notifErr) {
    console.warn('Failed to dispatch inventory notification:', notifErr);
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
