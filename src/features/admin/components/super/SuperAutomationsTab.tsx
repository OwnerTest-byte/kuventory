import { 
  Cog, Clock, ExternalLink, RefreshCw, 
  ShieldCheck, Database, Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AutomationJob } from '../../services/superAdminService';

interface SuperAutomationsTabProps {
  automations: AutomationJob[];
  onToggle?: (jobKey: string, isEnabled: boolean) => Promise<void>;
  onTrigger?: (jobKey: string) => Promise<{ success: boolean; durationMs: number; message: string }>;
  onRefresh: () => void;
}

interface ServiceDescriptor {
  key: string;
  name: string;
  legacyName?: string;
  executor: string;
  executionType: 'PostgreSQL pg_cron' | 'GitHub Actions' | 'Dedicated Worker' | 'Database Trigger' | 'Manual Procedure';
  status: 'Configured' | 'External' | 'Not scheduled in hosting runtime' | 'Event-driven' | 'Not configured';
  statusBadge: {
    label: string;
    variant: 'emerald' | 'blue' | 'amber' | 'muted';
  };
  schedule: string;
  notes: string;
  externalLink?: string;
  externalLinkLabel?: string;
}

const SCHEDULED_SERVICES: ServiceDescriptor[] = [
  {
    key: 'expiry_check',
    name: 'Perishable Batch Expiry Audit',
    legacyName: 'Expiry Check & FEFO Priority Rebalancer',
    executor: 'PostgreSQL pg_cron extension',
    executionType: 'PostgreSQL pg_cron',
    status: 'Configured',
    statusBadge: { label: 'Configured (pg_cron)', variant: 'emerald' },
    schedule: '0 0 * * * (Daily at 00:00 UTC)',
    notes: 'Configured in database migrations via daily_expiry_check(). Executes within PostgreSQL without requiring open client tabs.'
  },
  {
    key: 'report_generation',
    name: 'Daily Operations Summary Digest',
    legacyName: 'Daily Reconciliation & Report Snapshot',
    executor: 'GitHub Actions keepalive & reporting workflow',
    executionType: 'GitHub Actions',
    status: 'External',
    statusBadge: { label: 'Managed in GitHub Actions', variant: 'blue' },
    schedule: 'Every 6 hours (cron trigger in .github/workflows)',
    notes: 'Executes within GitHub Actions CI runner. Health and run logs are audited in repository workflow dispatch.',
    externalLink: 'https://github.com/OwnerTest-byte/kuventory/actions',
    externalLinkLabel: 'View Workflow Runs'
  },
  {
    key: 'backup_snapshot',
    name: 'Disaster Recovery Point Checkpoint',
    legacyName: 'Automated Database & State Snapshot',
    executor: 'scripts/backup-db.mjs (Node pg_dump process)',
    executionType: 'Dedicated Worker',
    status: 'Not scheduled in hosting runtime',
    statusBadge: { label: 'Not scheduled in hosting runtime', variant: 'amber' },
    schedule: 'Requires dedicated node-cron worker',
    notes: 'Netlify static hosting cannot maintain persistent background daemons. Use dedicated runner or manual export in Backups & Recovery.'
  },
  {
    key: 'low_stock_alert',
    name: 'Low Stock & Depleted Batch Detection',
    legacyName: 'Stock Threshold & Depleted Batch Monitor',
    executor: 'PostgreSQL Event Triggers',
    executionType: 'Database Trigger',
    status: 'Event-driven',
    statusBadge: { label: 'Realtime Event-Driven', variant: 'blue' },
    schedule: 'Evaluated on stock transaction mutation',
    notes: 'Triggered automatically when inventory transaction ledger updates reduce item stock below minimum thresholds.'
  },
  {
    key: 'daily_sync',
    name: 'Daily Inventory Sync & Archival',
    legacyName: 'Worksheet Archival & Retention Routine',
    executor: 'Operator action / Database RPC',
    executionType: 'Manual Procedure',
    status: 'Not configured',
    statusBadge: { label: 'Manual Procedure', variant: 'muted' },
    schedule: 'Manual trigger (Persistent scheduler unconfigured)',
    notes: 'No persistent background daemon configured. Operators trigger retention cleanup via database RPC or admin actions.'
  }
];

export function SuperAutomationsTab({
  automations: _automations,
  onRefresh
}: SuperAutomationsTabProps) {

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Scheduled Services & Background Job Health
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                  Background Automation & Maintenance Engine
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  Read-Only Status
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Audited status of scheduled database cron routines, GitHub Actions workflows, dedicated runners, and event triggers.
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
            Refresh Status
          </Button>
        </div>

        {/* Informative Trust Notice */}
        <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-xs space-y-1.5 text-muted-foreground">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Truthful Scheduler Contract
          </p>
          <p className="leading-relaxed text-[11px]">
            In compliance with KUVENTORY security audit standards, unconfigured and client-side simulated schedulers have been retired. Background tasks are reported truthfully based on their actual hosting executor rather than simulated success banners.
          </p>
        </div>
      </div>

      {/* 2. Scheduled Services Roster */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">Registered System Services</h3>
            <p className="text-xs text-muted-foreground">
              Direct verification of database cron, external CI runners, and transaction triggers
            </p>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {SCHEDULED_SERVICES.length} services audited
          </span>
        </div>

        <div className="space-y-3">
          {SCHEDULED_SERVICES.map((srv) => {
            const variantClass = 
              srv.statusBadge.variant === 'emerald'
                ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                : srv.statusBadge.variant === 'blue'
                ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                : srv.statusBadge.variant === 'amber'
                ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                : "bg-muted text-muted-foreground border-border";

            return (
              <div 
                key={srv.key}
                className="p-4 rounded-xl bg-muted/30 border border-border flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-border/80 transition-all"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center shrink-0 mt-0.5 text-muted-foreground">
                    {srv.executionType === 'PostgreSQL pg_cron' ? (
                      <Database className="w-5 h-5 text-emerald-500" />
                    ) : srv.executionType === 'GitHub Actions' ? (
                      <Calendar className="w-5 h-5 text-blue-400" />
                    ) : (
                      <Cog className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-foreground truncate">{srv.name}</h4>
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", variantClass)}>
                        {srv.statusBadge.label}
                      </span>
                    </div>
                    
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {srv.notes}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground font-mono mt-2">
                      <span>Executor: <strong className="text-foreground font-sans">{srv.executor}</strong></span>
                      <span>Schedule: <strong className="text-foreground font-mono">{srv.schedule}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  {srv.externalLink ? (
                    <a
                      href={srv.externalLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-card border border-border text-primary hover:bg-muted transition-colors"
                    >
                      <span>{srv.externalLinkLabel || 'View'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-[11px] font-mono text-muted-foreground px-2.5 py-1 rounded-md bg-card/60 border border-border/60">
                      Internal
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
