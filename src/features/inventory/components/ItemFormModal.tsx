import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { X, Image as ImageIcon } from 'lucide-react';
import type { InventoryItem, Category } from '../types';
import { useSuppliers } from '../api/suppliers';
import { ImageUploadInput } from './ImageUploadInput';

interface Props {
  item?: InventoryItem; // If undefined, it's a create action
  defaultCategoryId?: string;
  onClose: () => void;
  onSubmit: (data: Omit<InventoryItem, 'id' | 'is_archived' | 'created_at' | 'updated_at' | 'current_qty'>, initialQty?: number) => Promise<void>;
  isSubmitting: boolean;
}

export function ItemFormModal({ item, defaultCategoryId, onClose, onSubmit, isSubmitting }: Props) {
  const [formData, setFormData] = useState({
    item_code: item?.item_code || '',
    item_name: item?.item_name || '',
    category_id: item?.category_id || defaultCategoryId || '',
    description: item?.description || '',
    inventory_type: item?.inventory_type || 'PORTION STOCK',
    supplier_a: item?.supplier_a || '',
    supplier_b: item?.supplier_b || '',
    unit: item?.unit || 'pcs',
    unit_cost: item?.unit_cost?.toString() || '0',
    min_qty: item?.min_qty?.toString() || '0',
    initial_qty: '0',
    image_path: item?.image_path || ''
  });
  const [error, setError] = useState<string | null>(null);

  const { data: categories } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (error) throw error;
      return (data || []) as Category[];
    }
  });

  const { data: registeredSuppliers } = useSuppliers();

  // Derive effective category ID directly to avoid unnecessary state renders
  const effectiveCategoryId = formData.category_id || defaultCategoryId || categories?.[0]?.id || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const categoryIdToUse = formData.category_id || effectiveCategoryId;
    if (!formData.item_name || !categoryIdToUse || !formData.item_code) {
      setError("Item code, Name and category are required");
      return;
    }

    const selectedCategoryName = categories?.find(c => c.id === categoryIdToUse)?.name || 'General';

    try {
      await onSubmit({
        item_code: formData.item_code,
        item_name: formData.item_name,
        category_id: categoryIdToUse,
        description: formData.description,
        inventory_type: selectedCategoryName as any,
        supplier_a: formData.supplier_a,
        supplier_b: formData.supplier_b,
        unit: formData.unit,
        unit_cost: parseFloat(formData.unit_cost) || 0,
        min_qty: parseInt(formData.min_qty, 10) || 0,
        image_path: formData.image_path || null,
        category_name: selectedCategoryName
      }, !item ? parseFloat(formData.initial_qty) || 0 : undefined);
    } catch (err: any) {
      setError(err.message || 'Failed to save item');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh] border border-border">
        <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-muted/40 rounded-t-xl">
          <h2 className="text-xl font-bold text-foreground">{item ? 'Edit Item' : 'Add New Item'}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog" className="text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 overflow-y-auto">
          {error && (
            <div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 shadow-sm text-sm font-medium">
              {error}
            </div>
          )}

          <form id="item-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Item Code *</label>
                <Input 
                  value={formData.item_code}
                  onChange={e => setFormData({ ...formData, item_code: e.target.value })}
                  placeholder="e.g. ITM-001"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Item Name *</label>
                <Input 
                  value={formData.item_name}
                  onChange={e => setFormData({ ...formData, item_name: e.target.value })}
                  placeholder="e.g. Chicken Breast"
                  required
                />
              </div>
              
              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-foreground">Category / Station *</label>
                  <span className="text-[11px] text-muted-foreground">Assigns item to station table in Daily Inventory</span>
                </div>
                <select
                  value={formData.category_id || effectiveCategoryId}
                  onChange={e => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full h-10 px-3 py-2 bg-background border border-input rounded-md text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  required
                >
                  <option value="" disabled>Select a category / station</option>
                  {categories?.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-foreground">Description</label>
                <Input 
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional details..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Unit of Measurement</label>
                <Input 
                  value={formData.unit}
                  onChange={e => setFormData({ ...formData, unit: e.target.value })}
                  placeholder="e.g. kg, pcs, box"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Minimum Quantity</label>
                <Input 
                  type="number"
                  min="0"
                  value={formData.min_qty}
                  onChange={e => setFormData({ ...formData, min_qty: e.target.value })}
                  placeholder="Alert threshold"
                />
              </div>

              {!item && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">Initial Stock Quantity</label>
                  <Input 
                    type="number"
                    min="0"
                    value={formData.initial_qty}
                    onChange={e => setFormData({ ...formData, initial_qty: e.target.value })}
                    placeholder="Initial units on hand"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Unit Cost (₱)</label>
                <Input 
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.unit_cost}
                  onChange={e => setFormData({ ...formData, unit_cost: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Primary Supplier</label>
                <Input 
                  list="registered-suppliers"
                  value={formData.supplier_a}
                  onChange={e => setFormData({ ...formData, supplier_a: e.target.value })}
                  placeholder="e.g. Monterey Meats"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Secondary Supplier</label>
                <Input 
                  list="registered-suppliers"
                  value={formData.supplier_b}
                  onChange={e => setFormData({ ...formData, supplier_b: e.target.value })}
                  placeholder="Optional alternate vendor"
                />
              </div>

              <datalist id="registered-suppliers">
                {registeredSuppliers?.map(sup => (
                  <option key={sup.id} value={sup.name}>
                    {sup.contact_person ? `(${sup.contact_person})` : ''} {sup.phone ? `• ${sup.phone}` : ''}
                  </option>
                ))}
              </datalist>

              <div className="space-y-2 md:col-span-2 pt-1">
                <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-primary" />
                  Item Image (Optional)
                </label>
                <ImageUploadInput 
                  value={formData.image_path}
                  onChange={(val) => setFormData({ ...formData, image_path: val || '' })}
                  hideHeaderLabel
                />
              </div>
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-border bg-muted/40 rounded-b-xl flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            form="item-form" 
            disabled={isSubmitting}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          >
            {isSubmitting ? 'Saving...' : 'Save Item'}
          </Button>
        </div>
      </div>
    </div>
  );
}
