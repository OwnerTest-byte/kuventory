import { useState } from 'react';
import { useDailyInventory, useFinalizeDailyInventory } from '../hooks/useDailyInventory';
import { InventorySheet } from './InventorySheet';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, AlertTriangle, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

export function DailyInventoryPage() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  
  const { data: record, isLoading, error } = useDailyInventory(date);
  const finalizeMutation = useFinalizeDailyInventory(date);

  const handleFinalize = async () => {
    if (!record) return;
    await finalizeMutation.mutateAsync(record.id);
    setShowFinalizeDialog(false);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header matching mockup */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">INVENTORY KIOSK AND BODEGA</h1>
          <div className="flex items-center text-sm text-slate-600 mt-2">
            <span className="font-semibold mr-2">Date:</span>
            <div className="flex items-center border border-slate-200 rounded px-2 py-1 bg-white">
              <span className="mr-2">{format(new Date(date), 'MMM dd, yyyy')}</span>
              <CalendarIcon className="w-4 h-4 text-slate-400 cursor-pointer" />
              {/* Hidden native date picker to keep functionality */}
              <input 
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="absolute opacity-0 w-8 h-6 cursor-pointer"
              />
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-slate-300 text-slate-700 bg-white font-semibold">
            Preview Report
          </Button>
          
          {(!record || record.status === 'DRAFT') && (
            <Button 
              onClick={() => setShowFinalizeDialog(true)}
              className="bg-green-700 hover:bg-green-800 text-white font-semibold"
              disabled={isLoading || !record}
            >
              Finalize Day
            </Button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center p-12 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      )}
      
      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 shadow-sm">
          <p className="font-semibold">Error loading inventory</p>
          <p className="text-sm opacity-80">{(error as Error).message}</p>
        </div>
      )}

      {record && !isLoading && (
        <InventorySheet 
          session={record} 
          isReadOnly={record.status !== 'DRAFT'} 
          date={date}
        />
      )}

      <Dialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize Daily Inventory?</DialogTitle>
            <DialogDescription>
              Finalizing will physically consume the AM and PM stock amounts and permanently lock this day's record.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg my-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-900">
              This action cannot be undone. Review all counts before finalizing.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinalizeDialog(false)} disabled={finalizeMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleFinalize} disabled={finalizeMutation.isPending} className="bg-green-700 hover:bg-green-800 text-white">
              {finalizeMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Finalizing...</>
              ) : (
                "Finalize Day"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
