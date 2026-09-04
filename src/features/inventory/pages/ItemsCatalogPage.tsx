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
  Tags 
} from 'lucide-react';
import { ItemFormModal } from '../components/ItemFormModal';
import { StockUpdateModal } from '../components/StockUpdateModal';
import { StockBatchesPage } from './StockBatchesPage';
import { StockHistoryPage } from './StockHistoryPage';
import { CategoriesPage } from '@/features/categories/pages/CategoriesPage';
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">INVENTORY &amp; STOCK MANAGEMENT</h1>
          <p className="text-xs text-slate-500 mt-0.5">Master items catalog, FEFO stock batches, movement audit logs, and categories.</p>
        </div>
        {currentTab === 'catalog' && (
          <Button onClick={() => { setEditingItem(undefined); setIsModalOpen(true); }} className="h-10 bg-blue-600 hover:bg-blue-700 text-white shadow-xs font-bold text-xs shrink-0">
            <Plus className="w-4 h-4 mr-2" /> Add New Item
          </Button>
        )}
      </div>

      {/* Unified Top Ribbon */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-200/80 rounded-xl w-fit max-w-full overflow-x-auto shadow-2xs">
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'catalog' })}
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
            currentTab === 'catalog'
              ? "bg-white text-blue-700 shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
          )}
        >
          <Package className="w-3.5 h-3.5" />
          Master Catalog
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'batches' })}
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
            currentTab === 'batches'
              ? "bg-white text-blue-700 shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          Stock Batches (FEFO)
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'history' })}
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
            currentTab === 'history'
              ? "bg-white text-blue-700 shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
          )}
        >
          <History className="w-3.5 h-3.5" />
          Movement History
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'categories' })}
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
            currentTab === 'categories'
              ? "bg-white text-blue-700 shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
          )}
        >
          <Tags className="w-3.5 h-3.5" />
          Categories
        </button>
      </div>

      {/* Sub-view Content based on Ribbon Tab */}
      {currentTab === 'batches' && <StockBatchesPage embedded />}
      {currentTab === 'history' && <StockHistoryPage embedded />}
      {currentTab === 'categories' && <CategoriesPage embedded />}

      {currentTab === 'catalog' && (
        <Card className="shadow-xs border-slate-200 bg-white overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 items-center justify-between bg-white rounded-t-xl">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Search items, description, supplier..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 border-slate-300 text-xs"
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              {/* Sort Selector */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
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
                className="h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
              >
                <option value="All Categories">All Categories</option>
                {uniqueCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              
              {/* Status Filter */}
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
              >
                <option>Active</option>
                <option>Archived</option>
                <option>All</option>
              </select>
            </div>
          </div>

          <div className="max-h-[calc(100dvh-280px)] min-h-[350px] overflow-y-auto overflow-x-auto relative overscroll-contain">
            <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 shadow-xs">
                <tr className="text-slate-600">
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs sticky left-0 z-30 bg-slate-50 border-r border-slate-200 min-w-[200px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">ITEM</th>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs">DESCRIPTION</th>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs">SECTION</th>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs text-right">UNIT COST</th>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs">SUPPLIERS</th>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs text-center">MIN</th>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs text-center">QUANTITY BALANCE</th>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs text-center">STATUS</th>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {isLoadingInventory ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                      Loading items...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                      No items found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    let status = 'IN STOCK';
                    let badgeClass = 'text-green-700 bg-green-100';
                    
                    if (item.current_qty <= 0) {
                      status = 'OUT OF STOCK';
                      badgeClass = 'text-red-700 bg-red-100';
                    } else if (item.current_qty <= item.min_qty) {
                      status = 'LOW STOCK';
                      badgeClass = 'text-amber-700 bg-amber-100';
                    }
                    
                    if (item.is_archived) {
                      status = 'ARCHIVED';
                      badgeClass = 'text-slate-700 bg-slate-200';
                    }

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-5 py-3.5 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 min-w-[200px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          <Link 
                            to={`/items/${item.id}`} 
                            className="text-blue-600 hover:text-blue-800 hover:underline font-bold text-xs sm:text-sm"
                          >
                            {item.item_name}
                          </Link>
                          <span className="block font-mono text-[10px] text-slate-400 font-normal">
                            {item.item_code}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-500 max-w-40 truncate" title={item.description || ''}>
                          {item.description || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-700">
                          <span className="font-semibold">{item.inventory_type}</span>
                          <span className="block text-[10px] text-slate-400">{item.category_name || 'General'}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-xs font-bold text-slate-800">
                          ₱{Number(item.unit_cost || 0).toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 text-[11px] text-slate-600">
                          <div><span className="text-slate-400 font-medium">A:</span> {item.supplier_a || '—'}</div>
                          {item.supplier_b && <div><span className="text-slate-400 font-medium">B:</span> {item.supplier_b}</div>}
                        </td>
                        <td className="px-5 py-3.5 text-center font-mono text-xs text-slate-600">
                          {item.min_qty} {item.unit}
                        </td>
                        <td className="px-5 py-3.5 text-center font-mono font-bold text-slate-900 text-xs">
                          <span className="px-2.5 py-1 rounded-md bg-slate-100 font-black">
                            {item.current_qty} {item.unit}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${badgeClass}`}>
                            {status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex justify-end items-center gap-1.5">
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
                              className={`h-7 w-7 ${item.is_archived ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'}`}
                              onClick={() => handleToggleArchive(item)}
                              title={item.is_archived ? 'Restore SKU' : 'Archive SKU'}
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
    </div>
  );
}
