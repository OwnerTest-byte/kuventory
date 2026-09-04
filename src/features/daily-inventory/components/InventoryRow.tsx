import { useState, useEffect, useRef, memo } from 'react';
import type { DailyInventorySessionWithEntries } from '../api';
import { useUpsertDailyItem } from '../hooks/useDailyInventory';

import { AddStockModal } from './AddStockModal';
import { TableRow, TableCell } from '@/components/ui/table';

type DailyEntry = DailyInventorySessionWithEntries['daily_inventory_entries'][0];

interface InventoryRowProps {
  item: DailyEntry;
  index: number;
  isReadOnly: boolean;
  date: string;
}

export const InventoryRow = memo(function InventoryRow({ item, index, isReadOnly, date }: InventoryRowProps) {
  const [beg, setBeg] = useState(item.beginning_qty.toString());
  const [am, setAm] = useState(item.sales_am.toString());
  const [pm, setPm] = useState(item.sales_pm.toString());
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const mutation = useUpsertDailyItem(date);
  const isInitialMount = useRef(true);

  const [prevItem, setPrevItem] = useState(item);
  if (item !== prevItem) {
    setPrevItem(item);
    if (parseFloat(beg) !== item.beginning_qty) setBeg(item.beginning_qty.toString());
    if (parseFloat(am) !== item.sales_am) setAm(item.sales_am.toString());
    if (parseFloat(pm) !== item.sales_pm) setPm(item.sales_pm.toString());
  }

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    if (isReadOnly) return;

    const numBeg = parseFloat(beg) || 0;
    const numAm = parseFloat(am) || 0;
    const numPm = parseFloat(pm) || 0;

    if (numBeg === item.beginning_qty && numAm === item.sales_am && numPm === item.sales_pm) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        await mutation.mutateAsync({
          id: item.id,
          beg: numBeg,
          add: item.add_qty,
          am: numAm,
          pm: numPm
        });
      } catch {
        // error handling
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [beg, am, pm, isReadOnly, item, mutation, date]);

  const inputClass = `w-full text-center p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isReadOnly ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-white text-slate-900 font-semibold'}`;

  // Optimistic calculation for visual feedback while debouncing
  const optTotal = (parseFloat(beg) || 0) + item.add_qty;
  const optEnding = optTotal - (parseFloat(am) || 0) - (parseFloat(pm) || 0);

  return (
    <>
      <TableRow className="hover:bg-slate-50 group border-b border-slate-100 last:border-0 transition-colors">
        <TableCell className="p-3 text-center text-sm font-medium text-slate-400 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200">
          {index + 1}
        </TableCell>
        <TableCell className="p-3 align-middle sticky left-12 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 min-w-[180px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
          <div className="font-bold text-slate-800 text-xs sm:text-sm">{item.items?.item_name}</div>
          <div className="text-[11px] text-slate-500">{item.items?.unit}</div>
        </TableCell>
        <TableCell className="p-2">
          <input 
            type="number" 
            min="0"
            value={beg} 
            onChange={e => setBeg(e.target.value)}
            disabled={isReadOnly}
            className={inputClass}
          />
        </TableCell>
        <TableCell className="p-2 relative">
          <div 
            onClick={() => !isReadOnly && setIsModalOpen(true)}
            className={`w-full text-center p-2 border rounded flex items-center justify-center font-bold
              ${isReadOnly ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-white text-blue-600 hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors'}
            `}
          >
            {item.add_qty > 0 ? `+${item.add_qty}` : '0'}
          </div>
        </TableCell>
        <TableCell className="p-2">
          <div className="w-full text-center p-2 rounded bg-blue-50/50 text-blue-700 font-bold border border-blue-100/50">
            {optTotal}
          </div>
        </TableCell>
        <TableCell className="p-2">
          <input 
            type="number" 
            min="0"
            value={am} 
            onChange={e => setAm(e.target.value)}
            disabled={isReadOnly}
            className={inputClass}
          />
        </TableCell>
        <TableCell className="p-2">
          <input 
            type="number" 
            min="0"
            value={pm} 
            onChange={e => setPm(e.target.value)}
            disabled={isReadOnly}
            className={inputClass}
          />
        </TableCell>
        <TableCell className="p-2">
          <div className={`w-full text-center p-2 rounded font-bold border ${optEnding < 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50/50 text-blue-700 border-blue-100/50'}`}>
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
