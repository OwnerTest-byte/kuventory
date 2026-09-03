import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { X } from 'lucide-react';
import type { InventoryItem } from '../types';
import type { Database } from '@/types/supabase';

type Category = Database['public']['Tables']['categories']['Row'];

interface Props {
  item?: InventoryItem; // If undefined, it's a create action
  onClose: () => void;
  onSubmit: (data: Omit<InventoryItem, 'id' | 'is_active' | 'is_archived'>) => Promise<void>;
  isSubmitting: boolean;
}

export function ItemFormModal({ item, onClose, onSubmit, isSubmitting }: Props) {
  const [formData, setFormData] = useState({
    name: item?.name || '',
    category_id: item?.category_id || '',
    description: item?.description || '',
    supplier_a: item?.supplier_a || '',
    supplier_b: item?.supplier_b || '',
    unit: item?.unit || 'pcs',
    unit_cost: item?.unit_cost?.toString() || '0',
    min_quantity: item?.min_quantity?.toString() || '0',
  });
  const [error, setError] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (error) throw error;
      return data as Category[];
    }
  });

  // Default to first category if not set
  useEffect(() => {
    if (categories && categories.length > 0 && !formData.category_id) {
      setFormData(prev => ({ ...prev, category_id: categories[0].id }));
    }
  }, [categories, formData.category_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const unitCost = parseFloat(formData.unit_cost);
    const minQty = parseInt(formData.min_quantity, 10);

    if (!formData.name.trim()) return setError('Name is required');
    if (!formData.category_id) return setError('Category is required');
    if (!formData.unit.trim()) return setError('Unit is required');
    if (isNaN(unitCost) || unitCost < 0) return setError('Invalid unit cost');
    if (isNaN(minQty) || minQty < 0) return setError('Invalid min quantity');

    try {
      await onSubmit({
        name: formData.name.trim(),
        category_id: formData.category_id,
        description: formData.description.trim() || null,
        supplier_a: formData.supplier_a.trim() || null,
        supplier_b: formData.supplier_b.trim() || null,
        unit: formData.unit.trim(),
        unit_cost: unitCost,
        min_quantity: minQty,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-lg my-8">
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 rounded-t-xl z-10">
          <h2 className="font-semibold text-lg">{item ? 'Edit Item' : 'New Item'}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name <span className="text-red-500">*</span></label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Pale Pilsen"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Category <span className="text-red-500">*</span></label>
              <select
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:focus-visible:ring-slate-300"
                required
              >
                <option value="" disabled>Select Category</option>
                {categories?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Supplier A</label>
              <Input
                value={formData.supplier_a}
                onChange={(e) => setFormData({ ...formData, supplier_a: e.target.value })}
                placeholder="Primary Supplier"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Supplier B</label>
              <Input
                value={formData.supplier_b}
                onChange={(e) => setFormData({ ...formData, supplier_b: e.target.value })}
                placeholder="Secondary Supplier"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Unit <span className="text-red-500">*</span></label>
              <Input
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                placeholder="e.g. pcs, case"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Unit Cost <span className="text-red-500">*</span></label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.unit_cost}
                onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Min Qty <span className="text-red-500">*</span></label>
              <Input
                type="number"
                min="0"
                value={formData.min_quantity}
                onChange={(e) => setFormData({ ...formData, min_quantity: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 sticky bottom-0 bg-white dark:bg-slate-900">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : (item ? 'Save Changes' : 'Create Item')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
