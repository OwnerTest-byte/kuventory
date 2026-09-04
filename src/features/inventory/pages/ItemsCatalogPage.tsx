import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getInventory, getBatches } from '../api';
import { useItems } from '../hooks/useItems';
import { useStockMutations } from '../hooks/useStockMutations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Plus, Search, Edit2 } from 'lucide-react';
import { ItemFormModal } from '../components/ItemFormModal';
import { StockUpdateModal } from '../components/StockUpdateModal';
import type { InventoryItem, InventoryStock } from '../types';

export function ItemsCatalogPage() {
  const { data: inventory, isLoading: isLoadingInventory } = useQuery({
    queryKey: ['inventory'],
    queryFn: getInventory,
  });
  
  const { createItem, updateItem } = useItems();
  const { add, remove, adjust } = useStockMutations();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [statusFilter, setStatusFilter] = useState('Active');
  
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
    
    // Search
    if (searchTerm) {
      list = list.filter(i => i.item_name.toLowerCase().includes(searchTerm.toLowerCase()) || i.item_code.toLowerCase().includes(searchTerm.toLowerCase()));
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

    return list;
  }, [inventory, searchTerm, statusFilter, categoryFilter]);

  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    inventory?.forEach(i => {
      if (i.category_name) cats.add(i.category_name);
    });
    return Array.from(cats).sort();
  }, [inventory]);

  const handleCreateOrUpdate = async (data: Omit<InventoryItem, 'id' | 'is_archived' | 'created_at' | 'updated_at' | 'current_qty'>) => {
    setIsSubmitting(true);
    try {
      if (editingItem) {
        await updateItem({ id: editingItem.id, ...data });
      } else {
        await createItem(data);
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

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">INVENTORY ITEMS</h1>
      </div>

      <Card className="shadow-sm border-slate-200">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 items-center justify-between bg-white rounded-t-xl">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search items..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 border-slate-300"
            />
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select 
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-auto text-slate-700"
            >
              <option value="All Categories">All Categories</option>
              {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-auto text-slate-700"
            >
              <option>Active</option>
              <option>Archived</option>
              <option>All</option>
            </select>
            
            <Button onClick={() => { setEditingItem(undefined); setIsModalOpen(true); }} className="h-10 bg-blue-600 hover:bg-blue-700 text-white shrink-0 shadow-sm">
              <Plus className="w-4 h-4 mr-2" /> Add New Item
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200">
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">ITEM CODE</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">ITEM NAME</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">CATEGORY</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">SECTION</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">UNIT</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs text-center">MIN. QTY</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs text-center">CURRENT QTY</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs text-center">STATUS</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="bg-white">
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
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">{item.item_code}</td>
                      <td className="px-6 py-4 font-semibold text-slate-800">
                        <Link 
                          to={`/items/${item.id}`} 
                          className="text-blue-600 hover:text-blue-800 hover:underline font-bold"
                        >
                          {item.item_name}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{item.category_name || 'Uncategorized'}</td>
                      <td className="px-6 py-4 text-slate-600">{item.inventory_type}</td>
                      <td className="px-6 py-4 text-slate-600">{item.unit}</td>
                      <td className="px-6 py-4 text-center font-medium text-slate-700">{item.min_qty}</td>
                      <td className="px-6 py-4 text-center font-bold text-slate-900">{item.current_qty}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${badgeClass}`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800 font-semibold uppercase text-[10px] tracking-wider"
                            onClick={() => setStockUpdateItem(item as InventoryStock)}
                          >
                            Update Stock
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 hover:text-blue-600"
                            onClick={() => { setEditingItem(item as InventoryItem); setIsModalOpen(true); }}
                          >
                            <Edit2 className="w-4 h-4" />
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
