import { useQuery } from '@tanstack/react-query';
import { getStockMovementHistory } from '../api';
import { Card } from '@/components/ui/card';
import { Loader2, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

export function StockHistoryPage() {
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['global-stock-history'],
    queryFn: () => getStockMovementHistory(),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">Global Stock History &amp; Audit Trail</h1>
          <p className="text-xs text-slate-500 mt-1">Real-time log of stock receipts, consumption, adjustments, and balance transitions.</p>
        </div>
      </div>

      <Card className="shadow-sm border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">Date / Time</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">Item Name</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs text-center">Type</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs text-center">Qty Change</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs text-center">Balance Transition</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">Logged By</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">Reason / Ref</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    No stock movements recorded yet.
                  </td>
                </tr>
              ) : (
                movements.map(move => {
                  let badgeClass = 'bg-slate-100 text-slate-700';
                  if (move.action_type === 'ADD') badgeClass = 'bg-green-100 text-green-700';
                  if (move.action_type === 'REMOVE') badgeClass = 'bg-red-100 text-red-700';
                  if (move.action_type === 'ADJUST') badgeClass = 'bg-blue-100 text-blue-700';

                  const prefix = move.action_type === 'REMOVE' ? '-' : move.action_type === 'ADD' ? '+' : '';

                  return (
                    <tr key={move.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-slate-600 text-xs font-mono">
                        {format(new Date(move.created_at), 'MMM dd, yyyy h:mm a')}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900">
                        {move.item_name}
                        {move.batch_code && (
                          <span className="block text-[10px] text-slate-400 font-mono font-normal">
                            {move.batch_code}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                         <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${badgeClass}`}>
                           {move.action_type}
                         </span>
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-slate-900 font-mono">
                        {prefix}{Math.abs(move.quantity)}
                      </td>
                      <td className="px-6 py-4 text-center text-xs font-mono text-slate-600">
                        <span className="text-slate-500">{move.previous_balance}</span>
                        <ArrowRight className="inline w-3 h-3 mx-1.5 text-slate-400" />
                        <span className="font-bold text-slate-900">{move.new_balance}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-xs">
                        {move.user_name || 'System Admin'}
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-xs">
                        {move.reason || 'Inventory Adjustment'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
