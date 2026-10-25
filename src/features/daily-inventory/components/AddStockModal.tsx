import { useState } from 'react';
import type { DailyInventorySessionWithEntries } from '../api';
import { useStockMutations } from '../../inventory/hooks/useStockMutations';
import { useUpsertDailyItem } from '../hooks/useDailyInventory';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { getBusinessDateString, getBusinessDateStringPlusDays } from '@/lib/businessDate';

type DailyEntry = DailyInventorySessionWithEntries['daily_inventory_entries'][0];

interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: DailyEntry;
  date: string;
  isCorrectionMode?: boolean;
}

export function AddStockModal({ isOpen, onClose, item, date, isCorrectionMode }: AddStockModalProps) {
  const { profile, role } = useAuth();
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const [qty, setQty] = useState('');
  const [expiry, setExpiry] = useState(() => getBusinessDateStringPlusDays(30));
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

    if (!expiry) {
      setErrorMsg('Expiration date is required for FEFO tracking');
      return;
    }

    const todayStr = getBusinessDateString();
    if (expiry < todayStr) {
      setErrorMsg('Expiration date cannot be in the past. Stock is already expired.');
      return;
    }

    try {
      setErrorMsg('');
      
      // 1. Attempt atomic database transaction RPC (batch + movement + worksheet ledger entry)
      const { error: rpcErr } = await supabase.rpc('receive_daily_inventory_stock', {
        p_daily_inventory_item_id: item.id,
        p_quantity: numQty,
        p_expiry_date: expiry,
        p_user_id: profile?.id,
        p_reason: 'Daily Inventory Receiving'
      });

      if (rpcErr) {
        // The 2-step fallback writes through admin-gated paths (add_stock RPC +
        // direct worksheet update). STAFF fail honestly and retry instead —
        // the receive RPC is their authoritative path.
        if (!isAdmin) {
          setErrorMsg(
            'The delivery could not be recorded because the server rejected the request. Please check your connection and try again — if it keeps failing, ask an administrator.'
          );
          return;
        }
        console.warn('receive_daily_inventory_stock RPC fallback:', rpcErr.message);
        await stockMutations.add.mutateAsync({
          itemId: item.item_id,
          quantity: numQty,
          expiryDate: expiry,
          reason: 'Daily Inventory Receiving',
          userId: profile?.id
        });

        await dailyMutation.mutateAsync({
          id: item.id,
          beg: item.beginning_qty,
          add: item.add_qty + numQty,
          am: item.sales_am,
          pm: item.sales_pm,
          allowCorrection: isCorrectionMode,
        });
      }

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add stock');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card text-card-foreground rounded-xl shadow-xl p-6 w-full max-w-md border border-border">
        <h2 className="text-lg font-bold text-foreground mb-4">Receive Delivery: {item.items?.item_name}</h2>
        
        {errorMsg && (
          <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 text-sm font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Quantity to Add ({item.items?.unit})</label>
            <input 
              type="number" 
              required
              min="0.01"
              step="any"
              value={qty}
              onKeyDown={(e) => {
                if (e.key === '-' || e.key === 'Minus') e.preventDefault();
              }}
              onChange={e => {
                const clean = e.target.value.replace(/[^0-9.]/g, '');
                setQty(clean);
              }}
              className="w-full bg-background border border-input rounded-lg p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="e.g. 10"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Expiry Date <span className="text-rose-500 font-bold">*</span> <span className="text-xs text-muted-foreground font-normal">(Required for FEFO)</span>
            </label>
            <input 
              type="date" 
              required
              min={getBusinessDateString()}
              value={expiry}
              onChange={e => setExpiry(e.target.value)}
              className="w-full bg-background border border-input rounded-lg p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="outline" onClick={onClose} disabled={stockMutations.add.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={stockMutations.add.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
              {stockMutations.add.isPending ? 'Adding...' : 'Add Stock'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
