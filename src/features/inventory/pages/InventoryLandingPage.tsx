import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getInventory } from '../api';
import { Package, Bell, AlertOctagon, Clock, AlertTriangle, ArrowRight, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function InventoryLandingPage() {
  const { data: items, isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: getInventory,
  });

  const today = format(new Date(), 'MMM dd, yyyy');

  const summary = useMemo(() => {
    const list = items || [];
    return {
      total: list.length,
      low: list.filter(i => i.total_quantity > 0 && i.total_quantity <= i.min_quantity).length,
      out: list.filter(i => i.total_quantity <= 0).length,
      // Mock expiring soon for now
      expiring: 3, 
    };
  }, [items]);

  // Mock data for summary table
  const portionItems = 64;
  const portionStock = 1245;
  const caseItems = 28;
  const caseStock = 312;

  // Mock data for recent activity
  const recentActivity = [
    { time: '10:30 AM', user: 'Juan D.', details: 'Pale Pilsen', action: '+12 bottle(s)' },
    { time: '10:15 AM', user: 'Maria S.', details: 'Stallion Red Horse', action: '-8 bottle(s)' },
    { time: '09:50 AM', user: 'Juan D.', details: 'Milk', action: 'New stock: 57' },
    { time: '08:30 AM', user: 'Admin User', details: 'Daily Inventory', action: 'May 23, 2025' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight uppercase">Dashboard</h1>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-t-4 border-t-blue-600 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold text-slate-600 uppercase">Total Items</CardTitle>
            <Package className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-slate-900">{isLoading ? '-' : summary.total}</div>
            <p className="text-xs text-slate-500 mt-1">All active inventory items</p>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-amber-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold text-slate-600 uppercase">Low Stock</CardTitle>
            <Bell className="h-5 w-5 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-slate-900">{isLoading ? '-' : summary.low}</div>
            <p className="text-xs text-slate-500 mt-1">Below minimum quantity</p>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-red-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold text-slate-600 uppercase">Out of Stock</CardTitle>
            <AlertOctagon className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-slate-900">{isLoading ? '-' : summary.out}</div>
            <p className="text-xs text-slate-500 mt-1">No remaining stock</p>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-yellow-600 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold text-slate-600 uppercase">Expiring Soon</CardTitle>
            <Clock className="h-5 w-5 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-slate-900">{summary.expiring}</div>
            <p className="text-xs text-slate-500 mt-1">Within 7 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Today's Inventory Summary */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-lg font-bold uppercase tracking-tight text-slate-900">Today's Inventory Summary</CardTitle>
              <p className="text-sm font-medium text-slate-500">{today}</p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="font-bold text-slate-700">SECTION</TableHead>
                    <TableHead className="font-bold text-slate-700 text-center">TOTAL ITEMS</TableHead>
                    <TableHead className="font-bold text-slate-700 text-center">TOTAL STOCK</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-semibold text-slate-700">PORTION STOCK</TableCell>
                    <TableCell className="text-center font-medium">{portionItems}</TableCell>
                    <TableCell className="text-center font-medium">{portionStock.toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold text-slate-700">PER CASES</TableCell>
                    <TableCell className="text-center font-medium">{caseItems}</TableCell>
                    <TableCell className="text-center font-medium">{caseStock.toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow className="bg-green-50/50 hover:bg-green-50/50">
                    <TableCell className="font-bold text-green-700 uppercase">Total</TableCell>
                    <TableCell className="text-center font-bold text-green-700">{portionItems + caseItems}</TableCell>
                    <TableCell className="text-center font-bold text-green-700">{(portionStock + caseStock).toLocaleString()}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div className="px-6 py-3 text-xs text-slate-400 bg-slate-50/30">
                Last updated: 10:30 AM
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-lg font-bold uppercase tracking-tight text-slate-900">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="font-bold text-slate-700 w-24">TIME</TableHead>
                    <TableHead className="font-bold text-slate-700">USER</TableHead>
                    <TableHead className="font-bold text-slate-700">DETAILS</TableHead>
                    <TableHead className="font-bold text-slate-700">ACTION</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentActivity.map((act, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-slate-500 font-medium text-sm">{act.time}</TableCell>
                      <TableCell className="text-slate-700 font-medium">{act.user}</TableCell>
                      <TableCell className="text-slate-900 font-semibold">{act.details}</TableCell>
                      <TableCell className="text-slate-600 font-medium">{act.action}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Right Column (1/3) */}
        <div className="space-y-6">
          {/* Recent Alerts */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border">
              <CardTitle className="text-lg font-bold uppercase tracking-tight text-slate-900">Recent Alerts</CardTitle>
              <span className="text-sm font-semibold text-blue-600 cursor-pointer hover:underline">View All</span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {/* Low Stock Alert */}
                <div className="p-4 flex gap-4 hover:bg-slate-50 transition-colors">
                  <div className="mt-0.5">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-bold text-amber-600 uppercase">Low Stock</p>
                      <span className="text-xs font-medium text-slate-400">10 min ago</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800">SMA <span className="font-normal text-slate-600">has only 6 bottle(s) left.</span></p>
                  </div>
                </div>

                {/* Expiring Soon Alert */}
                <div className="p-4 flex gap-4 hover:bg-slate-50 transition-colors">
                  <div className="mt-0.5">
                    <Clock className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-bold text-green-600 uppercase">Expiring Soon</p>
                      <span className="text-xs font-medium text-slate-400">25 min ago</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800">Milk Batch A <span className="font-normal text-slate-600">expires in 3 days.</span></p>
                  </div>
                </div>

                {/* Out of Stock Alert */}
                <div className="p-4 flex gap-4 hover:bg-slate-50 transition-colors">
                  <div className="mt-0.5">
                    <XCircle className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-bold text-red-600 uppercase">Out of Stock</p>
                      <span className="text-xs font-medium text-slate-400">1 hour ago</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800">Coke Zero <span className="font-normal text-slate-600">is out of stock.</span></p>
                  </div>
                </div>

                {/* Expired Alert */}
                <div className="p-4 flex gap-4 hover:bg-slate-50 transition-colors">
                  <div className="mt-0.5">
                    <AlertTriangle className="h-5 w-5 text-red-700" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-bold text-red-700 uppercase">Expired</p>
                      <span className="text-xs font-medium text-slate-400">2 hours ago</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800">Cream Batch B <span className="font-normal text-slate-600">expired on May 23.</span></p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
