import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useDailyInventory, useFinalizeDailyInventory, dailyInventoryKeys } from '../hooks/useDailyInventory';
import { InventorySheet } from '../components/InventorySheet';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, AlertTriangle, CalendarIcon, RefreshCw, CheckCircle2, Lock } from 'lucide-react';
import { format } from 'date-fns';

export function DailyInventoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { data: record, isLoading, error } = useDailyInventory(date);
  const finalizeMutation = useFinalizeDailyInventory(date);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: dailyInventoryKeys.date(date) });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleFinalize = async () => {
    if (!record) return;
    await finalizeMutation.mutateAsync(record.id);
    setShowFinalizeDialog(false);
  };

  const isFinalized = record?.status === 'FINALIZED';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground uppercase">INVENTORY KIOSK AND BODEGA</h1>
            {record && (
              isFinalized ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/25">
                  <Lock size={12} /> Finalized & Locked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/25">
                  <CheckCircle2 size={12} /> Live Autosave
                </span>
              )
            )}
          </div>

          <div className="flex items-center text-sm text-muted-foreground mt-2 gap-3">
            <div className="flex items-center">
              <span className="font-semibold mr-2 text-foreground">Worksheet Date:</span>
              <div className="flex items-center border border-border rounded-lg px-2.5 py-1 bg-card relative hover:border-muted-foreground/40 transition-colors">
                <span className="mr-2 font-medium text-foreground">{format(new Date(date + 'T00:00:00'), 'MMM dd, yyyy')}</span>
                <CalendarIcon className="w-4 h-4 text-muted-foreground cursor-pointer" />
                <input 
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="text-muted-foreground hover:text-foreground h-8 px-2"
              title="Refresh sheet data from database"
            >
              <RefreshCw size={14} className={`mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Sync
            </Button>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={() => {
              if (record?.id) {
                navigate(`/reports/${record.id}`);
              } else {
                navigate('/reports');
              }
            }}
            className="border-border text-foreground bg-card font-semibold hover:bg-muted"
          >
            Preview Report
          </Button>
          
          {!isFinalized && (
            <Button 
              onClick={() => setShowFinalizeDialog(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
              disabled={isLoading || !record}
            >
              Finalize Day
            </Button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center p-16 text-muted-foreground space-y-3 bg-card rounded-xl border border-border shadow-xs">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Loading daily inventory worksheet...</p>
        </div>
      )}
      
      {error && (
        <div className="p-4 bg-rose-500/10 text-rose-500 rounded-xl border border-rose-500/20 shadow-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Error loading inventory worksheet</p>
            <p className="text-sm opacity-90">{(error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-2 text-xs bg-card border-border">
              Try Again
            </Button>
          </div>
        </div>
      )}

      {record && !isLoading && (
        <InventorySheet 
          session={record} 
          isReadOnly={isFinalized} 
          date={date}
        />
      )}

      <Dialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <DialogContent className="bg-card text-card-foreground border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Finalize Daily Inventory for {format(new Date(date + 'T00:00:00'), 'MMMM dd, yyyy')}?</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Finalizing permanently locks this day's record, generates an immutable official daily snapshot report, and executes FEFO stock deductions.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg my-2">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-600 dark:text-amber-400">
              This action locks the sheet. Double-check your BEG, ADD, SALES AM, and SALES PM quantities before proceeding.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinalizeDialog(false)} disabled={finalizeMutation.isPending} className="border-border text-foreground">
              Cancel
            </Button>
            <Button onClick={handleFinalize} disabled={finalizeMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {finalizeMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Finalizing...</>
              ) : (
                "Confirm Finalize"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
