import { useState, useMemo, useRef } from 'react';
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
import { useCreateItem } from '@/features/inventory/hooks/useCreateItem';
import type { InventoryItem } from '@/features/inventory/types';
import { getStationMeta, allocateStationIcon } from '../utils/stationIcons';
import { 
  MoveHorizontal, 
  Plus, 
  Loader2, 
  AlertCircle,
  Trash2,
  ArrowRightLeft,
  ClipboardList,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

type DailyEntry = DailyInventorySessionWithEntries['daily_inventory_entries'][number];

interface InventorySheetProps {
  session: DailyInventorySessionWithEntries;
  isReadOnly: boolean;
  date: string;
  isCorrectionMode?: boolean;
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

export function InventorySheet({ session, isReadOnly, date, isCorrectionMode }: InventorySheetProps) {
  const queryClient = useQueryClient();
  const { createItemWithStock } = useCreateItem();

  // Station navigation scroll container ref & wheel handler
  const pillsContainerRef = useRef<HTMLDivElement>(null);
  const handlePillsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (pillsContainerRef.current) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        pillsContainerRef.current.scrollLeft += e.deltaY;
      }
    }
  };

  // Add Station Dialog State
  const [isAddStationOpen, setIsAddStationOpen] = useState(false);
  const [newStationName, setNewStationName] = useState('');
  const [stationError, setStationError] = useState<string | null>(null);

  // Add Item Dialog State (for creating new item)
  const [itemModalStation, setItemModalStation] = useState<{ id: string; name: string } | null>(null);
  const [isSubmittingItem, setIsSubmittingItem] = useState(false);

  // Delete Station Dialog State
  const [stationToDelete, setStationToDelete] = useState<StationGroup | null>(null);
  const [isDeletingStation, setIsDeletingStation] = useState(false);

  // Reassign Item Destination Table Dialog State
  const [reassignItem, setReassignItem] = useState<DailyEntry | null>(null);
  const [targetStationId, setTargetStationId] = useState<string>('');
  const [isReassigning, setIsReassigning] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);

  // Remove Item from Sheet State
  const [itemToRemove, setItemToRemove] = useState<DailyEntry | null>(null);
  const [isRemovingFromSheet, setIsRemovingFromSheet] = useState(false);

  // Add Item to Other Supplies Dialog State
  const [isAddOtherSupplyOpen, setIsAddOtherSupplyOpen] = useState(false);
  const [otherSupplySearch, setOtherSupplySearch] = useState('');
  const [isAddingExisting, setIsAddingExisting] = useState(false);
  const [addExistingError, setAddExistingError] = useState<string | null>(null);

  // Query master categories from DB
  const { data: dbCategories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (error) throw error;
      return (data || []) as { id: string; name: string; description?: string | null }[];
    }
  });

  // Query all catalog items for adding existing items to Other Supplies
  const { data: allCatalogItems = [] } = useQuery({
    queryKey: ['all-catalog-items-for-daily'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('id, name, unit, category_id, is_active')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: isAddOtherSupplyOpen
  });

  // Items currently on today's worksheet
  const existingSheetItemIds = useMemo(() => {
    return new Set(session.daily_inventory_entries?.map(e => e.item_id) || []);
  }, [session.daily_inventory_entries]);

  // Catalog items eligible to be added to Other Supplies
  const availableCatalogItems = useMemo(() => {
    return allCatalogItems.filter((item: any) => {
      if (existingSheetItemIds.has(item.id)) return false;
      if (!otherSupplySearch.trim()) return true;
      return item.name.toLowerCase().includes(otherSupplySearch.trim().toLowerCase());
    });
  }, [allCatalogItems, existingSheetItemIds, otherSupplySearch]);

  // Station Creation Mutation with automatic distinct icon allocation
  const addStationMutation = useMutation({
    mutationFn: async (name: string) => {
      setStationError(null);
      const trimmed = name.trim().toUpperCase();
      if (!trimmed) throw new Error('Station name cannot be empty');
      const allocatedIconKey = allocateStationIcon(dbCategories);
      const { error } = await supabase.from('categories').insert({ 
        name: trimmed,
        description: `ICON:${allocatedIconKey}|Station table created on ${new Date().toISOString()}`
      });
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

  // Delete Station Mutation (unlinks items and deletes from categories table)
  const deleteStationMutation = useMutation({
    mutationFn: async (station: StationGroup) => {
      setIsDeletingStation(true);
      try {
        // 1. Unlink items from this category so foreign key constraint ON DELETE RESTRICT doesn't fail
        const { error: unlinkError } = await supabase
          .from('inventory_items')
          .update({ category_id: null })
          .eq('category_id', station.id);
        if (unlinkError) throw unlinkError;

        // 2. Delete the category from categories table
        const { error: catDeleteError } = await supabase
          .from('categories')
          .delete()
          .eq('id', station.id);
        if (catDeleteError) throw catDeleteError;
      } finally {
        setIsDeletingStation(false);
      }
    },
    onSuccess: async (_data, variables) => {
      // Optimistically remove category from cache immediately for instant UI reaction
      queryClient.setQueryData(['categories'], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.filter((c: any) => c.id !== variables.id);
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
        queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.all }),
        queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.date(date) }),
        queryClient.invalidateQueries({ queryKey: ['daily-inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      ]);
      setStationToDelete(null);
      window.dispatchEvent(new CustomEvent('kuventory:show-toast', {
        detail: {
          id: `station-deleted-${Date.now()}`,
          type: 'SYSTEM',
          title: 'Station Table Deleted',
          message: 'The station table and its category were deleted.',
          is_read: false,
          created_at: new Date().toISOString()
        }
      }));
    },
    onError: (err: any) => {
      console.error('Failed to delete station:', err);
      alert(err.message || 'Failed to delete station table and category.');
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
    initialQty?: number,
    initialExpiryDate?: string
  ) => {
    setIsSubmittingItem(true);
    try {
      const quantity = Number(initialQty);
      const expiryDate = initialExpiryDate?.slice(0, 10);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('Opening stock must be greater than zero. No item was created.');
      }
      if (!expiryDate) {
        throw new Error('An expiration date is required. No item was created.');
      }
      await createItemWithStock({
        item_name: data.item_name,
        category_id: data.category_id,
        unit: data.unit,
        initial_quantity: quantity,
        expiry_date: expiryDate,
        item_code: data.item_code,
        description: data.description || '',
        unit_cost: data.unit_cost,
        min_quantity: data.min_qty,
        supplier_a: data.supplier_a || '',
        supplier_b: data.supplier_b || '',
        image_path: data.image_path,
      });
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

  // Reassign Item Destination Table Handler
  const handleConfirmReassign = async () => {
    if (!reassignItem || !targetStationId) return;
    setIsReassigning(true);
    setReassignError(null);
    try {
      const targetCat = dbCategories.find(c => c.id === targetStationId);
      const targetName = targetCat?.name || 'Selected Station';
      const { error } = await supabase
        .from('inventory_items')
        .update({ category_id: targetStationId })
        .eq('id', reassignItem.item_id);
      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.date(date) }),
        queryClient.invalidateQueries({ queryKey: ['daily-inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['categories'] })
      ]);

      window.dispatchEvent(new CustomEvent('kuventory:show-toast', {
        detail: {
          id: `reassigned-${Date.now()}`,
          type: 'SYSTEM',
          title: 'Item Destination Reassigned',
          message: `"${reassignItem.items?.item_name || 'Item'}" was reassigned to ${targetName}.`,
          is_read: false,
          created_at: new Date().toISOString()
        }
      }));

      setReassignItem(null);
      setTargetStationId('');
    } catch (err: any) {
      console.error('Failed to reassign destination table:', err);
      setReassignError(err.message || 'Failed to reassign destination table.');
    } finally {
      setIsReassigning(false);
    }
  };

  // Remove Item from Sheet Handler
  const handleConfirmRemoveFromSheet = async () => {
    if (!itemToRemove) return;
    setIsRemovingFromSheet(true);
    try {
      const { error } = await supabase
        .from('daily_inventory_items')
        .delete()
        .eq('id', itemToRemove.id);
      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.date(date) }),
        queryClient.invalidateQueries({ queryKey: ['daily-inventory'] })
      ]);

      window.dispatchEvent(new CustomEvent('kuventory:show-toast', {
        detail: {
          id: `removed-from-sheet-${Date.now()}`,
          type: 'SYSTEM',
          title: 'Item Removed from Worksheet',
          message: `"${itemToRemove.items?.item_name || 'Item'}" was removed from today's worksheet. (Catalog item preserved).`,
          is_read: false,
          created_at: new Date().toISOString()
        }
      }));
      setItemToRemove(null);
    } catch (err: any) {
      console.error('Failed to remove item from sheet:', err);
      alert(err.message || 'Failed to remove item from worksheet.');
    } finally {
      setIsRemovingFromSheet(false);
    }
  };

  // Add Existing Item to Other Supplies Handler
  const handleAddExistingItem = async (catalogItem: any) => {
    setIsAddingExisting(true);
    setAddExistingError(null);
    try {
      // 1. Get current physical stock for this item
      const { data: batchData } = await supabase
        .from('stock_batches')
        .select('quantity')
        .eq('item_id', catalogItem.id);
      const currentStock = (batchData || []).reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);

      // 2. Insert into daily_inventory_items
      const { error: insertError } = await supabase
        .from('daily_inventory_items')
        .insert({
          daily_inventory_id: session.id,
          item_id: catalogItem.id,
          beg: currentStock,
          add: 0,
          am: 0,
          pm: 0,
          ending: currentStock
        });
      if (insertError) throw insertError;

      // 3. Ensure category_id is set to null so it belongs to Other Supplies
      if (catalogItem.category_id) {
        await supabase
          .from('inventory_items')
          .update({ category_id: null })
          .eq('id', catalogItem.id);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.date(date) }),
        queryClient.invalidateQueries({ queryKey: ['daily-inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['categories'] })
      ]);

      window.dispatchEvent(new CustomEvent('kuventory:show-toast', {
        detail: {
          id: `added-to-sheet-${Date.now()}`,
          type: 'SYSTEM',
          title: 'Item Added to Other Supplies',
          message: `"${catalogItem.name}" was added to Other Supplies with ${currentStock} ${catalogItem.unit} beginning stock.`,
          is_read: false,
          created_at: new Date().toISOString()
        }
      }));

      setIsAddOtherSupplyOpen(false);
      setOtherSupplySearch('');
    } catch (err: any) {
      console.error('Failed to add existing item:', err);
      setAddExistingError(err.message || 'Failed to add item to worksheet');
    } finally {
      setIsAddingExisting(false);
    }
  };

  // Dynamically group items into stations based on categories and worksheet entries
  const { stations, totalItems } = useMemo(() => {
    const rawEntries = session.daily_inventory_entries || [];
    const usedCategoryIds = new Set<string>();
    const stationGroups: StationGroup[] = [];

    // 1. First, create station groups for all database categories with persistent distinct icons
    dbCategories.forEach((cat) => {
      usedCategoryIds.add(cat.id);
      const catUpper = cat.name.toUpperCase();
      const meta = getStationMeta(cat);

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

    // 3. Always include OTHER SUPPLIES station group so users can access and manage other supplies
    stationGroups.push({
      id: 'unassigned-other',
      name: 'OTHER SUPPLIES',
      sectionId: 'section-unassigned',
      items: unassignedItems,
      ...getStationMeta('OTHER SUPPLIES')
    });

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
    const isOtherSupplies = station.id === 'unassigned-other';

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
              {tableItems.length} items
            </span>
            {!isReadOnly && !isOtherSupplies && (
              <>
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
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setStationToDelete(station)}
                  className="h-6 px-2 text-[11px] font-bold text-rose-500/80 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer rounded-md transition-colors"
                  title={`Delete ${station.name} table and its category`}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Delete Table
                </Button>
              </>
            )}
            {!isReadOnly && isOtherSupplies && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setIsAddOtherSupplyOpen(true)}
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
            <div className="table-slider-container max-h-145 relative overscroll-contain overflow-x-auto">
              <Table className="w-full text-left border-collapse min-w-190">
                <TableHeader className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs shadow-2xs">
                  {/* Visual Grouping Super-Header */}
                  <TableRow className="border-b border-border/80 text-[10px] uppercase font-bold tracking-wider">
                    <TableHead colSpan={2} className="sticky left-0 z-30 bg-muted border-r border-border min-w-50 sm:min-w-55 py-1.5 px-3 text-muted-foreground">
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
                    <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider sticky left-10 sm:left-12 z-30 bg-muted border-r border-border min-w-37.5 sm:min-w-45 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">ITEM</TableHead>
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
                      isCorrectionMode={isCorrectionMode}
                      onReassign={!isReadOnly ? (it) => { 
                        setReassignItem(it); 
                        setTargetStationId(dbCategories[0]?.id || ''); 
                      } : undefined}
                      onRemoveFromSheet={!isReadOnly ? (it) => setItemToRemove(it) : undefined}
                    />
                  ))}
                </TableBody>
                {/* Grand Total Row */}
                <TableBody className="sticky bottom-0 z-20 bg-muted border-t-2 border-border shadow-[0_-2px_4px_-1px_rgba(0,0,0,0.05)]">
                  <TableRow className="hover:bg-muted font-bold">
                    <TableCell className="sticky left-0 z-30 bg-muted text-center font-bold text-xs text-muted-foreground border-r border-border">Σ</TableCell>
                    <TableCell className="sticky left-10 sm:left-12 z-30 bg-muted border-r border-border text-left text-foreground uppercase tracking-wider text-xs font-black shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] truncate max-w-45">
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
                No items currently assigned to this table.
              </p>
            </div>
            {!isReadOnly && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (isOtherSupplies) {
                    setIsAddOtherSupplyOpen(true);
                  } else {
                    setItemModalStation({ id: station.id, name: station.name });
                  }
                }}
                className="text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Item to {station.name}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Quick Navigation Pills Header */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border/80">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 relative group">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0 rounded-full border-border/80 text-muted-foreground hover:text-foreground hidden sm:flex cursor-pointer shadow-2xs hover:bg-muted/60"
            onClick={() => pillsContainerRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}
            title="Scroll left"
            aria-label="Scroll stations left"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>

          <div
            ref={pillsContainerRef}
            onWheel={handlePillsWheel}
            className="flex items-center gap-2 overflow-x-auto py-1 scroll-smooth flex-1 no-scrollbar select-none"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {stations.map(station => {
              const Icon = station.icon;
              return (
                <button
                  key={station.id}
                  type="button"
                  onClick={() => scrollToSection(station.sectionId)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all shrink-0 cursor-pointer shadow-2xs hover:scale-[1.02] active:scale-[0.98] ${station.pillClass}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="whitespace-nowrap">{station.name}</span>
                  <span className="text-[10px] opacity-75 font-mono">({station.items.length})</span>
                </button>
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0 rounded-full border-border/80 text-muted-foreground hover:text-foreground hidden sm:flex cursor-pointer shadow-2xs hover:bg-muted/60"
            onClick={() => pillsContainerRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
            title="Scroll right"
            aria-label="Scroll stations right"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {!isReadOnly && (
          <Button
            type="button"
            size="sm"
            onClick={() => setIsAddStationOpen(true)}
            className="h-8 text-xs font-bold shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer shadow-xs ml-2"
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
              Create a new category station. A dedicated table with a distinct icon will be automatically assigned and saved.
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

      {/* Delete Station & Category Confirmation Dialog */}
      <Dialog open={!!stationToDelete} onOpenChange={(open) => !open && setStationToDelete(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-500" />
              Delete Station Table & Category
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm pt-2">
              Are you sure you want to delete the <strong className="text-foreground">{stationToDelete?.name}</strong> table?
              This will automatically remove the category from the system so you don't need to visit the Categories page.
              {stationToDelete && stationToDelete.items.length > 0 && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400 font-medium">
                  Notice: {stationToDelete.items.length} item(s) in this station will be unlinked from this category.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStationToDelete(null)}
              disabled={isDeletingStation}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => stationToDelete && deleteStationMutation.mutate(stationToDelete)}
              disabled={isDeletingStation}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
            >
              {isDeletingStation ? 'Deleting...' : 'Delete Table & Category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign Destination Table Dialog */}
      <Dialog open={!!reassignItem} onOpenChange={(open) => !open && setReassignItem(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-primary" />
              Reassign Destination Table
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Move <strong className="text-foreground">{reassignItem?.items?.item_name}</strong> to an active Daily Inventory table.
              Its stock quantities, batches, and records will be preserved.
            </DialogDescription>
          </DialogHeader>

          {reassignError && (
            <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/20 text-destructive text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{reassignError}</span>
            </div>
          )}

          <div className="space-y-3 py-2">
            <label className="text-xs font-bold text-foreground">
              Select Destination Station / Table *
            </label>
            <select
              value={targetStationId}
              onChange={(e) => setTargetStationId(e.target.value)}
              className="w-full h-10 px-3 py-2 bg-background border border-input rounded-md text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="" disabled>Choose target station...</option>
              {dbCategories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReassignItem(null)}
              disabled={isReassigning}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!targetStationId || isReassigning}
              onClick={handleConfirmReassign}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
            >
              {isReassigning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Moving...</> : 'Move to Destination Table'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove from Sheet Confirmation Dialog */}
      <Dialog open={!!itemToRemove} onOpenChange={(open) => !open && setItemToRemove(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-500" />
              Remove Item from Worksheet
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm pt-2">
              Remove <strong className="text-foreground">{itemToRemove?.items?.item_name}</strong> from today's daily inventory worksheet?
              <span className="block mt-2 text-xs text-muted-foreground">
                Note: This only removes the item from today's worksheet. The catalog item, its stock batches, and history remain safely in your inventory catalog.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setItemToRemove(null)}
              disabled={isRemovingFromSheet}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmRemoveFromSheet}
              disabled={isRemovingFromSheet}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
            >
              {isRemovingFromSheet ? 'Removing...' : 'Remove from Worksheet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item to Other Supplies Dialog */}
      <Dialog open={isAddOtherSupplyOpen} onOpenChange={setIsAddOtherSupplyOpen}>
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2 text-lg">
              <ClipboardList className="w-5 h-5 text-primary" />
              Add Item to Other Supplies
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Add an existing catalog item to Other Supplies, or register a brand-new item.
            </DialogDescription>
          </DialogHeader>

          {addExistingError && (
            <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/20 text-destructive text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{addExistingError}</span>
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search catalog items..."
                  value={otherSupplySearch}
                  onChange={(e) => setOtherSupplySearch(e.target.value)}
                  className="pl-9 bg-background h-9 text-xs border-border"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsAddOtherSupplyOpen(false);
                  setItemModalStation({ id: '', name: 'OTHER SUPPLIES' });
                }}
                className="h-9 text-xs font-bold border-dashed shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Create New Item
              </Button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {availableCatalogItems.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  {otherSupplySearch ? 'No matching items found.' : 'All catalog items are already added to this worksheet.'}
                </div>
              ) : (
                availableCatalogItems.map((catItem: any) => (
                  <div 
                    key={catItem.id} 
                    className="p-2.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-foreground truncate">{catItem.name}</div>
                      <div className="text-[11px] text-muted-foreground">{catItem.unit}</div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isAddingExisting}
                      onClick={() => handleAddExistingItem(catItem)}
                      className="h-7 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
                    >
                      Add
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddOtherSupplyOpen(false);
                setOtherSupplySearch('');
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item to Specific Station Modal (Creates new item) */}
      {itemModalStation && (
        <ItemFormModal
          defaultCategoryId={itemModalStation.id || undefined}
          onClose={() => setItemModalStation(null)}
          onSubmit={handleCreateItemForStation}
          isSubmitting={isSubmittingItem}
        />
      )}
    </div>
  );
}
