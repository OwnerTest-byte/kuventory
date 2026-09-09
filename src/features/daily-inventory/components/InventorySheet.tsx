import { useMemo } from 'react';
import type { DailyInventorySessionWithEntries } from '../api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InventoryRow } from './InventoryRow';

type DailyEntry = DailyInventorySessionWithEntries['daily_inventory_entries'][number];

interface InventorySheetProps {
  session: DailyInventorySessionWithEntries;
  isReadOnly: boolean;
  date: string;
}

export function InventorySheet({ session, isReadOnly, date }: InventorySheetProps) {
  const items = session.daily_inventory_entries || [];

  // Group into GRILLED STOCK, PORTION STOCK, PER CASES, and OTHER
  const { grilledItems, portionItems, caseItems, otherItems } = useMemo(() => {
    const list = session.daily_inventory_entries || [];
    const grilledItems: DailyEntry[] = [];
    const portionItems: DailyEntry[] = [];
    const caseItems: DailyEntry[] = [];
    const otherItems: DailyEntry[] = [];

    list.forEach(item => {
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
  }, [session.daily_inventory_entries]);

  const renderTable = (tableItems: DailyEntry[], title: string, colorClass = 'text-blue-800') => {
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
          <span className="text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full border border-border">
            {tableItems.length} items
          </span>
        </div>
        <div className="bg-card rounded-xl shadow-xs border border-border overflow-hidden">
          <div className="table-slider-container max-h-[550px] relative overscroll-contain">
            <Table className="w-full text-left border-collapse">
              <TableHeader className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs shadow-2xs">
                {/* Visual Grouping Super-Header */}
                <TableRow className="border-b border-border/80 text-[10px] uppercase font-bold tracking-wider">
                  <TableHead colSpan={2} className="sticky left-0 z-30 bg-muted border-r border-border min-w-[220px] py-1.5 px-3 text-muted-foreground">
                    Item Identification
                  </TableHead>
                  <TableHead className="text-center py-1.5 px-2 bg-muted/70 text-muted-foreground border-r border-border/60">
                    Beginning
                  </TableHead>
                  <TableHead colSpan={2} className="text-center py-1.5 px-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-r border-border/60">
                    Stock In
                  </TableHead>
                  <TableHead colSpan={2} className="text-center py-1.5 px-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-r border-border/60">
                    Daily Sales
                  </TableHead>
                  <TableHead className="text-center py-1.5 px-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    Ending
                  </TableHead>
                </TableRow>
                {/* Column Detail Sub-Header */}
                <TableRow className="border-b border-border text-xs">
                  <TableHead className="w-12 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider sticky left-0 z-30 bg-muted border-r border-border">#</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider sticky left-12 z-30 bg-muted border-r border-border min-w-[180px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">ITEM</TableHead>
                  <TableHead className="text-center w-24 text-xs font-bold text-muted-foreground uppercase tracking-wider bg-muted/40 border-r border-border/60">BEG</TableHead>
                  <TableHead className="text-center w-24 text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider bg-blue-500/5">ADD</TableHead>
                  <TableHead className="text-center w-32 text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider bg-blue-500/15 border-r border-border/60">TOTAL</TableHead>
                  <TableHead className="text-center w-24 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider bg-amber-500/5">SALES AM</TableHead>
                  <TableHead className="text-center w-24 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider bg-amber-500/5 border-r border-border/60">SALES PM</TableHead>
                  <TableHead className="text-center w-32 text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider bg-emerald-500/15">ENDING</TableHead>
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
              <TableBody className="sticky bottom-0 z-20 bg-muted border-t-2 border-border shadow-[0_-2px_4px_-1px_rgba(0,0,0,0.05)]">
                <TableRow className="hover:bg-muted font-bold">
                  <TableCell className="sticky left-0 z-30 bg-muted text-center font-bold text-xs text-muted-foreground border-r border-border">Σ</TableCell>
                  <TableCell className="sticky left-12 z-30 bg-muted border-r border-border text-left text-foreground uppercase tracking-wider text-xs font-black shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                    TOTAL {title}
                  </TableCell>
                  <TableCell className="text-center text-foreground font-mono font-bold text-xs bg-muted/40 border-r border-border/60">{totals.beg}</TableCell>
                  <TableCell className="text-center text-foreground font-mono font-bold text-xs bg-blue-500/5">{totals.add}</TableCell>
                  <TableCell className="text-center text-primary bg-blue-500/15 font-mono font-black text-xs border-r border-border/60">{totals.total}</TableCell>
                  <TableCell className="text-center text-foreground font-mono font-bold text-xs bg-amber-500/5">{totals.am}</TableCell>
                  <TableCell className="text-center text-foreground font-mono font-bold text-xs bg-amber-500/5 border-r border-border/60">{totals.pm}</TableCell>
                  <TableCell className="text-center text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 font-mono font-black text-xs">{totals.end}</TableCell>
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
      {renderTable(grilledItems, 'GRILLED STOCK', 'text-amber-500')}
      {renderTable(portionItems, 'PORTION STOCK', 'text-blue-500')}
      {renderTable(caseItems, 'PER CASES', 'text-emerald-500')}
      {renderTable(otherItems, 'OTHER SUPPLIES', 'text-muted-foreground')}
      
      {items.length === 0 && (
        <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-border border-dashed">
          No active items found for this date. Ensure items exist in catalog.
        </div>
      )}
    </div>
  );
}
