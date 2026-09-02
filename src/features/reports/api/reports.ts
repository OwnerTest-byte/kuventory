import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Report, ReportsFilter } from '../types';

export function useReportsList(filters: ReportsFilter) {
  return useQuery({
    queryKey: ['reports', 'list', filters],
    queryFn: async () => {
      let query = supabase
        .from('reports')
        .select(`
          id,
          daily_inventory_id,
          report_date,
          status,
          version,
          generated_at,
          generated_by
        `, { count: 'exact' });

      if (filters.fromDate) {
        query = query.gte('report_date', filters.fromDate);
      }
      if (filters.toDate) {
        query = query.lte('report_date', filters.toDate);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      
      const limit = filters.limit || 20;
      const offset = filters.offset || 0;
      
      query = query
        .order('report_date', { ascending: false })
        .order('version', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;
      
      return { data: data as Report[], count: count || 0 };
    }
  });
}
export function useReport(reportId: string | undefined) {
  return useQuery({
    queryKey: ['report', reportId],
    queryFn: async () => {
      if (!reportId) return null;

      const { data, error } = await supabase
        .from('reports')
        .select(`
          *,
          report_items (*)
        `)
        .eq('id', reportId)
        .single();

      if (error) {
        throw error;
      }

      return data as Report;
    },
    enabled: !!reportId,
  });
}

export function useReportByDailyInventoryId(dailyInventoryId: string | undefined) {
  return useQuery({
    queryKey: ['report', 'by-daily-inventory', dailyInventoryId],
    queryFn: async () => {
      if (!dailyInventoryId) return null;

      const { data, error } = await supabase
        .from('reports')
        .select(`
          *,
          report_items (*)
        `)
        .eq('daily_inventory_id', dailyInventoryId)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        // If no report exists, don't throw an error, just return null
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data as Report;
    },
    enabled: !!dailyInventoryId,
  });
}
