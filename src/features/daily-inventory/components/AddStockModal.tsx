import { useState } from 'react';
import type { DailyInventorySessionWithEntries } from '../api';
import { useStockMutations } from '../../inventory/hooks/useStockMutations';
import { useUpsertDailyItem } from '../hooks/useDailyInventory';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/context/AuthContext';

type DailyEntry = DailyInventorySessionWithEntries['daily_inventory_entries'][0];

interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: DailyEntry;
  date: string;
}

export function AddStockModal({ isOpen, onClose, item, date }: AddStockModalProps) {
  const { profile } = useAuth();
  const [qty, setQty] = useState('');
  const [expiry, setExpiry] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [errorMsg, setErrorMsg] = useState('');

  const stockMutations = useStockMutations();
  const dailyMutation = useUpsertDailyItem(date);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numQty = parseFloat(qty);
    if (!numQty || numQty <= 0) {
      setErrorMsg('Quantity must be greater than 0');
      return;
    }

    try {
      setErrorMsg('');
      
      // 1. Physically add the batch via Inventory API
      await stockMutations.add.mutateAsync({
        itemId: item.item_id,
        quantity: numQty,
        expiryDate: expiry,
        reason: 'Daily Inventory Receiving',
        userId: profile?.id
      });

      // 2. Increment the local daily sheet ADD column
      await dailyMutation.mutateAsync({
        id: item.id,
        beg: item.beginning_qty,
        add: item.add_qty + numQty,
        am: item.sales_am,
        pm: item.sales_pm,
      });

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add stock');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Receive Delivery: {item.items?.item_name}</h2>
        
        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded border border-red-200 text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Quantity to Add ({item.items?.unit})</label>
            <input 
              type="number" 
              required
              min="1"
              value={qty}
              onChange={e => setQty(e.target.value)}
              className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 10"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Date</label>
            <input 
              type="date" 
              required
              value={expiry}
              onChange={e => setExpiry(e.target.value)}
              className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="outline" onClick={onClose} disabled={stockMutations.add.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={stockMutations.add.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
              {stockMutations.add.isPending ? 'Adding...' : 'Add Stock'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
