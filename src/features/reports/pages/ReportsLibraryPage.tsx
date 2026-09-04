import { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useReportsList } from '../api/reports';
import { useQuery } from '@tanstack/react-query';
import { getInventory, getStockMovementHistory } from '@/features/inventory/api';
import { 
  FileText, ChevronLeft, ChevronRight, BarChart3, AlertTriangle, 
  ArrowDownRight, ArrowUpRight, RefreshCw, Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';

export function ReportsLibraryPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = useMemo(() => {
    if (location.pathname === '/reports/inventory') return 'valuation';
    if (location.pathname === '/reports/movement') return 'movements';
    if (location.pathname === '/reports/low-stock' || location.pathname === '/reports/expiry') return 'alerts';
    return 'daily-sheets';
  }, [location.pathname]);

  const handleTabChange = (val: string) => {
    if (val === 'valuation') navigate('/reports/inventory');
    else if (val === 'movements') navigate('/reports/movement');
    else if (val === 'alerts') navigate('/reports/low-stock');
    else navigate('/reports');
  };

  // Tab 1: Daily inventory sheets filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;
  const offset = (page - 1) * limit;

  const { data: reportsData, isLoading: isReportsLoading } = useReportsList({
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    limit,
    offset,
  });

  const reports = reportsData?.data || [];
  const totalCount = reportsData?.count || 0;
  const totalPages = Math.ceil(totalCount / limit);

  // Tab 2: Live Stock & Valuation
  const { data: inventory = [], isLoading: isInvLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: getInventory,
  });

  const [valuationSearch, setValuationSearch] = useState('');
  const [valuationCat, setValuationCat] = useState('ALL');

  const filteredValuation = useMemo(() => {
    return inventory.filter(item => {
      const matchSearch = item.item_name.toLowerCase().includes(valuationSearch.toLowerCase());
      const matchCat = valuationCat === 'ALL' || item.category_name === valuationCat;
      return matchSearch && matchCat;
    });
  }, [inventory, valuationSearch, valuationCat]);

  const totalValuation = useMemo(() => {
    return inventory.reduce((sum, item) => sum + (item.current_qty * item.unit_cost), 0);
  }, [inventory]);

  const totalUnits = useMemo(() => {
    return inventory.reduce((sum, item) => sum + item.current_qty, 0);
  }, [inventory]);

  // Tab 3: Movement Audit
  const [movementFilterDate, setMovementFilterDate] = useState('');
  const { data: movements = [], isLoading: isMovementsLoading } = useQuery({
    queryKey: ['global-stock-history'],
    queryFn: () => getStockMovementHistory(),
  });

  const filteredMovements = useMemo(() => {
    if (!movementFilterDate) return movements;
    return movements.filter(m => m.created_at.startsWith(movementFilterDate));
  }, [movements, movementFilterDate]);

  // Tab 4: Low Stock & Expiry alerts
  const lowStockItems = useMemo(() => {
    return inventory.filter(i => i.current_qty <= i.min_qty);
  }, [inventory]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    inventory.forEach(i => {
      if (i.category_name) set.add(i.category_name);
    });
    return Array.from(set);
  }, [inventory]);

  const exportValuationCSV = () => {
    if (filteredValuation.length === 0) return;
    const headers = ['Item Code', 'Item Name', 'Category', 'Unit', 'Unit Cost (PHP)', 'Current Stock', 'Total Value (PHP)', 'Status'];
    const rows = filteredValuation.map(i => [
      `"${i.item_code}"`,
      `"${i.item_name}"`,
      `"${i.category_name || ''}"`,
      `"${i.unit}"`,
      i.unit_cost.toFixed(2),
      i.current_qty,
      (i.current_qty * i.unit_cost).toFixed(2),
      i.current_qty <= 0 ? 'Out of Stock' : i.current_qty <= i.min_qty ? 'Low Stock' : 'In Stock'
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `KUVENTORY_Stock_Valuation_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            Reports & Analytics Hub
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Historical daily inventory worksheets, valuation summaries, and stock audit trails.
          </p>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={(val) => handleTabChange(val as string)} className="space-y-6">
        <TabsList className="bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-xl flex flex-wrap gap-1.5 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
          <TabsTrigger value="daily-sheets" className="font-semibold text-xs sm:text-sm">
            Daily Inventory Sheets
          </TabsTrigger>
          <TabsTrigger value="valuation" className="font-semibold text-xs sm:text-sm">
            Stock Valuation & Assets
          </TabsTrigger>
          <TabsTrigger value="movements" className="font-semibold text-xs sm:text-sm">
            Movement Audit Trail
          </TabsTrigger>
          <TabsTrigger value="alerts" className="font-semibold text-xs sm:text-sm">
            Low Stock Alerts ({lowStockItems.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: DAILY INVENTORY WORKSHEETS */}
        <TabsContent value="daily-sheets" className="space-y-6">
          <div className="flex flex-wrap gap-4 items-end bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="space-y-1.5 flex-1 min-w-45">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">From Date</label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                className="bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
              />
            </div>
            <div className="space-y-1.5 flex-1 min-w-45">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">To Date</label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                className="bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
              />
            </div>
            
            <Button 
              variant="outline" 
              className="border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold"
              onClick={() => { setFromDate(''); setToDate(''); setPage(1); }}
            >
              Clear Filters
            </Button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="max-h-[calc(100dvh-320px)] min-h-[300px] overflow-y-auto overflow-x-auto relative overscroll-contain">
              <Table className="border-collapse">
                <TableHeader className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-950 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 shadow-xs">
                  <TableRow>
                    <TableHead className="font-bold text-slate-700 dark:text-slate-300 sticky left-0 z-30 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">Inventory Date</TableHead>
                    <TableHead className="font-bold text-slate-700 dark:text-slate-300">Status</TableHead>
                    <TableHead className="font-bold text-slate-700 dark:text-slate-300">Finalized By</TableHead>
                    <TableHead className="font-bold text-slate-700 dark:text-slate-300">Finalized At</TableHead>
                    <TableHead className="text-right font-bold text-slate-700 dark:text-slate-300">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isReportsLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-slate-500 font-medium">Loading reports...</TableCell>
                    </TableRow>
                  ) : reports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-slate-500 font-medium">
                        No finalized daily inventory reports found yet. Finalize today's worksheet in Daily Inventory to create an immutable snapshot.
                      </TableCell>
                    </TableRow>
                  ) : (
                    reports.map(report => (
                      <TableRow key={report.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
                        <TableCell className="font-semibold text-slate-900 dark:text-white sticky left-0 z-10 bg-white group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/50 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          {format(new Date(report.inventory_date), 'MMMM dd, yyyy')}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            {report.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400 font-medium">{report.finalized_by_name || 'Admin User'}</TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400">
                          {report.finalized_at ? format(new Date(report.finalized_at), 'MMM dd, yyyy h:mm a') : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" className="font-bold border-slate-300 dark:border-slate-700 hover:bg-slate-100">
                            <Link to={`/reports/${report.id}`} className="flex items-center">
                              <FileText className="w-4 h-4 mr-2" />
                              View & Export
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <span className="text-xs text-slate-500 font-medium">Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 2: LIVE VALUATION & ASSET REPORT */}
        <TabsContent value="valuation" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Inventory Value</span>
              <div className="text-2xl font-black text-emerald-600 mt-2">
                ₱{totalValuation.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-xs text-slate-400 mt-1 block">Live aggregated asset valuation</span>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Physical Units</span>
              <div className="text-2xl font-black text-blue-600 mt-2">
                {totalUnits.toLocaleString()} units
              </div>
              <span className="text-xs text-slate-400 mt-1 block">Across all active batches</span>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Catalog Items</span>
              <div className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-2">
                {inventory.length} SKUs
              </div>
              <span className="text-xs text-slate-400 mt-1 block">In {categories.length} categories</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap gap-3 flex-1 w-full sm:w-auto">
              <Input
                placeholder="Search item name or code..."
                value={valuationSearch}
                onChange={e => setValuationSearch(e.target.value)}
                className="max-w-xs bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-sm"
              />
              <select
                value={valuationCat}
                onChange={e => setValuationCat(e.target.value)}
                className="h-10 px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-sm font-semibold"
              >
                <option value="ALL">All Categories</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <Button onClick={exportValuationCSV} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm">
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="max-h-[calc(100dvh-340px)] min-h-[300px] overflow-y-auto overflow-x-auto relative overscroll-contain">
              <Table className="border-collapse">
                <TableHeader className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-950 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 shadow-xs">
                  <TableRow>
                    <TableHead className="font-bold sticky left-0 z-30 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 min-w-[180px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">Item</TableHead>
                    <TableHead className="font-bold">Category</TableHead>
                    <TableHead className="text-center font-bold">Unit</TableHead>
                    <TableHead className="text-right font-bold">Unit Cost</TableHead>
                    <TableHead className="text-center font-bold">Physical Stock</TableHead>
                    <TableHead className="text-right font-bold">Total Value</TableHead>
                    <TableHead className="text-center font-bold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isInvLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-slate-500 font-medium">Loading valuation data...</TableCell>
                    </TableRow>
                  ) : filteredValuation.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-slate-500 font-medium">No items match your filter.</TableCell>
                    </TableRow>
                  ) : (
                    filteredValuation.map(item => {
                      const itemValue = item.current_qty * item.unit_cost;
                      const isOOS = item.current_qty <= 0;
                      const isLow = !isOOS && item.current_qty <= item.min_qty;
                      return (
                        <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
                          <TableCell className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/50 border-r border-slate-200 dark:border-slate-800 min-w-[180px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          <div className="font-bold text-slate-900 dark:text-white">{item.item_name}</div>
                          <div className="text-xs text-slate-400 font-mono">{item.item_code}</div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {item.category_name}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-xs font-bold text-slate-600">{item.unit}</TableCell>
                        <TableCell className="text-right font-semibold text-slate-700 dark:text-slate-300">
                          ₱{item.unit_cost.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center font-black text-slate-900 dark:text-white">
                          {item.current_qty}
                        </TableCell>
                        <TableCell className="text-right font-black text-emerald-600">
                          ₱{itemValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">
                          {isOOS ? (
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-700">Out of Stock</span>
                          ) : isLow ? (
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700">Low Stock</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700">Optimal</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: MOVEMENT AUDIT TRAIL */}
        <TabsContent value="movements" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Filter by Date:</label>
              <Input
                type="date"
                value={movementFilterDate}
                onChange={e => setMovementFilterDate(e.target.value)}
                className="w-48 bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-sm"
              />
              {movementFilterDate && (
                <Button variant="ghost" size="sm" onClick={() => setMovementFilterDate('')}>
                  Clear
                </Button>
              )}
            </div>
            <span className="text-xs font-semibold text-slate-500">
              Showing {filteredMovements.length} logged stock transactions
            </span>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="max-h-[calc(100dvh-320px)] min-h-[300px] overflow-y-auto overflow-x-auto relative overscroll-contain">
              <Table className="border-collapse">
                <TableHeader className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-950 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 shadow-xs">
                  <TableRow>
                    <TableHead className="font-bold sticky left-0 z-30 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 min-w-[160px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">Timestamp</TableHead>
                    <TableHead className="font-bold">Item</TableHead>
                    <TableHead className="font-bold text-center">Action</TableHead>
                    <TableHead className="text-center font-bold">Qty Change</TableHead>
                    <TableHead className="text-center font-bold">Balance (Before → After)</TableHead>
                    <TableHead className="font-bold">Performed By</TableHead>
                    <TableHead className="font-bold">Reason / Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isMovementsLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-slate-500 font-medium">Loading movements...</TableCell>
                    </TableRow>
                  ) : filteredMovements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-slate-500 font-medium">No stock transactions found for this selection.</TableCell>
                    </TableRow>
                  ) : (
                    filteredMovements.map(m => {
                      const isAdd = m.action_type === 'ADD';
                      const isRemove = m.action_type === 'REMOVE';
                      return (
                        <TableRow key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs group">
                          <TableCell className="text-slate-500 font-mono sticky left-0 z-10 bg-white group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/50 border-r border-slate-200 dark:border-slate-800 min-w-[160px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                            {format(new Date(m.created_at), 'MMM dd, yyyy h:mm a')}
                          </TableCell>
                          <TableCell className="font-bold text-slate-900 dark:text-white">
                            {m.item_name}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded font-bold ${
                              isAdd 
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                                : isRemove 
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' 
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            }`}>
                              {isAdd && <ArrowDownRight className="w-3 h-3 mr-1" />}
                              {isRemove && <ArrowUpRight className="w-3 h-3 mr-1" />}
                              {!isAdd && !isRemove && <RefreshCw className="w-3 h-3 mr-1" />}
                              {m.action_type}
                            </span>
                          </TableCell>
                          <TableCell className={`text-center font-black ${isAdd ? 'text-emerald-600' : isRemove ? 'text-rose-600' : 'text-blue-600'}`}>
                            {isAdd ? `+${m.quantity}` : isRemove ? `-${m.quantity}` : `${m.quantity}`}
                          </TableCell>
                          <TableCell className="text-center text-slate-600 font-mono">
                            {m.previous_balance} → <span className="font-bold text-slate-900 dark:text-white">{m.new_balance}</span>
                          </TableCell>
                          <TableCell className="font-medium text-slate-700 dark:text-slate-300">
                            {m.user_name || 'Staff User'}
                          </TableCell>
                          <TableCell className="text-slate-500 max-w-xs truncate">
                            {m.reason}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 4: LOW STOCK & REPLENISHMENT */}
        <TabsContent value="alerts" className="space-y-6">
          <div className="bg-amber-50 dark:bg-amber-950/40 p-4 rounded-xl border border-amber-200 dark:border-amber-900 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">Reorder & Stock Replenishment Action List</h3>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                The items below are currently at or below their minimum reorder point. Take action to replenish supplies to avoid stockouts during service.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="max-h-[calc(100dvh-320px)] min-h-[300px] overflow-y-auto overflow-x-auto relative overscroll-contain">
              <Table className="border-collapse">
                <TableHeader className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-950 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 shadow-xs">
                  <TableRow>
                    <TableHead className="font-bold sticky left-0 z-30 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 min-w-[180px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">Item Name</TableHead>
                    <TableHead className="font-bold">Category</TableHead>
                    <TableHead className="text-center font-bold">Current Stock</TableHead>
                    <TableHead className="text-center font-bold">Min Threshold</TableHead>
                    <TableHead className="text-center font-bold">Deficit</TableHead>
                    <TableHead className="font-bold">Supplier A</TableHead>
                    <TableHead className="text-right font-bold">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-emerald-600 font-bold">
                        ✓ All catalog items are sufficiently stocked above minimum reorder points.
                      </TableCell>
                    </TableRow>
                  ) : (
                    lowStockItems.map(item => {
                      const deficit = Math.max(0, item.min_qty - item.current_qty);
                      return (
                        <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
                          <TableCell className="font-bold text-slate-900 dark:text-white sticky left-0 z-10 bg-white group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/50 border-r border-slate-200 dark:border-slate-800 min-w-[180px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                            <Link to={`/items/${item.id}`} className="hover:text-blue-600">
                              {item.item_name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {item.category_name}
                            </span>
                          </TableCell>
                          <TableCell className="text-center font-black text-rose-600">
                            {item.current_qty} {item.unit}
                          </TableCell>
                          <TableCell className="text-center text-slate-600 font-semibold">
                            {item.min_qty} {item.unit}
                          </TableCell>
                          <TableCell className="text-center font-black text-amber-700 bg-amber-50 dark:bg-amber-950/30">
                            -{deficit} {item.unit}
                          </TableCell>
                          <TableCell className="text-slate-600 text-xs">
                            {item.supplier_a || 'Primary Supplier'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Link 
                              to={`/items/${item.id}`}
                              className="inline-flex items-center justify-center rounded-md bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-1.5 shadow-sm transition-colors"
                            >
                              Restock Item
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
