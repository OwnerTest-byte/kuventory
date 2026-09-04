import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { InventoryStock, StockBatch } from '../types';
import { PlusCircle, MinusCircle, RefreshCw, Layers } from 'lucide-react';

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
  const [batchId, setBatchId] = useState<string>('auto');
  const [expiryDate, setExpiryDate] = useState('');

  const numQty = typeof quantity === 'number' ? quantity : 0;
  
  let calculatedNewBalance = item.current_qty;
  if (action === 'add') {
    calculatedNewBalance = item.current_qty + numQty;
  } else if (action === 'remove') {
    calculatedNewBalance = Math.max(0, item.current_qty - numQty);
  } else if (action === 'adjust') {
    calculatedNewBalance = numQty;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity === '' || (action !== 'adjust' && quantity <= 0) || (action === 'adjust' && quantity < 0)) return;
    
    onSubmit({ 
      action, 
      quantity: Number(quantity), 
      reason: reason || (action === 'add' ? 'New delivery received' : action === 'remove' ? 'Stock deduction' : 'Physical count adjustment'), 
      batchId, 
      expiryDate: expiryDate ? new Date(expiryDate).toISOString() : undefined 
    });
  };

  const quickReasons = action === 'add' 
    ? ['New delivery received', 'Supplier restock', 'Transfer in', 'Found stock']
    : action === 'remove'
    ? ['Physical usage', 'Damaged goods', 'Expired inventory', 'Breakage/loss']
    : ['Weekly physical count', 'Audit reconciliation', 'Correction of error', 'Shift turnover'];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden shadow-2xl border-slate-200">
        <DialogHeader className="p-5 bg-linear-to-r from-slate-900 to-slate-800 text-white">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-blue-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Stock Management
              </span>
              <DialogTitle className="text-xl font-bold tracking-tight text-white mt-1">
                UPDATE STOCK: {item.item_name}
              </DialogTitle>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-700/60 mt-3 text-xs text-slate-300">
            <span>Item SKU: <strong className="text-white font-mono">{item.item_code}</strong></span>
            <span>Current Stock: <strong className="text-emerald-400 font-semibold">{item.current_qty} {item.unit}</strong></span>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-5 bg-white">
          {/* Segmented Action Selector matching Mockup */}
          <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-lg">
            <button
              type="button"
              onClick={() => { setAction('add'); setQuantity(''); }}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                action === 'add'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <PlusCircle className="w-4 h-4" /> Add
            </button>
            <button
              type="button"
              onClick={() => { setAction('remove'); setQuantity(''); }}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                action === 'remove'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <MinusCircle className="w-4 h-4" /> Remove
            </button>
            <button
              type="button"
              onClick={() => { setAction('adjust'); setQuantity(item.current_qty); }}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                action === 'adjust'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <RefreshCw className="w-4 h-4" /> Adjust
            </button>
          </div>

          <form id="stock-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {action === 'adjust' ? 'Target Physical Count' : action === 'add' ? 'Quantity to Add' : 'Quantity to Deduct'}
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min={action === 'adjust' ? 0 : 1}
                  step="any"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                  className="h-12 pl-4 pr-16 text-lg font-bold border-slate-300 focus:ring-blue-500"
                  placeholder="0"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase text-slate-400 bg-slate-100 px-2 py-1 rounded">
                  {item.unit}
                </span>
              </div>
            </div>

            {/* Dynamic Calculated Balance Banner */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Projected New Stock Balance</div>
                <div className="text-xs text-slate-400">
                  {action === 'add' && `${item.current_qty} + ${numQty} ${item.unit}`}
                  {action === 'remove' && `${item.current_qty} - ${numQty} ${item.unit}`}
                  {action === 'adjust' && `Adjusted directly to ${numQty} ${item.unit}`}
                </div>
              </div>
              <div className="text-xl font-bold text-slate-900 font-mono">
                {calculatedNewBalance} <span className="text-xs font-normal text-slate-500">{item.unit}</span>
              </div>
            </div>

            {action === 'add' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Batch Expiry Date (Optional)
                </Label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="border-slate-300 h-10"
                />
              </div>
            )}

            {action === 'remove' && batches.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Batch Allocation Rule
                </Label>
                <select 
                  className="w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                >
                  <option value="auto">Auto (FEFO Priority - Earliest Expiry First)</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.batch_code} ({b.quantity} {item.unit}) • Exp: {b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : 'N/A'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Reason / Reference Note
              </Label>
              <Input
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Type or select a reason below"
                className="border-slate-300 h-10"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {quickReasons.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className="text-[11px] px-2 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </form>
        </div>
        
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <Button type="button" variant="outline" onClick={onClose} className="font-semibold text-slate-600 border-slate-300">
            Cancel
          </Button>
          <Button 
            type="submit" 
            form="stock-form" 
            className={`font-semibold shadow-sm text-white ${
              action === 'add' ? 'bg-emerald-600 hover:bg-emerald-700' :
              action === 'remove' ? 'bg-rose-600 hover:bg-rose-700' :
              'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            Confirm {action.toUpperCase()}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
