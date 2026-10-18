import { useState } from 'react';
import { 
  Cog, Play, CheckCircle2, Loader2, RefreshCw 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatSafeDate } from '@/lib/utils';
import type { AutomationJob } from '../../services/superAdminService';

interface SuperAutomationsTabProps {
  automations: AutomationJob[];
  onToggle: (jobKey: string, isEnabled: boolean) => Promise<void>;
  onTrigger: (jobKey: string) => Promise<{ success: boolean; durationMs: number; message: string }>;
  onRefresh: () => void;
}

export function SuperAutomationsTab({
  automations,
  onToggle,
  onTrigger,
  onRefresh
}: SuperAutomationsTabProps) {
  const [runningJobKey, setRunningJobKey] = useState<string | null>(null);
  const [lastRunMessage, setLastRunMessage] = useState<{ jobKey: string; message: string; durationMs: number } | null>(null);

  const handleRunNow = async (jobKey: string) => {
    setRunningJobKey(jobKey);
    setLastRunMessage(null);
    try {
      const res = await onTrigger(jobKey);
      setLastRunMessage({ jobKey, message: res.message, durationMs: res.durationMs });
    } catch (err: any) {
      alert(`Job execution failed: ${err.message || 'Unknown error'}`);
    } finally {
      setRunningJobKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center shrink-0">
              <Cog className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Background Jobs & Autonomous Routines
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                  {automations.filter(a => a.isEnabled).length} Active
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Real scheduled cron tasks running independently on the server without open browser tabs
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Sync Schedulers
          </Button>
        </div>

        {lastRunMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-500 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{lastRunMessage.message}</span>
            </div>
            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-emerald-500/20">
              {lastRunMessage.durationMs}ms
            </span>
          </div>
        )}
      </div>

      {/* 2. Automations List matching mockup */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">Scheduled System Automations</h3>
            <p className="text-xs text-muted-foreground">Toggle job execution policies or trigger immediate operational passes</p>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {automations.length} jobs configured
          </span>
        </div>

        <div className="space-y-3">
          {automations.map((job) => {
            const isRunning = runningJobKey === job.jobKey;
            return (
              <div 
                key={job.jobKey}
                className="p-4 rounded-xl bg-muted/30 border border-border flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-border/80 transition-all"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                    job.isEnabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    <Cog className={cn("w-5 h-5", isRunning && "animate-spin text-primary")} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-foreground truncate">{job.name}</h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground border border-border">
                        {job.schedule}
                      </span>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                        job.lastStatus === 'Success' 
                          ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                          : job.lastStatus === 'Failed'
                          ? "bg-destructive/15 text-destructive border border-destructive/30"
                          : job.lastStatus === 'Running'
                          ? "bg-primary/15 text-primary border border-primary/30 animate-pulse"
                          : "bg-muted text-muted-foreground border border-border"
                      )}>
                        {job.lastStatus}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{job.description}</p>
                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground font-mono mt-1.5">
                      <span>Last run: {formatSafeDate(job.lastRunAt, 'MMM dd, hh:mm a', 'Never run')} ({job.lastDurationMs}ms)</span>
                      <span>Next run: {formatSafeDate(job.nextRunAt, 'MMM dd, hh:mm a', job.nextRunAt || 'Scheduled by backend')}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                  {/* Enable / Disable Switch */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={job.isEnabled}
                      onChange={(e) => onToggle(job.jobKey, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRunNow(job.jobKey)}
                    disabled={isRunning}
                    className="text-xs font-bold border-border text-foreground hover:bg-muted cursor-pointer h-8"
                  >
                    {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1 text-primary" />}
                    Run Now
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
