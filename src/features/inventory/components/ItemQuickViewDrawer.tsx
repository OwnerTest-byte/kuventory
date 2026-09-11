import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, 
  Package, 
  ExternalLink, 
  Edit2, 
  RefreshCw, 
  AlertTriangle, 
  Building2, 
  Tag, 
  Coins, 
  Layers 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { InventoryItem, InventoryStock } from '../types';

interface ItemQuickViewDrawerProps {
  item: InventoryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStock?: (item: InventoryStock) => void;
  onEdit?: (item: InventoryItem) => void;
}

export function ItemQuickViewDrawer({
  item,
  isOpen,
  onClose,
  onUpdateStock,
  onEdit
}: ItemQuickViewDrawerProps) {
  const navigate = useNavigate();

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const currentQty = Number(item.current_qty) || 0;
  const minQty = Number(item.min_qty) || 0;
  const isOutOfStock = currentQty <= 0;
  const isLowStock = !isOutOfStock && currentQty <= minQty;

  let statusLabel = 'In Stock';
  let statusBadgeStyle = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';

  if (item.is_archived) {
    statusLabel = 'Archived';
    statusBadgeStyle = 'bg-muted text-muted-foreground border-border';
  } else if (isOutOfStock) {
    statusLabel = 'Out of Stock';
    statusBadgeStyle = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
  } else if (isLowStock) {
    statusLabel = 'Low Stock';
    statusBadgeStyle = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      <div className="fixed inset-x-0 bottom-0 sm:inset-y-0 sm:right-0 sm:left-auto w-full sm:max-w-md bg-card border-t sm:border-t-0 sm:border-l border-border shadow-2xl flex flex-col max-h-[85vh] sm:max-h-full rounded-t-2xl sm:rounded-none z-50 animate-in slide-in-from-bottom sm:slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                {item.item_code}
              </span>
              <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-md border", statusBadgeStyle)}>
                {statusLabel}
              </span>
            </div>
            <h2 className="text-lg font-bold text-foreground mt-2 truncate" title={item.item_name}>
              {item.item_name}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {item.category_name || 'Uncategorized'} • {item.inventory_type || 'General'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border">
              <div className="text-[11px] font-medium text-muted-foreground uppercase flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-primary" /> Current Stock
              </div>
              <div className="text-2xl font-bold font-mono text-foreground mt-1">
                {currentQty} <span className="text-xs font-normal text-muted-foreground uppercase">{item.unit}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-muted/40 border border-border">
              <div className="text-[11px] font-medium text-muted-foreground uppercase flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Min Threshold
              </div>
              <div className="text-2xl font-bold font-mono text-foreground mt-1">
                {minQty} <span className="text-xs font-normal text-muted-foreground uppercase">{item.unit}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-muted/40 border border-border">
              <div className="text-[11px] font-medium text-muted-foreground uppercase flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-emerald-500" /> Unit Cost
              </div>
              <div className="text-xl font-bold font-mono text-foreground mt-1">
                ₱{Number(item.unit_cost || 0).toFixed(2)}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-muted/40 border border-border">
              <div className="text-[11px] font-medium text-muted-foreground uppercase flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-blue-500" /> Section
              </div>
              <div className="text-sm font-semibold text-foreground mt-1.5 truncate">
                {item.inventory_type || 'STANDARD'}
              </div>
            </div>
          </div>

          {/* Description */}
          {item.description && (
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Description / Notes
              </div>
              <p className="text-xs text-foreground leading-relaxed">
                {item.description}
              </p>
            </div>
          )}

          {/* Suppliers Information */}
          <div className="p-3.5 rounded-xl bg-muted/20 border border-border space-y-2.5">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-primary" /> Supplier Directory
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Primary Supplier (A):</span>
                <span className="font-semibold text-foreground">{item.supplier_a || 'None configured'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Secondary Supplier (B):</span>
                <span className="font-semibold text-foreground">{item.supplier_b || 'None configured'}</span>
              </div>
            </div>
          </div>

          {/* Operational Guidance */}
          <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 text-xs text-muted-foreground flex items-start gap-2.5">
            <Layers className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-foreground">Stock Deduction Protocol:</span>
              <p className="mt-0.5">
                Sales and usage deductions follow strict First-Expired, First-Out (FEFO) rules from active tracked batches.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Action Buttons */}
        <div className="p-4 border-t border-border bg-muted/30 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {!item.is_archived && onUpdateStock && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onUpdateStock(item as InventoryStock);
                }}
                className="h-9 text-xs font-semibold flex items-center justify-center gap-1.5 border-border hover:bg-muted"
              >
                <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                Update Stock
              </Button>
            )}

            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onEdit(item);
                }}
                className="h-9 text-xs font-semibold flex items-center justify-center gap-1.5 border-border hover:bg-muted"
              >
                <Edit2 className="w-3.5 h-3.5 text-amber-500" />
                Edit Item
              </Button>
            )}
          </div>

          <Button
            onClick={() => {
              onClose();
              navigate(`/items/${item.id}`);
            }}
            className="w-full h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Full Item Details Page
          </Button>
        </div>
      </div>
    </div>
  );
}
