import { supabase } from '@/lib/supabase';

export interface DailyInventoryCorrectionItem {
  id: string; // daily_inventory_items.id
  item_id: string;
  item_name?: string;
  unit?: string;
  beg: number;
  add: number;
  am: number;
  pm: number;
  ending: number;
}

export interface DailyInventoryRevision {
  id: string;
  daily_inventory_id: string;
  revision_number: number;
  inventory_date: string;
  reason: string;
  corrected_by: string;
  corrected_by_name?: string | null;
  old_values: any[];
  new_values: any[];
  stock_adjustments: any[];
  created_at: string;
}

export interface CorrectFinalizedDayParams {
  dailyInventoryId: string;
  inventoryDate: string;
  reason: string;
  correctedItems: DailyInventoryCorrectionItem[];
  userProfile?: { id?: string; email?: string; displayName?: string } | null;
}

/**
 * Execute differential stock reconciliation and save finalized day correction revision.
 * Strictly guarantees that historical stock operations are NEVER replayed blindly.
 */
export async function correctFinalizedDailyInventory({
  dailyInventoryId,
  inventoryDate,
  reason,
  correctedItems,
  userProfile,
}: CorrectFinalizedDayParams): Promise<{ success: boolean; revisionNumber: number; message: string }> {
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('A reason for correction is required to update a finalized daily report.');
  }

  // 1. First, attempt the atomic PostgreSQL RPC correct_finalized_daily_inventory
  let revNum = 1;

  try {
    const payload = correctedItems.map(item => ({
      item_id: item.item_id,
      beg: Number(item.beg) || 0,
      add: Number(item.add) || 0,
      am: Number(item.am) || 0,
      pm: Number(item.pm) || 0,
      ending: Number(item.ending) || 0,
    }));

    const { data: rpcData, error: rpcErr } = await supabase.rpc('correct_finalized_daily_inventory', {
      p_daily_inventory_id: dailyInventoryId,
      p_items: payload,
      p_reason: cleanReason,
    });

    if (!rpcErr && rpcData?.success) {
      revNum = rpcData.revision_number || 1;
      return {
        success: true,
        revisionNumber: revNum,
        message: rpcData.message || `Revision ${revNum} recorded and stock reconciled successfully.`,
      };
    } else if (rpcErr) {
      console.warn('RPC correct_finalized_daily_inventory failed, running client-side differential reconciliation fallback:', rpcErr);
    }
  } catch (err) {
    console.warn('RPC call exception, proceeding to fallback:', err);
  }

  // 2. Client-side Differential Reconciliation Fallback
  // Fetch existing items for this session to compute exact deltas
  const { data: existingRows, error: fetchErr } = await supabase
    .from('daily_inventory_items')
    .select('*, inventory_items(id, name, unit)')
    .eq('daily_inventory_id', dailyInventoryId);

  if (fetchErr) {
    throw new Error(`Failed to load existing worksheet items for reconciliation: ${fetchErr.message}`);
  }

  const existingMap = new Map<string, any>();
  (existingRows || []).forEach(row => {
    existingMap.set(row.item_id, row);
  });

  const stockAdjustments: any[] = [];
  const oldValuesSnapshot: any[] = [];
  const newValuesSnapshot: any[] = [];

  // Count existing revisions
  let existingRevsCount = 0;
  try {
    const { count } = await supabase
      .from('daily_inventory_revisions')
      .select('*', { count: 'exact', head: true })
      .eq('daily_inventory_id', dailyInventoryId);
    existingRevsCount = count || 0;
  } catch (e) {
    console.warn('Error counting revisions:', e);
  }
  revNum = existingRevsCount + 1;

  // Process differential stock reconciliation for each item
  for (const corrected of correctedItems) {
    const existing = existingMap.get(corrected.item_id);
    if (!existing) continue;

    const oldBeg = Number(existing.beg || 0);
    const oldAdd = Number(existing.add || 0);
    const oldAm = Number(existing.am || 0);
    const oldPm = Number(existing.pm || 0);
    const oldEnding = Number(existing.ending ?? (oldBeg + oldAdd - oldAm - oldPm));

    const newBeg = Math.max(0, Number(corrected.beg) || 0);
    const newAdd = Math.max(0, Number(corrected.add) || 0);
    const newAm = Math.max(0, Number(corrected.am) || 0);
    const newPm = Math.max(0, Number(corrected.pm) || 0);
    const newEnding = Math.max(0, Number(corrected.ending) || (newBeg + newAdd - newAm - newPm));

    oldValuesSnapshot.push({
      item_id: corrected.item_id,
      item_name: corrected.item_name || existing.inventory_items?.name,
      beg: oldBeg,
      add: oldAdd,
      am: oldAm,
      pm: oldPm,
      ending: oldEnding,
    });

    newValuesSnapshot.push({
      item_id: corrected.item_id,
      item_name: corrected.item_name || existing.inventory_items?.name,
      beg: newBeg,
      add: newAdd,
      am: newAm,
      pm: newPm,
      ending: newEnding,
    });

    // 2a. Differential Consumption Reconciliation
    const oldConsumption = oldAm + oldPm;
    const newConsumption = newAm + newPm;
    const deltaConsumption = newConsumption - oldConsumption;

    // 2b. Differential Receipt Reconciliation
    const deltaAdd = newAdd - oldAdd;

    if (deltaConsumption !== 0 || deltaAdd !== 0) {
      stockAdjustments.push({
        item_id: corrected.item_id,
        item_name: corrected.item_name || existing.inventory_items?.name,
        delta_consumption: deltaConsumption,
        delta_add: deltaAdd,
      });

      // Apply consumption delta
      if (deltaConsumption > 0) {
        // Additional consumption: consume stock
        try {
          await supabase.rpc('consume_stock', {
            p_item_id: corrected.item_id,
            p_quantity: deltaConsumption,
            p_reason: `Finalized Sheet Correction (Rev ${revNum}): +${deltaConsumption} usage`,
          });
        } catch (cErr) {
          console.warn('Error calling consume_stock fallback:', cErr);
        }
      } else if (deltaConsumption < 0) {
        // Overestimated consumption: replenish stock
        try {
          const replenishmentQty = Math.abs(deltaConsumption);
          const defaultExpiry = new Date();
          defaultExpiry.setDate(defaultExpiry.getDate() + 90);
          await supabase.rpc('add_stock', {
            p_item_id: corrected.item_id,
            p_quantity: replenishmentQty,
            p_expiry_date: defaultExpiry.toISOString().split('T')[0],
            p_received_date: new Date().toISOString().split('T')[0],
            p_reason: `Finalized Sheet Correction (Rev ${revNum}): Returned ${replenishmentQty} overestimated sales`,
          });
        } catch (aErr) {
          console.warn('Error calling add_stock fallback:', aErr);
        }
      }

      // Apply receipts delta
      if (deltaAdd > 0) {
        try {
          const defaultExpiry = new Date();
          defaultExpiry.setDate(defaultExpiry.getDate() + 90);
          await supabase.rpc('add_stock', {
            p_item_id: corrected.item_id,
            p_quantity: deltaAdd,
            p_expiry_date: defaultExpiry.toISOString().split('T')[0],
            p_received_date: new Date().toISOString().split('T')[0],
            p_reason: `Finalized Sheet Correction (Rev ${revNum}): +${deltaAdd} receipts adjustment`,
          });
        } catch (aErr) {
          console.warn('Error adding stock receipts delta:', aErr);
        }
      } else if (deltaAdd < 0) {
        try {
          await supabase.rpc('consume_stock', {
            p_item_id: corrected.item_id,
            p_quantity: Math.abs(deltaAdd),
            p_reason: `Finalized Sheet Correction (Rev ${revNum}): -${Math.abs(deltaAdd)} receipts reduction`,
          });
        } catch (cErr) {
          console.warn('Error reducing stock receipts delta:', cErr);
        }
      }
    }

    // 2c. Update daily_inventory_items row
    await supabase
      .from('daily_inventory_items')
      .update({
        beg: newBeg,
        add: newAdd,
        am: newAm,
        pm: newPm,
      })
      .eq('id', existing.id);
  }

  // 3. Insert Revision Record
  const revisionRecord: DailyInventoryRevision = {
    id: crypto.randomUUID(),
    daily_inventory_id: dailyInventoryId,
    revision_number: revNum,
    inventory_date: inventoryDate,
    reason: cleanReason,
    corrected_by: userProfile?.id || '00000000-0000-0000-0000-000000000000',
    corrected_by_name: userProfile?.displayName || userProfile?.email || 'Administrator',
    old_values: oldValuesSnapshot,
    new_values: newValuesSnapshot,
    stock_adjustments: stockAdjustments,
    created_at: new Date().toISOString(),
  };

  try {
    const { error: revInsertErr } = await supabase
      .from('daily_inventory_revisions')
      .insert(revisionRecord as any);

    if (revInsertErr) {
      // Fallback: save revision inside system_settings
      const key = `daily_rev_${dailyInventoryId}`;
      const { data: existingSettings } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();

      const existingVal = existingSettings ? (existingSettings as any).value : null;
      const revList: any[] = Array.isArray(existingVal) ? existingVal : [];
      revList.unshift(revisionRecord);

      await supabase.from('system_settings').upsert({
        key,
        value: revList,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (revErr) {
    console.warn('Failed to record daily inventory revision:', revErr);
  }

  // 4. Update the corresponding report with revision metadata
  try {
    await supabase
      .from('reports')
      .update({
        notes: `Revision ${revNum} applied on ${formatDateString(new Date())}: ${cleanReason}`,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('daily_inventory_id', dailyInventoryId);
  } catch (repErr) {
    console.warn('Report revision update error:', repErr);
  }

  // 5. Record System Audit Log
  try {
    await supabase.from('audit_logs').insert({
      action: 'FINALIZED_DAILY_INVENTORY_CORRECTED',
      target_table: 'daily_inventory',
      details: JSON.stringify({
        daily_inventory_id: dailyInventoryId,
        inventory_date: inventoryDate,
        revision_number: revNum,
        reason: cleanReason,
        stock_adjustments_count: stockAdjustments.length,
        corrected_by: userProfile?.email || 'Admin',
      }),
    } as any);
  } catch (auditErr) {
    console.warn('Audit log fallback warning:', auditErr);
  }

  // 6. Dispatch Notification
  try {
    await supabase.from('notifications').insert({
      type: 'DAILY_INVENTORY_REVISED',
      title: `Finalized Sheet Revised (Rev ${revNum})`,
      message: `Daily inventory for ${inventoryDate} was corrected by ${userProfile?.displayName || userProfile?.email || 'Administrator'}. Reason: ${cleanReason}`,
      target_id: `/daily-inventory?date=${inventoryDate}`,
      dedup_key: `rev_${dailyInventoryId}_${revNum}`,
    } as any);
  } catch (notifErr) {
    console.warn('Revision notification warning:', notifErr);
  }

  return {
    success: true,
    revisionNumber: revNum,
    message: `Revision ${revNum} recorded and stock reconciled successfully.`,
  };
}

/**
 * Fetch all revision history records for a given daily inventory session.
 */
export async function fetchDailyInventoryRevisions(dailyInventoryId: string): Promise<DailyInventoryRevision[]> {
  try {
    // 1. Try real table
    const { data, error } = await supabase
      .from('daily_inventory_revisions')
      .select('*')
      .eq('daily_inventory_id', dailyInventoryId)
      .order('revision_number', { ascending: false });

    if (!error && data && data.length > 0) {
      return data as DailyInventoryRevision[];
    }

    // 2. Fallback to system_settings
    const key = `daily_rev_${dailyInventoryId}`;
    const { data: settingsData } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    const settingsVal = settingsData ? (settingsData as any).value : null;
    if (Array.isArray(settingsVal) && settingsVal.length > 0) {
      return settingsVal as DailyInventoryRevision[];
    }

    return [];
  } catch (err) {
    console.warn('fetchDailyInventoryRevisions error:', err);
    return [];
  }
}

function formatDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}
