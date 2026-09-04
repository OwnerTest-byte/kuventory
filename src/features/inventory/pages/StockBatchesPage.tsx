import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Search, 
  Info,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

export function StockBatchesPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'fefo'>('fefo');
  const [search, setSearch] = useState('');

  const { data: batches = [], isLoading, refetch } = useQuery({
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
            id,
            item_name,
            item_code,
            unit,
            inventory_type
          )
        `)
        .order('expiry_date', { ascending: true, nullsFirst: false });
      
      if (error) throw error;
      return data as any[];
    }
  });

  const filteredBatches = useMemo(() => {
    let list = batches;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b => 
        b.batch_code?.toLowerCase().includes(q) ||
        b.items?.item_name?.toLowerCase().includes(q) ||
        b.items?.item_code?.toLowerCase().includes(q)
      );
    }
    if (activeTab === 'fefo') {
      // In FEFO mode, prioritize items that are active (>0) and have upcoming or past expiry
      list = list.filter(b => b.quantity > 0);
    }
    return list;
  }, [batches, search, activeTab]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 uppercase">
            Global Stock Batches
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            FEFO inventory rotation, batch lots, and expiration date monitoring.
          </p>
        </div>
        <Button 
          variant="outline"
          onClick={() => refetch()}
          className="border-slate-300 text-slate-700 bg-white hover:bg-slate-50 font-semibold text-xs flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Batches
        </Button>
      </div>

      {/* Tabs & Search Bar matching Mockup Screen 5 */}
      <Card className="bg-white border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50/50">
          {/* Tabs */}
          <div className="flex items-center gap-2 bg-slate-200/60 p-1 rounded-lg self-stretch sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('fefo')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === 'fefo'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              FEFO Priority Queue
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Batches &amp; Expiry
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search batch code or item..."
              className="pl-9 h-9 border-slate-300 text-xs bg-white"
            />
          </div>
        </div>

        {/* Batches Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500">
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Batch Code</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Item Name</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-center">Quantity</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Received Date</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Expiry Date</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-center">Days Left</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-center">Status</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400 text-xs">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                    Loading batches...
                  </td>
                </tr>
              ) : filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400 text-xs">
                    No batches match the criteria.
                  </td>
                </tr>
              ) : (
                filteredBatches.map((batch, index) => {
                  const expiryDate = batch.expiry_date ? new Date(batch.expiry_date) : null;
                  const now = new Date();
                  const isExpired = expiryDate && expiryDate < now;
                  const daysLeft = expiryDate ? differenceInDays(expiryDate, now) : null;

                  let priorityBadge = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                  let priorityText = 'NORMAL';

                  if (isExpired) {
                    priorityBadge = 'bg-rose-100 text-rose-800 font-bold border-rose-300';
                    priorityText = 'EXPIRED';
                  } else if (batch.quantity <= 0) {
                    priorityBadge = 'bg-slate-100 text-slate-600 border-slate-300';
                    priorityText = 'DEPLETED';
                  } else if (index === 0) {
                    priorityBadge = 'bg-rose-600 text-white font-bold animate-pulse';
                    priorityText = 'USE FIRST';
                  } else if (index === 1) {
                    priorityBadge = 'bg-amber-500 text-white font-bold';
                    priorityText = 'NEXT';
                  }

                  return (
                    <tr key={batch.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs font-bold text-slate-800">
                        {batch.batch_code}
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-900">
                        {batch.items?.item_name || 'Item'}
                        <span className="block text-[10px] text-slate-400 font-normal font-mono">
                          {batch.items?.item_code}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center font-mono font-bold text-slate-900 text-xs">
                        {batch.quantity} <span className="text-[11px] font-normal text-slate-500">{batch.items?.unit}</span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600">
                        {batch.created_at ? format(new Date(batch.created_at), 'MMM dd, yyyy') : '—'}
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold">
                        {expiryDate ? (
                          <span className={isExpired ? 'text-rose-600' : 'text-slate-800'}>
                            {format(expiryDate, 'MMM dd, yyyy')}
                          </span>
                        ) : (
                          <span className="text-slate-400">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-xs">
                        {daysLeft !== null ? (
                          <span className={isExpired ? 'text-rose-600 font-bold' : daysLeft <= 7 ? 'text-amber-600 font-bold' : 'text-slate-700'}>
                            {isExpired ? 'Expired' : `${daysLeft} days`}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold border ${priorityBadge}`}>
                          {priorityText}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {batch.items?.id ? (
                          <Link
                            to={`/items/${batch.items.id}`}
                            className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                          >
                            Inspect <ArrowRight className="w-3 h-3" />
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Informational Callout matching Mockup Screen 5 */}
        <div className="p-4 bg-amber-50/70 border-t border-amber-200/80 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <strong className="uppercase font-bold">FEFO (First Expire, First Out) Automated Principle:</strong>
            <p className="mt-0.5 text-amber-800">
              Stock deductions made via Daily Inventory or manual consumption are automatically allocated from the earliest expiry batch first, ensuring zero spoilage and accurate stock age tracking.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
