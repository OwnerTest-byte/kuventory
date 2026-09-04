import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { InventoryStock, StockBatch } from '../types';
import { ArrowDownRight, ArrowUpRight, ArrowRightLeft } from 'lucide-react';

interface StockUpdateModalProps {
  item: InventoryStock;
  batches: StockBatch[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { action: 'add'|'remove'|'adjust', quantity: number, reason: string, batchId?: string, expiryDate?: string }) => void;
}

export function StockUpdateModal({ item, batches, isOpen, onClose, onSubmit }: StockUpdateModalProps) {
  const [action, setAction] = useState<'add'|'remove'|'adjust'>('add');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [batchId, setBatchId] = useState<string>('auto'); // 'auto' for FEFO, or specific ID
  const [expiryDate, setExpiryDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quantity || quantity <= 0) return;
    onSubmit({ 
      action, 
      quantity: Number(quantity), 
      reason, 
      batchId, 
      expiryDate: expiryDate ? new Date(expiryDate).toISOString() : undefined 
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-6 bg-slate-50 border-b border-slate-200">
          <DialogTitle className="text-xl text-slate-900 uppercase font-bold tracking-tight">
            Update Stock: {item.item_name}
          </DialogTitle>
          <p className="text-sm text-slate-500 font-medium">Current Total: <strong className="text-slate-900">{item.current_qty} {item.unit}</strong></p>
        </DialogHeader>

        <div className="p-6">
          <div className="flex gap-2 mb-6">
            <Button
              type="button"
              variant={action === 'add' ? 'default' : 'outline'}
              className={`flex-1 font-bold tracking-wider uppercase text-xs ${action === 'add' ? 'bg-green-600 hover:bg-green-700' : 'border-slate-200 text-slate-600'}`}
              onClick={() => setAction('add')}
            >
              <ArrowDownRight className="w-4 h-4 mr-1" /> Add
            </Button>
            <Button
              type="button"
              variant={action === 'remove' ? 'default' : 'outline'}
              className={`flex-1 font-bold tracking-wider uppercase text-xs ${action === 'remove' ? 'bg-red-600 hover:bg-red-700' : 'border-slate-200 text-slate-600'}`}
              onClick={() => setAction('remove')}
            >
              <ArrowUpRight className="w-4 h-4 mr-1" /> Consume
            </Button>
            <Button
              type="button"
              variant={action === 'adjust' ? 'default' : 'outline'}
              className={`flex-1 font-bold tracking-wider uppercase text-xs ${action === 'adjust' ? 'bg-blue-600 hover:bg-blue-700' : 'border-slate-200 text-slate-600'}`}
              onClick={() => setAction('adjust')}
            >
              <ArrowRightLeft className="w-4 h-4 mr-1" /> Adjust
            </Button>
          </div>

          <form id="stock-form" onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                {action === 'adjust' ? 'New Total Quantity' : 'Quantity'}
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value ? Number(e.target.value) : '')}
                  className="pl-4 pr-12 text-lg font-bold border-slate-300"
                  placeholder="0"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
                  {item.unit}
                </span>
              </div>
            </div>

            {action === 'add' && (
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Expiry Date (Optional)</Label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="border-slate-300"
                />
              </div>
            )}

            {action === 'remove' && batches.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Consume From Batch</Label>
                <select 
                  className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                >
                  <option value="auto">Auto (FEFO - First Expiring, First Out)</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>
                      Batch: {b.quantity} {item.unit} | Exp: {b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : 'None'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Reason / Reference</Label>
              <Input
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Received PO-123, Daily usage"
                className="border-slate-300"
              />
            </div>
          </form>
        </div>
        
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} className="font-semibold border-slate-300">
            Cancel
          </Button>
          <Button type="submit" form="stock-form" className={`font-semibold ${action === 'add' ? 'bg-green-600 hover:bg-green-700' : action === 'remove' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
            Confirm {action}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
