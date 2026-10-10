import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { InventoryStock, StockBatch } from '../types';
import { PlusCircle, MinusCircle, RefreshCw, Layers, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface StockUpdateModalProps {
  item: InventoryStock;
  batches: StockBatch[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { action: 'add'|'remove'|'adjust', quantity: number, reason: string, batchId?: string, expiryDate?: string }) => Promise<void> | void;
  isSubmitting?: boolean;
}

export function StockUpdateModal({ item, batches, isOpen, onClose, onSubmit, isSubmitting }: StockUpdateModalProps) {
  const [action, setAction] = useState<'add'|'remove'|'adjust'>('add');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [batchId, setBatchId] = useState<string>('auto');
  const [expiryDate, setExpiryDate] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const activeBatches = useMemo(() => {
    return [...batches]
      .filter((b: StockBatch) => b.quantity > 0)
      .sort((a: StockBatch, b: StockBatch) => {
        const dateA = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
        const dateB = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
        return dateA - dateB;
      });
  }, [batches]);

  const isPending = isSubmitting || isSubmittingLocal;

  const numQty = typeof quantity === 'number' ? quantity : 0;
  
  let calculatedNewBalance = item.current_qty;
  if (action === 'add') {
    calculatedNewBalance = item.current_qty + numQty;
  } else if (action === 'remove') {
    calculatedNewBalance = Math.max(0, item.current_qty - numQty);
  } else if (action === 'adjust') {
    calculatedNewBalance = numQty;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    if (quantity === '' || (action !== 'adjust' && quantity <= 0) || (action === 'adjust' && quantity < 0)) return;
    
    // Strict requirement: Expiration date is required when adding stock
    if (action === 'add' && !expiryDate) {
      setErrorMsg('Expiration date is required for new stock batches (FEFO tracking)');
      return;
    }

    setErrorMsg('');
    setIsSubmittingLocal(true);
    try {
      await onSubmit({ 
        action, 
        quantity: Number(quantity), 
        reason: reason || (action === 'add' ? 'New delivery received' : action === 'remove' ? 'Stock deduction' : 'Physical count adjustment'), 
        batchId, 
        expiryDate: expiryDate ? new Date(expiryDate).toISOString() : undefined 
      });
    } finally {
      setIsSubmittingLocal(false);
    }
  };

  const quickReasons = action === 'add' 
    ? ['New delivery received', 'Supplier restock', 'Transfer in', 'Found stock']
    : action === 'remove'
    ? ['Physical usage', 'Damaged goods', 'Expired inventory', 'Breakage/loss']
    : ['Weekly physical count', 'Audit reconciliation', 'Correction of error', 'Shift turnover'];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto p-0 shadow-2xl border-border bg-card text-card-foreground">
        <DialogHeader className="p-5 bg-card border-b border-border text-card-foreground">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-primary flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Stock Management
              </span>
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground mt-1">
                UPDATE STOCK: {item.item_name}
              </DialogTitle>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border mt-3 text-xs text-muted-foreground">
            <span>Item SKU: <strong className="text-foreground font-mono">{item.item_code}</strong></span>
            <span>Current Stock: <strong className="text-emerald-500 font-semibold">{item.current_qty} {item.unit}</strong></span>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-5 bg-card text-card-foreground">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <span>⚠️</span> {errorMsg}
            </div>
          )}

          {/* Segmented Action Selector matching Mockup */}
          <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-lg">
            <button
              type="button"
              onClick={() => { setAction('add'); setQuantity(''); setErrorMsg(''); }}
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
              onClick={() => { setAction('remove'); setQuantity(''); setErrorMsg(''); }}
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
              onClick={() => { setAction('adjust'); setQuantity(item.current_qty); setErrorMsg(''); }}
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
                  onKeyDown={(e) => {
                    if (e.key === '-' || e.key === 'Minus') {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) => {
                    if (e.target.value === '') {
                      setQuantity('');
                      return;
                    }
                    const parsed = parseFloat(e.target.value.replace(/[^0-9.]/g, ''));
                    setQuantity(isNaN(parsed) ? '' : Math.max(0, parsed));
                  }}
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
            <div className={`p-3.5 border rounded-lg flex items-center justify-between ${
              action === 'remove' && numQty > item.current_qty 
                ? 'bg-amber-500/10 border-amber-500/30' 
                : 'bg-muted/50 border-border'
            }`}>
              <div>
                <div className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                  Projected New Stock Balance
                  {action === 'remove' && numQty > item.current_qty && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/20 px-1.5 py-0.5 rounded">
                      Deficit Auto-Zeroed
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {action === 'add' && `${item.current_qty} + ${numQty} ${item.unit}`}
                  {action === 'remove' && numQty <= item.current_qty && `${item.current_qty} - ${numQty} ${item.unit}`}
                  {action === 'remove' && numQty > item.current_qty && `Exceeds stock by ${(numQty - item.current_qty).toFixed(2)} ${item.unit} (zeroed to 0)`}
                  {action === 'adjust' && `Adjusted directly to ${numQty} ${item.unit}`}
                </div>
              </div>
              <div className="text-xl font-bold text-foreground font-mono">
                {calculatedNewBalance} <span className="text-xs font-normal text-muted-foreground">{item.unit}</span>
              </div>
            </div>

            {action === 'add' && (
              <div className="space-y-3 p-3.5 bg-muted/40 rounded-xl border border-border">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    Batch Expiry Date <span className="text-rose-500 font-bold">*</span> (FEFO Expiration Tracking)
                  </Label>
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    Required • Earliest Deducted 1st
                  </span>
                </div>
                <Input
                  type="date"
                  required
                  value={expiryDate}
                  onChange={(e) => {
                    setExpiryDate(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  className="border-border h-10 bg-card text-foreground"
                />

                {/* Existing Batches Queue Preview */}
                {activeBatches.length > 0 && (
                  <div className="pt-2 border-t border-border/80 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      <span>Existing Active Lots ({activeBatches.length})</span>
                      <span>FEFO Deduction Order</span>
                    </div>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                      {activeBatches.map((b, idx) => {
                        const isFirst = idx === 0;
                        const expDate = b.expiry_date ? new Date(b.expiry_date) : null;
                        return (
                          <div 
                            key={b.id} 
                            className={`flex items-center justify-between p-2 rounded-lg text-xs border ${
                              isFirst 
                                ? 'bg-rose-500/10 border-rose-500/30 text-foreground' 
                                : 'bg-card border-border text-muted-foreground'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono font-bold text-[11px] text-foreground">
                                {b.batch_code}
                              </span>
                              <span className="font-semibold text-foreground">
                                {b.quantity} {item.unit}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                Exp: {expDate ? format(expDate, 'MMM dd, yyyy') : 'No Expiry'}
                              </span>
                            </div>

                            <div>
                              {isFirst ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white uppercase tracking-wider shadow-2xs">
                                  Next to Deduct (1st)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
                                  Position #{idx + 1}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {action === 'remove' && batches.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Batch Allocation Rule
                  </Label>
                  <span className="text-[10px] font-semibold text-primary">
                    Auto-Prioritizes Closest Expiry
                  </span>
                </div>
                <select 
                  className="w-full h-10 px-3 py-2 bg-card border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                >
                  <option value="auto">Auto (FEFO Priority - Closest Expiry Lot Deducted First)</option>
                  {activeBatches.map((b, idx) => (
                    <option key={b.id} value={b.id}>
                      {idx === 0 ? '★ [USE FIRST] ' : ''}{b.batch_code} ({b.quantity} {item.unit}) • Exp: {b.expiry_date ? format(new Date(b.expiry_date), 'MMM dd, yyyy') : 'N/A'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                Reason / Reference Note
              </Label>
              <Input
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Type or select a reason below"
                className="border-border h-10"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {quickReasons.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className="text-[11px] px-2 py-0.5 rounded border border-border bg-muted hover:bg-muted/80 text-foreground transition-colors"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </form>
        </div>
        
        <div className="p-4 border-t border-border bg-muted/30 flex items-center justify-between">
          <Button type="button" variant="outline" disabled={isPending} onClick={onClose} className="font-semibold text-muted-foreground border-border">
            Cancel
          </Button>
          <Button 
            type="submit" 
            form="stock-form" 
            disabled={isPending}
            className={`font-semibold shadow-sm text-white ${
              action === 'add' ? 'bg-emerald-600 hover:bg-emerald-700' :
              action === 'remove' ? 'bg-rose-600 hover:bg-rose-700' :
              'bg-primary hover:bg-primary/90'
            }`}
          >
            {isPending ? 'Processing...' : `Confirm ${action.toUpperCase()}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
