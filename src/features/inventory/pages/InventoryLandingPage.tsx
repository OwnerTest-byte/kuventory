import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { getInventory, getActiveExpiringBatches, getActiveExpiredBatches } from '../api';
import { useNotifications } from '../hooks/useNotifications';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/context/AuthContext';
import { 
  Package, 
  Calendar, 
  ArrowRight, 
  AlertTriangle, 
  AlertOctagon, 
  Clock, 
  PlusCircle, 
  Layers, 
  CheckCircle2, 
  BarChart3,
  Bell
} from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getNotificationRoute } from '../utils/notificationRouter';

export function InventoryLandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // 1. Fetch Inventory Items
  const { data: items = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: getInventory,
  });

  // 2. Fetch Strictly Active Expiring Batches (quantity > 0 only)
  const { data: expiringBatches = [] } = useQuery({
    queryKey: ['active-expiring-batches'],
    queryFn: () => getActiveExpiringBatches(14),
    staleTime: 1000 * 60 * 2,
  });

  // 3. Fetch Strictly Active Expired Batches (quantity > 0 only)
  const { data: expiredBatches = [] } = useQuery({
    queryKey: ['active-expired-batches'],
    queryFn: getActiveExpiredBatches,
    staleTime: 1000 * 60 * 2,
  });

  // 4. Fetch Recent Operational Notifications
  const { data: notifications = [] } = useNotifications();

  // 5. Fetch Today's Daily Inventory Session State
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
          finalized_at
        `)
        .eq('inventory_date', todayDateStr)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching today daily session:', error);
      }
      return data;
    },
  });

  // Basic Operational Metrics
  const summary = useMemo(() => {
    const active = items.filter((i) => !i.is_archived);
    const totalStockUnits = active.reduce((acc, item) => acc + (Number(item.current_qty) || 0), 0);
    const lowStockCount = active.filter((i) => i.current_qty > 0 && i.current_qty <= i.min_qty).length;
    const outOfStockCount = active.filter((i) => i.current_qty <= 0).length;

    return {
      totalStockUnits,
      activeSkus: active.length,
      lowStockCount,
      outOfStockCount,
      expiringCount: expiringBatches.length,
      expiredCount: expiredBatches.length,
    };
  }, [items, expiringBatches, expiredBatches]);

  const isFinalizedToday = todaySession?.state === 'finalized' || !!todaySession?.finalized_at;
  const isDraftToday = !!todaySession && !isFinalizedToday;

  // Time-aware greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const displayName = user?.user_metadata?.first_name || user?.email?.split('@')[0] || 'Worker';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* 1. HEADER: Time Greeting & Current User */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {greeting}, {displayName}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {format(new Date(), 'EEEE, MMMM dd, yyyy')} • Operations Dashboard
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/analytics')}
            className="text-xs font-semibold border-border text-foreground hover:bg-muted"
          >
            <BarChart3 className="w-3.5 h-3.5 mr-1.5 text-primary" />
            Analytics
          </Button>
        </div>
      </div>

      {/* 2. SUMMARY CARDS (4 Operational Metrics) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current Stock */}
        <Link to="/items" className="block focus:outline-none">
          <Card className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Current Stock
                </span>
                <Package className="w-4 h-4 text-primary" />
              </div>
              <div className="mt-3">
                <span className="text-2xl sm:text-3xl font-extrabold text-foreground">
                  {summary.totalStockUnits.toLocaleString()}
                </span>
                <span className="text-xs text-muted-foreground ml-1.5">pcs</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Across {summary.activeSkus} active items
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Low Stock */}
        <Link to="/items" className="block focus:outline-none">
          <Card className="bg-card border-border hover:border-amber-500/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Low Stock
                </span>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>
              <div className="mt-3">
                <span className="text-2xl sm:text-3xl font-extrabold text-amber-600 dark:text-amber-400">
                  {summary.lowStockCount + summary.outOfStockCount}
                </span>
                <span className="text-xs text-muted-foreground ml-1.5">items</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {summary.outOfStockCount > 0 ? `${summary.outOfStockCount} out of stock` : 'Requires restock'}
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Expiring Soon (quantity > 0 only) */}
        <Link to="/items?tab=batches" className="block focus:outline-none">
          <Card className="bg-card border-border hover:border-amber-500/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Expiring Soon
                </span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div className="mt-3">
                <span className="text-2xl sm:text-3xl font-extrabold text-amber-600 dark:text-amber-400">
                  {summary.expiringCount}
                </span>
                <span className="text-xs text-muted-foreground ml-1.5">batches</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Expiring within 14 days
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Expired Stock (quantity > 0 only) */}
        <Link to="/items?tab=batches" className="block focus:outline-none">
          <Card className="bg-card border-border hover:border-rose-500/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Expired Stock
                </span>
                <AlertOctagon className="w-4 h-4 text-rose-500" />
              </div>
              <div className="mt-3">
                <span className={`text-2xl sm:text-3xl font-extrabold ${summary.expiredCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}>
                  {summary.expiredCount}
                </span>
                <span className="text-xs text-muted-foreground ml-1.5">batches</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {summary.expiredCount > 0 ? 'Action required: Dispose' : 'No expired stock'}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* 3. TODAY'S DAILY INVENTORY STATUS */}
      <Card className="bg-card border-border shadow-xs">
        <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary shrink-0" />
              <h2 className="text-base sm:text-lg font-bold text-foreground">
                Today&apos;s Daily Inventory
              </h2>
              {isFinalizedToday ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" /> FINALIZED
                </span>
              ) : isDraftToday ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                  DRAFT IN PROGRESS
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                  NOT STARTED
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-semibold">
              {isFinalizedToday
                ? 'FINALIZED'
                : isDraftToday
                ? 'DRAFT IN PROGRESS'
                : 'NOT STARTED'}
            </p>
          </div>

          <Button
            onClick={() => navigate('/daily-inventory')}
            className={`font-semibold text-xs sm:text-sm shrink-0 shadow-xs cursor-pointer min-h-11 ${
              isFinalizedToday
                ? 'bg-muted text-foreground hover:bg-muted/80'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {isFinalizedToday
              ? 'View Completed Sheet'
              : isDraftToday
              ? 'Continue Counting'
              : 'Start Today’s Count'}
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </CardContent>
      </Card>

      {/* 4. QUICK ACTIONS */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button
            variant="outline"
            onClick={() => navigate('/items')}
            className="h-12 min-h-12 justify-start px-4 border-border bg-card hover:bg-muted text-foreground text-left cursor-pointer"
          >
            <PlusCircle className="w-5 h-5 text-emerald-600 mr-3 shrink-0" />
            <span className="font-bold text-xs sm:text-sm">Add Stock</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => navigate('/daily-inventory')}
            className="h-12 min-h-12 justify-start px-4 border-border bg-card hover:bg-muted text-foreground text-left cursor-pointer"
          >
            <Calendar className="w-5 h-5 text-primary mr-3 shrink-0" />
            <span className="font-bold text-xs sm:text-sm">Daily Inventory</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => navigate('/items')}
            className="h-12 min-h-12 justify-start px-4 border-border bg-card hover:bg-muted text-foreground text-left cursor-pointer"
          >
            <Layers className="w-5 h-5 text-blue-600 mr-3 shrink-0" />
            <span className="font-bold text-xs sm:text-sm">Inventory Catalog</span>
          </Button>
        </div>
      </div>

      {/* 5. OPERATIONAL ALERTS (Recent Notifications) */}
      <Card className="bg-card border-border shadow-xs">
        <CardHeader className="p-4 sm:p-5 border-b border-border flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-bold text-foreground">Recent Operational Alerts</CardTitle>
          </div>
          <Link
            to="/notifications"
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            View All in Notification Center →
          </Link>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-border/60">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No active alerts. All stock thresholds and batch expirations are healthy.
            </div>
          ) : (
            notifications.slice(0, 4).map((notif) => (
              <div
                key={notif.id}
                onClick={() => navigate(getNotificationRoute(notif))}
                className="p-4 flex items-start justify-between gap-3 hover:bg-muted/30 transition-colors cursor-pointer group"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {notif.type === 'EXPIRED' || notif.type === 'OUT_OF_STOCK' ? (
                      <AlertOctagon className="w-4 h-4 text-rose-500" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">{notif.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{notif.message}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(notif.created_at), 'h:mm a')}
                  </span>
                  {!notif.is_read && (
                    <span className="block w-2 h-2 rounded-full bg-primary ml-auto mt-1" />
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
