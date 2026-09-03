import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export function StockHistoryPage() {
  const { data: movements, isLoading } = useQuery({
    queryKey: ['global-stock-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select(`
          id,
          type,
          quantity_change,
          reason,
          created_at,
          inventory_items (
            name,
            unit
          )
        `)
        .order('created_at', { ascending: false })
        .limit(200);
      
      if (error) throw error;
      return data as any[];
    }
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">Global Stock History</h1>
      </div>

      <Card className="shadow-sm border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">Date / Time</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">Item Name</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs text-center">Type</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs text-center">Change</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">Reason</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : movements?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    No stock movements recorded yet.
                  </td>
                </tr>
              ) : (
                movements?.map(move => {
                  let badgeClass = 'bg-slate-100 text-slate-700';
                  if (move.type === 'ADD') badgeClass = 'bg-green-100 text-green-700';
                  if (move.type === 'REMOVE') badgeClass = 'bg-red-100 text-red-700';
                  if (move.type === 'ADJUST') badgeClass = 'bg-blue-100 text-blue-700';

                  const prefix = move.type === 'REMOVE' ? '-' : move.type === 'ADD' ? '+' : '';

                  return (
                    <tr key={move.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-slate-600">
                        {format(new Date(move.created_at), 'MMM dd, yyyy h:mm a')}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {move.inventory_items?.name}
                      </td>
                      <td className="px-6 py-4 text-center">
                         <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${badgeClass}`}>
                           {move.type}
                         </span>
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-slate-900">
                        {prefix}{Math.abs(move.quantity_change)} <span className="text-xs font-normal text-slate-500">{move.inventory_items?.unit}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {move.reason}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
