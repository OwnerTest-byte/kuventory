import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getInventory } from '../api';
import { useItems } from '../hooks/useItems';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Plus, Search, Edit2, MoreVertical, Archive } from 'lucide-react';
import { ItemFormModal } from '../components/ItemFormModal';
import { stockStatusVariant } from '@/lib/utils';
import type { InventoryItem } from '../types';

export function ItemsCatalogPage() {
  const { data: inventory, isLoading: isLoadingInventory } = useQuery({
    queryKey: ['inventory'],
    queryFn: getInventory,
  });
  
  const { createItem, updateItem, archiveItem } = useItems();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [statusFilter, setStatusFilter] = useState('Active');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredItems = useMemo(() => {
    let list = inventory || [];
    
    // Search
    if (searchTerm) {
      list = list.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    
    // Status Filter (Active / Archived)
    if (statusFilter === 'Active') {
      list = list.filter(i => !i.is_archived);
    } else if (statusFilter === 'Archived') {
      list = list.filter(i => i.is_archived);
    }
    
    return list;
  }, [inventory, searchTerm, statusFilter]);

  const handleCreateOrUpdate = async (data: Omit<InventoryItem, 'id' | 'is_active' | 'is_archived'>) => {
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

  const handleOpenCreate = () => {
    setEditingItem(undefined);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: any) => {
    setEditingItem(item as InventoryItem);
    setIsModalOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">INVENTORY ITEMS</h1>
      </div>

      <Card className="shadow-sm border-slate-200">
        {/* Toolbar */}
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
              <option>All Categories</option>
              <option>Beverages</option>
              <option>Dairy</option>
              <option>Groceries</option>
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
            
            <Button onClick={handleOpenCreate} className="h-10 bg-blue-600 hover:bg-blue-700 text-white shrink-0 shadow-sm">
              <Plus className="w-4 h-4 mr-2" /> Add New Item
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200">
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">ITEM</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">CATEGORY</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs">UNIT</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs text-center">MIN. QTY</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs text-center">CURRENT QTY</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs text-center">STATUS</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase tracking-wider text-xs text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {isLoadingInventory ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    Loading items...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    No items found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  let status = 'IN STOCK';
                  let badgeClass = 'text-green-700 bg-green-100';
                  
                  if (item.total_quantity <= 0) {
                    status = 'OUT OF STOCK';
                    badgeClass = 'text-red-700 bg-red-100';
                  } else if (item.total_quantity <= item.min_quantity) {
                    status = 'LOW STOCK';
                    badgeClass = 'text-amber-700 bg-amber-100';
                  }
                  
                  if (item.is_archived) {
                    status = 'ARCHIVED';
                    badgeClass = 'text-slate-700 bg-slate-200';
                  }

                  // Mock category based on mockup for display purposes if missing in DB
                  const mockCat = item.name.toLowerCase().includes('milk') ? 'Dairy' : 'Beverages';

                  return (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-800">{item.name}</td>
                      <td className="px-6 py-4 text-slate-600">{mockCat}</td>
                      <td className="px-6 py-4 text-slate-600">{item.unit}</td>
                      <td className="px-6 py-4 text-center font-medium text-slate-700">{item.min_quantity}</td>
                      <td className="px-6 py-4 text-center font-semibold text-slate-900">{item.total_quantity}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={\inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider \\}>
                          {status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 hover:text-blue-600"
                            onClick={() => handleOpenEdit(item)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 hover:text-slate-600"
                          >
                            <MoreVertical className="w-4 h-4" />
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
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleCreateOrUpdate}
        />
      )}
    </div>
  );
}
