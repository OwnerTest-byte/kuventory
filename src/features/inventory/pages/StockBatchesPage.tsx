import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export function StockBatchesPage() {
  const { data: batches, isLoading } = useQuery({
    queryKey: ['global-stock-batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_batches')
        .select(`
          id,
          batch_code,
          quantity,
          expiry_date,
          created_at,
          items (
            item_name,
            unit
          )
        `)
        .order('expiry_date', { ascending: true, nullsFirst: false });
      
      if (error) throw error;
      return data as any[];
    }
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">Global Stock Batches</h1>
      </div>

      <Card className="shadow-sm border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">Batch Code</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">Item Name</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs text-center">Quantity</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">Received Date</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">Expiry Date</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs text-center">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : batches?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No active stock batches found.
                  </td>
                </tr>
              ) : (
                batches?.map(batch => {
                  const isExpired = batch.expiry_date && new Date(batch.expiry_date) < new Date();
                  return (
                    <tr key={batch.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">
                        {batch.batch_code}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {batch.items?.item_name}
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-slate-700">
                        {batch.quantity} <span className="text-xs font-normal text-slate-500">{batch.items?.unit}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {format(new Date(batch.created_at), 'MMM dd, yyyy')}
                      </td>
                      <td className="px-6 py-4 font-medium">
                        {batch.expiry_date ? (
                           <span className={isExpired ? "text-red-600" : "text-amber-600"}>
                             {format(new Date(batch.expiry_date), 'MMM dd, yyyy')}
                           </span>
                        ) : (
                           <span className="text-slate-400">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                         {isExpired ? (
                           <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-red-100 text-red-700">EXPIRED</span>
                         ) : batch.quantity <= 0 ? (
                           <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700">DEPLETED</span>
                         ) : (
                           <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-green-100 text-green-700">ACTIVE</span>
                         )}
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
