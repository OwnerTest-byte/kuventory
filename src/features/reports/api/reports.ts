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
      let query = supabase
        .from('daily_inventory_sessions')
        .select(`
          id,
          inventory_date,
          status,
          finalized_at,
          profiles!daily_inventory_sessions_finalized_by_fkey (
            first_name,
            last_name
          )
        `, { count: 'exact' })
        .eq('status', 'FINALIZED');

      if (filters.fromDate) {
        query = query.gte('inventory_date', filters.fromDate);
      }
      if (filters.toDate) {
        query = query.lte('inventory_date', filters.toDate);
      }
      
      const limit = filters.limit || 20;
      const offset = filters.offset || 0;
      
      query = query
        .order('inventory_date', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;
      
      return { 
        data: data.map((d: any) => ({
          ...d,
          finalized_by_name: d.profiles ? `${d.profiles.first_name} ${d.profiles.last_name}` : 'Unknown'
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
        .from('daily_inventory_sessions')
        .select(`
          *,
          daily_inventory_entries (
            *,
            items (
              item_name,
              item_code,
              unit,
              inventory_type
            )
          ),
          users!daily_inventory_sessions_finalized_by_fkey (
            full_name
          )
        `)
        .eq('id', reportId)
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
    enabled: !!reportId,
  });
}
