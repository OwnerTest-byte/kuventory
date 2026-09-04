import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addStock } from '../api';
import type { InventoryStock } from '../types';
import { useAuth } from '@/features/auth/context/AuthContext';
import { X } from 'lucide-react';

interface Props {
  item: InventoryStock;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddBatchModal({ item, onClose, onSuccess }: Props) {
  const { profile } = useAuth();
  const [quantity, setQuantity] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('New batch delivery');
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
      await addStock({
        itemId: item.id,
        quantity: qty,
        expiryDate: expiryDate ? expiryDate : null,
        receivedDate,
        reason
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add batch');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-lg">Add Batch - {item.item_name}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm dark:bg-red-950/20 dark:border-red-900 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Quantity ({item.unit})
            </label>
            <Input 
              type="number"
              required
              min="1"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Received Date
            </label>
            <Input 
              type="date"
              required
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Expiry Date (Optional)
            </label>
            <Input 
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-1">Leave empty if the item does not expire.</p>
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Add Batch'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
