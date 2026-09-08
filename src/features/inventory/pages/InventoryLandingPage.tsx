import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { getInventory, getStockMovementHistory } from '../api';
import { supabase } from '@/lib/supabase';
import { 
  Package, 
  AlertTriangle, 
  AlertOctagon, 
  Clock, 
  ArrowRight, 
  Calendar, 
  TrendingUp, 
  PieChart as PieChartIcon, 
  Activity,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

const CATEGORY_COLORS = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B'];

export function InventoryLandingPage() {
  const navigate = useNavigate();

  // 1. Fetch Inventory Items
  const { data: items = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: getInventory,
  });

  // 2. Fetch Expiring Batches (within next 30 days)
  const { data: batches = [] } = useQuery({
    queryKey: ['expiring-batches'],
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
            unit
          )
        `)
        .gt('quantity', 0)
        .order('expiry_date', { ascending: true, nullsFirst: false })
        .limit(10);
      if (error) {
        console.error('Error fetching expiring batches:', error);
        throw error;
      }
      return (data || []).map((b: any) => ({
        id: b.id,
        batch_code: `BATCH-${b.id.substring(0, 6).toUpperCase()}`,
        quantity: Number(b.quantity || 0),
        expiry_date: b.expiry_date,
        created_at: b.created_at,
        items: {
          id: b.inventory_items?.id,
          item_name: b.inventory_items?.name || 'Item',
          unit: b.inventory_items?.unit || 'pcs'
        }
      }));
    }
  });

  // 3. Fetch Recent Stock Transactions (Activity Trail & Analytics)
  const { data: recentTransactions = [] } = useQuery({
    queryKey: ['global-stock-history'],
    queryFn: () => getStockMovementHistory(),
  });

  // 4. Fetch Live Notifications for Alerts Widget
  const { data: recentNotifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(4);
      if (error) throw error;
      return data as any[];
    }
  });

  // Computed Metrics
  const summary = useMemo(() => {
    const activeList = items.filter(i => !i.is_archived);
    
    let grilledItems = 0;
    let grilledStock = 0;
    let portionItems = 0;
    let portionStock = 0;
    let caseItems = 0;
    let caseStock = 0;
    let totalStock = 0;

    activeList.forEach(item => {
      const qty = Number(item.current_qty) || 0;
      totalStock += qty;
      const type = (item.inventory_type || item.category_name || '').toUpperCase();
      if (type.includes('GRILL')) {
        grilledItems++;
        grilledStock += qty;
      } else if (type.includes('CASE')) {
        caseItems++;
        caseStock += qty;
      } else {
        portionItems++;
        portionStock += qty;
      }
    });

    const lowStock = activeList.filter(i => i.current_qty > 0 && i.current_qty <= i.min_qty);
    const outOfStock = activeList.filter(i => i.current_qty <= 0);
    
    const now = new Date();
    const threshold30Days = addDays(now, 30);
    const expiringSoonBatches = batches.filter(b => b.expiry_date && new Date(b.expiry_date) <= threshold30Days);

    return {
      totalItems: activeList.length,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      expiringCount: expiringSoonBatches.length,
      grilledItems,
      grilledStock,
      portionItems,
      portionStock,
      caseItems,
      caseStock,
      totalStock,
      lowStockItems: lowStock.slice(0, 3),
      outOfStockItems: outOfStock.slice(0, 3)
    };
  }, [items, batches]);

  // Chart Data 1: Category Distribution
  const categoryChartData = useMemo(() => {
    const catMap = new Map<string, number>();
    items.filter(i => !i.is_archived).forEach(item => {
      const cat = item.category_name || 'Uncategorized';
      catMap.set(cat, (catMap.get(cat) || 0) + (Number(item.current_qty) || 0));
    });
    return Array.from(catMap.entries()).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [items]);

  // Chart Data 2: Stock Movement Activity (Aggregated from real database transactions)
  const movementChartData = useMemo(() => {
    const dayBuckets: Record<string, { day: string; inStock: number; outStock: number }> = {};
    
    // Last 7 days
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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground uppercase">
            Dashboard Overview
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Real-time stock monitoring, FEFO tracking, and daily inventory statistics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => navigate('/daily-inventory')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm shadow-xs flex items-center gap-2"
          >
            <Calendar className="w-4 h-4" />
            Today&rsquo;s Daily Inventory
          </Button>
          <Button 
            variant="outline"
            onClick={() => navigate('/items')}
            className="border-border text-foreground bg-card hover:bg-muted font-semibold text-xs sm:text-sm shadow-xs"
          >
            View All SKUs
          </Button>
        </div>
      </div>

      {/* Row 1: 4 Top KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Items */}
        <Card className="bg-card border-border shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Items</span>
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Package className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground font-mono">{summary.totalItems}</span>
              <span className="text-xs font-medium text-muted-foreground uppercase">SKUs</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">All active inventory items</p>
          </CardContent>
        </Card>

        {/* Low Stock */}
        <Card className="bg-card border-border shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Low Stock</span>
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-amber-500 font-mono">{summary.lowStockCount}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 uppercase text-[10px]">
                Attention
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Below minimum quantity</p>
          </CardContent>
        </Card>

        {/* Out of Stock */}
        <Card className="bg-card border-border shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Out of Stock</span>
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <AlertOctagon className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-rose-500 font-mono">{summary.outOfStockCount}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25 uppercase text-[10px]">
                Critical
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">No remaining stock</p>
          </CardContent>
        </Card>

        {/* Expiring Soon */}
        <Card className="bg-card border-border shadow-xs hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Expiring Soon</span>
              <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-orange-500 font-mono">{summary.expiringCount}</span>
              <span className="text-xs font-medium text-muted-foreground uppercase">Batches</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Within next 30 days (FEFO)</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Today's Inventory Summary & Recent Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Today's Inventory Summary Table */}
        <Card className="lg:col-span-2 bg-card border-border shadow-xs">
          <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-foreground uppercase tracking-wider">
                  Today&rsquo;s Inventory Summary
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(), 'MMMM dd, yyyy')} • Section Breakdown
                </span>
              </div>
            </div>
            <Link
              to="/daily-inventory"
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              Open Daily Worksheet <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-muted/60 border-b border-border text-muted-foreground">
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Section</th>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-center">Total Items</th>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-right">Total Stock (Units)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  <tr className="hover:bg-muted/40 transition-colors">
                    <td className="px-6 py-3.5 font-semibold text-foreground flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      GRILLED STOCK
                    </td>
                    <td className="px-6 py-3.5 text-center font-mono font-medium text-foreground">
                      {summary.grilledItems}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono font-bold text-foreground">
                      {summary.grilledStock.toLocaleString()}
                    </td>
                  </tr>
                  <tr className="hover:bg-muted/40 transition-colors">
                    <td className="px-6 py-3.5 font-semibold text-foreground flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      PORTION STOCK
                    </td>
                    <td className="px-6 py-3.5 text-center font-mono font-medium text-foreground">
                      {summary.portionItems}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono font-bold text-foreground">
                      {summary.portionStock.toLocaleString()}
                    </td>
                  </tr>
                  <tr className="hover:bg-muted/40 transition-colors">
                    <td className="px-6 py-3.5 font-semibold text-foreground flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      PER CASES
                    </td>
                    <td className="px-6 py-3.5 text-center font-mono font-medium text-foreground">
                      {summary.caseItems}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono font-bold text-foreground">
                      {summary.caseStock.toLocaleString()}
                    </td>
                  </tr>
                  <tr className="bg-emerald-500/10 font-bold border-t-2 border-emerald-500/30">
                    <td className="px-6 py-4 text-emerald-500 uppercase tracking-wider text-xs flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      TOTAL INVENTORY BALANCE
                    </td>
                    <td className="px-6 py-4 text-center font-mono text-emerald-500">
                      {summary.totalItems}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-emerald-500 text-base">
                      {summary.totalStock.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 bg-muted/30 border-t border-border text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Automated real-time inventory aggregation</span>
              <span>Last updated: {format(new Date(), 'h:mm a')}</span>
            </div>
          </CardContent>
        </Card>

        {/* Right 1 Col: Recent Alerts Feed */}
        <Card className="bg-card border-border shadow-xs flex flex-col">
          <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-500">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <CardTitle className="text-sm font-bold text-foreground uppercase tracking-wider">
                Recent Alerts
              </CardTitle>
            </div>
            <Link to="/notifications" className="text-xs font-semibold text-primary hover:underline">
              View All
            </Link>
          </CardHeader>
          <CardContent className="p-4 flex-1 divide-y divide-border/60">
            {recentNotifications.length === 0 && summary.lowStockCount === 0 && summary.outOfStockCount === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs">
                No active critical alerts. All stock is healthy!
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {/* Out of Stock Priority Alerts */}
                {summary.outOfStockItems.map(item => (
                  <div key={item.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25">
                    <AlertOctagon className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-rose-500 truncate">OUT OF STOCK</div>
                      <div className="text-xs text-muted-foreground truncate">{item.item_name} has 0 remaining.</div>
                    </div>
                  </div>
                ))}

                {/* Low Stock Priority Alerts */}
                {summary.lowStockItems.map(item => (
                  <div key={item.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-amber-500 truncate">LOW STOCK</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {item.item_name} has only {item.current_qty} {item.unit} left (min: {item.min_qty}).
                      </div>
                    </div>
                  </div>
                ))}

                {/* Expiring Soon Batches */}
                {batches.slice(0, 2).map(b => (
                  <div key={b.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/25">
                    <Clock className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-orange-500 truncate">EXPIRING SOON</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {b.items?.item_name} ({b.batch_code}) expires {format(new Date(b.expiry_date), 'MMM dd')}.
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Interactive Analytics Charts (Recharts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Stock Movement In vs Out */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-foreground uppercase tracking-wider">
                  Weekly Stock Movements (In vs Out)
                </CardTitle>
                <span className="text-xs text-muted-foreground">Transaction velocity overview</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={movementChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#80868b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#80868b' }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18191d', borderRadius: '8px', border: '1px solid #2d313a', color: '#f1f3f4', fontSize: '12px' }}
                    labelStyle={{ color: '#9aa0a6' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Bar dataKey="inStock" name="Stock In" fill="#1a73e8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outStock" name="Stock Out (Sales/Usage)" fill="#ea4335" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Chart 2: Category Breakdown Donut */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500">
                <PieChartIcon className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-foreground uppercase tracking-wider">
                  Stock by Category
                </CardTitle>
                <span className="text-xs text-muted-foreground">Inventory quantity distribution</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            <div className="h-64 w-full flex items-center justify-center">
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
      </div>

      {/* Row 4: Recent Activity Audit Stream & FEFO Priority Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Activity Stream */}
        <Card className="lg:col-span-2 bg-card border-border shadow-xs">
          <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <Activity className="w-4 h-4" />
              </div>
              <CardTitle className="text-sm font-bold text-foreground uppercase tracking-wider">
                Recent Activity Audit Stream
              </CardTitle>
            </div>
            <Link to="/items?tab=history" className="text-xs font-semibold text-primary hover:underline">
              View All History
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-muted/60 border-b border-border text-muted-foreground">
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Time</th>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">User</th>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-center">Action</th>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Item</th>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {recentTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground text-xs">
                        No transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    recentTransactions.slice(0, 6).map((tx) => {
                      let badgeStyle = 'bg-muted text-foreground border border-border';
                      let icon = null;
                      if (tx.action_type === 'ADD') {
                        badgeStyle = 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/25';
                        icon = <ArrowDownRight className="w-3 h-3 mr-1" />;
                      } else if (tx.action_type === 'REMOVE') {
                        badgeStyle = 'bg-rose-500/15 text-rose-500 border border-rose-500/25';
                        icon = <ArrowUpRight className="w-3 h-3 mr-1" />;
                      } else if (tx.action_type === 'ADJUST') {
                        badgeStyle = 'bg-primary/15 text-primary border border-primary/25';
                        icon = <RefreshCw className="w-3 h-3 mr-1" />;
                      }

                      const userDisplay = tx.user_name || 'System Staff';
                      const prefix = tx.action_type === 'REMOVE' ? '-' : tx.action_type === 'ADD' ? '+' : '';

                      return (
                        <tr key={tx.id} className="hover:bg-muted/40 transition-colors">
                          <td className="px-6 py-3.5 text-xs text-muted-foreground font-medium">
                            {format(new Date(tx.created_at), 'h:mm a')}
                          </td>
                          <td className="px-6 py-3.5 text-xs font-semibold text-foreground">
                            {userDisplay}
                          </td>
                          <td className="px-6 py-3.5 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-wide ${badgeStyle}`}>
                              {icon}
                              {tx.action_type}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-xs font-semibold text-foreground">
                            {tx.item_name || 'Item'}
                          </td>
                          <td className="px-6 py-3.5 text-right font-mono text-xs font-bold text-foreground">
                            {prefix}{Math.abs(tx.quantity)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Right 1 Col: FEFO Priority Queue */}
        <Card className="bg-card border-border shadow-xs flex flex-col">
          <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-500">
                <Layers className="w-4 h-4" />
              </div>
              <CardTitle className="text-sm font-bold text-foreground uppercase tracking-wider">
                FEFO Priority Queue
              </CardTitle>
            </div>
            <Link to="/items?tab=batches" className="text-xs font-semibold text-primary hover:underline">
              View All Batches
            </Link>
          </CardHeader>
          <CardContent className="p-4 flex-1 divide-y divide-border/60">
            {batches.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs">
                No active tracked batches in system.
              </div>
            ) : (
              <div className="space-y-2.5 pt-1">
                {batches.slice(0, 5).map((batch, index) => {
                  const expiryDate = batch.expiry_date ? new Date(batch.expiry_date) : null;
                  const now = new Date();
                  const isExpired = expiryDate && expiryDate < now;
                  const diffDays = expiryDate ? Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 3600 * 24)) : null;

                  let priorityLabel = 'NORMAL';
                  let priorityBadge = 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/25';

                  if (isExpired) {
                    priorityLabel = 'EXPIRED';
                    priorityBadge = 'bg-rose-500/15 text-rose-500 border border-rose-500/25';
                  } else if (index === 0) {
                    priorityLabel = 'USE FIRST';
                    priorityBadge = 'bg-rose-600 text-white animate-pulse';
                  } else if (index === 1) {
                    priorityLabel = 'NEXT';
                    priorityBadge = 'bg-amber-500 text-white';
                  }

                  return (
                    <div key={batch.id} className="p-2.5 rounded-xl border border-border bg-muted/30 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-bold text-foreground truncate">
                          {batch.items?.item_name || 'Item'}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {batch.batch_code} • {batch.quantity} {batch.items?.unit}
                        </div>
                        <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                          {expiryDate ? `Exp: ${format(expiryDate, 'MMM dd, yyyy')}` : 'No Expiry'}
                          {diffDays !== null && !isExpired && ` (${diffDays} days left)`}
                        </div>
                      </div>
                      <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shrink-0 ${priorityBadge}`}>
                        {priorityLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
