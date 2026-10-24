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
  baselineItems?: DailyInventoryCorrectionItem[];
  userProfile?: { id?: string; email?: string; displayName?: string } | null;
}

/**
 * Execute differential stock reconciliation and save finalized day correction revision.
 * Strictly guarantees that historical stock operations are NEVER replayed blindly.
 */
export async function correctFinalizedDailyInventory({
  dailyInventoryId,
  inventoryDate: _inventoryDate,
  reason,
  correctedItems,
  baselineItems: _baselineItems,
  userProfile: _userProfile,
}: CorrectFinalizedDayParams): Promise<{ success: boolean; revisionNumber: number; message: string }> {
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('A reason for correction is required to update a finalized daily report.');
  }

  if (!dailyInventoryId) {
    throw new Error('Worksheet identifier is required for finalized correction.');
  }

  if (!correctedItems || correctedItems.length === 0) {
    throw new Error('At least one item must be provided for correction.');
  }

  // Finalized-day correction must use one transactional server RPC only.
  // Never run a client-side reconciliation fallback after an RPC error, as that
  // causes partial mutations and audit ledger divergence.
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

  if (rpcErr) {
    console.error('correct_finalized_daily_inventory RPC failed; correction aborted:', rpcErr);
    throw new Error(`Finalized worksheet correction failed on server: ${rpcErr.message}`);
  }

  if (!rpcData || !rpcData.success) {
    const failureMsg = rpcData?.message || 'Database rejected finalized correction.';
    console.error('correct_finalized_daily_inventory returned failure:', failureMsg);
    throw new Error(`Finalized worksheet correction rejected: ${failureMsg}`);
  }

  return {
    success: true,
    revisionNumber: rpcData.revision_number || 1,
    message: rpcData.message || `Revision ${rpcData.revision_number || 1} recorded and stock reconciled successfully.`,
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
      // Ensure revisions are sequentially ordered and numbered chronologically
      const sortedAsc = [...settingsVal].sort(
        (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );

      let needsResequence = false;
      const resequenced = sortedAsc.map((rev, idx) => {
        const expected = idx + 1;
        if (Number(rev.revision_number) !== expected) {
          needsResequence = true;
          return { ...rev, revision_number: expected };
        }
        return rev;
      });

      const sortedDesc = [...resequenced].sort(
        (a, b) => Number(b.revision_number || 0) - Number(a.revision_number || 0)
      );

      // Heal legacy duplicates in persistent storage in the background
      if (needsResequence) {
        supabase
          .from('system_settings')
          .upsert({
            key,
            value: sortedDesc,
            updated_at: new Date().toISOString(),
          })
          .then();
      }

      return sortedDesc as DailyInventoryRevision[];
    }

    return [];
  } catch (err) {
    console.warn('fetchDailyInventoryRevisions error:', err);
    return [];
  }
}
