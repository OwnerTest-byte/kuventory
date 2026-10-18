import { useState, useEffect } from 'react';
import { 
  Settings, Shield, CheckCircle2, Save, Loader2, AlertCircle, Info, Database
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useQuery } from '@tanstack/react-query';
import { loadRetentionPolicies, saveRetentionPolicies } from '../../services/superAdminService';

interface SuperSettingsTabProps {
  userEmail: string;
}

export function SuperSettingsTab({ userEmail }: SuperSettingsTabProps) {
  const [retentionDays, setRetentionDays] = useState(30);
  const [backupRetentionDays, setBackupRetentionDays] = useState(365);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load authoritative saved policies from system_settings
  const { data: policies, isLoading, refetch } = useQuery({
    queryKey: ['super-retention-policies'],
    queryFn: loadRetentionPolicies,
  });

  useEffect(() => {
    if (policies) {
      setRetentionDays(policies.sheet_archival_days);
      setBackupRetentionDays(policies.backup_retention_days);
    }
  }, [policies]);

  const handleSavePolicies = async (e: React.FormEvent) => {
    e.preventDefault();
    if (retentionDays < 7 || retentionDays > 90) {
      setSaveError('Sheet archival threshold must be between 7 and 90 days.');
      return;
    }
    if (backupRetentionDays < 30 || backupRetentionDays > 730) {
      setSaveError('Backup checkpoint retention must be between 30 and 730 days.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSavedNotice(null);
    try {
      await saveRetentionPolicies({
        sheet_archival_days: retentionDays,
        backup_retention_days: backupRetentionDays,
      });
      await refetch();
      setSavedNotice('Authoritative retention policies updated in PostgreSQL system_settings.');
      setTimeout(() => setSavedNotice(null), 4000);
    } catch (err: any) {
      setSaveError(`Failed to save policies: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/30 text-primary flex items-center justify-center shrink-0">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Super Admin System Configuration & Governance
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automated data retention schedules, recovery policies, and authoritative operational parameters
            </p>
          </div>
        </div>
      </div>

      {/* 2. Retention Policies Form */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs max-w-2xl space-y-5">
        <div>
          <h3 className="text-sm font-bold text-foreground">Data Retention & Archival Policies</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            These values are read directly by the <code>archive_old_daily_inventories()</code> background cron job
          </p>
        </div>

        {saveError && (
          <div className="p-3 text-xs text-destructive bg-destructive/15 rounded-xl border border-destructive/25 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        {savedNotice && (
          <div className="p-3 text-xs text-emerald-500 bg-emerald-500/15 rounded-xl border border-emerald-500/25 font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{savedNotice}</span>
          </div>
        )}

        {isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1 text-primary" />
            Loading authoritative policy values...
          </div>
        ) : (
          <form onSubmit={handleSavePolicies} className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">
                Daily Inventory Sheet Archival Threshold (Days)
              </Label>
              <Input
                type="number"
                value={retentionDays}
                onChange={e => setRetentionDays(Number(e.target.value))}
                min={7}
                max={90}
                className="text-xs h-10 bg-muted/40 border-border"
                required
              />
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-0.5">
                <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                Sheets finalized prior to {retentionDays} days ago will be archived by the nightly <code>daily_sync</code> routine.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">
                Disaster Recovery Checkpoint Retention (Days)
              </Label>
              <Input
                type="number"
                value={backupRetentionDays}
                onChange={e => setBackupRetentionDays(Number(e.target.value))}
                min={30}
                max={730}
                className="text-xs h-10 bg-muted/40 border-border"
                required
              />
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-0.5">
                <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                State checkpoints in <code>recovery_points</code> older than {backupRetentionDays} days (excluding protected safety checkpoints) are flagged for archival.
              </p>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <Button
                type="submit"
                disabled={isSaving}
                className="text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                Persist Retention Policies
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* 3. Authenticated Administrator Clearance Card */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs max-w-2xl space-y-4">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Authenticated Administrator Identity
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Active administrative clearance currently authenticated for operational oversight
          </p>
        </div>

        <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Authenticated Account:</span>
            <span className="font-mono font-bold text-foreground">{userEmail}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Authority Level:</span>
            <span className="font-bold text-emerald-500">Tier 0 (Root Clearance)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Active Database:</span>
            <span className="font-mono text-foreground font-semibold flex items-center gap-1">
              <Database className="w-3 h-3 text-blue-500" /> PostgreSQL (Supabase Cloud)
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Hosting Environment:</span>
            <span className="font-bold text-foreground">Netlify Production CD (branch: main)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
