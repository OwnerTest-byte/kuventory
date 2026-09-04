import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ReportsFilter {
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export function useReportsList(filters: ReportsFilter) {
  return useQuery({
    queryKey: ['reports', 'list', filters],
    queryFn: async () => {
      const limit = filters.limit || 20;
      const offset = filters.offset || 0;

      let query = supabase
        .from('daily_inventory')
        .select('id, inventory_date, state, finalized_at', { count: 'exact' })
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
        data: (data || []).map((d: any) => ({
          id: d.id,
          inventory_date: d.inventory_date,
          status: d.state,
          finalized_at: d.finalized_at,
          finalized_by_name: 'Admin User'
        })), 
        count: count || 0 
      };
    }
  });
}

export function useReport(reportId: string | undefined) {
  return useQuery({
    queryKey: ['report', reportId],
    queryFn: async () => {
      if (!reportId) return null;

      const { data, error } = await supabase
        .from('daily_inventory')
        .select(`
          id,
          inventory_date,
          state,
          finalized_at,
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
              unit,
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

      const mappedEntries = (data.daily_inventory_items || []).map((entry: any) => {
        const catName = entry.inventory_items?.categories?.name || 'General';
        return {
          id: entry.id,
          section: catName.toUpperCase().includes('CASE') ? 'PER CASES' : 'PORTION STOCK',
          beginning_qty: Number(entry.beg || 0),
          add_qty: Number(entry.add || 0),
          total_stock: Number(entry.total ?? (Number(entry.beg || 0) + Number(entry.add || 0))),
          sales_am: Number(entry.am || 0),
          sales_pm: Number(entry.pm || 0),
          ending_qty: Number(entry.ending ?? 0),
          items: {
            item_name: entry.inventory_items?.name || 'Unknown Item',
            unit: entry.inventory_items?.unit || 'pcs'
          }
        };
      });

      return {
        id: data.id,
        inventory_date: data.inventory_date,
        status: data.state,
        finalized_at: data.finalized_at,
        daily_inventory_entries: mappedEntries
      };
    },
    enabled: !!reportId,
  });
}
