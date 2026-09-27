import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { DailyInventorySessionWithEntries } from '../api';
import { dailyInventoryKeys } from '../hooks/useDailyInventory';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { InventoryRow } from './InventoryRow';
import { ItemFormModal } from '@/features/inventory/components/ItemFormModal';
import { createItem } from '@/features/inventory/api';
import { useStockMutations } from '@/features/inventory/hooks/useStockMutations';
import type { InventoryItem } from '@/features/inventory/types';
import { 
  Flame, 
  UtensilsCrossed, 
  PackageOpen, 
  ClipboardList, 
  MoveHorizontal, 
  Plus, 
  Coffee, 
  Wine, 
  Cookie, 
  Sparkles, 
  Layers, 
  Tag, 
  Loader2, 
  AlertCircle 
} from 'lucide-react';

type DailyEntry = DailyInventorySessionWithEntries['daily_inventory_entries'][number];

interface InventorySheetProps {
  session: DailyInventorySessionWithEntries;
  isReadOnly: boolean;
  date: string;
}

interface StationGroup {
  id: string;
  name: string;
  sectionId: string;
  items: DailyEntry[];
  icon: any;
  colorClass: string;
  pillClass: string;
  badgeClass: string;
}

function getStationMeta(name: string, index: number) {
  const upper = name.toUpperCase();
  if (upper.includes('GRILL')) {
    return {
      icon: Flame,
      colorClass: 'text-amber-600 dark:text-amber-400',
      pillClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20',
      badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    };
  }
  if (upper.includes('CASE')) {
    return {
      icon: PackageOpen,
      colorClass: 'text-emerald-600 dark:text-emerald-400',
      pillClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    };
  }
  if (upper.includes('PORTION')) {
    return {
      icon: UtensilsCrossed,
      colorClass: 'text-blue-600 dark:text-blue-400',
      pillClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20',
      badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
    };
  }
  if (upper.includes('BOTTLE')) {
    return {
      icon: Wine,
      colorClass: 'text-cyan-600 dark:text-cyan-400',
      pillClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/20',
      badgeClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20'
    };
  }
  if (upper.includes('BEVERAGE') || upper.includes('DRINK')) {
    return {
      icon: Coffee,
      colorClass: 'text-purple-600 dark:text-purple-400',
      pillClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 hover:bg-purple-500/20',
      badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
    };
  }
  if (upper.includes('SNACK')) {
    return {
      icon: Cookie,
      colorClass: 'text-orange-600 dark:text-orange-400',
      pillClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 hover:bg-orange-500/20',
      badgeClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
    };
  }
  // Curated fallbacks
  const fallbacks = [
    {
      icon: Layers,
      colorClass: 'text-indigo-600 dark:text-indigo-400',
      pillClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20',
      badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
    },
    {
      icon: Sparkles,
      colorClass: 'text-rose-600 dark:text-rose-400',
      pillClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/20',
      badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
    },
    {
      icon: Tag,
      colorClass: 'text-teal-600 dark:text-teal-400',
      pillClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20 hover:bg-teal-500/20',
      badgeClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20'
    },
    {
      icon: ClipboardList,
      colorClass: 'text-muted-foreground',
      pillClass: 'bg-muted text-muted-foreground border-border hover:bg-muted/80',
      badgeClass: 'bg-muted text-muted-foreground border-border'
    }
  ];
  return fallbacks[index % fallbacks.length];
}

