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
  
  // Group into PORTION STOCK and PER CASES using the strict section field
  const { portionItems, caseItems } = useMemo(() => {
    const caseItems = items.filter(item => item.section === 'PER CASES');
    const portionItems = items.filter(item => item.section === 'PORTION STOCK');
    return { portionItems, caseItems };
  }, [items]);

  const renderTable = (tableItems: typeof items, title: string) => {
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
        <h2 className="text-sm font-bold text-blue-800 uppercase tracking-widest mb-3 pl-2">{title}</h2>
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="w-full text-left">
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200">
                  <TableHead className="w-12 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">#</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider">ITEM</TableHead>
                  <TableHead className="text-center w-24 text-xs font-bold text-slate-500 uppercase tracking-wider">BEG</TableHead>
                  <TableHead className="text-center w-24 text-xs font-bold text-slate-500 uppercase tracking-wider">ADD</TableHead>
                  <TableHead className="text-center w-32 text-xs font-bold text-slate-500 uppercase tracking-wider">TOTAL STOCK</TableHead>
                  <TableHead className="text-center w-24 text-xs font-bold text-slate-500 uppercase tracking-wider">SALES AM</TableHead>
                  <TableHead className="text-center w-24 text-xs font-bold text-slate-500 uppercase tracking-wider">SALES PM</TableHead>
                  <TableHead className="text-center w-32 text-xs font-bold text-slate-500 uppercase tracking-wider">ENDING QTY</TableHead>
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
              <TableBody className="bg-slate-50 border-t-2 border-slate-300">
                <TableRow className="hover:bg-slate-50 font-bold">
                  <TableCell colSpan={2} className="text-right text-slate-700 uppercase tracking-widest text-xs">
                    GRAND TOTAL {title}
                  </TableCell>
                  <TableCell className="text-center text-slate-700">{totals.beg}</TableCell>
                  <TableCell className="text-center text-slate-700">{totals.add}</TableCell>
                  <TableCell className="text-center text-blue-700 bg-blue-50/50">{totals.total}</TableCell>
                  <TableCell className="text-center text-slate-700">{totals.am}</TableCell>
                  <TableCell className="text-center text-slate-700">{totals.pm}</TableCell>
                  <TableCell className="text-center text-blue-700 bg-blue-50/50">{totals.end}</TableCell>
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
      {renderTable(portionItems, 'PORTION STOCK')}
      {renderTable(caseItems, 'PER CASES')}
      {items.length === 0 && (
        <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-slate-200 border-dashed">
          No active items found for this date. Ensure items exist and are not archived.
        </div>
      )}
    </div>
  );
}
