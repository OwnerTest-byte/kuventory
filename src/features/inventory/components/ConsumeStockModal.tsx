import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { removeStock } from '../api';
import type { InventoryStock } from '../types';
import { useAuth } from '@/features/auth/context/AuthContext';
import { X, LogOut } from 'lucide-react';

interface Props {
  item: InventoryStock;
  onClose: () => void;
  onSuccess: () => void;
}

export function ConsumeStockModal({ item, onClose, onSuccess }: Props) {
  const { profile } = useAuth();
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('Manual FEFO Consumption');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError('Quantity must be a positive number');
      return;
    }
    if (!profile?.id) return;

    try {
      setIsSubmitting(true);
      await removeStock({
        itemId: item.id,
        quantity: qty,
        reason
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to consume stock');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <LogOut className="w-5 h-5 text-blue-600" /> Consume Stock - {item.item_name}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 p-3 rounded-lg text-sm mb-4">
            Total Valid Stock: <strong>{item.current_qty} {item.unit}</strong><br/>
            Stock will be removed following the <strong>FEFO</strong> (First-Expire, First-Out) rule. Expired stock is automatically excluded.
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm dark:bg-red-950/20 dark:border-red-900 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Quantity to Remove ({item.unit})
            </label>
            <Input 
              type="number"
              required
              min="1"
              step="any"
              max={item.current_qty}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={`Max: ${item.current_qty}`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Reason
            </label>
            <Input 
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || Number(item.current_qty) <= 0}>
              {isSubmitting ? 'Processing...' : 'Consume Stock'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
