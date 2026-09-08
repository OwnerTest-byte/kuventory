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

export function StockBatchesPage({ embedded }: { embedded?: boolean } = {}) {
  const [stockFilter, setStockFilter] = useState<'in_stock' | 'all'>('in_stock');
  const [expiryFilter, setExpiryFilter] = useState<'all' | 'expiring' | 'expired'>('all');
  const [search, setSearch] = useState('');

  const { data: batches = [], isLoading, refetch } = useQuery({
    queryKey: ['global-stock-batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_batches')
        .select(`
          id,
          quantity,
          expiry_date,
          received_date,
          created_at,
          inventory_items (
            id,
            name,
            unit,
            unit_cost,
            supplier_a,
            supplier_b,
            description,
            categories (
              name
            )
          )
        `)
        .order('expiry_date', { ascending: true, nullsFirst: false });
      
      if (error) {
        console.error('Failed to query stock_batches:', error);
        throw error;
      }

      return (data || []).map((b: any) => ({
        id: b.id,
        batch_code: `BATCH-${b.id.substring(0, 6).toUpperCase()}`,
        quantity: Number(b.quantity || 0),
        expiry_date: b.expiry_date,
        received_date: b.received_date,
        created_at: b.created_at,
        items: {
          id: b.inventory_items?.id,
          item_name: b.inventory_items?.name || 'Item',
          item_code: (b.inventory_items?.id || '').substring(0, 8).toUpperCase(),
          unit: b.inventory_items?.unit || 'pcs',
          unit_cost: Number(b.inventory_items?.unit_cost || 0),
          category_name: b.inventory_items?.categories?.name || 'General',
          supplier_a: b.inventory_items?.supplier_a || 'Supplier A',
          supplier_b: b.inventory_items?.supplier_b || 'Supplier B',
        }
      }));
    }
  });

  const filteredBatches = useMemo(() => {
    let list = batches;
    const now = new Date();

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b => 
        b.batch_code?.toLowerCase().includes(q) ||
        b.items?.item_name?.toLowerCase().includes(q) ||
        b.items?.item_code?.toLowerCase().includes(q) ||
        b.items?.supplier_a?.toLowerCase().includes(q)
      );
    }

    if (stockFilter === 'in_stock') {
      list = list.filter(b => b.quantity > 0);
    }

    if (expiryFilter === 'expired') {
      list = list.filter(b => b.expiry_date && new Date(b.expiry_date) < now);
    } else if (expiryFilter === 'expiring') {
      list = list.filter(b => {
        if (!b.expiry_date) return false;
        const d = differenceInDays(new Date(b.expiry_date), now);
        return d >= 0 && d <= 14;
      });
    }

    return list;
  }, [batches, search, stockFilter, expiryFilter]);

  return (
    <div className={embedded ? "space-y-4" : "p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6"}>
      {/* Page Header */}
      {!embedded && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground uppercase">
              Stock Batches (FEFO Tracking)
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Automated First-Expired, First-Out queue, expiration monitoring, and batch lot tracking.
            </p>
          </div>
          <Button 
            variant="outline"
            onClick={() => refetch()}
            className="border-border text-foreground bg-card hover:bg-muted font-semibold text-xs flex items-center gap-1.5 self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh Batches
          </Button>
        </div>
      )}

      {/* Filter Toolbar with Search */}
      <Card className="bg-card border-border shadow-xs overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 items-center justify-between bg-muted/40">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
            {/* Stock Balance Filter */}
            <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setStockFilter('in_stock')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  stockFilter === 'in_stock'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                In-Stock Only
              </button>
              <button
                type="button"
                onClick={() => setStockFilter('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  stockFilter === 'all'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All (incl. Depleted)
              </button>
            </div>

            {/* Expiry Quick Filter */}
            <select
              value={expiryFilter}
              onChange={(e) => setExpiryFilter(e.target.value as any)}
              className="h-9 px-3 py-1.5 bg-card border border-border rounded-lg text-xs font-semibold text-foreground shadow-xs focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="all">All Expirations</option>
              <option value="expiring">Expiring Soon (≤14 days)</option>
              <option value="expired">Expired Batches</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search batch code or item..."
              className="pl-9 h-9 border-border text-xs bg-card text-foreground"
            />
          </div>
        </div>

        {/* Batches Table with Table Slider Container */}
        <div className="table-slider-container max-h-[calc(100dvh-320px)] min-h-[350px] relative overscroll-contain">
          <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
            <thead className="sticky top-0 z-20 bg-muted/60 backdrop-blur-xs border-b border-border shadow-xs">
              <tr className="text-muted-foreground">
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs sticky left-0 z-30 bg-muted/95 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">Batch Code</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Item Name</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-center">Quantity</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Received Date</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Expiry Date</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-center">Days Left</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-center">Priority</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground text-xs">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-primary mb-2" />
                    Loading batches...
                  </td>
                </tr>
              ) : filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground text-xs">
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
                    <tr key={batch.id} className="hover:bg-muted/40 transition-colors group">
                      <td className="px-6 py-4 font-mono text-xs font-bold text-foreground sticky left-0 z-10 bg-card group-hover:bg-muted/50 border-r border-border">
                        {batch.batch_code}
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-foreground">
                        {batch.items?.item_name || 'Item'}
                        <span className="block text-[10px] text-muted-foreground font-normal font-mono">
                          {batch.items?.item_code}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center font-mono font-bold text-foreground text-xs">
                        {batch.quantity} <span className="text-[11px] font-normal text-muted-foreground">{batch.items?.unit}</span>
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">
                        {batch.created_at ? format(new Date(batch.created_at), 'MMM dd, yyyy') : '—'}
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold">
                        {expiryDate ? (
                          <span className={isExpired ? 'text-destructive font-bold' : 'text-foreground'}>
                            {format(expiryDate, 'MMM dd, yyyy')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-xs">
                        {daysLeft !== null ? (
                          <span className={isExpired ? 'text-destructive font-bold' : daysLeft <= 7 ? 'text-amber-500 font-bold' : 'text-foreground'}>
                            {isExpired ? 'Expired' : `${daysLeft} days`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
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
                            className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
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
        <div className="p-4 bg-muted/40 border-t border-border flex items-start gap-3">
          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-foreground">
            <strong className="uppercase font-bold">FEFO (First Expire, First Out) Automated Principle:</strong>
            <p className="mt-0.5 text-muted-foreground">
              Stock deductions made via Daily Inventory or manual consumption are automatically allocated from the earliest expiry batch first, ensuring zero spoilage and accurate stock age tracking.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
