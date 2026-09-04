import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface EstablishmentSettings {
  name: string;
  branch?: string;
  address: string;
  contact_number?: string;
  phone?: string;
  email: string;
  operating_hours?: string;
  hours?: string;
  currency: string;
  tax_rate?: number;
  receipt_footer?: string;
}

export interface NotificationSettings {
  lowStockThreshold?: number;
  low_stock_threshold?: number;
  expiryNoticeDays?: number;
  expiry_warning_days?: number;
  emailAlerts?: boolean;
  email_alerts?: boolean;
  soundAlerts?: boolean;
  fefoAutoAllocation?: boolean;
  autoDailyReminder?: boolean;
  auto_daily_reminder?: boolean;
  sms_alerts?: boolean;
}

/**
 * Fetch a system setting by key from PostgreSQL.
 */
export async function getSystemSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error || !data) {
      const cached = localStorage.getItem(`kuventory_setting_${key}`);
      return cached ? JSON.parse(cached) : fallback;
    }

    // Update local cache
    localStorage.setItem(`kuventory_setting_${key}`, JSON.stringify(data.value));
    return data.value as T;
  } catch {
    const cached = localStorage.getItem(`kuventory_setting_${key}`);
    return cached ? JSON.parse(cached) : fallback;
  }
}

/**
 * Save a system setting to PostgreSQL.
 */
export async function setSystemSetting<T>(key: string, value: T): Promise<void> {
  // Update local cache immediately
  localStorage.setItem(`kuventory_setting_${key}`, JSON.stringify(value));

  const { error } = await supabase.rpc('set_system_setting', {
    p_key: key,
    p_value: value,
  });

  if (error) {
    console.error('set_system_setting RPC error:', error);
    // Fallback: direct table upsert
    const { error: upsertErr } = await supabase
      .from('system_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (upsertErr) throw upsertErr;
  }
}

/**
 * Hook to retrieve and cache system settings with automatic TanStack Query invalidation.
 */
export function useSystemSetting<T>(key: string, fallback: T) {
  return useQuery({
    queryKey: ['system-setting', key],
    queryFn: () => getSystemSetting<T>(key, fallback),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to update system setting with cache synchronization.
 */
export function useUpdateSystemSetting<T>(key: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (value: T) => setSystemSetting<T>(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-setting', key] });
    },
  });
}
