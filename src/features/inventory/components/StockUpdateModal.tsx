import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { InventoryStock, StockBatch } from '../types';

const updateSchema = z.object({
  action: z.enum(['add', 'remove', 'adjust']),
  quantity: z.number().min(1, 'Quantity is required'),
  batchId: z.string().optional(),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional(),
});

type UpdateFormData = z.infer<typeof updateSchema>;

interface StockUpdateModalProps {
  item?: InventoryStock;
  batches?: StockBatch[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: UpdateFormData) => Promise<void>;
}

export function StockUpdateModal({ item, batches = [], isOpen, onClose, onSubmit }: StockUpdateModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionType, setActionType] = useState<'add' | 'remove' | 'adjust'>('add');

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<UpdateFormData>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      action: 'add',
      batchId: 'auto',
      reason: 'New delivery received'
    },
  });

  const quantity = watch('quantity') || 0;

  const handleFormSubmit = async (data: UpdateFormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      reset();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentStock = item?.total_quantity || 0;
  
  let newStockBalance = currentStock;
  if (actionType === 'add') newStockBalance = currentStock + Number(quantity);
  if (actionType === 'remove') newStockBalance = currentStock - Number(quantity);
  if (actionType === 'adjust') newStockBalance = Number(quantity);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        reset();
        onClose();
      }
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader className="border-b pb-4 mb-4">
          <DialogTitle className="text-xl font-bold uppercase tracking-tight">UPDATE STOCK</DialogTitle>
        </DialogHeader>

        {item && (
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Item</p>
              <p className="font-bold text-slate-900">{item.name}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Current Stock</p>
              <p className="font-bold text-slate-900">{currentStock} {item.unit}(s)</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
          <div className="space-y-3">
            <Label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Action</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  {...register('action')} 
                  value="add"
                  checked={actionType === 'add'}
                  onChange={() => setActionType('add')}
                  className="text-blue-600 focus:ring-blue-600 h-4 w-4" 
                />
                <span className="text-sm font-semibold">ADD</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  {...register('action')} 
                  value="remove"
                  checked={actionType === 'remove'}
                  onChange={() => setActionType('remove')}
                  className="text-blue-600 focus:ring-blue-600 h-4 w-4" 
                />
                <span className="text-sm font-semibold">REMOVE</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  {...register('action')} 
                  value="adjust"
                  checked={actionType === 'adjust'}
                  onChange={() => setActionType('adjust')}
                  className="text-blue-600 focus:ring-blue-600 h-4 w-4" 
                />
                <span className="text-sm font-semibold">ADJUST</span>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase font-bold text-slate-500 tracking-wider">
              {actionType === 'adjust' ? 'Actual Count *' : 'Quantity *'}
            </Label>
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                {...register('quantity', { valueAsNumber: true })}
                className="w-full h-10 border-slate-300"
              />
              <span className="text-slate-500 text-sm whitespace-nowrap">{item?.unit}(s)</span>
            </div>
            {errors.quantity && <p className="text-sm text-red-500">{errors.quantity.message}</p>}
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Batch / Expiry</Label>
            <select 
              {...register('batchId')} 
              className="w-full h-10 px-3 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900"
            >
              <option value="auto">Auto (FEFO)</option>
              {batches.map(b => (
                <option key={b.id} value={b.id}>{b.batch_code || 'Unnamed'} (Expiry: {b.expiry_date})</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Reason</Label>
            <select 
              {...register('reason')} 
              className="w-full h-10 px-3 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900"
            >
              <option value="New delivery received">New delivery received</option>
              <option value="Stock addition">Stock addition</option>
              <option value="Physical count adjustment">Physical count adjustment</option>
              <option value="Damage/Spoilage">Damage/Spoilage</option>
            </select>
          </div>

          {actionType === 'adjust' && (
             <div className="space-y-2">
               <Label className="text-xs uppercase font-bold text-slate-500 tracking-wider">Notes</Label>
               <Input {...register('notes')} placeholder="e.g. Checked by Juan D." className="border-slate-300" />
             </div>
          )}

          <div className="bg-slate-50 p-4 rounded-md border border-slate-100 flex justify-between items-center">
            <span className="text-sm text-slate-600 font-semibold">New Stock Balance</span>
            <span className="text-lg font-bold text-slate-900">{newStockBalance} <span className="text-sm font-normal text-slate-600">{item?.unit}(s)</span></span>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t">
            <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSubmitting ? 'Updating...' : actionType === 'adjust' ? 'Confirm Adjustment' : 'Confirm Update'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
