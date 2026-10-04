import { useState } from 'react';
import { 
  Radio, Play, Pause, Zap, CheckCircle2, 
  ShieldCheck, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { pingSupabaseKeepalive } from '@/lib/keepalive';

interface MasterRealtimeTabProps {
  realtimeEvents: Array<{
    id: string;
    source: string;
    action: string;
    summary: string;
    timestamp: string;
    badge: string;
  }>;
  setRealtimeEvents: React.Dispatch<React.SetStateAction<Array<{
    id: string;
    source: string;
    action: string;
    summary: string;
    timestamp: string;
    badge: string;
  }>>>;
  realtimeChannelStatus: string;
  realtimePingMs: number | null;
  setRealtimePingMs: (ms: number | null) => void;
  isRealtimePaused: boolean;
  setIsRealtimePaused: (paused: boolean) => void;
}

export function MasterRealtimeTab({
  realtimeEvents,
  setRealtimeEvents,
  realtimeChannelStatus,
  realtimePingMs,
  setRealtimePingMs,
  isRealtimePaused,
  setIsRealtimePaused,
}: MasterRealtimeTabProps) {
  const [isPinging, setIsPinging] = useState(false);

  const handlePing = async () => {
    setIsPinging(true);
    const res = await pingSupabaseKeepalive();
    if (res) setRealtimePingMs(res.latencyMs);
    setIsPinging(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="relative flex h-3.5 w-3.5">
                <span className={cn(
                  "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                  realtimeChannelStatus === 'CONNECTED' ? "bg-emerald-400" : "bg-amber-400"
                )} />
                <span className={cn(
                  "relative inline-flex rounded-full h-3.5 w-3.5",
                  realtimeChannelStatus === 'CONNECTED' ? "bg-emerald-500" : "bg-amber-500"
                )} />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Realtime Telemetry & WebSocket Engine
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {realtimeChannelStatus}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Live bi-directional WebSocket telemetry streaming database mutations, ledger events, daily counts, and staff session updates.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePing}
              disabled={isPinging}
              className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer"
            >
              <Zap className={cn("w-3.5 h-3.5 mr-1.5 text-amber-500", isPinging && "animate-spin")} />
              {realtimePingMs ? `${realtimePingMs}ms Ping` : 'Ping Latency'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRealtimePaused(!isRealtimePaused)}
              className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer"
            >
              {isRealtimePaused ? (
                <>
                  <Play className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                  Resume Feed
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                  Pause Feed
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRealtimeEvents([])}
              className="text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
          </div>
        </div>

        {/* Realtime Architecture Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2">
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border">
            <span className="text-muted-foreground text-[11px] block">Channel Name</span>
            <span className="font-mono font-bold text-foreground text-xs mt-0.5 block truncate">
              master-live-activity-stream
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border">
            <span className="text-muted-foreground text-[11px] block">Delivery Guarantee</span>
            <span className="font-bold text-emerald-500 text-xs mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Database Fallback Active
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border">
            <span className="text-muted-foreground text-[11px] block">Stream Buffer</span>
            <span className="font-bold text-foreground text-xs mt-0.5 block">
              {realtimeEvents.length} events buffered (capped at 50)
            </span>
          </div>
        </div>
      </div>

      {/* Live Event Stream Table */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">Live Telemetry Feed</h3>
          <span className="text-xs text-muted-foreground">
            {isRealtimePaused ? 'Feed Paused' : 'Listening Live'}
          </span>
        </div>

        <div className="rounded-xl border border-border bg-muted/20 overflow-hidden max-h-96 overflow-y-auto">
          {realtimeEvents.length === 0 ? (
            <div className="py-14 text-center text-xs text-muted-foreground space-y-2">
              <Radio className="w-8 h-8 mx-auto text-muted-foreground/50 animate-pulse" />
              <p className="font-bold text-foreground text-sm">Listening for real-time mutations...</p>
              <p className="text-[11px] max-w-sm mx-auto">
                Any modifications made to stock balances, daily worksheets, staff accounts, or system settings across any browser session will stream here instantaneously.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {realtimeEvents.map((evt) => (
                <div key={evt.id} className="p-3.5 text-xs flex items-center justify-between hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shrink-0",
                      evt.badge === 'INSERT' ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" :
                      evt.badge === 'UPDATE' ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30" :
                      "bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                    )}>
                      {evt.badge}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground border border-border shrink-0">
                      {evt.source}
                    </span>
                    <span className="font-medium text-foreground truncate">
                      {evt.summary}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0 ml-3">
                    {format(new Date(evt.timestamp), 'HH:mm:ss')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Realtime Safety Architecture Note */}
      <div className="p-4 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground space-y-1.5">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Realtime Architecture & Data Integrity Safeguard</span>
        </div>
        <p className="leading-relaxed">
          Realtime is an <strong>update propagation mechanism</strong>, not the source of truth. The PostgreSQL database is the immutable single source of truth. If a network interruption disconnects WebSockets, KUVENTORY seamlessly falls back to TanStack Query refetches upon reconnection, guaranteeing that temporary network drops can never corrupt inventory stock balances.
        </p>
      </div>
    </div>
  );
}
