import { useMemo } from 'react';
import type { DailyInventoryItem } from '../types';
import { InventoryRow } from './InventoryRow';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface InventorySheetProps {
  items: DailyInventoryItem[];
  isReadOnly: boolean;
  date: string;
}

export function InventorySheet({ items, isReadOnly, date }: InventorySheetProps) {
  
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
    return (
      <div className="bg-white dark:bg-slate-900 rounded shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden mb-8 animate-in fade-in">
        <div className="bg-slate-50 dark:bg-slate-900 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest">{title}</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{tableItems.length} items</span>
        </div>
        
        <div className="overflow-x-auto">
          <Table className="w-full text-left">
            <TableHeader className="hidden md:table-header-group">
              <TableRow className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800">
                <TableHead className="w-1/4">ITEM</TableHead>
                <TableHead className="text-center w-24">BEG</TableHead>
                <TableHead className="text-center w-24">ADD</TableHead>
                <TableHead className="text-center w-24 bg-slate-200/50 dark:bg-slate-700/50">TOTAL</TableHead>
                <TableHead className="text-center w-24">AM</TableHead>
                <TableHead className="text-center w-24">PM</TableHead>
                <TableHead className="text-center w-24 bg-slate-200/50 dark:bg-slate-700/50">END</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableItems.map(item => (
                <InventoryRow 
                  key={item.id} 
                  item={item} 
                  isReadOnly={isReadOnly} 
                  date={date}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {renderTable(portionItems, 'PORTION STOCK')}
      {renderTable(caseItems, 'PER CASES')}
    </div>
  );
}
