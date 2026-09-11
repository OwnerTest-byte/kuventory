import { useMemo } from 'react';
import type { DailyInventorySessionWithEntries } from '../api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InventoryRow } from './InventoryRow';
import { Flame, UtensilsCrossed, PackageOpen, ClipboardList, MoveHorizontal } from 'lucide-react';

type DailyEntry = DailyInventorySessionWithEntries['daily_inventory_entries'][number];

interface InventorySheetProps {
  session: DailyInventorySessionWithEntries;
  isReadOnly: boolean;
  date: string;
}

export function InventorySheet({ session, isReadOnly, date }: InventorySheetProps) {
  // Group into GRILLED STOCK, PORTION STOCK, PER CASES, and OTHER
  const { grilledItems, portionItems, caseItems, otherItems, totalItems } = useMemo(() => {
    const items = session.daily_inventory_entries || [];
    const grilledItems: DailyEntry[] = [];
    const portionItems: DailyEntry[] = [];
    const caseItems: DailyEntry[] = [];
    const otherItems: DailyEntry[] = [];

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

    return { grilledItems, portionItems, caseItems, otherItems, totalItems: items.length };
  }, [session.daily_inventory_entries]);

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const renderTable = (tableItems: DailyEntry[], title: string, sectionId: string, colorClass = 'text-blue-600') => {
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
      <div id={sectionId} className="mb-8 scroll-mt-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2.5 px-1 gap-1">
          <div className="flex items-center gap-2">
            <h2 className={`text-sm font-black uppercase tracking-wider ${colorClass}`}>
              {title}
            </h2>
            <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
              {tableItems.length} SKUs
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <MoveHorizontal className="w-3.5 h-3.5 md:hidden text-muted-foreground animate-pulse" />
            <span className="md:hidden">Swipe table horizontally to enter sales</span>
          </div>
        </div>

        <div className="bg-card rounded-xl shadow-xs border border-border overflow-hidden">
          <div className="table-slider-container max-h-[580px] relative overscroll-contain overflow-x-auto">
            <Table className="w-full text-left border-collapse min-w-[760px]">
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
                  <TableHead className="text-center w-28 text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider bg-blue-500/15 border-r border-border/60">TOTAL</TableHead>
                  <TableHead className="text-center w-24 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider bg-amber-500/5">SALES AM</TableHead>
                  <TableHead className="text-center w-24 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider bg-amber-500/5 border-r border-border/60">SALES PM</TableHead>
                  <TableHead className="text-center w-28 text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider bg-emerald-500/15">ENDING</TableHead>
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
    <div className="space-y-6">
      {/* Station Quick-Jump Pills (Miller's Law & Fitts's Law) */}
      {totalItems > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
          <span className="text-xs font-bold text-muted-foreground shrink-0 uppercase tracking-wider mr-1">
            Stations:
          </span>
          {grilledItems.length > 0 && (
            <button
              type="button"
              onClick={() => scrollToSection('section-grilled')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all shrink-0 cursor-pointer shadow-2xs"
            >
              <Flame className="w-3.5 h-3.5" />
              Grilled Stock ({grilledItems.length})
            </button>
          )}
          {portionItems.length > 0 && (
            <button
              type="button"
              onClick={() => scrollToSection('section-portion')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all shrink-0 cursor-pointer shadow-2xs"
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              Portion Stock ({portionItems.length})
            </button>
          )}
          {caseItems.length > 0 && (
            <button
              type="button"
              onClick={() => scrollToSection('section-cases')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all shrink-0 cursor-pointer shadow-2xs"
            >
              <PackageOpen className="w-3.5 h-3.5" />
              Per Cases ({caseItems.length})
            </button>
          )}
          {otherItems.length > 0 && (
            <button
              type="button"
              onClick={() => scrollToSection('section-other')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-muted text-muted-foreground border border-border hover:bg-muted/80 transition-all shrink-0 cursor-pointer shadow-2xs"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Other Supplies ({otherItems.length})
            </button>
          )}
        </div>
      )}

      {renderTable(grilledItems, 'GRILLED STOCK', 'section-grilled', 'text-amber-600 dark:text-amber-400')}
      {renderTable(portionItems, 'PORTION STOCK', 'section-portion', 'text-blue-600 dark:text-blue-400')}
      {renderTable(caseItems, 'PER CASES', 'section-cases', 'text-emerald-600 dark:text-emerald-400')}
      {renderTable(otherItems, 'OTHER SUPPLIES', 'section-other', 'text-muted-foreground')}
      
      {totalItems === 0 && (
        <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-border border-dashed">
          No active items found for this date. Ensure items exist in catalog.
        </div>
      )}
    </div>
  );
}
