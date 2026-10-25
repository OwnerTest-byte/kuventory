import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ClipboardList, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  submitStaffChangeRequest,
  STAFF_REQUEST_TYPE_LABELS,
  type StaffChangeRequestType,
} from '../services/staffRequestService';

export interface StaffRequestContext {
  /** The worksheet entry being changed (REMOVE_FROM_SHEET / ADJUST source). */
  dailyInventoryItemId?: string;
  itemId?: string;
  itemName?: string;
  unit?: string;
  currentQuantity?: number;
  minQuantity?: number;
  currentCategoryId?: string;
  currentCategoryName?: string;
  categories?: Array<{ id: string; name: string }>;
  /** Pre-filled target for ADJUST_STOCK (e.g. the reorder point). */
  targetQuantityPreset?: number;
}

interface StaffRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestType: StaffChangeRequestType;
  context?: StaffRequestContext;
  onSuccess?: (message: string) => void;
}

/**
 * The STAFF-side entry point for every structural change. Type-aware fields
 * pre-filled from context, reason required, submits through the
 * review-pipeline RPC — the admin then Approves & Applies / Returns / Rejects.
 */
export function StaffRequestModal({ open, onOpenChange, requestType, context = {}, onSuccess }: StaffRequestModalProps) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [initialQuantity, setInitialQuantity] = useState('0');
  const [expiryDate, setExpiryDate] = useState('');
  const [minQuantity, setMinQuantity] = useState('0');
  const [targetQuantity, setTargetQuantity] = useState('');
  const [targetCategoryId, setTargetCategoryId] = useState('');
  const [changes, setChanges] = useState<{ name?: string; unit?: string; minQuantity?: string }>({});
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setErrorMessage(null);
      setSuccessMessage(null);
      setReason('');
      setName('');
      setUnit('');
      setCategoryId(context.currentCategoryId || '');
      setInitialQuantity('0');
      setExpiryDate('');
      setMinQuantity(String(context.minQuantity ?? 0));
      setTargetQuantity(String(context.targetQuantityPreset ?? context.currentQuantity ?? 0));
      setTargetCategoryId(context.currentCategoryId || '');
      setChanges({
        name: context.itemName || '',
        unit: context.unit || '',
        minQuantity: String(context.minQuantity ?? 0),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requestType]);

  const typeLabel = STAFF_REQUEST_TYPE_LABELS[requestType];

  const buildPayload = useMemo((): Record<string, any> => {
    const base = {
      // Human-readable context for the admin review cards (the RPC validates
      // the ids; names travel for display only).
      item_id: context.itemId,
      item_name: context.itemName,
    };
    switch (requestType) {
      case 'ADD_ITEM':
        return {
          name: name.trim(),
          unit: unit.trim(),
          category_id: categoryId || null,
          initial_quantity: Number(initialQuantity) || 0,
          expiry_date: (Number(initialQuantity) || 0) > 0 && expiryDate ? expiryDate : null,
          min_quantity: Number(minQuantity) || 0,
        };
      case 'EDIT_ITEM':
        return {
          ...base,
          changes: {
            ...(changes.name?.trim() && changes.name.trim() !== context.itemName ? { name: changes.name.trim() } : {}),
            ...(changes.unit?.trim() && changes.unit.trim() !== context.unit ? { unit: changes.unit.trim() } : {}),
            ...(changes.minQuantity !== undefined && Number(changes.minQuantity) !== Number(context.minQuantity ?? 0)
              ? { min_quantity: Number(changes.minQuantity) || 0 }
              : {}),
          },
        };
      case 'ARCHIVE_ITEM':
        return base;
      case 'ADJUST_STOCK':
        return {
          ...base,
          target_quantity: Number(targetQuantity) || 0,
          current_quantity: context.currentQuantity,
          reason: reason.trim(),
        };
      case 'REASSIGN_TABLE': {
        const target = (context.categories || []).find(c => c.id === targetCategoryId);
        return {
          ...base,
          target_category_id: targetCategoryId || null,
          target_category_name: target?.name,
          current_category_name: context.currentCategoryName,
        };
      }
      case 'ADD_CATEGORY':
        return { name: name.trim() };
      case 'REMOVE_FROM_SHEET':
        return { daily_inventory_item_id: context.dailyInventoryItemId, ...base };
      default:
        return {};
    }
  }, [requestType, name, unit, categoryId, initialQuantity, expiryDate, minQuantity, changes, targetQuantity, targetCategoryId, context, reason]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!reason.trim()) {
      setErrorMessage('Please explain why you are requesting this change — the administrator reviews the reason.');
      return;
    }
    if (requestType === 'EDIT_ITEM' && Object.keys(buildPayload.changes || {}).length === 0) {
      setErrorMessage('Change at least one field (name, unit, or minimum quantity) before submitting.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await submitStaffChangeRequest({ requestType, payload: buildPayload, reason });
      if (res.submitted) {
        setSuccessMessage(res.message);
        onSuccess?.(res.message);
        setTimeout(() => onOpenChange(false), 1600);
      } else {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'The request could not be submitted. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const showAddItemFields = requestType === 'ADD_ITEM';
  const showEditFields = requestType === 'EDIT_ITEM';
  const showAdjustFields = requestType === 'ADJUST_STOCK';
  const showReassignFields = requestType === 'REASSIGN_TABLE';
  const showStationName = requestType === 'ADD_CATEGORY';
  const showItemPreamble = requestType !== 'ADD_ITEM' && requestType !== 'ADD_CATEGORY';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md p-5 rounded-2xl bg-card border-border shadow-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="space-y-1 text-left border-b border-border/60 pb-3">
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
            <ClipboardList className="w-5 h-5 text-primary" />
            Request: {typeLabel}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {showItemPreamble && context.itemName
              ? `Item: ${context.itemName}${context.currentCategoryName ? ` · Station: ${context.currentCategoryName}` : ''}`
              : 'An administrator reviews every request before anything changes in the system.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 py-2 text-left" aria-label={`Staff Change Request: ${typeLabel}`}>
          {showAddItemFields && (
            <>
              <div className="space-y-1">
                <Label htmlFor="sr-name" className="text-xs font-bold">Item Name *</Label>
                <Input id="sr-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Salmon Fillet" required className="h-9 text-sm rounded-lg" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="sr-unit" className="text-xs font-bold">Unit *</Label>
                  <Input id="sr-unit" value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. kg, pcs" required className="h-9 text-sm rounded-lg" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sr-station" className="text-xs font-bold">Station</Label>
                  <select
                    id="sr-station"
                    value={categoryId}
                    onChange={e => setCategoryId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground"
                  >
                    <option value="">— Unassigned —</option>
                    {(context.categories || []).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="sr-initqty" className="text-xs font-bold">Initial Stock Qty</Label>
                  <Input id="sr-initqty" type="number" min="0" value={initialQuantity} onChange={e => setInitialQuantity(e.target.value)} className="h-9 text-sm rounded-lg" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sr-minqty" className="text-xs font-bold">Min Quantity (alert level)</Label>
                  <Input id="sr-minqty" type="number" min="0" value={minQuantity} onChange={e => setMinQuantity(e.target.value)} className="h-9 text-sm rounded-lg" />
                </div>
              </div>
              {Number(initialQuantity) > 0 && (
                <div className="space-y-1">
                  <Label htmlFor="sr-expiry" className="text-xs font-bold">Stock Expiry Date *</Label>
                  <Input id="sr-expiry" type="date" min={new Date().toISOString().slice(0, 10)} value={expiryDate} onChange={e => setExpiryDate(e.target.value)} required className="h-9 text-sm rounded-lg" />
                </div>
              )}
            </>
          )}

          {showEditFields && (
            <>
              <div className="space-y-1">
                <Label htmlFor="sr-edit-name" className="text-xs font-bold">Name</Label>
                <Input id="sr-edit-name" value={changes.name || ''} onChange={e => setChanges(c => ({ ...c, name: e.target.value }))} className="h-9 text-sm rounded-lg" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="sr-edit-unit" className="text-xs font-bold">Unit</Label>
                  <Input id="sr-edit-unit" value={changes.unit || ''} onChange={e => setChanges(c => ({ ...c, unit: e.target.value }))} className="h-9 text-sm rounded-lg" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sr-edit-min" className="text-xs font-bold">Min Quantity</Label>
                  <Input id="sr-edit-min" type="number" min="0" value={changes.minQuantity ?? '0'} onChange={e => setChanges(c => ({ ...c, minQuantity: e.target.value }))} className="h-9 text-sm rounded-lg" />
                </div>
              </div>
            </>
          )}

          {showAdjustFields && (
            <div className="space-y-1">
              <Label htmlFor="sr-target" className="text-xs font-bold">
                Requested Stock Target {context.currentQuantity !== undefined && `(current: ${context.currentQuantity} ${context.unit || ''})`}
              </Label>
              <Input id="sr-target" type="number" min="0" value={targetQuantity} onChange={e => setTargetQuantity(e.target.value)} required className="h-9 text-sm rounded-lg" />
            </div>
          )}

          {showReassignFields && (
            <div className="space-y-1">
              <Label htmlFor="sr-targetstation" className="text-xs font-bold">
                Move to Station {context.currentCategoryName ? `(currently: ${context.currentCategoryName})` : ''}
              </Label>
              <select
                id="sr-targetstation"
                value={targetCategoryId}
                onChange={e => setTargetCategoryId(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground"
                required
              >
                <option value="">— Choose destination —</option>
                {(context.categories || []).filter(c => c.id !== context.currentCategoryId).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {showStationName && (
            <div className="space-y-1">
              <Label htmlFor="sr-catname" className="text-xs font-bold">New Station Name *</Label>
              <Input id="sr-catname" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Grill Station" required className="h-9 text-sm rounded-lg" />
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="sr-reason" className="text-xs font-bold">Reason (required — shown to the administrator) *</Label>
            <textarea
              id="sr-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              required
              placeholder="e.g. We received a new delivery and this item is missing from the worksheet."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70"
            />
          </div>

          <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60 flex items-start gap-2 text-[11px] text-muted-foreground">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Nothing changes until an administrator approves. You will see the decision in My Requests on this page.</span>
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2" role="alert">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-2" role="status">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          <DialogFooter className="pt-1 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-9 text-xs rounded-xl">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="h-9 text-xs font-bold rounded-xl">
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <ClipboardList className="w-3.5 h-3.5 mr-1.5" />}
              Submit Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
