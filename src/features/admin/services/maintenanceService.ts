import { supabase } from '@/lib/supabase';

export interface MaintenanceStatus {
  status: 'NORMAL' | 'MAINTENANCE' | 'RECOVERY';
  locked: boolean;
  reason?: string;
  locked_at?: string | null;
  locked_by?: string | null;
  updated_at?: string;
}

const DEFAULT_MAINTENANCE: MaintenanceStatus = {
  status: 'NORMAL',
  locked: false,
  reason: '',
  locked_at: null,
  locked_by: null,
};

/**
 * Fetch authoritative maintenance status from system_settings
 */
export async function getMaintenanceStatus(): Promise<MaintenanceStatus> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value, updated_at')
      .eq('key', 'maintenance_lock')
      .maybeSingle();

    if (error || !data?.value) {
      return DEFAULT_MAINTENANCE;
    }

    const val = data.value as any;
    const isLocked = Boolean(val.locked || val.status === 'MAINTENANCE' || val.status === 'RECOVERY');
    const statusVal = val.status || (isLocked ? 'MAINTENANCE' : 'NORMAL');

    return {
      status: statusVal,
      locked: isLocked,
      reason: val.reason || '',
      locked_at: val.locked_at || null,
      locked_by: val.locked_by || null,
      updated_at: data.updated_at,
    };
  } catch (err) {
    console.warn('Error checking maintenance status:', err);
    return DEFAULT_MAINTENANCE;
  }
}

/**
 * Super Admin toggles emergency maintenance lockdown
 */
export async function setMaintenanceLockdown(
  locked: boolean,
  reason: string = '',
  userEmail: string = 'Super Admin'
): Promise<MaintenanceStatus> {
  const newStatus: MaintenanceStatus = {
    status: locked ? 'MAINTENANCE' : 'NORMAL',
    locked,
    reason: reason.trim() || (locked ? 'Emergency maintenance lockdown activated' : ''),
    locked_at: locked ? new Date().toISOString() : null,
    locked_by: userEmail,
  };

  // 1. Update system_settings via set_system_setting RPC or direct update
  let rpcSuccess = false;
  try {
    const { error: rpcErr } = await supabase.rpc('set_system_setting', {
      p_key: 'maintenance_lock',
      p_value: newStatus,
    });
    if (!rpcErr) rpcSuccess = true;
  } catch (e) {
    console.warn('set_system_setting RPC fallback:', e);
  }

  if (!rpcSuccess) {
    const { error: upsertErr } = await supabase
      .from('system_settings')
      .upsert({
        key: 'maintenance_lock',
        value: newStatus,
        updated_at: new Date().toISOString(),
      });
    if (upsertErr) {
      throw new Error(`Failed to update maintenance state: ${upsertErr.message}`);
    }
  }

  // 2. Dispatch high-priority operational alert notification
  try {
    await supabase.from('notifications').insert({
      type: 'SYSTEM',
      title: locked ? 'EMERGENCY MAINTENANCE LOCKDOWN ACTIVE' : 'Maintenance Mode Lifted',
      message: locked 
        ? `Super Admin has placed KUVENTORY under emergency lockdown: ${newStatus.reason}. Operations are temporarily suspended.`
        : 'Normal operations restored. All systems are operational.',
      target_id: '/settings',
    } as any);
  } catch (notifErr) {
    console.warn('Maintenance notification broadcast error:', notifErr);
  }

  // 3. Log to audit trail
  try {
    const { data: authData } = await supabase.auth.getUser();
    await supabase.from('audit_logs').insert({
      user_id: authData?.user?.id,
      user_name: userEmail,
      role: 'SUPER_ADMIN',
      action: locked ? 'MAINTENANCE_LOCKDOWN_ACTIVATED' : 'MAINTENANCE_LOCKDOWN_DEACTIVATED',
      target: 'system_settings/maintenance_lock',
      details: JSON.stringify(newStatus),
    } as any);
  } catch (auditErr) {
    console.warn('Maintenance audit log error:', auditErr);
  }

  return newStatus;
}
