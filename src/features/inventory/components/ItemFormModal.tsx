import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { X, Image as ImageIcon, Layers, Calendar, CheckCircle2 } from 'lucide-react';
import type { InventoryItem, Category } from '../types';
import { useSuppliers } from '../api/suppliers';
import { addStock } from '../api';
import { ImageUploadInput } from './ImageUploadInput';

interface Props {
  item?: InventoryItem; // If undefined, it's a create action
  defaultCategoryId?: string;
  onClose: () => void;
  onSubmit: (
    data: Omit<InventoryItem, 'id' | 'is_archived' | 'created_at' | 'updated_at' | 'current_qty'>, 
    initialQty?: number,
    initialExpiryDate?: string
  ) => Promise<void>;
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
    initial_expiry_date: '',
    image_path: item?.image_path || ''
  });
  const [error, setError] = useState<string | null>(null);
  const [batchAddedSuccess, setBatchAddedSuccess] = useState<string | null>(null);

  const { data: categories } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (error) throw error;
      return (data || []) as Category[];
    }
  });

  const { data: registeredSuppliers } = useSuppliers();

  // Query existing items for intelligent FEFO duplicate detection
  const { data: existingActiveItems = [] } = useQuery({
    queryKey: ['existing-active-items-catalog'],
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory_items')
        .select('id, name, unit, category_id, categories(name)')
        .eq('is_archived', false);
      return data || [];
    },
    enabled: !item
  });

  const matchedExistingItem = !item && formData.item_name.trim().length > 1
    ? existingActiveItems.find(
        (i: any) => i.name.trim().toLowerCase() === formData.item_name.trim().toLowerCase()
      )
    : null;

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
      }, !item ? parseFloat(formData.initial_qty) || 0 : undefined, formData.initial_expiry_date || undefined);
    } catch (err: any) {
      setError(err.message || 'Failed to save item');
    }
  };

  const handleAddBatchToExisting = async () => {
    if (!matchedExistingItem) return;
    const qty = parseFloat(formData.initial_qty);
    if (!qty || qty <= 0) {
      setError("QUANTITY REQUIRED");
      return;
    }

    try {
      await addStock({
        itemId: (matchedExistingItem as any).id,
        quantity: qty,
        expiryDate: formData.initial_expiry_date || null,
        reason: 'Restock Batch Delivery (FEFO Expiry Queue)'
      });
      setBatchAddedSuccess(`ADDED: ${qty} ${(matchedExistingItem as any).unit || 'units'}`);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'SAVE FAILED');
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

          {batchAddedSuccess && (
            <div className="mb-6 p-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-500/20 shadow-sm text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{batchAddedSuccess}</span>
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

              {/* Intelligent FEFO Duplicate Resolution Banner */}
              {matchedExistingItem && (
                <div className="md:col-span-2 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2.5">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-sm">
                    <Layers className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>Item "{(matchedExistingItem as any).name}" already exists in your inventory</span>
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    KUVENTORY is powered by an automated <strong>First-Expired, First-Out (FEFO)</strong> engine. You do not need to create duplicate item entries for different expiration dates. You can add this shipment as a new batch lot to <strong>{(matchedExistingItem as any).name}</strong> with its unique expiration date, and the batch with the <strong>closest expiry date will automatically be consumed first</strong>.
                  </p>
                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddBatchToExisting}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-8 shadow-xs cursor-pointer"
                    >
                      Add as New Batch to Existing "{(matchedExistingItem as any).name}"
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      or proceed below to register a completely separate SKU item.
                    </span>
                  </div>
                </div>
              )}
              
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
                <>
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

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-primary" />
                        Initial Batch Expiry Date
                      </span>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">FEFO Queued</span>
                    </label>
                    <Input 
                      type="date"
                      value={formData.initial_expiry_date}
                      onChange={e => setFormData({ ...formData, initial_expiry_date: e.target.value })}
                    />
                  </div>
                </>
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
