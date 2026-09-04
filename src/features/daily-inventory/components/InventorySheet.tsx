import { useMemo } from 'react';
import type { DailyInventorySessionWithEntries } from '../api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InventoryRow } from './InventoryRow';

interface InventorySheetProps {
  session: DailyInventorySessionWithEntries;
  isReadOnly: boolean;
  date: string;
}

export function InventorySheet({ session, isReadOnly, date }: InventorySheetProps) {
  const items = session.daily_inventory_entries || [];
  
  // Group into GRILLED STOCK, PORTION STOCK, PER CASES, and OTHER
  const { grilledItems, portionItems, caseItems, otherItems } = useMemo(() => {
    const grilledItems: typeof items = [];
    const portionItems: typeof items = [];
    const caseItems: typeof items = [];
    const otherItems: typeof items = [];

    items.forEach(item => {
      const sec = (item.section || '').toUpperCase();
      if (sec.includes('GRILL')) {
        grilledItems.push(item);
      } else if (sec.includes('CASE')) {
        caseItems.push(item);
      } else if (sec.includes('PORTION')) {
        portionItems.push(item);
      } else {
        otherItems.push(item);
      }
    });

    return { grilledItems, portionItems, caseItems, otherItems };
  }, [items]);

  const renderTable = (tableItems: typeof items, title: string, colorClass = 'text-blue-800') => {
    if (tableItems.length === 0) return null;
    
    // Calculate totals
    const totals = tableItems.reduce((acc, item) => ({
      beg: acc.beg + item.beginning_qty,
      add: acc.add + item.add_qty,
      total: acc.total + item.total_stock,
      am: acc.am + item.sales_am,
      pm: acc.pm + item.sales_pm,
      end: acc.end + item.ending_qty
    }), { beg: 0, add: 0, total: 0, am: 0, pm: 0, end: 0 });

    return (
      <div className="mb-10">
        <div className="flex items-center justify-between mb-3 pl-2">
          <h2 className={`text-sm font-bold uppercase tracking-widest ${colorClass}`}>
            {title}
          </h2>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
            {tableItems.length} items
          </span>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="max-h-[500px] overflow-y-auto overflow-x-auto relative overscroll-contain">
            <Table className="w-full text-left border-collapse">
              <TableHeader className="sticky top-0 z-20 bg-slate-100 shadow-xs">
                <TableRow className="border-b border-slate-200">
                  <TableHead className="w-12 text-center text-xs font-bold text-slate-600 uppercase tracking-wider sticky left-0 z-30 bg-slate-100 border-r border-slate-200">#</TableHead>
                  <TableHead className="text-xs font-bold text-slate-600 uppercase tracking-wider sticky left-12 z-30 bg-slate-100 border-r border-slate-200 min-w-[180px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">ITEM</TableHead>
                  <TableHead className="text-center w-24 text-xs font-bold text-slate-600 uppercase tracking-wider">BEG</TableHead>
                  <TableHead className="text-center w-24 text-xs font-bold text-slate-600 uppercase tracking-wider">ADD</TableHead>
                  <TableHead className="text-center w-32 text-xs font-bold text-slate-600 uppercase tracking-wider bg-slate-100/80">TOTAL STOCK</TableHead>
                  <TableHead className="text-center w-24 text-xs font-bold text-slate-600 uppercase tracking-wider">SALES AM</TableHead>
                  <TableHead className="text-center w-24 text-xs font-bold text-slate-600 uppercase tracking-wider">SALES PM</TableHead>
                  <TableHead className="text-center w-32 text-xs font-bold text-slate-600 uppercase tracking-wider bg-slate-100/80">ENDING QTY</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableItems.map((item, index) => (
                  <InventoryRow 
                    key={item.id} 
                    item={item} 
                    index={index} 
                    isReadOnly={isReadOnly}
                    date={date}
                  />
                ))}
              </TableBody>
              {/* Grand Total Row */}
              <TableBody className="sticky bottom-0 z-20 bg-slate-100 border-t-2 border-slate-300 shadow-[0_-2px_4px_-1px_rgba(0,0,0,0.05)]">
                <TableRow className="hover:bg-slate-100 font-bold">
                  <TableCell className="sticky left-0 z-30 bg-slate-100 text-center font-bold text-xs text-slate-500 border-r border-slate-200">Σ</TableCell>
                  <TableCell className="sticky left-12 z-30 bg-slate-100 border-r border-slate-200 text-left text-slate-700 uppercase tracking-wider text-xs font-black shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                    TOTAL {title}
                  </TableCell>
                  <TableCell className="text-center text-slate-700 font-mono font-bold text-xs">{totals.beg}</TableCell>
                  <TableCell className="text-center text-slate-700 font-mono font-bold text-xs">{totals.add}</TableCell>
                  <TableCell className="text-center text-blue-800 bg-blue-100/40 font-mono font-black text-xs">{totals.total}</TableCell>
                  <TableCell className="text-center text-slate-700 font-mono font-bold text-xs">{totals.am}</TableCell>
                  <TableCell className="text-center text-slate-700 font-mono font-bold text-xs">{totals.pm}</TableCell>
                  <TableCell className="text-center text-blue-800 bg-blue-100/40 font-mono font-black text-xs">{totals.end}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {renderTable(grilledItems, 'GRILLED STOCK', 'text-amber-700')}
      {renderTable(portionItems, 'PORTION STOCK', 'text-blue-800')}
      {renderTable(caseItems, 'PER CASES', 'text-emerald-700')}
      {renderTable(otherItems, 'OTHER SUPPLIES', 'text-slate-700')}
      
      {items.length === 0 && (
        <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-slate-200 border-dashed">
          No active items found for this date. Ensure items exist in catalog.
        </div>
      )}
    </div>
  );
}
