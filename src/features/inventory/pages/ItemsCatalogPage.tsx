import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getInventory, getBatches } from '../api';
import { useItems } from '../hooks/useItems';
import { useStockMutations } from '../hooks/useStockMutations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { 
  Plus, 
  Search, 
  Edit2, 
  Archive, 
  ArrowUpDown, 
  Trash2, 
  Package, 
  Layers, 
  History, 
  Tags,
  Building2,
  RotateCcw,
  Info,
  Eye,
} from 'lucide-react';
import { ItemFormModal } from '../components/ItemFormModal';
import { StockUpdateModal } from '../components/StockUpdateModal';
import { ItemQuickViewDrawer } from '../components/ItemQuickViewDrawer';
import { StockBatchesPage } from './StockBatchesPage';
import { StockHistoryPage } from './StockHistoryPage';
import { CategoriesPage } from '@/features/categories/pages/CategoriesPage';
import { SuppliersDirectoryTab } from '../components/SuppliersDirectoryTab';
import { cn } from '@/lib/utils';
import type { InventoryItem, InventoryStock } from '../types';

export function ItemsCatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'catalog';

  const { data: inventory, isLoading: isLoadingInventory } = useQuery({
    queryKey: ['inventory'],
    queryFn: getInventory,
  });
  
  const { createItem, updateItem, archiveItem, deleteItem } = useItems();
  const { add, remove, adjust } = useStockMutations();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'cost_desc' | 'cost_asc' | 'qty_desc' | 'qty_asc' | 'category'>('name_asc');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [stockUpdateItem, setStockUpdateItem] = useState<InventoryStock | null>(null);
  const [quickViewItem, setQuickViewItem] = useState<InventoryItem | null>(null);

  const { data: currentBatches = [] } = useQuery({
    queryKey: ['batches', stockUpdateItem?.id],
    queryFn: () => getBatches(stockUpdateItem!.id),
    enabled: !!stockUpdateItem,
  });

  const filteredItems = useMemo(() => {
    let list = inventory || [];
    
    // Search across name, code, description, and suppliers
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(i => 
        i.item_name.toLowerCase().includes(q) || 
        i.item_code.toLowerCase().includes(q) ||
        (i.description && i.description.toLowerCase().includes(q)) ||
        (i.supplier_a && i.supplier_a.toLowerCase().includes(q)) ||
        (i.supplier_b && i.supplier_b.toLowerCase().includes(q))
      );
    }
    
    // Status Filter
    if (statusFilter === 'Active') {
      list = list.filter(i => !i.is_archived);
    } else if (statusFilter === 'Archived') {
      list = list.filter(i => i.is_archived);
    }
    
    // Category Filter
    if (categoryFilter !== 'All Categories') {
      list = list.filter(i => i.category_name === categoryFilter);
    }

    // Sort
    return [...list].sort((a, b) => {
      if (sortBy === 'name_asc') return a.item_name.localeCompare(b.item_name);
      if (sortBy === 'name_desc') return b.item_name.localeCompare(a.item_name);
      if (sortBy === 'cost_desc') return (b.unit_cost || 0) - (a.unit_cost || 0);
      if (sortBy === 'cost_asc') return (a.unit_cost || 0) - (b.unit_cost || 0);
      if (sortBy === 'qty_desc') return (b.current_qty || 0) - (a.current_qty || 0);
      if (sortBy === 'qty_asc') return (a.current_qty || 0) - (b.current_qty || 0);
      if (sortBy === 'category') return (a.category_name || '').localeCompare(b.category_name || '');
      return 0;
    });
  }, [inventory, searchTerm, statusFilter, categoryFilter, sortBy]);

  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    inventory?.forEach(i => {
      if (i.category_name) cats.add(i.category_name);
    });
    return Array.from(cats).sort();
  }, [inventory]);

  const { activeCount, archivedCount } = useMemo(() => {
    let active = 0;
    let archived = 0;
    inventory?.forEach(i => {
      if (i.is_archived) archived++;
      else active++;
    });
    return { activeCount: active, archivedCount: archived };
  }, [inventory]);

  const handleCreateOrUpdate = async (
    data: Omit<InventoryItem, 'id' | 'is_archived' | 'created_at' | 'updated_at' | 'current_qty'>,
    initialQty?: number
  ) => {
    setIsSubmitting(true);
    try {
      if (editingItem) {
        await updateItem({ id: editingItem.id, ...data });
      } else {
        const newItem = await createItem(data);
        if (initialQty && initialQty > 0) {
          await add.mutateAsync({
            itemId: newItem.id,
            quantity: initialQty,
            reason: 'Initial Opening Stock Balance'
          });
        }
      }
    } finally {
      setIsSubmitting(false);
      setIsModalOpen(false);
    }
  };

  const handleStockUpdateSubmit = async (data: any) => {
    if (!stockUpdateItem) return;
    try {
      if (data.action === 'add') {
        await add.mutateAsync({
          itemId: stockUpdateItem.id,
          quantity: data.quantity,
          expiryDate: data.expiryDate,
          reason: data.reason
        });
      } else if (data.action === 'remove') {
        await remove.mutateAsync({
          itemId: stockUpdateItem.id,
          quantity: data.quantity,
          reason: data.reason
        });
      } else if (data.action === 'adjust') {
        await adjust.mutateAsync({
          itemId: stockUpdateItem.id,
          targetQuantity: data.quantity,
          reason: data.reason
        });
      }
      setStockUpdateItem(null);
    } catch (err: any) {
      alert(err.message || 'Failed to update stock');
    }
  };

  const handleToggleArchive = async (item: InventoryItem) => {
    const action = item.is_archived ? 'restore' : 'archive';
    if (!window.confirm(`Are you sure you want to ${action} "${item.item_name}"?`)) return;
    try {
      await archiveItem({ id: item.id, isArchived: !item.is_archived });
    } catch (err: any) {
      alert(err.message || `Failed to ${action} item`);
    }
  };

  const handleDelete = async (item: InventoryItem) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${item.item_name}"? All associated batch and movement records will be deleted.`)) return;
    try {
      await deleteItem(item.id);
    } catch (err: any) {
      alert(err.message || 'Failed to delete item');
    }
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-foreground uppercase">INVENTORY &amp; STOCK MANAGEMENT</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Master items catalog, FEFO stock batches, movement audit logs, and categories.</p>
        </div>
        {currentTab === 'catalog' && (
          <Button 
            onClick={() => { setEditingItem(undefined); setIsModalOpen(true); }} 
            className="h-9 sm:h-10 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs font-bold text-xs shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add New Item
          </Button>
        )}
      </div>

      {/* Unified Top Ribbon - Smooth horizontal scroll on mobile */}
      <div className="flex items-center gap-1.5 p-1 bg-muted rounded-xl w-full sm:w-fit overflow-x-auto border border-border shadow-2xs scrollbar-none">
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'catalog' })}
          className={cn(
            "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0",
            currentTab === 'catalog'
              ? "bg-card text-primary shadow-xs border border-border/50"
              : "text-muted-foreground hover:text-foreground hover:bg-card/50"
          )}
        >
          <Package className="w-3.5 h-3.5" />
          Items
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'batches' })}
          className={cn(
            "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0",
            currentTab === 'batches'
              ? "bg-card text-primary shadow-xs border border-border/50"
              : "text-muted-foreground hover:text-foreground hover:bg-card/50"
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          Batches
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'history' })}
          className={cn(
            "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0",
            currentTab === 'history'
              ? "bg-card text-primary shadow-xs border border-border/50"
              : "text-muted-foreground hover:text-foreground hover:bg-card/50"
          )}
        >
          <History className="w-3.5 h-3.5" />
          Movements
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'suppliers' })}
          className={cn(
            "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0",
            currentTab === 'suppliers'
              ? "bg-card text-primary shadow-xs border border-border/50"
              : "text-muted-foreground hover:text-foreground hover:bg-card/50"
          )}
        >
          <Building2 className="w-3.5 h-3.5" />
          Suppliers
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'categories' })}
          className={cn(
            "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0",
            currentTab === 'categories'
              ? "bg-card text-primary shadow-xs border border-border/50"
              : "text-muted-foreground hover:text-foreground hover:bg-card/50"
          )}
        >
          <Tags className="w-3.5 h-3.5" />
          Categories
        </button>
      </div>

      {/* Sub-view Content based on Ribbon Tab */}
      {currentTab === 'batches' && <StockBatchesPage embedded />}
      {currentTab === 'history' && <StockHistoryPage embedded />}
      {currentTab === 'suppliers' && <SuppliersDirectoryTab />}
      {currentTab === 'categories' && <CategoriesPage embedded />}

      {currentTab === 'catalog' && (
        <Card className="shadow-xs border-border bg-card text-card-foreground overflow-hidden">
          {/* Filters Bar: Adaptive Grid on Mobile, Flex Row on Desktop */}
          <div className="p-3 sm:p-4 border-b border-border flex flex-col gap-3 bg-card rounded-t-xl">
            {/* Search Input */}
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search items, code, description, supplier..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 border-border bg-card text-foreground text-xs"
              />
            </div>
            
            {/* Filter & Sort Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-3">
                {/* Sort Selector */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 hidden sm:inline" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full sm:w-auto h-9 sm:h-10 px-2 sm:px-3 py-1.5 bg-card border border-border rounded-lg text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  >
                    <option value="name_asc">Name (A-Z)</option>
                    <option value="name_desc">Name (Z-A)</option>
                    <option value="cost_desc">Unit Cost (High-Low)</option>
                    <option value="cost_asc">Unit Cost (Low-High)</option>
                    <option value="qty_desc">Stock Balance (High-Low)</option>
                    <option value="qty_asc">Stock Balance (Low-High)</option>
                    <option value="category">Category</option>
                  </select>
                </div>

                {/* Category Filter */}
                <select 
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full sm:w-auto h-9 sm:h-10 px-2 sm:px-3 py-1.5 bg-card border border-border rounded-lg text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                >
                  <option value="All Categories">All Categories</option>
                  {uniqueCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              
              {/* Segmented Status Filter Buttons */}
              <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-border overflow-x-auto shrink-0 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setStatusFilter('Active')}
                  className={cn(
                    "px-2.5 sm:px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap",
                    statusFilter === 'Active'
                      ? "bg-card text-primary shadow-xs border border-border/50"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Active ({activeCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('Archived')}
                  className={cn(
                    "px-2.5 sm:px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap",
                    statusFilter === 'Archived'
                      ? "bg-amber-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Archived ({archivedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('All')}
                  className={cn(
                    "px-2.5 sm:px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap",
                    statusFilter === 'All'
                      ? "bg-card text-primary shadow-xs border border-border/50"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  All ({activeCount + archivedCount})
                </button>
              </div>
            </div>
          </div>

          {/* Banner when viewing archived items */}
          {statusFilter === 'Archived' && (
            <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between gap-3 text-xs text-amber-600 dark:text-amber-400">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-500 shrink-0" />
                <span>
                  <strong>Archived Items:</strong> These items are hidden from daily counts and active stock balances. Click <strong>Restore</strong> to return an item to the active catalog, or <strong>Delete</strong> to permanently purge it.
                </span>
              </div>
            </div>
          )}

          {/* VIEW 1: Mobile & Small Screen Native Cards List (< 768px) */}
          <div className="md:hidden divide-y divide-border/60">
            {isLoadingInventory ? (
              <div className="p-8 text-center text-muted-foreground text-xs">
                Loading items...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-xs">
                No items found matching your criteria.
              </div>
            ) : (
              filteredItems.map((item) => {
                let status = 'IN STOCK';
                let badgeClass = 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                
                if (item.current_qty <= 0) {
                  status = 'OUT OF STOCK';
                  badgeClass = 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20';
                } else if (item.current_qty <= item.min_qty) {
                  status = 'LOW STOCK';
                  badgeClass = 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20';
                }
                
                if (item.is_archived) {
                  status = 'ARCHIVED';
                  badgeClass = 'text-muted-foreground bg-muted border-border';
                }

                return (
                  <div key={item.id} className="p-3.5 space-y-2.5 bg-card hover:bg-muted/30 transition-colors">
                    {/* Card Header: Thumbnail + Title + Code + Status */}
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-lg bg-muted/60 border border-border overflow-hidden shrink-0 flex items-center justify-center">
                        {item.image_path ? (
                          <img 
                            src={item.image_path} 
                            alt={item.item_name} 
                            className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <Package className="w-6 h-6 text-muted-foreground/50" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <Link 
                            to={`/items/${item.id}`} 
                            className="text-primary hover:underline font-bold text-sm leading-snug line-clamp-2"
                          >
                            {item.item_name}
                          </Link>
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border shrink-0", badgeClass)}>
                            {status}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="font-mono text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted border border-border">
                            {item.item_code}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {item.category_name || 'General'} • {item.inventory_type}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card Metrics Row: Balance + Unit Cost + Min */}
                    <div className="grid grid-cols-3 gap-2 p-2 rounded-lg bg-muted/30 border border-border/60 text-center">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Balance</div>
                        <div className="text-xs font-mono font-black text-foreground mt-0.5">
                          {item.current_qty} <span className="text-[10px] font-normal text-muted-foreground">{item.unit}</span>
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Unit Cost</div>
                        <div className="text-xs font-mono font-bold text-foreground mt-0.5">
                          ₱{Number(item.unit_cost || 0).toFixed(2)}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Min Qty</div>
                        <div className="text-xs font-mono text-muted-foreground mt-0.5">
                          {item.min_qty} {item.unit}
                        </div>
                      </div>
                    </div>

                    {/* Suppliers (if any) */}
                    {(item.supplier_a || item.supplier_b) && (
                      <div className="text-[10px] text-muted-foreground flex items-center gap-2 truncate">
                        <span className="font-semibold text-foreground/80">Suppliers:</span>
                        <span className="truncate">{[item.supplier_a, item.supplier_b].filter(Boolean).join(', ')}</span>
                      </div>
                    )}

                    {/* Card Actions Footer */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 px-2 text-muted-foreground hover:text-foreground text-xs gap-1"
                          onClick={() => setQuickViewItem(item as InventoryItem)}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </Button>

                        {!item.is_archived && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 px-2.5 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 font-semibold text-xs"
                            onClick={() => setStockUpdateItem(item as InventoryStock)}
                          >
                            Update Stock
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {item.is_archived ? (
                          <>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 px-2 border-emerald-300 text-emerald-600 hover:bg-emerald-50 text-xs gap-1"
                              onClick={() => handleToggleArchive(item)}
                              title="Restore SKU"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Restore</span>
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600"
                              onClick={() => handleDelete(item)}
                              title="Delete permanently"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => { setEditingItem(item as InventoryItem); setIsModalOpen(true); }}
                              title="Edit Details"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-amber-600"
                              onClick={() => handleToggleArchive(item)}
                              title="Archive SKU"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-600"
                              onClick={() => handleDelete(item)}
                              title="Delete permanently"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* VIEW 2: Desktop High-Density Data Table (>= 768px) */}
          <div className="hidden md:block table-slider-container max-h-[calc(100dvh-280px)] min-h-[350px] relative overscroll-contain">
            <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
              <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur-xs border-b border-border shadow-2xs">
                <tr className="text-muted-foreground">
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs sticky left-0 z-30 bg-muted border-r border-border min-w-[220px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">ITEM</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs">DESCRIPTION</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs">SECTION</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs text-right">UNIT COST</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs">SUPPLIERS</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs text-center">MIN</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs text-center">QUANTITY BALANCE</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs text-center">STATUS</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-xs text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border/60">
                {isLoadingInventory ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                      Loading items...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                      No items found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    let status = 'IN STOCK';
                    let badgeClass = 'text-emerald-500 bg-emerald-500/15 border border-emerald-500/25';
                    
                    if (item.current_qty <= 0) {
                      status = 'OUT OF STOCK';
                      badgeClass = 'text-rose-500 bg-rose-500/15 border border-rose-500/25';
                    } else if (item.current_qty <= item.min_qty) {
                      status = 'LOW STOCK';
                      badgeClass = 'text-amber-500 bg-amber-500/15 border border-amber-500/25';
                    }
                    
                    if (item.is_archived) {
                      status = 'ARCHIVED';
                      badgeClass = 'text-muted-foreground bg-muted border border-border';
                    }

                    return (
                      <tr key={item.id} className="hover:bg-muted/40 transition-colors group">
                        <td className="px-4 py-3 sticky left-0 z-10 bg-card group-hover:bg-muted/60 border-r border-border min-w-[220px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-muted/60 border border-border overflow-hidden shrink-0 flex items-center justify-center">
                              {item.image_path ? (
                                <img 
                                  src={item.image_path} 
                                  alt={item.item_name} 
                                  className="w-full h-full object-cover"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              ) : (
                                <Package className="w-5 h-5 text-muted-foreground/50" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <Link 
                                to={`/items/${item.id}`} 
                                className="text-primary hover:underline font-bold text-xs sm:text-sm block truncate"
                              >
                                {item.item_name}
                              </Link>
                              <span className="block font-mono text-[10px] text-muted-foreground font-normal">
                                {item.item_code}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-40 truncate" title={item.description || ''}>
                          {item.description || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground">
                          <span className="font-semibold">{item.inventory_type}</span>
                          <span className="block text-[10px] text-muted-foreground">{item.category_name || 'General'}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-bold text-foreground">
                          ₱{Number(item.unit_cost || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-muted-foreground">
                          <div><span className="text-muted-foreground/70 font-medium">A:</span> {item.supplier_a || '—'}</div>
                          {item.supplier_b && <div><span className="text-muted-foreground/70 font-medium">B:</span> {item.supplier_b}</div>}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-xs text-muted-foreground">
                          {item.min_qty} {item.unit}
                        </td>
                        <td className="px-4 py-3 text-center font-mono font-bold text-foreground text-xs">
                          <span className="px-2.5 py-1 rounded-lg bg-muted border border-border font-black">
                            {item.current_qty} {item.unit}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${badgeClass}`}>
                            {status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end items-center gap-1.5">
                            {item.is_archived ? (
                              <>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-7 border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-bold text-xs gap-1.5"
                                  onClick={() => handleToggleArchive(item)}
                                  title="Restore SKU back to active catalog"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                                  Restore
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-7 border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-xs gap-1.5"
                                  onClick={() => handleDelete(item)}
                                  title="Permanently purge SKU from database"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                  Delete
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
                                  onClick={() => setQuickViewItem(item as InventoryItem)}
                                  title="Quick View Item"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-7 border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800 font-semibold uppercase text-[10px] tracking-wider"
                                  onClick={() => setStockUpdateItem(item as InventoryStock)}
                                >
                                  Update Stock
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7 text-slate-400 hover:text-blue-600"
                                  onClick={() => { setEditingItem(item as InventoryItem); setIsModalOpen(true); }}
                                  title="Edit Details"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7 text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                                  onClick={() => handleToggleArchive(item)}
                                  title="Archive SKU"
                                >
                                  <Archive className="w-3.5 h-3.5" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                  onClick={() => handleDelete(item)}
                                  title="Delete SKU permanently"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {isModalOpen && (
        <ItemFormModal
          item={editingItem}
          isSubmitting={isSubmitting}
          onClose={() => { setIsModalOpen(false); setEditingItem(undefined); }}
          onSubmit={handleCreateOrUpdate}
        />
      )}

      {stockUpdateItem && (
        <StockUpdateModal
          isOpen={true}
          item={stockUpdateItem}
          batches={currentBatches}
          onClose={() => setStockUpdateItem(null)}
          onSubmit={handleStockUpdateSubmit}
        />
      )}

      <ItemQuickViewDrawer
        item={quickViewItem}
        isOpen={!!quickViewItem}
        onClose={() => setQuickViewItem(null)}
        onUpdateStock={(stockItem) => setStockUpdateItem(stockItem)}
        onEdit={(editItem) => { setEditingItem(editItem); setIsModalOpen(true); }}
      />
    </div>
  );
}