export function InventorySheet({ session, isReadOnly, date }: InventorySheetProps) {
  const queryClient = useQueryClient();
  const { add } = useStockMutations();

  // Add Station Dialog State
  const [isAddStationOpen, setIsAddStationOpen] = useState(false);
  const [newStationName, setNewStationName] = useState('');
  const [stationError, setStationError] = useState<string | null>(null);

  // Add Item Dialog State
  const [itemModalStation, setItemModalStation] = useState<{ id: string; name: string } | null>(null);
  const [isSubmittingItem, setIsSubmittingItem] = useState(false);

  // Query master categories from DB
  const { data: dbCategories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (error) throw error;
      return (data || []) as { id: string; name: string; description?: string | null }[];
    }
  });

  // Station Creation Mutation
  const addStationMutation = useMutation({
    mutationFn: async (name: string) => {
      setStationError(null);
      const trimmed = name.trim().toUpperCase();
      if (!trimmed) throw new Error('Station name cannot be empty');
      const { error } = await supabase.from('categories').insert({ name: trimmed });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      await queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.date(date) });
      setIsAddStationOpen(false);
      setNewStationName('');
      setStationError(null);
    },
    onError: (err: any) => {
      setStationError(err.message || 'Failed to create station table');
    }
  });

  const handleCreateStation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStationName.trim()) return;
    addStationMutation.mutate(newStationName);
  };

  // Item Creation Handler for this station
  const handleCreateItemForStation = async (
    data: Omit<InventoryItem, 'id' | 'is_archived' | 'created_at' | 'updated_at' | 'current_qty'>,
    initialQty?: number
  ) => {
    setIsSubmittingItem(true);
    try {
      const newItem = await createItem(data);
      if (initialQty && initialQty > 0) {
        await add.mutateAsync({
          itemId: newItem.id,
          quantity: initialQty,
          reason: 'Initial Opening Stock Balance'
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      await queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.date(date) });
      setItemModalStation(null);
    } catch (err: any) {
      console.error('Failed to create item for station:', err);
      throw err;
    } finally {
      setIsSubmittingItem(false);
    }
  };

  // Dynamically group items into stations based on categories and worksheet entries
  const { stations, totalItems } = useMemo(() => {
    const rawEntries = session.daily_inventory_entries || [];
    const usedCategoryIds = new Set<string>();
    const stationGroups: StationGroup[] = [];

    // 1. First, create station groups for all database categories
    dbCategories.forEach((cat, index) => {
      usedCategoryIds.add(cat.id);
      const catUpper = cat.name.toUpperCase();
      const meta = getStationMeta(cat.name, index);

      // Find all entries matching this category (by id or name)
      const matched = rawEntries.filter(entry => {
        const entryCatId = entry.category_id || entry.items?.categories?.id;
        if (entryCatId && entryCatId === cat.id) return true;
        const entrySec = (entry.section || entry.category_name || entry.items?.categories?.name || '').toUpperCase();
        return entrySec === catUpper;
      });

      stationGroups.push({
        id: cat.id,
        name: cat.name,
        sectionId: `section-${cat.id}`,
        items: matched,
        ...meta
      });
    });

    // 2. Capture any entries that might belong to unknown/unassigned categories
    const unassignedItems = rawEntries.filter(entry => {
      const entryCatId = entry.category_id || entry.items?.categories?.id;
      if (entryCatId && usedCategoryIds.has(entryCatId)) return false;
      const entrySec = (entry.section || entry.category_name || entry.items?.categories?.name || '').toUpperCase();
      return !dbCategories.some(c => c.name.toUpperCase() === entrySec);
    });

    if (unassignedItems.length > 0) {
      stationGroups.push({
        id: 'unassigned-other',
        name: 'OTHER SUPPLIES',
        sectionId: 'section-unassigned',
        items: unassignedItems,
        icon: ClipboardList,
        colorClass: 'text-muted-foreground',
        pillClass: 'bg-muted text-muted-foreground border-border hover:bg-muted/80',
        badgeClass: 'bg-muted text-muted-foreground border-border'
      });
    }

    return {
      stations: stationGroups,
      totalItems: rawEntries.length
    };
  }, [session.daily_inventory_entries, dbCategories]);

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const renderStationTable = (station: StationGroup) => {
    const tableItems = station.items;

    // Calculate totals for this station
    const totals = tableItems.reduce((acc, item) => ({
      beg: acc.beg + item.beginning_qty,
      add: acc.add + item.add_qty,
      total: acc.total + item.total_stock,
      am: acc.am + item.sales_am,
      pm: acc.pm + item.sales_pm,
      end: acc.end + item.ending_qty
    }), { beg: 0, add: 0, total: 0, am: 0, pm: 0, end: 0 });

    const Icon = station.icon;

    return (
      <div key={station.id} id={station.sectionId} className="mb-8 scroll-mt-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2.5 px-1 gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`p-1.5 rounded-lg ${station.pillClass.split(' ')[0]} ${station.colorClass}`}>
              <Icon className="w-4 h-4" />
            </div>
            <h2 className={`text-sm font-black uppercase tracking-wider ${station.colorClass}`}>
              {station.name}
            </h2>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${station.badgeClass}`}>
              {tableItems.length} SKUs
            </span>
            {!isReadOnly && station.id !== 'unassigned-other' && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setItemModalStation({ id: station.id, name: station.name })}
                className="h-6 px-2 text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/80 cursor-pointer rounded-md"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Item
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <MoveHorizontal className="w-3.5 h-3.5 md:hidden text-muted-foreground animate-pulse shrink-0" />
            <span className="md:hidden">Swipe table horizontally to enter sales</span>
          </div>
        </div>

        {tableItems.length > 0 ? (
          <div className="bg-card rounded-xl shadow-xs border border-border overflow-hidden">
            <div className="table-slider-container max-h-[580px] relative overscroll-contain overflow-x-auto">
              <Table className="w-full text-left border-collapse min-w-[760px]">
                <TableHeader className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs shadow-2xs">
                  {/* Visual Grouping Super-Header */}
                  <TableRow className="border-b border-border/80 text-[10px] uppercase font-bold tracking-wider">
                    <TableHead colSpan={2} className="sticky left-0 z-30 bg-muted border-r border-border min-w-[200px] sm:min-w-[220px] py-1.5 px-3 text-muted-foreground">
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
                    <TableHead className="w-10 sm:w-12 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider sticky left-0 z-30 bg-muted border-r border-border">#</TableHead>
                    <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider sticky left-10 sm:left-12 z-30 bg-muted border-r border-border min-w-[150px] sm:min-w-[180px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">ITEM</TableHead>
                    <TableHead className="text-center w-20 sm:w-24 text-xs font-bold text-muted-foreground uppercase tracking-wider bg-muted/40 border-r border-border/60">BEG</TableHead>
                    <TableHead className="text-center w-20 sm:w-24 text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider bg-blue-500/5">ADD</TableHead>
                    <TableHead className="text-center w-24 sm:w-28 text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider bg-blue-500/15 border-r border-border/60">TOTAL</TableHead>
                    <TableHead className="text-center w-20 sm:w-24 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider bg-amber-500/5">SALES AM</TableHead>
                    <TableHead className="text-center w-20 sm:w-24 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider bg-amber-500/5 border-r border-border/60">SALES PM</TableHead>
                    <TableHead className="text-center w-24 sm:w-28 text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider bg-emerald-500/15">ENDING</TableHead>
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
                    <TableCell className="sticky left-10 sm:left-12 z-30 bg-muted border-r border-border text-left text-foreground uppercase tracking-wider text-xs font-black shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] truncate max-w-[180px]">
                      TOTAL {station.name}
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
        ) : (
          <div className="bg-card rounded-xl shadow-xs border border-border border-dashed p-6 text-center space-y-3">
            <div className={`inline-flex p-3 rounded-xl ${station.pillClass.split(' ')[0]} ${station.colorClass}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">{station.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-md mx-auto">
                No active items currently assigned to this station. Add items to track beginning stock, daily deliveries, and shift sales.
              </p>
            </div>
            {!isReadOnly && station.id !== 'unassigned-other' && (
              <Button 
                type="button"
                size="sm" 
                onClick={() => setItemModalStation({ id: station.id, name: station.name })}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-8 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add First Item to {station.name}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Station Quick-Jump Pills & Add Station Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-border/60">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar flex-1">
          <span className="text-xs font-bold text-muted-foreground shrink-0 uppercase tracking-wider mr-1">
            Stations:
          </span>
          {stations.map(station => {
            const Icon = station.icon;
            return (
              <button
                key={station.id}
                type="button"
                onClick={() => scrollToSection(station.sectionId)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0 cursor-pointer shadow-2xs ${station.pillClass}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {station.name} ({station.items.length})
              </button>
            );
          })}
        </div>

        {!isReadOnly && (
          <Button
            type="button"
            size="sm"
            onClick={() => setIsAddStationOpen(true)}
            className="h-8 text-xs font-bold shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Station / Table
          </Button>
        )}
      </div>

      {/* Render Table for each Station Category */}
      {stations.map(station => renderStationTable(station))}

      {totalItems === 0 && stations.length === 0 && (
        <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-border border-dashed">
          No stations or items found. Click "Add Station / Table" to create your first station!
        </div>
      )}

      {/* Add New Station / Category Modal */}
      <Dialog open={isAddStationOpen} onOpenChange={setIsAddStationOpen}>
        <DialogContent className="bg-card text-card-foreground border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2 text-lg">
              <Plus className="w-5 h-5 text-primary" />
              Add New Station / Table
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Create a new category station. A dedicated table will be added immediately to this Daily Inventory Worksheet and in all reports.
            </DialogDescription>
          </DialogHeader>

          {stationError && (
            <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/20 text-destructive text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{stationError}</span>
            </div>
          )}

          <form onSubmit={handleCreateStation} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="station-name-input" className="text-xs font-bold text-foreground">
                Station / Category Name *
              </label>
              <Input
                id="station-name-input"
                autoFocus
                type="text"
                placeholder="e.g. BEVERAGES, DESSERTS, SEAFOOD, PER BOTTLE"
                value={newStationName}
                onChange={e => setNewStationName(e.target.value)}
                className="bg-background text-foreground h-10 border-border"
                required
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAddStationOpen(false);
                  setNewStationName('');
                  setStationError(null);
                }}
                disabled={addStationMutation.isPending}
                className="border-border text-foreground"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!newStationName.trim() || addStationMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
              >
                {addStationMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</>
                ) : (
                  'Create Station Table'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Item to Specific Station Modal */}
      {itemModalStation && (
        <ItemFormModal
          defaultCategoryId={itemModalStation.id}
          onClose={() => setItemModalStation(null)}
          onSubmit={handleCreateItemForStation}
          isSubmitting={isSubmittingItem}
        />
      )}
    </div>
  );
}
