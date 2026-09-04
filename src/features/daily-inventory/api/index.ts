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

export async function fetchOrCreateDailyInventory(date: string): Promise<DailyInventorySessionWithEntries> {
  // 1. Try to find existing session
  let { data: session } = await supabase
    .from('daily_inventory_sessions')
    .select('*')
    .eq('inventory_date', date)
    .single();

  if (!session) {
    // 2. Create session if it doesn't exist
    const { data: newSession, error: createError } = await supabase
      .from('daily_inventory_sessions')
      .insert({ inventory_date: date, status: 'DRAFT' })
      .select()
      .single();
    
    if (createError && createError.code !== '23505') { // Ignore unique constraint violation if created concurrently
      throw createError;
    }
    
    if (!newSession) {
      // Re-fetch if it was created concurrently
      const { data: existingSession } = await supabase
        .from('daily_inventory_sessions')
        .select('*')
        .eq('inventory_date', date)
        .single();
      session = existingSession;
    } else {
      session = newSession;
    }
  }

  // 3. Sync entries for the session
  if (session?.status === 'DRAFT') {
    // Fetch all active items
    const { data: activeItems } = await supabase
      .from('items')
      .select('id, inventory_type, current_qty')
      .eq('is_archived', false);
      
    // Fetch existing entries
    const { data: existingEntries } = await supabase
      .from('daily_inventory_entries')
      .select('item_id')
      .eq('session_id', session.id);
      
    const existingItemIds = new Set(existingEntries?.map(e => e.item_id) || []);
    
    // Find missing items
    const missingItems = activeItems?.filter(item => !existingItemIds.has(item.id)) || [];
    
    if (missingItems.length > 0) {
      const newEntries = missingItems.map(item => ({
        session_id: session.id,
        item_id: item.id,
        section: item.inventory_type,
        beginning_qty: item.current_qty,
        add_qty: 0,
        sales_am: 0,
        sales_pm: 0
      }));
      
      await supabase.from('daily_inventory_entries').insert(newEntries);
    }
  }

  // 4. Fetch the full session with all entries
  const { data: fullSession, error: fetchError } = await supabase
    .from('daily_inventory_sessions')
    .select(`
      *,
      daily_inventory_entries (
        *,
        items (
          item_name,
          unit,
          categories ( name )
        )
      )
    `)
    .eq('id', session.id)
    .single();

  if (fetchError) throw fetchError;
  
  // Sort items logically by category then name
  if (fullSession && fullSession.daily_inventory_entries) {
    fullSession.daily_inventory_entries.sort((a: any, b: any) => {
      const catA = a.items?.categories?.name || '';
      const catB = b.items?.categories?.name || '';
      if (catA < catB) return -1;
      if (catA > catB) return 1;
      const nameA = a.items?.item_name || '';
      const nameB = b.items?.item_name || '';
      return nameA.localeCompare(nameB);
    });
  }

  return fullSession as DailyInventorySessionWithEntries;
}

export async function updateDailyInventoryItem(
  params: { id: string; beg: number; add: number; am: number; pm: number }
): Promise<any> {
  const { data, error } = await supabase
    .from('daily_inventory_entries')
    .update({
      beginning_qty: params.beg,
      add_qty: params.add,
      sales_am: params.am,
      sales_pm: params.pm
    })
    .eq('id', params.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function finalizeDailyInventory(sessionId: string, userId?: string): Promise<void> {
  // We do it on the client side since RPC is gone
  // 1. Fetch session entries
  const { data: entries } = await supabase
    .from('daily_inventory_entries')
    .select('*')
    .eq('session_id', sessionId);
    
  if (!entries) return;

  // 2. Consume stock using FEFO for each item
  // Note: For a real production app, this should be done in a transaction (RPC)
  // But we're implementing the logic in JS for reconstruction.
  for (const entry of entries) {
    const consumed = entry.sales_am + entry.sales_pm;
    if (consumed > 0) {
      // Find batches for the item
      const { data: batches } = await supabase
        .from('stock_batches')
        .select('*')
        .eq('item_id', entry.item_id)
        .order('expiry_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
        
      let remaining = consumed;
      if (batches) {
        for (const batch of batches) {
          if (remaining <= 0) break;
          if (batch.quantity <= 0) continue;
          
          const deduct = Math.min(batch.quantity, remaining);
          await supabase.from('stock_batches').update({ quantity: batch.quantity - deduct }).eq('id', batch.id);
          remaining -= deduct;
        }
      }
      
      // Record transaction
      const { data: item } = await supabase.from('items').select('current_qty').eq('id', entry.item_id).single();
      const currentQty = item?.current_qty || 0;
      
      await supabase.from('stock_transactions').insert({
        item_id: entry.item_id,
        user_id: userId || null,
        action_type: 'REMOVE',
        quantity: consumed,
        previous_balance: currentQty,
        new_balance: currentQty - consumed,
        reason: 'Daily Inventory Sales'
      });
      
      // Update item master
      await supabase.from('items').update({ current_qty: currentQty - consumed }).eq('id', entry.item_id);
    }
  }

  // 3. Mark session as finalized
  await supabase
    .from('daily_inventory_sessions')
    .update({ 
      status: 'FINALIZED',
      finalized_by: userId || null,
      finalized_at: new Date().toISOString()
    })
    .eq('id', sessionId);
}
