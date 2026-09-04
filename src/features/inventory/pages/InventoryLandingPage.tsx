import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getInventory } from '../api';
import { supabase } from '@/lib/supabase';
import { Package, AlertOctagon, Clock, AlertTriangle } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

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

  const summary = useMemo(() => {
    const list = items || [];
    const activeList = list.filter(i => !i.is_archived);
    
    let portionItems = 0;
    let portionStock = 0;
    let caseItems = 0;
    let caseStock = 0;

    activeList.forEach(item => {
      if (item.inventory_type === 'PER CASES') {
        caseItems++;
        caseStock += item.current_qty;
      } else {
        portionItems++;
        portionStock += item.current_qty;
      }
    });

    return {
      total: activeList.length,
      low: activeList.filter(i => i.current_qty > 0 && i.current_qty <= i.min_qty).length,
      out: activeList.filter(i => i.current_qty <= 0).length,
      expiring: batches?.length || 0,
      portionItems,
      portionStock,
      caseItems,
      caseStock
    };
  }, [items, batches]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
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

        <Card className="border-t-4 border-t-orange-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wider">Low Stock</CardTitle>
            <AlertTriangle className="w-5 h-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{summary.low}</div>
            <p className="text-xs font-semibold text-slate-500 mt-1 uppercase">At or below minimum</p>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-red-600 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wider">Out of Stock</CardTitle>
            <AlertOctagon className="w-5 h-5 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{summary.out}</div>
            <p className="text-xs font-semibold text-slate-500 mt-1 uppercase">Zero quantity</p>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-yellow-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wider">Expiring Soon</CardTitle>
            <Clock className="w-5 h-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{summary.expiring}</div>
            <p className="text-xs font-semibold text-slate-500 mt-1 uppercase">Next 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <Card className="shadow-sm border border-slate-200">
          <CardHeader className="bg-slate-50 border-b border-slate-100 py-3">
            <CardTitle className="text-sm font-bold text-slate-700 uppercase tracking-wider">Portion Stock Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-4xl font-bold text-slate-900">{summary.portionItems}</div>
                <div className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">Unique Items</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-slate-900">{summary.portionStock}</div>
                <div className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">Total Units</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-slate-200">
          <CardHeader className="bg-slate-50 border-b border-slate-100 py-3">
            <CardTitle className="text-sm font-bold text-slate-700 uppercase tracking-wider">Per Cases Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-4xl font-bold text-slate-900">{summary.caseItems}</div>
                <div className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">Unique Items</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-slate-900">{summary.caseStock}</div>
                <div className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">Total Cases</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
