import { useState } from 'react';
import { useDailyInventory, useFinalizeDailyInventory } from '../hooks/useDailyInventory';
import { InventorySheet } from './InventorySheet';
import { Button } from '@/components/ui/Button';
import { Lock, Edit3, Loader2 } from 'lucide-react';

export function DailyInventoryPage() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  const { data: record, isLoading, error } = useDailyInventory(date);
  const finalizeMutation = useFinalizeDailyInventory(date);

  const handleFinalize = async () => {
    if (!record) return;
    const confirmed = window.confirm(
      "Are you sure you want to finalize this inventory?\n\nThis will physically consume the AM and PM stock amounts and permanently lock this record."
    );
    if (confirmed) {
      await finalizeMutation.mutateAsync(record.id);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Daily Inventory</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Record daily AM and PM stock usage.</p>
        </div>
        
        <div className="flex flex-col gap-1">
          <label htmlFor="inventory-date" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Inventory Date</label>
          <input 
            id="inventory-date"
            type="date" 
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-4 py-2 border h-10 w-full md:w-auto"
          />
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center p-12 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      )}
      
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900 shadow-sm">
          <p className="font-semibold">Error loading inventory</p>
          <p className="text-sm opacity-80">{(error as Error).message}</p>
        </div>
      )}

      {record && (
        <>
          <div className={`p-4 md:p-6 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm transition-colors ${
            record.state === 'FINALIZED' 
              ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200' 
              : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200'
          }`}>
            <div className="flex items-start gap-3">
              <div className="mt-1">
                {record.state === 'FINALIZED' ? <Lock className="w-5 h-5 text-amber-600 dark:text-amber-500" /> : <Edit3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
              </div>
              <div>
                <div className="font-bold text-lg flex items-center gap-2">
                  <span className="uppercase tracking-wider">{record.state}</span>
                </div>
                <div className="text-sm opacity-80 mt-1">
                  {record.state === 'FINALIZED' 
                    ? `Finalized by ${record.finalized_by || 'Unknown'} — This record is locked and cannot be edited.`
                    : 'Auto-saving as you type. Ensure all counts are accurate before finalizing.'}
                </div>
              </div>
            </div>
            
            {record.state === 'DRAFT' && (
              <Button 
                onClick={handleFinalize} 
                disabled={finalizeMutation.isPending}
                className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white shadow"
              >
                {finalizeMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Finalizing...</>
                ) : (
                  <><Lock className="w-4 h-4 mr-2" /> Finalize Day</>
                )}
              </Button>
            )}
          </div>

          <InventorySheet 
            items={record.daily_inventory_items || []} 
            isReadOnly={record.state !== 'DRAFT'} 
            date={date}
          />
        </>
      )}
    </div>
  );
}
