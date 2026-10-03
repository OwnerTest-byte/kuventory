import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { getInventory, getStockMovementHistory, getDashboardTop3Stats } from '@/features/inventory/api';
import { supabase } from '@/lib/supabase';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from 'recharts';
import { 
  TrendingUp, 
  PieChart as PieChartIcon, 
  Activity, 
  ArrowLeft, 
  Layers, 
  Clock, 
  Package, 
  DollarSign,
  Calendar,
  ArrowUpRight,
  PackageCheck,
  AlertTriangle
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const CATEGORY_COLORS = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B'];

export function AnalyticsPage() {
  const navigate = useNavigate();
  const [movementFilter, setMovementFilter] = useState<'ALL' | 'ADD' | 'REMOVE' | 'ADJUST'>('ALL');

  // 1. Fetch Inventory Items
  const { data: items = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: getInventory,
  });

  // 2. Fetch Active Stock Batches
  const { data: batches = [] } = useQuery({
    queryKey: ['global-stock-batches-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_batches')
        .select(`
          id, 
          quantity, 
          expiry_date,
          created_at,
          inventory_items (
            id,
            name,
            unit,
            unit_cost
          )
        `)
        .gt('quantity', 0)
        .order('expiry_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []).map((b: any) => ({
        id: b.id,
        batch_code: `BATCH-${b.id.substring(0, 6).toUpperCase()}`,
        quantity: Number(b.quantity || 0),
        expiry_date: b.expiry_date,
        created_at: b.created_at,
        items: {
          id: b.inventory_items?.id,
          name: b.inventory_items?.name || 'Item',
          unit: b.inventory_items?.unit || 'pcs',
          unit_cost: Number(b.inventory_items?.unit_cost || 0),
        }
      }));
    }
  });

  // 3. Fetch Stock Movement History
  const { data: recentTransactions = [] } = useQuery({
    queryKey: ['global-stock-history'],
    queryFn: () => getStockMovementHistory(),
  });

  // 4. Fetch Operational Top 3 Decision Statistics (Outflow, Stocked, Lowest)
  const { data: top3Stats } = useQuery({
    queryKey: ['operational-top3-stats'],
    queryFn: getDashboardTop3Stats,
  });

  // Category Distribution Computation (Recharts Pie)
  const categoryChartData = useMemo(() => {
    const catMap = new Map<string, { quantity: number; value: number }>();
    items.filter(i => !i.is_archived).forEach(item => {
      const cat = item.category_name || 'Uncategorized';
      const qty = Number(item.current_qty) || 0;
      const val = qty * (Number(item.unit_cost) || 0);
      const existing = catMap.get(cat) || { quantity: 0, value: 0 };
      catMap.set(cat, {
        quantity: existing.quantity + qty,
        value: existing.value + val,
      });
    });

    return Array.from(catMap.entries()).map(([name, stat]) => ({
      name,
      value: stat.quantity,
      monetaryValue: stat.value
    })).filter(d => d.value > 0);
  }, [items]);

  // Weekly Movements Activity Computation (Recharts Bar)
  const movementChartData = useMemo(() => {
    const dayBuckets: Record<string, { day: string; inStock: number; outStock: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = format(d, 'EEE');
      dayBuckets[key] = { day: key, inStock: 0, outStock: 0 };
    }

    recentTransactions.forEach((tx) => {
      if (!tx.created_at) return;
      const txDate = new Date(tx.created_at);
      const dayKey = format(txDate, 'EEE');
      if (dayBuckets[dayKey]) {
        const qty = Math.abs(Number(tx.quantity)) || 0;
        if (tx.action_type === 'ADD') {
          dayBuckets[dayKey].inStock += qty;
        } else if (tx.action_type === 'REMOVE') {
          dayBuckets[dayKey].outStock += qty;
        }
      }
    });

    return Object.values(dayBuckets);
  }, [recentTransactions]);

  // High-Level Analytical Summary
  const analyticsSummary = useMemo(() => {
    const active = items.filter(i => !i.is_archived);
    const totalInventoryValue = active.reduce((acc, i) => acc + (Number(i.current_qty) || 0) * (Number(i.unit_cost) || 0), 0);
    const totalUnits = active.reduce((acc, i) => acc + (Number(i.current_qty) || 0), 0);
    const now = new Date();
    const threshold14Days = addDays(now, 14);
    const atRiskBatches = batches.filter(b => b.expiry_date && new Date(b.expiry_date) <= threshold14Days);

    return {
      totalValue: totalInventoryValue,
      totalUnits,
      activeSkus: active.length,
      trackedBatches: batches.length,
      atRiskCount: atRiskBatches.length,
      avgUnitCost: totalUnits > 0 ? totalInventoryValue / totalUnits : 0,
    };
  }, [items, batches]);

  const filteredMovements = useMemo(() => {
    if (movementFilter === 'ALL') return recentTransactions;
    return recentTransactions.filter(t => t.action_type === movementFilter);
  }, [recentTransactions, movementFilter]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link 
              to="/inventory" 
              className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
            </Link>
            <span className="text-muted-foreground/60">•</span>
            <span className="text-xs font-semibold text-primary">Deep-Dive Analytics</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Inventory Analytics &amp; Reports
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Visual distribution, weekly movement velocity, and category asset valuations.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/reports')}
            className="border-border text-foreground hover:bg-muted font-semibold text-xs"
          >
            <Calendar className="w-3.5 h-3.5 mr-1.5" />
            Official Snapshots
          </Button>
          <Button
            size="sm"
            onClick={() => navigate('/items')}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs"
          >
            <Package className="w-3.5 h-3.5 mr-1.5" />
            Manage Stock Items
          </Button>
        </div>
      </div>

      {/* Analytical KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Value</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl sm:text-3xl font-bold text-foreground font-mono">
                ₱{analyticsSummary.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Sum of active items &times; unit cost</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Units</span>
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl sm:text-3xl font-bold text-foreground font-mono">
                {analyticsSummary.totalUnits.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Across {analyticsSummary.activeSkus} active catalog SKUs</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Batches</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl sm:text-3xl font-bold text-amber-500 font-mono">
                {analyticsSummary.trackedBatches}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Under strict FEFO tracking</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">14-Day Expiry Risk</span>
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl sm:text-3xl font-bold text-rose-500 font-mono">
                {analyticsSummary.atRiskCount}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Batches reaching expiration</p>
          </CardContent>
        </Card>
      </div>

      {/* Top 3 Decision Support Matrices */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Top 3 Most Outgoing */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500">
                <ArrowUpRight className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-foreground">
                  Top 3 Most Outgoing Items
                </CardTitle>
                <span className="text-[11px] text-muted-foreground">Highest recorded deductions</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {!top3Stats?.best_sellers || top3Stats.best_sellers.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">No recorded stock deductions yet</p>
            ) : (
              top3Stats.best_sellers.map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/60">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{item.item_name}</p>
                      <p className="text-[10px] text-muted-foreground">{item.category_name}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono text-xs font-bold text-rose-500">
                    -{item.sold_quantity} <span className="text-[10px] font-normal text-muted-foreground">{item.unit}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Card 2: Top 3 Most Stocked */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                <PackageCheck className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-foreground">
                  Top 3 Most Stocked Items
                </CardTitle>
                <span className="text-[11px] text-muted-foreground">Highest current stock volume</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {!top3Stats?.most_stocked || top3Stats.most_stocked.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">No stocked items found</p>
            ) : (
              top3Stats.most_stocked.map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/60">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{item.item_name}</p>
                      <p className="text-[10px] text-muted-foreground">{item.category_name}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {item.current_stock} <span className="text-[10px] font-normal text-muted-foreground">{item.unit}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Card 3: Top 3 Lowest Stock */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-foreground">
                  Top 3 Lowest Stock Items
                </CardTitle>
                <span className="text-[11px] text-muted-foreground">Approaching or below threshold</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {!top3Stats?.least_stocked || top3Stats.least_stocked.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">All items adequately stocked</p>
            ) : (
              top3Stats.least_stocked.map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/60">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{item.item_name}</p>
                      <p className="text-[10px] text-muted-foreground">Min: {item.min_quantity} {item.unit}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono text-xs font-bold text-amber-500">
                    {item.current_stock} <span className="text-[10px] font-normal text-muted-foreground">{item.unit}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Category Donut & Weekly Movements Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown Donut */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <PieChartIcon className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Stock by Category
                </CardTitle>
                <span className="text-xs text-muted-foreground">Inventory quantity distribution</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            <div className="h-68 w-full flex items-center justify-center">
              {categoryChartData.length === 0 ? (
                <div className="text-muted-foreground text-xs">No category data to display</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                    >
                      {categoryChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18191d', borderRadius: '8px', border: '1px solid #2d313a', color: '#f1f3f4', fontSize: '12px' }} 
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Weekly Movements Velocity (Stock In vs Stock Out) */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Weekly Movements Velocity
                </CardTitle>
                <span className="text-xs text-muted-foreground">Stock Received (In) vs Consumed (Out)</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            <div className="h-68 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={movementChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#80868b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#80868b' }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18191d', borderRadius: '8px', border: '1px solid #2d313a', color: '#f1f3f4', fontSize: '12px' }}
                    labelStyle={{ color: '#9aa0a6' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="inStock" name="Stock In" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outStock" name="Stock Out" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Category Assets Breakdown Table */}
      <Card className="bg-card border-border shadow-xs">
        <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Category Asset Summary
              </CardTitle>
              <span className="text-xs text-muted-foreground">Valuation breakdown by station category</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-muted/60 border-b border-border text-muted-foreground">
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[11px]">Category</th>
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[11px] text-center">SKUs</th>
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[11px] text-right">Total Units</th>
                  <th className="px-5 py-3 font-semibold uppercase tracking-wider text-[11px] text-right">Total Valuation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categoryChartData.map((cat, idx) => {
                  const skuCount = items.filter(i => (i.category_name || 'Uncategorized') === cat.name).length;
                  return (
                    <tr key={cat.name} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3 text-xs font-medium text-foreground flex items-center gap-2">
                        <span 
                          className="w-2.5 h-2.5 rounded-full" 
                          style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }} 
                        />
                        {cat.name}
                      </td>
                      <td className="px-5 py-3 text-center text-xs font-mono text-muted-foreground">
                        {skuCount}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs font-semibold text-foreground">
                        {cat.value.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs font-bold text-primary">
                        ₱{cat.monetaryValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Row 4: Movement Audit Trail */}
      <Card className="bg-card border-border shadow-xs">
        <CardHeader className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Movement Audit Logs
              </CardTitle>
              <span className="text-xs text-muted-foreground">Live transaction feed and stock adjustments</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-lg border border-border">
            {(['ALL', 'ADD', 'REMOVE', 'ADJUST'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setMovementFilter(f)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  movementFilter === f
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f === 'ALL' ? 'All' : f === 'ADD' ? 'Added' : f === 'REMOVE' ? 'Removed' : 'Adjusted'}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-muted/60 border-b border-border text-muted-foreground">
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[11px]">Time</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[11px]">User</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[11px] text-center">Action</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[11px]">Item</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[11px] text-right">Quantity</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[11px]">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredMovements.slice(0, 15).map((tx) => {
                  let badgeStyle = 'bg-muted text-foreground border border-border';
                  let label: string = tx.action_type || 'Update';

                  if (tx.action_type === 'ADD') {
                    badgeStyle = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
                    label = 'Added';
                  } else if (tx.action_type === 'REMOVE') {
                    badgeStyle = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
                    label = 'Removed';
                  } else if (tx.action_type === 'ADJUST') {
                    badgeStyle = 'bg-primary/10 text-primary border border-primary/20';
                    label = 'Adjusted';
                  }

                  const prefix = tx.action_type === 'REMOVE' ? '-' : tx.action_type === 'ADD' ? '+' : '';

                  return (
                    <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {tx.created_at ? format(new Date(tx.created_at), 'MMM dd, h:mm a') : 'Recent'}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-foreground">
                        {tx.user_name || 'Staff User'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${badgeStyle}`}>
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-foreground">
                        {tx.item_name || 'Item'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-foreground">
                        {prefix}{Math.abs(tx.quantity)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[200px]">
                        {tx.reason || 'General'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
