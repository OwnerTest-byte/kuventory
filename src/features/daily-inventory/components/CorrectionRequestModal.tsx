import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitCorrectionRequest, type ProposedCorrectionItem } from '../services/correctionRequestService';
import {
  FileText,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Send,
  Info
} from 'lucide-react';

interface CorrectionRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dailyInventoryId: string;
  inventoryDate: string;
  items: Array<{
    id: string;
    item_id: string;
    item_name: string;
    unit?: string;
    beginning_qty: number;
    add_qty: number;
    sales_am: number;
    sales_pm: number;
    ending_qty: number;
  }>;
  onSuccess?: () => void;
}

export function CorrectionRequestModal({
  open,
  onOpenChange,
  dailyInventoryId,
  inventoryDate,
  items,
  onSuccess,
}: CorrectionRequestModalProps) {
  const [reason, setReason] = useState('');
  const [draftItems, setDraftItems] = useState<ProposedCorrectionItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setErrorMessage(null);
      setSuccessMessage(null);
      setDraftItems(
        items.map(i => ({
          id: i.id,
          item_id: i.item_id,
          item_name: i.item_name,
          unit: i.unit || 'pcs',
          beg: i.beginning_qty,
          add: i.add_qty,
          am: i.sales_am,
          pm: i.sales_pm,
          ending: i.ending_qty,
        }))
      );
    }
  }, [open, items]);

  const handleValueChange = (
    index: number,
    field: 'beg' | 'add' | 'am' | 'pm',
    value: string
  ) => {
    const num = Math.max(0, Number(value) || 0);
    setDraftItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: num };
      item.ending = Math.max(0, item.beg + item.add - item.am - item.pm);
      updated[index] = item;
      return updated;
    });
  };

  const hasModifications = () => {
    return draftItems.some((draft, idx) => {
      const orig = items[idx];
      if (!orig) return false;
      return (
        draft.beg !== orig.beginning_qty ||
        draft.add !== orig.add_qty ||
        draft.am !== orig.sales_am ||
        draft.pm !== orig.sales_pm
      );
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMessage('A comprehensive reason explaining the finalized discrepancy is strictly required.');
      return;
    }

    if (!hasModifications()) {
      setErrorMessage('Please adjust at least one item quantity before submitting a correction request.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await submitCorrectionRequest(dailyInventoryId, reason.trim(), draftItems);
      setSuccessMessage(res.message);
      setTimeout(() => {
        onOpenChange(false);
        if (onSuccess) onSuccess();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit correction request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="4xl" className="w-[calc(100vw-2rem)] max-w-4xl max-h-[90dvh] overflow-y-auto p-0 rounded-2xl bg-card border-border shadow-2xl">
        <DialogHeader className="p-6 border-b border-border/60 bg-muted/20 text-left">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 shrink-0 mt-0.5 sm:mt-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground wrap-break-word">
                Request Finalized Inventory Correction
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Worksheet Date: <span className="font-semibold text-foreground">{inventoryDate}</span>. Proposed changes will enter a 2-stage approval workflow.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errorMessage && (
            <div className="p-3.5 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Governance Notice */}
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-foreground flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-600 dark:text-amber-400">Strict Governance Protocol Active</p>
              <p className="text-muted-foreground leading-relaxed">
                Submitting this request does <strong>not</strong> change inventory or stock records. It will be queued for
                <strong> Admin Review (Stage 1)</strong>, followed by <strong>Super Admin Final Approval (Stage 2)</strong>.
                Only after both approvals are granted will the database atomically apply stock reconciliation and create an official revision.
              </p>
            </div>
          </div>

          {/* Required Reason Input */}
          <div className="space-y-2 text-left">
            <Label htmlFor="correction-reason" className="text-xs font-bold text-foreground">
              Correction Reason & Audit Rationale *
            </Label>
            <Input
              id="correction-reason"
              placeholder="e.g., Physical count recount: 2 units of Milk were mistakenly entered under PM instead of AM."
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="h-11 text-xs rounded-xl"
              required
            />
          </div>

          {/* Items Adjustment Table */}
          <div className="space-y-2 text-left">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-foreground">Adjust Worksheet Item Quantities</Label>
              <span className="text-[11px] text-muted-foreground italic">
                {hasModifications() ? 'Quantities modified' : 'No changes made yet'}
              </span>
            </div>

            <div className="border border-border/80 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto max-h-90 overflow-y-auto">
                <table className="w-full text-xs text-left min-w-135">
                  <thead className="bg-muted/40 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider text-[10px] sticky top-0 z-10 backdrop-blur-xs">
                    <tr>
                      <th className="px-4 py-2.5">Item Name</th>
                      <th className="px-2 py-2.5 text-center w-20">Beg</th>
                      <th className="px-2 py-2.5 text-center w-20">Add</th>
                      <th className="px-2 py-2.5 text-center w-20">AM</th>
                      <th className="px-2 py-2.5 text-center w-20">PM</th>
                      <th className="px-3 py-2.5 text-center w-24">Ending</th>
                      <th className="px-3 py-2.5 text-center w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {draftItems.map((item, idx) => {
                      const orig = items[idx];
                      const isModified =
                        orig &&
                        (item.beg !== orig.beginning_qty ||
                          item.add !== orig.add_qty ||
                          item.am !== orig.sales_am ||
                          item.pm !== orig.sales_pm);

                      return (
                        <tr
                          key={item.item_id}
                          className={isModified ? 'bg-amber-500/5' : 'hover:bg-muted/20'}
                        >
                          <td className="px-4 py-2 font-medium text-foreground">
                            <div>{item.item_name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              Unit: {item.unit}
                            </div>
                          </td>

                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={item.beg}
                              onChange={e => handleValueChange(idx, 'beg', e.target.value)}
                              className="h-8 text-center text-xs font-mono rounded-lg"
                            />
                          </td>

                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={item.add}
                              onChange={e => handleValueChange(idx, 'add', e.target.value)}
                              className="h-8 text-center text-xs font-mono rounded-lg"
                            />
                          </td>

                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={item.am}
                              onChange={e => handleValueChange(idx, 'am', e.target.value)}
                              className="h-8 text-center text-xs font-mono rounded-lg"
                            />
                          </td>

                          <td className="px-2 py-2">
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={item.pm}
                              onChange={e => handleValueChange(idx, 'pm', e.target.value)}
                              className="h-8 text-center text-xs font-mono rounded-lg"
                            />
                          </td>

                          <td className="px-3 py-2 text-center font-mono font-bold text-foreground">
                            {item.ending}
                          </td>

                          <td className="px-3 py-2 text-center">
                            {isModified ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                Modified
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground italic">
                                Unchanged
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0 flex-col-reverse sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 text-xs rounded-xl"
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={isSubmitting || !reason.trim() || !hasModifications()}
              className="h-10 px-5 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-xl shadow-xs flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Submit for Admin Review
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
