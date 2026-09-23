import { useQuery } from '@tanstack/react-query';
import { getStockMovementHistory } from '../api';
import { Card } from '@/components/ui/card';
import { Loader2, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

export function StockHistoryPage({ embedded }: { embedded?: boolean } = {}) {
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['global-stock-history'],
    queryFn: () => getStockMovementHistory(),
  });

  return (
    <div className={embedded ? "space-y-4" : "p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-foreground"}>
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground uppercase">Stock Movements &amp; Audit Trail</h1>
            <p className="text-xs text-muted-foreground mt-1">Real-time log of stock receipts, consumption, adjustments, and balance transitions.</p>
          </div>
        </div>
      )}

      <Card className="shadow-xs border-border overflow-hidden bg-card">
        <div className="table-slider-container max-h-[calc(100dvh-320px)] min-h-[350px] overflow-y-auto overflow-x-auto relative overscroll-contain">
          <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
            <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur-xs border-b border-border shadow-xs">
              <tr className="text-muted-foreground">
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs sticky left-0 z-30 bg-muted border-r border-border">Date / Time</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Item Name</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-center">Type</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-center">Qty Change</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-center">Balance Transition</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Logged By</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Reason / Ref</th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    No stock movements recorded yet.
                  </td>
                </tr>
              ) : (
                movements.map(move => {
                  let badgeClass = 'bg-muted text-muted-foreground border-border';
                  let actionLabel: string = move.action_type || 'Update';

                  if (move.action_type === 'ADD') {
                    badgeClass = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
                    actionLabel = 'Added';
                  } else if (move.action_type === 'REMOVE') {
                    badgeClass = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
                    actionLabel = 'Deducted';
                  } else if (move.action_type === 'ADJUST') {
                    badgeClass = 'bg-primary/10 text-primary border border-primary/20';
                    actionLabel = 'Correction';
                  }

                  const prefix = move.action_type === 'REMOVE' ? '-' : move.action_type === 'ADD' ? '+' : '';

                  return (
                    <tr key={move.id} className="hover:bg-muted/40 transition-colors group">
                      <td className="px-6 py-4 text-muted-foreground text-xs font-mono sticky left-0 z-10 bg-card group-hover:bg-muted border-r border-border">
                        {format(new Date(move.created_at), 'MMM dd, yyyy h:mm a')}
                      </td>
                      <td className="px-6 py-4 font-bold text-foreground">
                        {move.item_name}
                        {move.batch_code && (
                          <span className="block text-[10px] text-muted-foreground font-mono font-normal">
                            {move.batch_code}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                         <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${badgeClass}`}>
                           {actionLabel}
                         </span>
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-foreground font-mono">
                        {prefix}{Math.abs(move.quantity)}
                      </td>
                      <td className="px-6 py-4 text-center text-xs font-mono text-muted-foreground">
                        <span>{move.previous_balance}</span>
                        <ArrowRight className="inline w-3 h-3 mx-1.5 text-muted-foreground" />
                        <span className="font-bold text-foreground">{move.new_balance}</span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">
                        {move.user_name || 'System Admin'}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">
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
