import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ReportsFilter {
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * Lists finalized inventory reports with authentic finalizer profile names.
 */
export function useReportsList(filters: ReportsFilter) {
  return useQuery({
    queryKey: ['reports', 'list', filters],
    queryFn: async () => {
      const limit = filters.limit || 20;
      const offset = filters.offset || 0;

      let query = supabase
        .from('daily_inventory')
        .select(`
          id, 
          inventory_date, 
          state, 
          finalized_at,
          finalized_by,
          profiles:finalized_by (
            display_name,
            first_name,
            last_name
          )
        `, { count: 'exact' })
        .eq('state', 'FINALIZED');

      if (filters.fromDate) {
        query = query.gte('inventory_date', filters.fromDate);
      }
      if (filters.toDate) {
        query = query.lte('inventory_date', filters.toDate);
      }
      
      query = query
        .order('inventory_date', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error('Reports fetch error:', error);
        throw error;
      }
      
      return { 
        data: (data || []).map((d: any) => {
          const profile = d.profiles;
          const finalizerName = profile?.display_name || 
            (profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : 'Warehouse Administrator');

          return {
            id: d.id,
            inventory_date: d.inventory_date,
            status: d.state,
            finalized_at: d.finalized_at,
            finalized_by_name: finalizerName
          };
        }), 
        count: count || 0 
      };
    }
  });
}

/**
 * Loads report details prioritizing immutable snapshots from `reports` and `report_items`.
 * Ensures reports reflect immutable historical snapshots captured upon finalization (H2 / DATA-01).
 */
export function useReport(reportId: string | undefined) {
  return useQuery({
    queryKey: ['report', reportId],
    queryFn: async () => {
      if (!reportId) return null;

      // 1. Prioritize querying immutable snapshot from reports + report_items
      const { data: snapshotReport } = await supabase
        .from('reports')
        .select(`
          id,
          daily_inventory_id,
          report_date,
          generated_by,
          created_at,
          profiles:generated_by (
            display_name,
            first_name,
            last_name
          ),
          report_items (
            id,
            item_name,
            category_name,
            description,
            unit,
            unit_cost,
            supplier_a,
            supplier_b,
            beg,
            add,
            total,
            am,
            pm,
            ending
          )
        `)
        .or(`id.eq.${reportId},daily_inventory_id.eq.${reportId}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (snapshotReport && snapshotReport.report_items && snapshotReport.report_items.length > 0) {
        const genProfile = snapshotReport.profiles as any;
        const finalizerName = genProfile?.display_name || 
          (genProfile?.first_name ? `${genProfile.first_name} ${genProfile.last_name || ''}`.trim() : 'Warehouse Administrator');

        const mappedEntries = snapshotReport.report_items.map((entry: any) => ({
          id: entry.id,
          section: (entry.category_name || 'GENERAL').toUpperCase(),
          beginning_qty: Number(entry.beg || 0),
          add_qty: Number(entry.add || 0),
          total_stock: Number(entry.total ?? (Number(entry.beg || 0) + Number(entry.add || 0))),
          sales_am: Number(entry.am || 0),
          sales_pm: Number(entry.pm || 0),
          ending_qty: Number(entry.ending ?? 0),
          items: {
            item_name: entry.item_name || 'Unknown Item',
            description: entry.description || '',
            unit: entry.unit || 'pcs',
            unit_cost: Number(entry.unit_cost || 0),
            supplier_a: entry.supplier_a || '',
            supplier_b: entry.supplier_b || '',
          }
        }));

        return {
          id: snapshotReport.id,
          daily_inventory_id: snapshotReport.daily_inventory_id,
          inventory_date: snapshotReport.report_date,
          status: 'FINALIZED',
          finalized_at: snapshotReport.created_at,
          finalized_by_name: finalizerName,
          daily_inventory_entries: mappedEntries
        };
      }

      // 2. Fallback to daily_inventory + daily_inventory_items (for drafts or legacy sheets)
      const { data, error } = await supabase
        .from('daily_inventory')
        .select(`
          id,
          inventory_date,
          state,
          finalized_at,
          finalized_by,
          profiles:finalized_by (
            display_name,
            first_name,
            last_name
          ),
          daily_inventory_items (
            id,
            beg,
            add,
            total,
            am,
            pm,
            ending,
            inventory_items (
              id,
              name,
              description,
              unit,
              unit_cost,
              supplier_a,
              supplier_b,
              categories ( name )
            )
          )
        `)
        .eq('id', reportId)
        .single();

      if (error) {
        console.error('Report view error:', error);
        throw error;
      }

      const fbProfile = data.profiles as any;
      const finalizerName = fbProfile?.display_name || 
        (fbProfile?.first_name ? `${fbProfile.first_name} ${fbProfile.last_name || ''}`.trim() : 'Warehouse Administrator');

      const mappedEntries = (data.daily_inventory_items || []).map((entry: any) => {
        const catName = entry.inventory_items?.categories?.name || 'General';
        const section = catName.toUpperCase();

        return {
          id: entry.id,
          section,
          beginning_qty: Number(entry.beg || 0),
          add_qty: Number(entry.add || 0),
          total_stock: Number(entry.total ?? (Number(entry.beg || 0) + Number(entry.add || 0))),
          sales_am: Number(entry.am || 0),
          sales_pm: Number(entry.pm || 0),
          ending_qty: Number(entry.ending ?? 0),
          items: {
            item_name: entry.inventory_items?.name || 'Unknown Item',
            description: entry.inventory_items?.description || '',
            unit: entry.inventory_items?.unit || 'pcs',
            unit_cost: Number(entry.inventory_items?.unit_cost || 0),
            supplier_a: entry.inventory_items?.supplier_a || '',
            supplier_b: entry.inventory_items?.supplier_b || '',
          }
        };
      });

      return {
        id: data.id,
        daily_inventory_id: data.id,
        inventory_date: data.inventory_date,
        status: data.state,
        finalized_at: data.finalized_at,
        finalized_by_name: finalizerName,
        daily_inventory_entries: mappedEntries
      };
    },
    enabled: !!reportId,
  });
}
