import { useMemo } from 'react';
import type { DailyInventoryItem } from '../types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface InventorySheetProps {
  items: DailyInventoryItem[];
  isReadOnly: boolean;
  date: string;
}

export function InventorySheet({ items }: InventorySheetProps) {
  
  // UX Spec: strictly group into PORTION STOCK and PER CASES
  const { portionItems, caseItems } = useMemo(() => {
    const caseItems = items.filter(item => {
      const unit = item.inventory_items?.unit?.toUpperCase() || '';
      const category = item.inventory_items?.categories?.name?.toUpperCase() || '';
      return unit.includes('CASE') || category.includes('CASE');
    });
    
    const portionItems = items.filter(item => !caseItems.includes(item));
    return { portionItems, caseItems };
  }, [items]);

  const renderTable = (tableItems: DailyInventoryItem[], title: string) => {
    if (tableItems.length === 0) return null;
    
    // Calculate totals
    const totals = tableItems.reduce((acc, item) => ({
      beg: acc.beg + (item.beg || 0),
      add: acc.add + (item.add || 0),
      total: acc.total + ((item.beg || 0) + (item.add || 0)),
      am: acc.am + (item.am || 0),
      pm: acc.pm + (item.pm || 0),
      end: acc.end + (item.ending || 0)
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
                  <TableHead className="text-center w-28 text-xs font-bold text-slate-500 uppercase tracking-wider">SALES AM</TableHead>
                  <TableHead className="text-center w-28 text-xs font-bold text-slate-500 uppercase tracking-wider">SALES PM</TableHead>
                  <TableHead className="text-center w-24 text-xs font-bold text-slate-500 uppercase tracking-wider">ENDING</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableItems.map((item, index) => {
                  const totalStock = (item.beg || 0) + (item.add || 0);
                  
                  return (
                    <TableRow key={item.id} className="hover:bg-slate-50/50">
                      <TableCell className="text-center text-slate-500 font-medium">{index + 1}</TableCell>
                      <TableCell className="font-semibold text-slate-800 uppercase text-sm">{item.inventory_items?.name}</TableCell>
                      <TableCell className="text-center font-medium text-slate-700">{item.beg || 0}</TableCell>
                      <TableCell className="text-center font-medium text-slate-700">{item.add || 0}</TableCell>
                      <TableCell className="text-center font-medium text-slate-700">{totalStock}</TableCell>
                      <TableCell className="text-center font-medium text-slate-700">{item.am || 0}</TableCell>
                      <TableCell className="text-center font-medium text-slate-700">{item.pm || 0}</TableCell>
                      <TableCell className="text-center font-medium text-slate-700">{item.ending || 0}</TableCell>
                    </TableRow>
                  );
                })}
                {/* Custom Total Row */}
                <TableRow className="bg-green-50/50 hover:bg-green-50/50 border-t border-slate-200">
                  <TableCell colSpan={2} className="font-bold text-green-700 uppercase tracking-wide text-sm pl-8">
                    TOTAL
                  </TableCell>
                  <TableCell className="text-center font-bold text-green-700">{totals.beg}</TableCell>
                  <TableCell className="text-center font-bold text-green-700">{totals.add}</TableCell>
                  <TableCell className="text-center font-bold text-green-700">{totals.total}</TableCell>
                  <TableCell className="text-center font-bold text-green-700">{totals.am}</TableCell>
                  <TableCell className="text-center font-bold text-green-700">{totals.pm}</TableCell>
                  <TableCell className="text-center font-bold text-green-700">{totals.end}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderTable(portionItems, 'PORTION STOCK')}
      {renderTable(caseItems, 'PER CASES')}
    </div>
  );
}
