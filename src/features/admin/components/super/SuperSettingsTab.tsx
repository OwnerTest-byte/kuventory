import { useState } from 'react';
import { 
  Settings, Shield, CheckCircle2, Save, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';

export function SuperSettingsTab() {
  const [retentionDays, setRetentionDays] = useState(30);
  const [backupRetentionDays, setBackupRetentionDays] = useState(365);
  const [savedNotice, setSavedNotice] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSavePolicies = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await supabase.rpc('set_system_setting', {
        p_key: 'super_retention_policy',
        p_value: {
          sheet_archival_days: retentionDays,
          backup_retention_days: backupRetentionDays,
          updated_at: new Date().toISOString()
        }
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (err: any) {
      alert(`Error saving policies: ${err.message || 'Unknown error'}`);
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
              Automated data retention schedules, recovery policies, and emergency developer protocols
            </p>
          </div>
        </div>
      </div>

      {/* 2. Retention Policies Form */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs max-w-2xl space-y-5">
        <div>
          <h3 className="text-sm font-bold text-foreground">Data Retention & Archival Policies</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure automated pruning schedules for daily inventory sheets and backup snapshots
          </p>
        </div>

        <form onSubmit={handleSavePolicies} className="space-y-4">
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
            />
            <p className="text-[11px] text-muted-foreground">
              Sheets older than this threshold are archived automatically by the nightly sync job.
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
            />
            <p className="text-[11px] text-muted-foreground">
              Immutable monthly and disaster recovery points are preserved up to this threshold.
            </p>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <Button
              type="submit"
              disabled={isSaving}
              className="text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Save Retention Policies
            </Button>
            {savedNotice && (
              <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Policies Saved
              </span>
            )}
          </div>
        </form>
      </div>

      {/* 3. Developer & Hotline Card */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-xs max-w-2xl space-y-4">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Super Admin Developer Clearance Credentials
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tier 0 governance contact information registered for system password resets and emergency support
          </p>
        </div>

        <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Super Admin Identity:</span>
            <span className="font-mono font-bold text-foreground">superadmin@kuventory.com</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Direct Hotline / SMS:</span>
            <span className="font-mono font-bold text-primary">09917101298</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">System Authority Level:</span>
            <span className="font-bold text-emerald-500">Tier 0 (Root Authority)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Hosting & CI/CD Pipeline:</span>
            <span className="font-bold text-foreground">Netlify Continuous Deployment (main)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
