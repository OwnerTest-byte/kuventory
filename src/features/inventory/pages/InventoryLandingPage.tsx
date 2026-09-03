import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getInventory } from '../api';
import { Package, AlertTriangle, ArrowRight, Search, Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { stockStatusVariant } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import type { InventoryStock } from '../types';

type StatusFilter = 'ALL' | 'IN_STOCK' | 'LOW' | 'OUT';

export function InventoryLandingPage() {
  const { data: items, isLoading, isError, refetch } = useQuery({
    queryKey: ['inventory'],
    queryFn: getInventory,
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const today = format(new Date(), 'MMM dd, yyyy');

  const summary = useMemo(() => {
    const list = items || [];
    return {
      total: list.length,
      active: list.filter(i => i.total_quantity > 0 && i.total_quantity > i.min_quantity).length,
      low: list.filter(i => i.total_quantity > 0 && i.total_quantity <= i.min_quantity).length,
      out: list.filter(i => i.total_quantity <= 0).length,
      units: list.reduce((acc, i) => acc + (Number(i.total_quantity) || 0), 0),
    };
  }, [items]);

  const filtered = useMemo(() => {
    let list = items || [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    if (statusFilter === 'IN_STOCK') list = list.filter(i => i.total_quantity > 0 && i.total_quantity > i.min_quantity);
    if (statusFilter === 'LOW') list = list.filter(i => i.total_quantity > 0 && i.total_quantity <= i.min_quantity);
    if (statusFilter === 'OUT') list = list.filter(i => i.total_quantity <= 0);
    return list;
  }, [items, search, statusFilter]);

  const statusLabel = (item: InventoryStock) => {
    if (item.total_quantity <= 0) return 'OUT OF STOCK';
    if (item.total_quantity <= item.min_quantity) return 'LOW STOCK';
    return 'IN STOCK';
  };

  const statusText: Record<string, string> = {
    'IN STOCK': 'Normal',
    'LOW STOCK': 'Low',
    'OUT OF STOCK': 'None',
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-8 animate-in fade-in duration-300">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Inventory Overview</h1>
        <p className="text-slate-500 dark:text-slate-400">Monitor stock levels and run the daily count.</p>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Items</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{isLoading ? '…' : summary.total}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">In Stock</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{isLoading ? '…' : summary.active}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Low Stock</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{isLoading ? '…' : summary.low}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">Out of Stock</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{isLoading ? '…' : summary.out}</div>
        </div>
      </div>

      {/* Primary Action */}
      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-5 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1 text-center md:text-left">
          <h2 className="text-lg font-bold text-blue-900 dark:text-blue-100">Today's Inventory</h2>
          <p className="text-blue-700/80 dark:text-blue-300/80 font-medium">{today}</p>
        </div>
        <Link
          to="/daily-inventory"
          className="w-full md:w-auto inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold h-11 px-6 rounded-lg shadow transition-colors"
        >
          Open Today's Inventory
          <ArrowRight className="ml-2 w-5 h-5" />
        </Link>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items..."
            className="pl-9"
            aria-label="Search inventory items"
          />
        </div>
        <div className="flex gap-2">
          {(['ALL', 'IN_STOCK', 'LOW', 'OUT'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                statusFilter === f
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {f === 'ALL' ? 'All' : f === 'IN_STOCK' ? 'In Stock' : f === 'LOW' ? 'Low' : 'Out'}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Min</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading inventory...
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <div className="text-red-600 dark:text-red-400 mb-3">Unable to load inventory.</div>
                  <button onClick={() => refetch()} className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline">
                    <RefreshCw className="w-4 h-4 mr-1" /> Try Again
                  </button>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  No inventory items found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => {
                const status = statusLabel(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-slate-900 dark:text-white">
                      {item.name}
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300">
                      {item.unit}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-slate-900 dark:text-white tabular-nums">
                      {item.total_quantity}
                    </TableCell>
                    <TableCell className="text-right text-slate-500 tabular-nums">
                      {item.min_quantity}
                    </TableCell>
                    <TableCell>
                      <Badge variant={stockStatusVariant(item.total_quantity, item.min_quantity)}>
                        <span className="sr-only">{statusText[status]}</span>
                        {status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Low stock alert card */}
      {summary.low + summary.out > 0 && !isLoading && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-900 dark:text-amber-200">
            <span className="font-semibold">
              {summary.out} out of stock, {summary.low} low.
            </span>{' '}
            Restock soon to avoid stockouts. Use the stock management screen to add batches.
          </div>
        </div>
      )}
    </div>
  );
}
