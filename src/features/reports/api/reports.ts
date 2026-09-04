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

      const mappedEntries = (data.daily_inventory_items || []).map((entry: any) => {
        const catName = (entry.inventory_items?.categories?.name || '').toUpperCase();
        let section: 'GRILLED STOCK' | 'PORTION STOCK' | 'PER CASES' = 'PORTION STOCK';
        if (catName.includes('GRILL')) section = 'GRILLED STOCK';
        else if (catName.includes('CASE')) section = 'PER CASES';

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
        inventory_date: data.inventory_date,
        status: data.state,
        finalized_at: data.finalized_at,
        daily_inventory_entries: mappedEntries
      };
    },
    enabled: !!reportId,
  });
}
