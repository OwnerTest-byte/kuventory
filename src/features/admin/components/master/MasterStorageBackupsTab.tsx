import { 
  HardDrive, Download, Database, CheckCircle2, 
  Loader2, ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

interface MasterStorageBackupsTabProps {
  onExportBackup: () => Promise<void>;
  isExportingBackup: boolean;
  backupStats: { timestamp: string; count: number; filename: string } | null;
  counts: {
    activeItems: number;
    totalStockUnits: number;
    auditLogs: number;
  };
}

export function MasterStorageBackupsTab({
  onExportBackup,
  isExportingBackup,
  backupStats,
  counts,
}: MasterStorageBackupsTabProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Storage & Point-in-Time Backup Engine
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Separation of Database vs Storage concerns and real-time point-in-time JSON archive generation.
            </p>
          </div>

          <Button
            onClick={onExportBackup}
            disabled={isExportingBackup}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs px-5 py-2.5 cursor-pointer shadow-xs"
          >
            {isExportingBackup ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Backup...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Export Full Backup (.json)
              </>
            )}
          </Button>
        </div>

        {/* Database vs Storage Distinction Rule */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
          <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-2">
            <span className="font-bold text-primary flex items-center gap-1.5 text-sm">
              <Database className="w-4 h-4" /> Relational Database (PostgreSQL)
            </span>
            <p className="text-muted-foreground leading-relaxed">
              Contains the transactional state: catalog items, stock batches, ledger history, daily counts, staff profiles, and system settings.
            </p>
            <div className="font-mono text-[11px] text-muted-foreground pt-1">
              Status: <strong>{counts.activeItems} Items · {counts.auditLogs} Audit Records</strong>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-2">
            <span className="font-bold text-amber-500 flex items-center gap-1.5 text-sm">
              <HardDrive className="w-4 h-4" /> Cloud Storage Objects (Buckets)
            </span>
            <p className="text-muted-foreground leading-relaxed">
              Contains binary assets: generated PDF reports, Excel spreadsheets, item photos, and uploaded receipts.
            </p>
            <div className="font-mono text-[11px] text-muted-foreground pt-1">
              Status: <strong>0 Buckets Configured (Local JSON engine active)</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Backup Execution Card */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="space-y-2">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" /> One-Click Point-in-Time Full System Snapshot
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Exports an immutable point-in-time JSON archive capturing all 8 core tables with full relationship integrity:
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 text-xs text-muted-foreground grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
          <div>• categories (7)</div>
          <div>• inventory_items</div>
          <div>• stock_batches</div>
          <div>• stock_movements</div>
          <div>• daily_inventory</div>
          <div>• daily_inventory_items</div>
          <div>• reports & items</div>
          <div>• system_settings</div>
        </div>

        <div className="pt-2">
          <Button
            onClick={onExportBackup}
            disabled={isExportingBackup}
            className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs sm:text-sm min-h-11 px-6 shadow-xs cursor-pointer"
          >
            {isExportingBackup ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Exporting Snapshot Archive...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download Point-in-Time System Snapshot (.json)
              </>
            )}
          </Button>
        </div>

        {backupStats && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              <div>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 block">
                  Backup Export Successful
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {backupStats.filename}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="bg-card px-2.5 py-1 rounded-md border border-border font-bold">
                {backupStats.count} Total Records
              </span>
              <span className="text-muted-foreground text-[11px]">
                {format(new Date(backupStats.timestamp), 'MMM dd, HH:mm:ss')}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Backup Integrity & Compliance Note */}
      <div className="p-4 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground space-y-1.5">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Immutable Backup Policy</span>
        </div>
        <p className="leading-relaxed">
          In strict compliance with Master Admin standards: backups are never simulated. Clicking export retrieves every active table row directly from PostgreSQL and packages them into a portable, standard JSON schema ready for validation and point-in-time disaster recovery.
        </p>
      </div>
    </div>
  );
}
