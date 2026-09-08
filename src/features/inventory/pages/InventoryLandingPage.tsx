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
  CheckCircle2
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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

  // 4. Fetch Today's Daily Inventory Session State for Actionable Widget
  const todayDateStr = format(new Date(), 'yyyy-MM-dd');
  const { data: todaySession } = useQuery({
    queryKey: ['today-inventory-session', todayDateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_inventory')
        .select(`
          id,
          inventory_date,
          state,
          finalized_at,
          daily_inventory_items (
            id,
            beg,
            add,
            total,
            am,
            pm,
            ending
          )
        `)
        .eq('inventory_date', todayDateStr)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching today daily session:', error);
      }
      return data;
    }
  });

  // Today's inventory progress computation
  const todayProgress = useMemo(() => {
    if (!todaySession) {
      return {
        exists: false,
        status: 'Not Started',
        isFinalized: false,
        totalTracked: items.filter(i => !i.is_archived).length,
        itemsCounted: 0,
        amCounted: 0,
        pmCounted: 0,
      };
    }
    const rawItems: any[] = todaySession.daily_inventory_items || [];
    const isFinalized = todaySession.state === 'finalized' || !!todaySession.finalized_at;
    const amCounted = rawItems.filter(r => (Number(r.am) || 0) > 0).length;
    const pmCounted = rawItems.filter(r => (Number(r.pm) || 0) > 0).length;
    const itemsCounted = rawItems.filter(r => 
      (Number(r.am) || 0) > 0 || (Number(r.pm) || 0) > 0 || (Number(r.ending) || 0) > 0
    ).length;

    return {
      exists: true,
      status: isFinalized ? 'Finalized' : 'In Progress',
      isFinalized,
      totalTracked: rawItems.length || items.filter(i => !i.is_archived).length,
      itemsCounted,
      amCounted,
      pmCounted,
    };
  }, [todaySession, items]);

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

  // Prioritized Alert Lists (Critical vs Attention)
  const prioritizedAlerts = useMemo(() => {
    const now = new Date();
    const critical: Array<{ id: string; title: string; desc: string; type: 'out' | 'expired' }> = [];
    const attention: Array<{ id: string; title: string; desc: string; type: 'low' | 'expiring' }> = [];

    // 1. Out of stock (Critical)
    summary.outOfStockItems.forEach(item => {
      critical.push({
        id: `out-${item.id}`,
        title: item.item_name,
        desc: '0 balance remaining in inventory',
        type: 'out'
      });
    });

    // 2. Expired batches (Critical)
    batches.forEach(b => {
      if (b.expiry_date && new Date(b.expiry_date) < now) {
        critical.push({
          id: `exp-${b.id}`,
          title: `${b.items?.item_name || 'Batch'} (${b.batch_code})`,
          desc: `Expired on ${format(new Date(b.expiry_date), 'MMM dd, yyyy')}`,
          type: 'expired'
        });
      }
    });

    // 3. Low stock (Attention)
    summary.lowStockItems.forEach(item => {
      attention.push({
        id: `low-${item.id}`,
        title: item.item_name,
        desc: `${item.current_qty} ${item.unit} left (min: ${item.min_qty})`,
        type: 'low'
      });
    });

    // 4. Batches expiring within 14 days (Attention)
    const threshold14Days = addDays(now, 14);
    batches.forEach(b => {
      if (b.expiry_date) {
        const d = new Date(b.expiry_date);
        if (d >= now && d <= threshold14Days) {
          const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 3600 * 24));
          attention.push({
            id: `exp-soon-${b.id}`,
            title: `${b.items?.item_name || 'Batch'} (${b.batch_code})`,
            desc: diffDays === 0 ? 'Expires today' : diffDays === 1 ? 'Expires tomorrow' : `Expires in ${diffDays} days`,
            type: 'expiring'
          });
        }
      }
    });

    return { critical, attention };
  }, [summary, batches]);

  // Chart Data 1: Category Distribution
  const categoryChartData = useMemo(() => {
    const catMap = new Map<string, number>();
    items.filter(i => !i.is_archived).forEach(item => {
      const cat = item.category_name || 'Uncategorized';
      catMap.set(cat, (catMap.get(cat) || 0) + (Number(item.current_qty) || 0));
    });
    return Array.from(catMap.entries()).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [items]);

  // Chart Data 2: Stock Movement Activity
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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Dashboard Overview
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Real-time stock monitoring, FEFO tracking, and daily inventory statistics.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button 
            onClick={() => navigate('/daily-inventory')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm shadow-xs flex items-center gap-2"
          >
            <Calendar className="w-4 h-4" />
            {todayProgress.exists ? "Continue Today's Inventory" : "Start Today's Inventory"}
          </Button>
          <Button 
            variant="outline"
            onClick={() => navigate('/items')}
            className="border-border text-foreground bg-card hover:bg-muted font-semibold text-xs sm:text-sm shadow-xs"
          >
            View All Items
          </Button>
        </div>
      </div>

      {/* Row 1: 4 Top KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Items */}
        <Card className="bg-card border-border shadow-xs hover:border-primary/40 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Items</span>
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Package className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground font-mono">{summary.totalItems}</span>
              <span className="text-xs font-medium text-muted-foreground uppercase">SKUs</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Active inventory catalogue</p>
          </CardContent>
        </Card>

        {/* Low Stock */}
        <Card className="bg-card border-border shadow-xs hover:border-amber-500/40 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Low Stock</span>
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-amber-500 font-mono">{summary.lowStockCount}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Attention
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Below minimum threshold</p>
          </CardContent>
        </Card>

        {/* Out of Stock */}
        <Card className="bg-card border-border shadow-xs hover:border-rose-500/40 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Out of Stock</span>
              <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <AlertOctagon className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-rose-500 font-mono">{summary.outOfStockCount}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                Critical
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Zero units remaining</p>
          </CardContent>
        </Card>

        {/* Expiring Soon */}
        <Card className="bg-card border-border shadow-xs hover:border-orange-500/40 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Expiring Soon</span>
              <div className="w-9 h-9 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-orange-500 font-mono">{summary.expiringCount}</span>
              <span className="text-xs font-medium text-muted-foreground">Batches</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Within next 30 days (FEFO)</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Today's Actionable Inventory + Prioritized Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Today's Inventory Card */}
        <Card className="lg:col-span-2 bg-card border-border shadow-xs flex flex-col justify-between">
          <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-bold text-foreground">
                    Today&rsquo;s Inventory Status
                  </CardTitle>
                  <span className={cn(
                    "text-[11px] font-semibold px-2 py-0.5 rounded-md border",
                    todayProgress.isFinalized 
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : todayProgress.exists
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                      : "bg-muted text-muted-foreground border-border"
                  )}>
                    {todayProgress.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(), 'EEEE, MMMM dd, yyyy')} • Daily Operations
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => navigate('/daily-inventory')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-xs hidden sm:flex items-center gap-1.5"
            >
              {todayProgress.exists ? "Open Worksheet" : "Start Session"}
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="p-5 space-y-5">
            {/* Shift & Counting Progress Indicators */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <div className="text-[11px] font-medium text-muted-foreground uppercase">AM Sales Logged</div>
                <div className="text-xl font-bold font-mono text-foreground mt-1">
                  {todayProgress.amCounted} <span className="text-xs font-normal text-muted-foreground">/ {todayProgress.totalTracked}</span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <div className="text-[11px] font-medium text-muted-foreground uppercase">PM Sales Logged</div>
                <div className="text-xl font-bold font-mono text-foreground mt-1">
                  {todayProgress.pmCounted} <span className="text-xs font-normal text-muted-foreground">/ {todayProgress.totalTracked}</span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <div className="text-[11px] font-medium text-muted-foreground uppercase">Items Counted</div>
                <div className="text-xl font-bold font-mono text-foreground mt-1">
                  {todayProgress.itemsCounted} <span className="text-xs font-normal text-muted-foreground">/ {todayProgress.totalTracked}</span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <div className="text-[11px] font-medium text-muted-foreground uppercase">Day Close</div>
                <div className="text-sm font-bold text-foreground mt-2 flex items-center gap-1.5">
                  {todayProgress.isFinalized ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Finalized
                    </span>
                  ) : (
                    <span className="text-amber-500 flex items-center gap-1">
                      <Clock className="w-4 h-4" /> Pending
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Section Breakdown Table */}
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="bg-muted/60 border-b border-border text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-[11px]">Section</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-[11px] text-center">Items</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-[11px] text-right">Current Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-foreground flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      GRILLED STOCK
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-muted-foreground">
                      {summary.grilledItems}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-foreground">
                      {summary.grilledStock.toLocaleString()}
                    </td>
                  </tr>
                  <tr className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-foreground flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      PORTION STOCK
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-muted-foreground">
                      {summary.portionItems}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-foreground">
                      {summary.portionStock.toLocaleString()}
                    </td>
                  </tr>
                  <tr className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-foreground flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      PER CASES
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-muted-foreground">
                      {summary.caseItems}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-foreground">
                      {summary.caseStock.toLocaleString()}
                    </td>
                  </tr>
                  <tr className="bg-muted/40 font-bold border-t border-border">
                    <td className="px-4 py-3 text-foreground uppercase tracking-wider text-xs">
                      TOTAL INVENTORY BALANCE
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-foreground">
                      {summary.totalItems}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-foreground text-sm">
                      {summary.totalStock.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="sm:hidden pt-1">
              <Button
                onClick={() => navigate('/daily-inventory')}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center justify-center gap-2"
              >
                {todayProgress.exists ? "Open Daily Worksheet" : "Start Today's Inventory"}
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right 1 Col: Prioritized Alerts (Critical vs Attention) */}
        <Card className="bg-card border-border shadow-xs flex flex-col justify-between">
          <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <CardTitle className="text-base font-bold text-foreground">
                Prioritized Alerts
              </CardTitle>
            </div>
            <Link to="/notifications" className="text-xs font-semibold text-primary hover:underline">
              View All
            </Link>
          </CardHeader>
          <CardContent className="p-4 flex-1 space-y-4">
            {prioritizedAlerts.critical.length === 0 && prioritizedAlerts.attention.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2 opacity-80" />
                No active critical alerts. All inventory levels and batches are healthy!
              </div>
            ) : (
              <>
                {/* Critical Section */}
                {prioritizedAlerts.critical.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      Critical Urgency ({prioritizedAlerts.critical.length})
                    </div>
                    <div className="space-y-2">
                      {prioritizedAlerts.critical.slice(0, 3).map(alert => (
                        <div key={alert.id} className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5">
                          <AlertOctagon className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-foreground truncate">{alert.title}</div>
                            <div className="text-[11px] text-rose-600/90 dark:text-rose-400/90 truncate">{alert.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attention Section */}
                {prioritizedAlerts.attention.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      Attention Needed ({prioritizedAlerts.attention.length})
                    </div>
                    <div className="space-y-2">
                      {prioritizedAlerts.attention.slice(0, 3).map(alert => (
                        <div key={alert.id} className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5">
                          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-foreground truncate">{alert.title}</div>
                            <div className="text-[11px] text-amber-600/90 dark:text-amber-400/90 truncate">{alert.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Stock by Category + Expiry Priority */}
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

        {/* Expiry Priority (FEFO tracking with plain language urgency) */}
        <Card className="bg-card border-border shadow-xs flex flex-col justify-between">
          <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Expiry Priority
                </CardTitle>
                <span className="text-xs text-muted-foreground">FEFO batch tracking & urgency</span>
              </div>
            </div>
            <Link to="/items?tab=batches" className="text-xs font-semibold text-primary hover:underline">
              View All Batches
            </Link>
          </CardHeader>
          <CardContent className="p-4 flex-1">
            {batches.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs">
                No active tracked batches in system.
              </div>
            ) : (
              <div className="space-y-2.5">
                {batches.slice(0, 4).map((batch) => {
                  const expiryDate = batch.expiry_date ? new Date(batch.expiry_date) : null;
                  const now = new Date();
                  const isExpired = expiryDate && expiryDate < now;
                  const diffDays = expiryDate ? Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 3600 * 24)) : null;

                  let urgencyText = 'Healthy';
                  let badgeStyle = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';

                  if (isExpired) {
                    urgencyText = 'Expired';
                    badgeStyle = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
                  } else if (diffDays !== null && diffDays <= 0) {
                    urgencyText = 'Expires Today';
                    badgeStyle = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
                  } else if (diffDays !== null && diffDays <= 3) {
                    urgencyText = `Expires in ${diffDays}d (First Out)`;
                    badgeStyle = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20';
                  } else if (diffDays !== null && diffDays <= 14) {
                    urgencyText = `Expires in ${diffDays}d`;
                    badgeStyle = 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20';
                  }

                  return (
                    <div key={batch.id} className="p-3 rounded-lg border border-border bg-muted/20 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">
                          {batch.items?.item_name || 'Item'}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          {batch.batch_code} • {batch.quantity} {batch.items?.unit}
                        </div>
                        <div className="text-[11px] text-muted-foreground/80 mt-0.5">
                          {expiryDate ? `Expiry: ${format(expiryDate, 'MMM dd, yyyy')}` : 'No Expiry Set'}
                        </div>
                      </div>
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0 ${badgeStyle}`}>
                        {urgencyText}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Recent Activity Table + Secondary Movements Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Activity Table */}
        <Card className="lg:col-span-2 bg-card border-border shadow-xs">
          <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Recent Activity
                </CardTitle>
                <span className="text-xs text-muted-foreground">Audit log of stock movements</span>
              </div>
            </div>
            <Link to="/items?tab=history" className="text-xs font-semibold text-primary hover:underline">
              View All History
            </Link>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-xs">
                        No transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    recentTransactions.slice(0, 6).map((tx) => {
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
                        label = 'Stock Correction';
                      }

                      const userDisplay = tx.user_name || 'System Staff';
                      const prefix = tx.action_type === 'REMOVE' ? '-' : tx.action_type === 'ADD' ? '+' : '';

                      return (
                        <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {format(new Date(tx.created_at), 'h:mm a')}
                          </td>
                          <td className="px-4 py-3 text-xs font-medium text-foreground">
                            {userDisplay}
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
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Right 1 Col: Stock Movements Velocity */}
        <Card className="bg-card border-border shadow-xs">
          <CardHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Weekly Movements
                </CardTitle>
                <span className="text-xs text-muted-foreground">In vs Out velocity</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            <div className="h-60 w-full">
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
    </div>
  );
}
