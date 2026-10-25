import { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useReportsList } from '../api/reports';
import { useQuery } from '@tanstack/react-query';
import { 
  getInventory, 
  getStockMovementHistory, 
  getAllActiveBatches, 
  getArchivedItems 
} from '@/features/inventory/api';
import { 
  FileText, ChevronLeft, ChevronRight, BarChart3, AlertTriangle, 
  ArrowDownRight, ArrowUpRight, RefreshCw, Download, Clock, Archive, ShieldAlert
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { downloadCsv, escapeCsvField } from '../export/csv';
import { getBusinessDateString } from '@/lib/businessDate';
import { ErrorState } from '@/components/common/ErrorState';
import { useAuth } from '@/features/auth/context/AuthContext';
import { StaffRequestModal } from '@/features/daily-inventory/components/StaffRequestModal';

export function ReportsLibraryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const [restockRequest, setRestockRequest] = useState<{ itemId: string; itemName: string; unit: string; currentQty: number; minQty: number } | null>(null);

  const activeTab = useMemo(() => {
    if (location.pathname === '/reports/inventory') return 'valuation';
    if (location.pathname === '/reports/movement') return 'movements';
    if (location.pathname === '/reports/low-stock') return 'low-stock';
    if (location.pathname === '/reports/expiry') return 'expiry';
    if (location.pathname === '/reports/archived') return 'archived';
    return 'daily-sheets';
  }, [location.pathname]);

  const handleTabChange = (val: string) => {
    if (val === 'valuation') navigate('/reports/inventory');
    else if (val === 'movements') navigate('/reports/movement');
    else if (val === 'low-stock') navigate('/reports/low-stock');
    else if (val === 'expiry') navigate('/reports/expiry');
    else if (val === 'archived') navigate('/reports/archived');
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
  const {
    data: inventory = [],
    isLoading: isInvLoading,
    isError: isInvError,
    error: invError,
    refetch: refetchInventory,
  } = useQuery({
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
  const {
    data: movements = [],
    isLoading: isMovementsLoading,
    isError: isMovementsError,
    error: movementsError,
    refetch: refetchMovements,
  } = useQuery({
    queryKey: ['global-stock-history'],
    queryFn: () => getStockMovementHistory(),
  });

  const filteredMovements = useMemo(() => {
    if (!movementFilterDate) return movements;
    return movements.filter(m => m.created_at.startsWith(movementFilterDate));
  }, [movements, movementFilterDate]);

  const todayBusinessStr = useMemo(() => getBusinessDateString(), []);

  // Tab 4: Low Stock alerts
  const lowStockItems = useMemo(() => {
    return inventory
      .filter(item => item.current_qty <= item.min_qty)
      .sort((a, b) => (b.min_qty - b.current_qty) - (a.min_qty - a.current_qty));
  }, [inventory]);

  // Tab 5: Expiry Risk & Active Batches
  const {
    data: batches = [],
    isLoading: isBatchesLoading,
    isError: isBatchesError,
    error: batchesError,
    refetch: refetchBatches,
  } = useQuery({
    queryKey: ['report-active-batches'],
    queryFn: getAllActiveBatches,
  });

  const [expirySearch, setExpirySearch] = useState('');
  const [expiryStatusFilter, setExpiryStatusFilter] = useState<'ALL' | 'EXPIRED' | 'EXPIRING_SOON' | 'HEALTHY'>('ALL');

  const analyzedBatches = useMemo(() => {
    return batches.map(b => {
      let status: 'EXPIRED' | 'EXPIRING_SOON' | 'HEALTHY' | 'NO_EXPIRY' = 'NO_EXPIRY';
      let daysRemaining: number | null = null;
      if (b.expiry_date) {
        const expTime = new Date(b.expiry_date).getTime();
        const nowTime = new Date(todayBusinessStr).getTime();
        daysRemaining = Math.ceil((expTime - nowTime) / (1000 * 60 * 60 * 24));
        if (daysRemaining < 0) {
          status = 'EXPIRED';
        } else if (daysRemaining <= 30) {
          status = 'EXPIRING_SOON';
        } else {
          status = 'HEALTHY';
        }
      }
      return {
        ...b,
        status,
        daysRemaining,
        itemName: b.inventory_items?.name || 'Unknown Item',
        categoryName: b.inventory_items?.categories?.name || 'General',
        unit: b.inventory_items?.unit || 'pcs',
        unitCost: Number(b.inventory_items?.unit_cost || 0),
      };
    });
  }, [batches, todayBusinessStr]);

  const filteredBatches = useMemo(() => {
    return analyzedBatches.filter(b => {
      const matchSearch = b.itemName.toLowerCase().includes(expirySearch.toLowerCase()) ||
                          b.categoryName.toLowerCase().includes(expirySearch.toLowerCase());
      const matchStatus = expiryStatusFilter === 'ALL' || b.status === expiryStatusFilter;
      return matchSearch && matchStatus;
    });
  }, [analyzedBatches, expirySearch, expiryStatusFilter]);

  const expiredCount = useMemo(() => analyzedBatches.filter(b => b.status === 'EXPIRED').length, [analyzedBatches]);
  const expiringSoonCount = useMemo(() => analyzedBatches.filter(b => b.status === 'EXPIRING_SOON').length, [analyzedBatches]);

  const exportExpiryCSV = () => {
    if (filteredBatches.length === 0) return;
    const headers = ['Batch ID', 'Item Name', 'Category', 'Quantity', 'Unit', 'Received Date', 'Expiry Date', 'Status', 'Days Remaining'];
    const rows = filteredBatches.map(b => [
      escapeCsvField(b.id),
      escapeCsvField(b.itemName),
      escapeCsvField(b.categoryName),
      escapeCsvField(b.quantity),
      escapeCsvField(b.unit),
      escapeCsvField(b.received_date || ''),
      escapeCsvField(b.expiry_date || 'N/A'),
      escapeCsvField(b.status),
      escapeCsvField(b.daysRemaining !== null ? b.daysRemaining : 'N/A'),
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCsv(`KUVENTORY_Expiry_Risk_${todayBusinessStr}.csv`, csvContent);
  };

  // Tab 6: Archived Catalog Items
  const { data: archivedItems = [], isLoading: isArchivedLoading } = useQuery({
    queryKey: ['report-archived-items'],
    queryFn: getArchivedItems,
  });

  const [archivedSearch, setArchivedSearch] = useState('');

  const filteredArchived = useMemo(() => {
    return archivedItems.filter(item => {
      const search = archivedSearch.toLowerCase();
      const name = (item.name || '').toLowerCase();
      const cat = (item.categories?.name || '').toLowerCase();
      const desc = (item.description || '').toLowerCase();
      return name.includes(search) || cat.includes(search) || desc.includes(search);
    });
  }, [archivedItems, archivedSearch]);

  const exportArchivedCSV = () => {
    if (filteredArchived.length === 0) return;
    const headers = ['Item Name', 'Category', 'Unit', 'Unit Cost (PHP)', 'Min Quantity', 'Archived / Inactive At'];
    const rows = filteredArchived.map(i => [
      escapeCsvField(i.name),
      escapeCsvField(i.categories?.name || 'General'),
      escapeCsvField(i.unit || 'pcs'),
      escapeCsvField(Number(i.unit_cost || 0).toFixed(2)),
      escapeCsvField(i.min_quantity || 0),
      escapeCsvField(i.updated_at ? format(new Date(i.updated_at), 'yyyy-MM-dd HH:mm') : 'N/A'),
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCsv(`KUVENTORY_Archived_Catalog_${todayBusinessStr}.csv`, csvContent);
  };

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
      escapeCsvField(i.item_code),
      escapeCsvField(i.item_name),
      escapeCsvField(i.category_name || ''),
      escapeCsvField(i.unit),
      escapeCsvField(i.unit_cost.toFixed(2)),
      escapeCsvField(i.current_qty),
      escapeCsvField((i.current_qty * i.unit_cost).toFixed(2)),
      escapeCsvField(i.current_qty <= 0 ? 'Out of Stock' : i.current_qty <= i.min_qty ? 'Low Stock' : 'In Stock')
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCsv(`KUVENTORY_Stock_Valuation_${todayBusinessStr}.csv`, csvContent);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 text-foreground">
      {(isInvError || isMovementsError || isBatchesError) && (
        <ErrorState
          error={invError || movementsError || batchesError}
          operation="load the report data"
          onRetry={() => {
            void refetchInventory();
            void refetchMovements();
            void refetchBatches();
          }}
          retryLabel="Refresh Data"
        />
      )}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 border-border">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-primary" />
            Reports & Analytics Hub
          </h1>
          <p className="text-muted-foreground mt-1 font-medium text-sm">
            Historical daily inventory worksheets, valuation summaries, batch expiry monitoring, and stock audit trails.
          </p>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={(val) => handleTabChange(val as string)} className="space-y-6">
        <TabsList className="bg-muted p-1.5 rounded-xl flex flex-wrap gap-1.5 border border-border shadow-2xs">
          <TabsTrigger value="daily-sheets" className="font-semibold text-xs sm:text-sm">
            Daily Inventory Sheets
          </TabsTrigger>
          <TabsTrigger value="valuation" className="font-semibold text-xs sm:text-sm">
            Stock Valuation & Assets
          </TabsTrigger>
          <TabsTrigger value="movements" className="font-semibold text-xs sm:text-sm">
            Movement Audit Trail
          </TabsTrigger>
          <TabsTrigger value="low-stock" className="font-semibold text-xs sm:text-sm">
            Low Stock Alerts ({lowStockItems.length})
          </TabsTrigger>
          <TabsTrigger value="expiry" className="font-semibold text-xs sm:text-sm">
            Expiry Risk ({expiredCount + expiringSoonCount})
          </TabsTrigger>
          <TabsTrigger value="archived" className="font-semibold text-xs sm:text-sm">
            Archived Catalog ({archivedItems.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: DAILY INVENTORY WORKSHEETS */}
        <TabsContent value="daily-sheets" className="space-y-6">
          <div className="flex flex-wrap gap-4 items-end bg-card p-4 rounded-xl border border-border shadow-xs">
            <div className="space-y-1.5 flex-1 min-w-45">
              <label className="text-xs font-bold text-foreground">From Date</label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                className="bg-card border-border text-foreground"
              />
            </div>
            <div className="space-y-1.5 flex-1 min-w-45">
              <label className="text-xs font-bold text-foreground">To Date</label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                className="bg-card border-border text-foreground"
              />
            </div>
            
            <Button 
              variant="outline" 
              className="border-border text-foreground font-bold hover:bg-muted"
              onClick={() => { setFromDate(''); setToDate(''); setPage(1); }}
            >
              Clear Filters
            </Button>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            <div className="table-slider-container max-h-[calc(100dvh-320px)] min-h-[300px] relative overscroll-contain">
              <Table className="border-collapse">
                <TableHeader className="sticky top-0 z-20 bg-muted/60 backdrop-blur-xs border-b border-border shadow-xs">
                  <TableRow>
                    <TableHead className="font-bold text-foreground sticky left-0 z-30 bg-muted border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">Inventory Date</TableHead>
                    <TableHead className="font-bold text-foreground">Status</TableHead>
                    <TableHead className="font-bold text-foreground">Finalized By</TableHead>
                    <TableHead className="font-bold text-foreground">Finalized At</TableHead>
                    <TableHead className="text-right font-bold text-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isReportsLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground font-medium">Loading reports...</TableCell>
                    </TableRow>
                  ) : reports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground font-medium">
                        No finalized daily inventory reports found yet. Finalize today's worksheet in Daily Inventory to create an immutable snapshot.
                      </TableCell>
                    </TableRow>
                  ) : (
                    reports.map(report => (
                      <TableRow key={report.id} className="hover:bg-muted/40 group">
                        <TableCell className="font-semibold text-foreground sticky left-0 z-10 bg-card group-hover:bg-muted border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          {format(new Date(report.inventory_date), 'MMMM dd, yyyy')}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                            {report.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-foreground font-medium">{report.finalized_by_name || 'Admin User'}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {report.finalized_at ? format(new Date(report.finalized_at), 'MMM dd, yyyy h:mm a') : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link 
                            to={`/reports/${report.id}`} 
                            className={buttonVariants({ variant: 'outline', size: 'sm', className: "font-bold border-border hover:bg-muted text-foreground" })}
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            View & Export
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-border bg-muted/40">
                <span className="text-xs text-muted-foreground font-medium">Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="border-border">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="border-border">
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
            <div className="bg-card p-5 rounded-xl border border-border shadow-xs">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Inventory Value</span>
              <div className="text-2xl font-black text-emerald-500 mt-2">
                ₱{totalValuation.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-xs text-muted-foreground mt-1 block">Live aggregated asset valuation</span>
            </div>
            <div className="bg-card p-5 rounded-xl border border-border shadow-xs">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Physical Units</span>
              <div className="text-2xl font-black text-primary mt-2">
                {totalUnits.toLocaleString()} units
              </div>
              <span className="text-xs text-muted-foreground mt-1 block">Across all active batches</span>
            </div>
            <div className="bg-card p-5 rounded-xl border border-border shadow-xs">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Catalog Items</span>
              <div className="text-2xl font-black text-foreground mt-2">
                {inventory.length} items
              </div>
              <span className="text-xs text-muted-foreground mt-1 block">In {categories.length} categories</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-xl border border-border">
            <div className="flex flex-wrap gap-3 flex-1 w-full sm:w-auto">
              <Input
                placeholder="Search item name or code..."
                value={valuationSearch}
                onChange={e => setValuationSearch(e.target.value)}
                className="max-w-xs bg-card border-border text-foreground text-sm"
              />
              <select
                value={valuationCat}
                onChange={e => setValuationCat(e.target.value)}
                className="h-10 px-3 py-2 bg-card border border-border text-foreground rounded-md text-sm font-semibold outline-none"
              >
                <option value="ALL">All Categories</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <Button onClick={exportValuationCSV} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs sm:text-sm">
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            <div className="table-slider-container max-h-[calc(100dvh-340px)] min-h-[300px] relative overscroll-contain">
              <Table className="border-collapse">
                <TableHeader className="sticky top-0 z-20 bg-muted/60 backdrop-blur-xs border-b border-border shadow-xs">
                  <TableRow>
                    <TableHead className="font-bold text-foreground sticky left-0 z-30 bg-muted border-r border-border min-w-45 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">Item</TableHead>
                    <TableHead className="font-bold text-foreground">Category</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Unit</TableHead>
                    <TableHead className="text-right font-bold text-foreground">Unit Cost</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Physical Stock</TableHead>
                    <TableHead className="text-right font-bold text-foreground">Total Value</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isInvLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground font-medium">Loading valuation data...</TableCell>
                    </TableRow>
                  ) : filteredValuation.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground font-medium">No items match your filter.</TableCell>
                    </TableRow>
                  ) : (
                    filteredValuation.map(item => {
                      const itemValue = item.current_qty * item.unit_cost;
                      const isOOS = item.current_qty <= 0;
                      const isLow = !isOOS && item.current_qty <= item.min_qty;
                      return (
                        <TableRow key={item.id} className="hover:bg-muted/40 group">
                          <TableCell className="sticky left-0 z-10 bg-card group-hover:bg-muted border-r border-border min-w-45 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          <div className="font-bold text-foreground">{item.item_name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{item.item_code}</div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground">
                            {item.category_name}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-xs font-bold text-muted-foreground">{item.unit}</TableCell>
                        <TableCell className="text-right font-semibold text-foreground">
                          ₱{item.unit_cost.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center font-black text-foreground">
                          {item.current_qty}
                        </TableCell>
                        <TableCell className="text-right font-black text-emerald-500">
                          ₱{itemValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">
                          {isOOS ? (
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-destructive/15 text-destructive border border-destructive/20">Out of Stock</span>
                          ) : isLow ? (
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-500 border border-amber-500/20">Low Stock</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">Optimal</span>
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
          <div className="flex flex-wrap items-center justify-between gap-4 bg-card p-4 rounded-xl border border-border">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-foreground">Filter by Date:</label>
              <Input
                type="date"
                value={movementFilterDate}
                onChange={e => setMovementFilterDate(e.target.value)}
                className="w-48 bg-card border-border text-foreground text-sm"
              />
              {movementFilterDate && (
                <Button variant="ghost" size="sm" onClick={() => setMovementFilterDate('')} className="text-muted-foreground hover:text-foreground">
                  Clear
                </Button>
              )}
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              Showing {filteredMovements.length} logged stock transactions
            </span>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            <div className="table-slider-container max-h-[calc(100dvh-320px)] min-h-[300px] relative overscroll-contain">
              <Table className="border-collapse">
                <TableHeader className="sticky top-0 z-20 bg-muted/60 backdrop-blur-xs border-b border-border shadow-xs">
                  <TableRow>
                    <TableHead className="font-bold text-foreground sticky left-0 z-30 bg-muted border-r border-border min-w-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">Timestamp</TableHead>
                    <TableHead className="font-bold text-foreground">Item</TableHead>
                    <TableHead className="font-bold text-foreground text-center">Action</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Qty Change</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Balance (Before → After)</TableHead>
                    <TableHead className="font-bold text-foreground">Performed By</TableHead>
                    <TableHead className="font-bold text-foreground">Reason / Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isMovementsLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground font-medium">Loading movements...</TableCell>
                    </TableRow>
                  ) : filteredMovements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground font-medium">No stock transactions found for this selection.</TableCell>
                    </TableRow>
                  ) : (
                    filteredMovements.map(m => {
                      const isAdd = m.action_type === 'ADD';
                      const isRemove = m.action_type === 'REMOVE';
                      return (
                        <TableRow key={m.id} className="hover:bg-muted/40 text-xs group">
                          <TableCell className="text-muted-foreground font-mono sticky left-0 z-10 bg-card group-hover:bg-muted border-r border-border min-w-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                            {format(new Date(m.created_at), 'MMM dd, yyyy h:mm a')}
                          </TableCell>
                          <TableCell className="font-bold text-foreground">
                            {m.item_name}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded font-bold ${
                              isAdd 
                                ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20' 
                                : isRemove 
                                ? 'bg-destructive/15 text-destructive border border-destructive/20' 
                                : 'bg-primary/15 text-primary border border-primary/20'
                            }`}>
                              {isAdd && <ArrowDownRight className="w-3 h-3 mr-1" />}
                              {isRemove && <ArrowUpRight className="w-3 h-3 mr-1" />}
                              {!isAdd && !isRemove && <RefreshCw className="w-3 h-3 mr-1" />}
                              {m.action_type}
                            </span>
                          </TableCell>
                          <TableCell className={`text-center font-black ${isAdd ? 'text-emerald-500' : isRemove ? 'text-destructive' : 'text-primary'}`}>
                            {isAdd ? `+${m.quantity}` : isRemove ? `-${m.quantity}` : `${m.quantity}`}
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground font-mono">
                            {m.previous_balance} → <span className="font-bold text-foreground">{m.new_balance}</span>
                          </TableCell>
                          <TableCell className="font-medium text-foreground">
                            {m.user_name || 'Staff User'}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-xs truncate">
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
        <TabsContent value="low-stock" className="space-y-6">
          <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-foreground">Reorder & Stock Replenishment Action List</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                The items below are currently at or below their minimum reorder point. Take action to replenish supplies to avoid stockouts during service.
              </p>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            <div className="table-slider-container max-h-[calc(100dvh-320px)] min-h-75 relative overscroll-contain">
              <Table className="border-collapse">
                <TableHeader className="sticky top-0 z-20 bg-muted/60 backdrop-blur-xs border-b border-border shadow-xs">
                  <TableRow>
                    <TableHead className="font-bold text-foreground sticky left-0 z-30 bg-muted border-r border-border min-w-45 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">Item Name</TableHead>
                    <TableHead className="font-bold text-foreground">Category</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Current Stock</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Min Threshold</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Deficit</TableHead>
                    <TableHead className="font-bold text-foreground">Supplier A</TableHead>
                    <TableHead className="text-right font-bold text-foreground">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-emerald-500 font-bold">
                        ✓ All catalog items are sufficiently stocked above minimum reorder points.
                      </TableCell>
                    </TableRow>
                  ) : (
                    lowStockItems.map(item => {
                      const deficit = Math.max(0, item.min_qty - item.current_qty);
                      return (
                        <TableRow key={item.id} className="hover:bg-muted/40 group">
                          <TableCell className="font-bold text-foreground sticky left-0 z-10 bg-card group-hover:bg-muted border-r border-border min-w-45 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                            {isAdmin ? (
                              <Link to={`/items/${item.id}`} className="hover:text-primary">
                                {item.item_name}
                              </Link>
                            ) : (
                              <span>{item.item_name}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground">
                              {item.category_name}
                            </span>
                          </TableCell>
                          <TableCell className="text-center font-black text-destructive">
                            {item.current_qty} {item.unit}
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground font-semibold">
                            {item.min_qty} {item.unit}
                          </TableCell>
                          <TableCell className={`text-center font-bold text-xs ${
                            deficit > 0 
                              ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10' 
                              : 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
                          }`}>
                            {deficit > 0 ? `-${deficit} ${item.unit}` : `At Min (0 ${item.unit})`}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {item.supplier_a || 'Primary Supplier'}
                          </TableCell>
                          <TableCell className="text-right">
                            {isAdmin ? (
                              <Link 
                                to={`/items/${item.id}`}
                                className="inline-flex items-center justify-center rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs px-3 py-1.5 shadow-xs transition-colors"
                              >
                                Restock Item
                              </Link>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setRestockRequest({ itemId: item.id, itemName: item.item_name, unit: item.unit, currentQty: item.current_qty, minQty: item.min_qty })}
                                className="inline-flex items-center justify-center rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs px-3 py-1.5 transition-colors cursor-pointer"
                                title="Submit a restock request for administrator review"
                              >
                                Request Restock
                              </button>
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

        {/* TAB 5: EXPIRY RISK & ACTIVE BATCHES */}
        <TabsContent value="expiry" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card p-5 rounded-xl border border-destructive/30 shadow-xs">
              <span className="text-xs font-bold text-destructive uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-destructive" /> Expired Batches
              </span>
              <div className="text-2xl font-black text-destructive mt-2">
                {expiredCount} {expiredCount === 1 ? 'batch' : 'batches'}
              </div>
              <span className="text-xs text-muted-foreground mt-1 block">Past expiration date; quarantine required</span>
            </div>
            <div className="bg-card p-5 rounded-xl border border-amber-500/30 shadow-xs">
              <span className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-500" /> Expiring Within 30 Days
              </span>
              <div className="text-2xl font-black text-amber-500 mt-2">
                {expiringSoonCount} {expiringSoonCount === 1 ? 'batch' : 'batches'}
              </div>
              <span className="text-xs text-muted-foreground mt-1 block">Priority FEFO dispatch required</span>
            </div>
            <div className="bg-card p-5 rounded-xl border border-border shadow-xs">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Total Monitored Batches
              </span>
              <div className="text-2xl font-black text-foreground mt-2">
                {batches.length} active
              </div>
              <span className="text-xs text-muted-foreground mt-1 block">Batches with positive physical stock</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-xl border border-border">
            <div className="flex flex-wrap gap-3 flex-1 w-full sm:w-auto">
              <Input
                placeholder="Search batch item or category..."
                value={expirySearch}
                onChange={e => setExpirySearch(e.target.value)}
                className="max-w-xs bg-card border-border text-foreground text-sm"
              />
              <select
                value={expiryStatusFilter}
                onChange={e => setExpiryStatusFilter(e.target.value as any)}
                className="h-10 px-3 py-2 bg-card border border-border text-foreground rounded-md text-sm font-semibold outline-none"
              >
                <option value="ALL">All Expiry Statuses</option>
                <option value="EXPIRED">Expired Only</option>
                <option value="EXPIRING_SOON">Expiring Soon (&le; 30d)</option>
                <option value="HEALTHY">Fresh / Healthy</option>
              </select>
            </div>
            <Button onClick={exportExpiryCSV} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs sm:text-sm">
              <Download className="w-4 h-4 mr-2" /> Export Expiry CSV
            </Button>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            <div className="table-slider-container max-h-[calc(100dvh-320px)] min-h-75 relative overscroll-contain">
              <Table className="border-collapse">
                <TableHeader className="sticky top-0 z-20 bg-muted/60 backdrop-blur-xs border-b border-border shadow-xs">
                  <TableRow>
                    <TableHead className="font-bold text-foreground sticky left-0 z-30 bg-muted border-r border-border min-w-45 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">Item / Batch</TableHead>
                    <TableHead className="font-bold text-foreground">Category</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Batch Qty</TableHead>
                    <TableHead className="font-bold text-foreground">Received Date</TableHead>
                    <TableHead className="font-bold text-foreground">Expiry Date</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Timeline</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Status</TableHead>
                    <TableHead className="text-right font-bold text-foreground">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isBatchesLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground font-medium">Loading batch expiry data...</TableCell>
                    </TableRow>
                  ) : filteredBatches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground font-medium">No batches match the selected criteria.</TableCell>
                    </TableRow>
                  ) : (
                    filteredBatches.map(b => {
                      const isExpired = b.status === 'EXPIRED';
                      const isSoon = b.status === 'EXPIRING_SOON';
                      return (
                        <TableRow key={b.id} className="hover:bg-muted/40 group">
                          <TableCell className="font-bold text-foreground sticky left-0 z-10 bg-card group-hover:bg-muted border-r border-border min-w-45 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                            <div className="text-foreground">{b.itemName}</div>
                            <div className="text-xs text-muted-foreground font-mono">BATCH-{b.id.substring(0, 8).toUpperCase()}</div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground">
                              {b.categoryName}
                            </span>
                          </TableCell>
                          <TableCell className="text-center font-black text-foreground">
                            {b.quantity} {b.unit}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs font-mono">
                            {b.received_date ? format(new Date(b.received_date), 'MMM dd, yyyy') : '-'}
                          </TableCell>
                          <TableCell className={`font-mono text-xs font-bold ${isExpired ? 'text-destructive' : isSoon ? 'text-amber-500' : 'text-foreground'}`}>
                            {b.expiry_date ? format(new Date(b.expiry_date), 'MMM dd, yyyy') : 'No Expiry'}
                          </TableCell>
                          <TableCell className="text-center text-xs font-semibold">
                            {b.daysRemaining === null ? (
                              <span className="text-muted-foreground">-</span>
                            ) : b.daysRemaining < 0 ? (
                              <span className="text-destructive font-bold">{Math.abs(b.daysRemaining)}d ago</span>
                            ) : (
                              <span className={isSoon ? 'text-amber-500 font-bold' : 'text-emerald-500'}>{b.daysRemaining}d left</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {isExpired ? (
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-destructive/15 text-destructive border border-destructive/20">
                                EXPIRED
                              </span>
                            ) : isSoon ? (
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-500 border border-amber-500/20">
                                EXPIRING SOON
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                                HEALTHY
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isAdmin && b.inventory_items?.id && (
                              <Link 
                                to={`/items/${b.inventory_items.id}`}
                                className="inline-flex items-center justify-center rounded-md border border-border hover:bg-muted text-foreground font-semibold text-xs px-2.5 py-1 transition-colors"
                              >
                                View Item
                              </Link>
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

        {/* TAB 6: ARCHIVED CATALOG ITEMS */}
        <TabsContent value="archived" className="space-y-6">
          <div className="bg-muted/40 p-4 rounded-xl border border-border flex items-start gap-3">
            <Archive className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-foreground">Archived & Deactivated Catalog Items</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Archived items are hidden from daily physical stock counts, but all past movements, snapshots, and financial reports retain their complete audit records.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-xl border border-border">
            <div className="flex flex-wrap gap-3 flex-1 w-full sm:w-auto">
              <Input
                placeholder="Search archived items by name, category, or notes..."
                value={archivedSearch}
                onChange={e => setArchivedSearch(e.target.value)}
                className="max-w-md bg-card border-border text-foreground text-sm"
              />
            </div>
            <Button onClick={exportArchivedCSV} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs sm:text-sm">
              <Download className="w-4 h-4 mr-2" /> Export Archived CSV
            </Button>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            <div className="table-slider-container max-h-[calc(100dvh-320px)] min-h-75 relative overscroll-contain">
              <Table className="border-collapse">
                <TableHeader className="sticky top-0 z-20 bg-muted/60 backdrop-blur-xs border-b border-border shadow-xs">
                  <TableRow>
                    <TableHead className="font-bold text-foreground sticky left-0 z-30 bg-muted border-r border-border min-w-45 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">Item Name</TableHead>
                    <TableHead className="font-bold text-foreground">Category</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Unit</TableHead>
                    <TableHead className="text-right font-bold text-foreground">Unit Cost</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Min Threshold</TableHead>
                    <TableHead className="font-bold text-foreground">Archived Date</TableHead>
                    <TableHead className="text-center font-bold text-foreground">Status</TableHead>
                    <TableHead className="text-right font-bold text-foreground">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isArchivedLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground font-medium">Loading archived catalog...</TableCell>
                    </TableRow>
                  ) : filteredArchived.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground font-medium">No archived or deactivated catalog items found.</TableCell>
                    </TableRow>
                  ) : (
                    filteredArchived.map(item => (
                      <TableRow key={item.id} className="hover:bg-muted/40 group">
                        <TableCell className="font-bold text-foreground sticky left-0 z-10 bg-card group-hover:bg-muted border-r border-border min-w-45 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          <div className="text-foreground">{item.name}</div>
                          {item.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-xs">{item.description}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground">
                            {item.categories?.name || 'General'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-bold text-muted-foreground text-xs">{item.unit || 'pcs'}</TableCell>
                        <TableCell className="text-right font-semibold text-foreground">
                          ₱{Number(item.unit_cost || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground text-xs font-semibold">
                          {item.min_quantity || 0}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs font-mono">
                          {item.updated_at ? format(new Date(item.updated_at), 'MMM dd, yyyy h:mm a') : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-muted text-muted-foreground border border-border">
                            {item.is_archived ? 'Archived' : 'Inactive'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link 
                            to={`/items/${item.id}`}
                            className="inline-flex items-center justify-center rounded-md border border-border hover:bg-muted text-foreground font-semibold text-xs px-2.5 py-1 transition-colors"
                          >
                            Details
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* STAFF: restock requests straight from the Low Stock report */}
      <StaffRequestModal
        open={!!restockRequest}
        onOpenChange={open => !open && setRestockRequest(null)}
        requestType="ADJUST_STOCK"
        context={restockRequest ? {
          itemId: restockRequest.itemId,
          itemName: restockRequest.itemName,
          unit: restockRequest.unit,
          currentQuantity: restockRequest.currentQty,
          minQuantity: restockRequest.minQty,
          targetQuantityPreset: restockRequest.minQty,
        } : undefined}
      />
    </div>
  );
}
