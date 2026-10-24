import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  logger.error('CRITICAL: Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are missing. Refusing to connect to arbitrary fallback projects.');
}

// Fallback to local disposable dummy client if variables are absent to fail closed safely
export const supabase = createClient(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabaseAnonKey || 'dummy_anon_key_unconfigured'
);

if (typeof window !== 'undefined') {
  (window as any).supabase = supabase;
}
