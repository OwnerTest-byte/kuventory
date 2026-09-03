import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getInventory } from '../api';
import { supabase } from '@/lib/supabase';
import { Package, Bell, AlertOctagon, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function InventoryLandingPage() {
  const { data: items } = useQuery({
    queryKey: ['inventory'],
    queryFn: getInventory,
  });

  const { data: batches } = useQuery({
    queryKey: ['expiring-batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_batches')
        .select('id, quantity, expiry_date')
        .lt('expiry_date', format(addDays(new Date(), 30), 'yyyy-MM-dd'))
        .gt('quantity', 0);
      if (error) throw error;
      return data;
    }
  });

  const { data: recentActivity } = useQuery({
    queryKey: ['recent-movements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select(`
          id,
          type,
          quantity_change,
          created_at,
          profiles ( first_name, last_name ),
          inventory_items ( name, unit )
        `)
        .order('created_at', { ascending: false })
        .limit(4);
      if (error) throw error;
      return data;
    }
  });

  const summary = useMemo(() => {
    const list = items || [];
    const activeList = list.filter(i => !i.is_archived);
    
    let portionItems = 0;
    let portionStock = 0;
    let caseItems = 0;
    let caseStock = 0;

    activeList.forEach(item => {
      // Determine if it's a CASE by unit or category
      if (item.unit?.toUpperCase().includes('CASE') || item.category_name?.toUpperCase().includes('CASE')) {
        caseItems++;
        caseStock += item.total_quantity;
      } else {
        portionItems++;
        portionStock += item.total_quantity;
      }
    });

    return {
      total: activeList.length,
      low: activeList.filter(i => i.total_quantity > 0 && i.total_quantity <= i.min_quantity).length,
      out: activeList.filter(i => i.total_quantity <= 0).length,
      expiring: batches?.length || 0,
      portionItems,
      portionStock,
      caseItems,
      caseStock
    };
  }, [items, batches]);

  const today = format(new Date(), 'MMM dd, yyyy');

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight uppercase">Dashboard</h1>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-t-4 border-t-blue-600 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wider">Total Items</CardTitle>
            <Package className="w-5 h-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{summary.total}</div>
            <p className="text-xs font-semibold text-slate-500 mt-1 uppercase">Active in system</p>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-amber-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wider">Low Stock</CardTitle>
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{summary.low}</div>
            <p className="text-xs font-semibold text-amber-600 mt-1 uppercase">Needs Reorder</p>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-red-600 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wider">Out of Stock</CardTitle>
            <AlertOctagon className="w-5 h-5 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{summary.out}</div>
            <p className="text-xs font-semibold text-red-600 mt-1 uppercase">Action Required</p>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-orange-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wider">Expiring Soon</CardTitle>
            <Clock className="w-5 h-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{summary.expiring}</div>
            <p className="text-xs font-semibold text-orange-600 mt-1 uppercase">Next 30 Days</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
            <CardTitle className="text-base font-bold text-slate-800 uppercase tracking-wide flex items-center justify-between">
              TODAY'S INVENTORY SUMMARY
              <span className="text-xs bg-white border border-slate-200 px-2 py-1 rounded text-slate-600">{today}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-bold text-slate-600 uppercase text-xs w-[50%]">CATEGORY</TableHead>
                  <TableHead className="font-bold text-slate-600 uppercase text-xs text-center">TOTAL ITEMS</TableHead>
                  <TableHead className="font-bold text-slate-600 uppercase text-xs text-center">TOTAL STOCK</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-semibold text-slate-800">PORTION STOCK</TableCell>
                  <TableCell className="text-center font-medium">{summary.portionItems}</TableCell>
                  <TableCell className="text-center font-bold text-slate-900">{summary.portionStock}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold text-slate-800">PER CASES</TableCell>
                  <TableCell className="text-center font-medium">{summary.caseItems}</TableCell>
                  <TableCell className="text-center font-bold text-slate-900">{summary.caseStock}</TableCell>
                </TableRow>
                <TableRow className="bg-green-50 hover:bg-green-50">
                  <TableCell className="font-bold text-green-800">TOTAL</TableCell>
                  <TableCell className="text-center font-bold text-green-800">{summary.portionItems + summary.caseItems}</TableCell>
                  <TableCell className="text-center font-bold text-green-800">{summary.portionStock + summary.caseStock}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
            <CardTitle className="text-base font-bold text-slate-800 uppercase tracking-wide flex justify-between items-center">
              RECENT ALERTS & ACTIVITY
              <Bell className="w-4 h-4 text-slate-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {recentActivity?.length === 0 && (
                 <div className="p-6 text-center text-slate-500 text-sm">No recent activity.</div>
              )}
              {recentActivity?.map((activity, i) => {
                let badgeClass = 'text-slate-700 bg-slate-100';
                let prefix = '';
                if (activity.type === 'ADD') {
                  badgeClass = 'text-green-700 bg-green-100';
                  prefix = '+';
                }
                if (activity.type === 'REMOVE') {
                  badgeClass = 'text-red-700 bg-red-100';
                  prefix = '-';
                }
                if (activity.type === 'ADJUST') {
                  badgeClass = 'text-blue-700 bg-blue-100';
                }

                const itemData = activity.inventory_items as any;
                const profileData = activity.profiles as any;

                return (
                  <div key={i} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="text-xs font-bold text-slate-500 w-16 text-right uppercase">
                        {format(new Date(activity.created_at), 'h:mm a')}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{itemData?.name}</p>
                        <p className="text-xs font-medium text-slate-500 uppercase mt-0.5">
                          BY {profileData?.first_name} {profileData?.last_name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                       <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${badgeClass} mb-1`}>
                         {activity.type}
                       </span>
                       <span className="text-sm font-bold text-slate-900">
                         {prefix}{Math.abs(activity.quantity_change)} <span className="text-xs text-slate-500 font-normal">{itemData?.unit}</span>
                       </span>
                    </div>
                  </div>
                )
              })}
            </div>
            {recentActivity && recentActivity.length > 0 && (
              <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                <button className="w-full text-center text-xs font-bold text-blue-600 hover:text-blue-700 uppercase flex items-center justify-center gap-1">
                  View Full History <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
