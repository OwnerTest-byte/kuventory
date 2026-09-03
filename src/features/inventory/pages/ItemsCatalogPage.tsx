import { useState } from 'react';
import { useItems } from '../hooks/useItems';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Plus, Search, Edit2, Archive, ArchiveRestore } from 'lucide-react';
import { ItemFormModal } from '../components/ItemFormModal';
import type { InventoryItem } from '../types';

export function ItemsCatalogPage() {
  const { items, isLoading, createItem, updateItem, archiveItem } = useItems();
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (item.description?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesArchived = showArchived ? true : !item.is_archived;
    return matchesSearch && matchesArchived;
  });

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
    }
  };

  const handleOpenCreate = () => {
    setEditingItem(undefined);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const handleToggleArchive = async (item: InventoryItem) => {
    if (confirm(`Are you sure you want to ${item.is_archived ? 'restore' : 'archive'} ${item.name}?`)) {
      await archiveItem({ id: item.id, isArchived: !item.is_archived });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Items Catalog</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage master list of inventory items.</p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Add New Item
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mb-6">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search items by name or description (Excel-like)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input 
              type="checkbox" 
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-slate-300"
            />
            Show Archived
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Item Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Unit Cost</th>
                <th className="px-4 py-3">Suppliers (A/B)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 rounded-tr-lg text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Loading items...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No items found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium">{item.name}</td>
                    <td className="px-4 py-3 text-slate-500">{item.description || '-'}</td>
                    <td className="px-4 py-3">{item.unit}</td>
                    <td className="px-4 py-3">₱{item.unit_cost.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col text-xs text-slate-500">
                        {item.supplier_a && <span>A: {item.supplier_a}</span>}
                        {item.supplier_b && <span>B: {item.supplier_b}</span>}
                        {!item.supplier_a && !item.supplier_b && <span>-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.is_archived ? (
                        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full">
                          Archived
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 px-2 text-slate-500 hover:text-blue-600"
                          onClick={() => handleOpenEdit(item)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className={`h-8 px-2 ${item.is_archived ? 'text-green-500 hover:text-green-600' : 'text-slate-500 hover:text-red-600'}`}
                          onClick={() => handleToggleArchive(item)}
                          title={item.is_archived ? 'Restore' : 'Archive'}
                        >
                          {item.is_archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
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
