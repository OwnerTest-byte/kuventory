import { useState, useEffect, useRef, memo } from 'react';
import type { DailyInventorySessionWithEntries } from '../api';
import { useUpsertDailyItem } from '../hooks/useDailyInventory';
import { AddStockModal } from './AddStockModal';
import { TableRow, TableCell } from '@/components/ui/table';
import { PlusCircle } from 'lucide-react';

type DailyEntry = DailyInventorySessionWithEntries['daily_inventory_entries'][0];

interface InventoryRowProps {
  item: DailyEntry;
  index: number;
  isReadOnly: boolean;
  date: string;
}

export const InventoryRow = memo(function InventoryRow({ item, index, isReadOnly, date }: InventoryRowProps) {
  const [beg, setBeg] = useState(item.beginning_qty.toString());
  const [add, setAdd] = useState(item.add_qty.toString());
  const [am, setAm] = useState(item.sales_am.toString());
  const [pm, setPm] = useState(item.sales_pm.toString());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const mutation = useUpsertDailyItem(date);

  const lastSyncedRef = useRef({ id: item.id, date, add: item.add_qty });

  // Sync state when date, item, or external add changes
  useEffect(() => {
    if (lastSyncedRef.current.id !== item.id || lastSyncedRef.current.date !== date) {
      lastSyncedRef.current = { id: item.id, date, add: item.add_qty };
      setBeg(item.beginning_qty.toString());
      setAdd(item.add_qty.toString());
      setAm(item.sales_am.toString());
      setPm(item.sales_pm.toString());
    } else if (lastSyncedRef.current.add !== item.add_qty) {
      lastSyncedRef.current.add = item.add_qty;
      setAdd(item.add_qty.toString());
    }
  }, [item.id, date, item.beginning_qty, item.add_qty, item.sales_am, item.sales_pm]);

  const saveRow = async (newBeg: string, newAdd: string, newAm: string, newPm: string) => {
    if (isReadOnly) return;
    const numBeg = parseFloat(newBeg) || 0;
    const numAdd = parseFloat(newAdd) || 0;
    const numAm = parseFloat(newAm) || 0;
    const numPm = parseFloat(newPm) || 0;

    if (
      numBeg === item.beginning_qty &&
      numAdd === item.add_qty &&
      numAm === item.sales_am &&
      numPm === item.sales_pm
    ) {
      return;
    }

    setSaveStatus('saving');
    try {
      await mutation.mutateAsync({
        id: item.id,
        beg: numBeg,
        add: numAdd,
        am: numAm,
        pm: numPm,
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
    }
  };

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = (field: 'beg' | 'add' | 'am' | 'pm', value: string) => {
    if (isReadOnly) return;

    let nextBeg = beg;
    let nextAdd = add;
    let nextAm = am;
    let nextPm = pm;

    if (field === 'beg') { setBeg(value); nextBeg = value; }
    if (field === 'add') { setAdd(value); nextAdd = value; }
    if (field === 'am') { setAm(value); nextAm = value; }
    if (field === 'pm') { setPm(value); nextPm = value; }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      saveRow(nextBeg, nextAdd, nextAm, nextPm);
    }, 600);
  };

  const handleBlur = () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    saveRow(beg, add, am, pm);
  };

  const numBeg = parseFloat(beg) || 0;
  const numAdd = parseFloat(add) || 0;
  const numAm = parseFloat(am) || 0;
  const numPm = parseFloat(pm) || 0;
  const optTotal = numBeg + numAdd;
  const optEnding = optTotal - numAm - numPm;

  const inputClass = `w-full text-center p-2 text-base sm:text-sm font-semibold border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary ${
    isReadOnly 
      ? 'bg-muted/50 text-muted-foreground cursor-not-allowed border-border' 
      : 'bg-card text-foreground border-border hover:border-muted-foreground/40'
  }`;

  return (
    <>
      <TableRow className="hover:bg-muted/40 group border-b border-border/60 last:border-0 transition-colors">
        <TableCell className="p-3 text-center text-xs font-medium text-muted-foreground sticky left-0 z-10 bg-card group-hover:bg-muted/60 border-r border-border">
          {index + 1}
        </TableCell>
        <TableCell className="p-3 align-middle sticky left-12 z-10 bg-card group-hover:bg-muted/60 border-r border-border min-w-[180px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
          <div className="font-bold text-foreground text-xs sm:text-sm">{item.items?.item_name}</div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <span>{item.items?.unit}</span>
            {saveStatus === 'saving' && <span className="text-amber-500 font-medium">Saving...</span>}
            {saveStatus === 'saved' && <span className="text-emerald-500 font-medium">Saved</span>}
            {saveStatus === 'error' && <span className="text-rose-500 font-medium">Save failed</span>}
          </div>
        </TableCell>
        
        {/* BEG */}
        <TableCell className="p-2">
          <input 
            type="number" 
            min="0"
            step="any"
            value={beg} 
            onChange={e => handleInputChange('beg', e.target.value)}
            onBlur={handleBlur}
            disabled={isReadOnly}
            className={inputClass}
          />
        </TableCell>

        {/* ADD - Direct Input + Batch Modal trigger */}
        <TableCell className="p-2">
          <div className="relative flex items-center">
            <input 
              type="number" 
              min="0"
              step="any"
              value={add} 
              onChange={e => handleInputChange('add', e.target.value)}
              onBlur={handleBlur}
              disabled={isReadOnly}
              className={`${inputClass} pr-7 font-bold text-primary`}
            />
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                title="Receive Delivery with Expiry Date"
                className="absolute right-1 text-muted-foreground hover:text-primary p-1 transition-colors"
              >
                <PlusCircle size={15} />
              </button>
            )}
          </div>
        </TableCell>

        {/* TOTAL STOCK */}
        <TableCell className="p-2">
          <div className="w-full text-center p-2 rounded-lg bg-primary/10 text-primary font-bold border border-primary/20 text-sm">
            {optTotal}
          </div>
        </TableCell>

        {/* SALES AM */}
        <TableCell className="p-2">
          <input 
            type="number" 
            min="0"
            step="any"
            value={am} 
            onChange={e => handleInputChange('am', e.target.value)}
            onBlur={handleBlur}
            disabled={isReadOnly}
            className={inputClass}
          />
        </TableCell>

        {/* SALES PM */}
        <TableCell className="p-2">
          <input 
            type="number" 
            min="0"
            step="any"
            value={pm} 
            onChange={e => handleInputChange('pm', e.target.value)}
            onBlur={handleBlur}
            disabled={isReadOnly}
            className={inputClass}
          />
        </TableCell>

        {/* ENDING QTY */}
        <TableCell className="p-2">
          <div className={`w-full text-center p-2 rounded-lg font-bold border text-sm transition-colors ${
            optEnding < 0 
              ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' 
              : 'bg-primary/10 text-primary border border-primary/20'
          }`}>
            {optEnding}
          </div>
        </TableCell>
      </TableRow>

      {!isReadOnly && isModalOpen && (
        <AddStockModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          item={item}
          date={date}
        />
      )}
    </>
  );
});
