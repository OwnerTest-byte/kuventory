import { supabase } from '@/lib/supabase';
import type { DailyInventorySession, DailyInventoryEntry } from '../../inventory/types';

export type DailyInventorySessionWithEntries = DailyInventorySession & {
  daily_inventory_entries: (DailyInventoryEntry & {
    items: {
      item_name: string;
      unit: string;
      categories: { name: string } | null;
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
          name,
          unit,
          categories (
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
      categories: { name: string } | null;
    } | null;
  })[] = rawItems.map((entry: any) => {
    const itemName = entry.inventory_items?.name || 'Unknown Item';
    const unit = entry.inventory_items?.unit || 'pcs';
    const catName = entry.inventory_items?.categories?.name || 'General';
    let section: 'GRILLED STOCK' | 'PORTION STOCK' | 'PER CASES' = 'PORTION STOCK';
    if (catName.toUpperCase().includes('GRILL')) {
      section = 'GRILLED STOCK';
    } else if (catName.toUpperCase().includes('CASE')) {
      section = 'PER CASES';
    } else {
      section = 'PORTION STOCK';
    }

    return {
      id: entry.id,
      session_id: entry.daily_inventory_id,
      item_id: entry.item_id,
      item_name: itemName,
      unit: unit,
      section: section,
      beginning_qty: Number(entry.beg || 0),
      add_qty: Number(entry.add || 0),
      total_stock: Number(entry.total ?? (Number(entry.beg || 0) + Number(entry.add || 0))),
      sales_am: Number(entry.am || 0),
      sales_pm: Number(entry.pm || 0),
      ending_qty: Number(entry.ending ?? (Number(entry.beg || 0) + Number(entry.add || 0) - Number(entry.am || 0) - Number(entry.pm || 0))),
      items: {
        item_name: itemName,
        unit: unit,
        categories: { name: catName }
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
    .select()
    .single();

  if (error) {
    console.error('updateDailyInventoryItem error:', error);
    throw error;
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
