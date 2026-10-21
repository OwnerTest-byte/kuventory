import { useState } from 'react';
import { 
  ClipboardList, ArrowRight, RefreshCw, Calendar, FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatSafeDate } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getBusinessDateString } from '@/lib/businessDate';
import { useNavigate } from 'react-router-dom';

interface SuperDailyOperationsTabProps {
  onRefresh: () => void;
}

export function SuperDailyOperationsTab({ onRefresh: _onRefresh }: SuperDailyOperationsTabProps) {
  const navigate = useNavigate();
  const businessDate = getBusinessDateString();
  const [selectedState, setSelectedState] = useState<'ALL' | 'DRAFT' | 'FINALIZED'>('ALL');

  // Query recent daily inventory sheets
  const { data: sheets = [], refetch, isLoading } = useQuery({
    queryKey: ['super-daily-inventory-sheets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_inventory')
        .select('id, inventory_date, state, created_at, updated_at, finalized_at, finalized_by')
        .order('inventory_date', { ascending: false })
        .limit(30);
      if (error) return [];
      return data || [];
    }
  });

  const filteredSheets = sheets.filter(s => {
    if (selectedState === 'ALL') return true;
    return s.state === selectedState;
  });

  const todaySheet = sheets.find(s => s.inventory_date === businessDate);

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              Daily Operations & Worksheet Completeness
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monitors shift daily stock count submissions, draft statuses, and reconciliation drift.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="h-8 text-xs font-semibold cursor-pointer border-border hover:bg-muted self-start sm:self-auto"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isLoading && "animate-spin")} />
            Refresh Sheets
          </Button>
        </div>

        {/* Today's Status Banner */}
        <div className="p-4 rounded-xl bg-muted/40 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs",
              todaySheet?.state === 'FINALIZED'
                ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/25"
                : todaySheet?.state === 'DRAFT'
                ? "bg-amber-500/15 text-amber-500 border border-amber-500/25"
                : "bg-muted text-muted-foreground border border-border"
            )}>
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">
                  Today's Sheet ({businessDate})
                </h3>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                  todaySheet?.state === 'FINALIZED'
                    ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                    : todaySheet?.state === 'DRAFT'
                    ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                    : "bg-muted text-muted-foreground border-border"
                )}>
                  {todaySheet?.state || 'MISSING / NOT STARTED'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {todaySheet?.state === 'FINALIZED' 
                  ? `Finalized at ${formatSafeDate(todaySheet.finalized_at, 'hh:mm a')}` 
                  : todaySheet?.state === 'DRAFT'
                  ? 'Worksheet open in draft mode. Ending count submission pending.'
                  : 'No inventory worksheet opened yet for this business date.'}
              </p>
            </div>
          </div>

          <Button
            size="sm"
            onClick={() => navigate('/daily-inventory')}
            className="h-8 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer self-start sm:self-auto shrink-0"
          >
            Open Daily Inventory <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </div>
      </div>

      {/* 2. Recent Worksheets Table */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Historical Daily Worksheets
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review finalized closing reports and pending draft corrections.
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted border border-border text-xs">
            {(['ALL', 'DRAFT', 'FINALIZED'] as const).map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedState(st)}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer",
                  selectedState === st 
                    ? "bg-primary text-primary-foreground shadow-xs" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {filteredSheets.length === 0 ? (
          <div className="p-6 rounded-xl bg-muted/30 border border-border text-center text-xs text-muted-foreground">
            No daily inventory worksheets found matching filter.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted text-muted-foreground font-semibold border-b border-border">
                <tr>
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5">State</th>
                  <th className="p-2.5">Last Activity</th>
                  <th className="p-2.5">Finalized At</th>
                  <th className="p-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredSheets.map(s => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="p-2.5 font-bold font-mono text-foreground">
                      {s.inventory_date}
                    </td>
                    <td className="p-2.5">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                        s.state === 'FINALIZED'
                          ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                          : "bg-amber-500/15 text-amber-500 border-amber-500/30"
                      )}>
                        {s.state}
                      </span>
                    </td>
                    <td className="p-2.5 text-muted-foreground font-mono">
                      {formatSafeDate(s.updated_at || s.created_at, 'MMM dd, hh:mm a')}
                    </td>
                    <td className="p-2.5 text-muted-foreground font-mono">
                      {s.finalized_at ? formatSafeDate(s.finalized_at, 'MMM dd, hh:mm a') : '—'}
                    </td>
                    <td className="p-2.5 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/daily-inventory?date=${s.inventory_date}`)}
                        className="h-7 text-xs font-bold text-primary hover:bg-primary/10 cursor-pointer"
                      >
                        Inspect Sheet <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
