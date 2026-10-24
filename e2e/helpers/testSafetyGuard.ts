import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface ValidatedE2EConfig {
  targetSupabaseUrl: string;
  targetAnonKey: string;
  superAdminEmail: string;
  superAdminPassword?: string;
  staffEmail: string;
  staffPassword?: string;
  isRemote: boolean;
  projectRef: string;
}

/**
 * Extracts Supabase project ref from a URL (e.g. "stotgoylyzltzpahuglc" from "https://stotgoylyzltzpahuglc.supabase.co").
 */
export function extractProjectRef(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('supabase.co')) {
      return parsed.hostname.split('.')[0];
    }
    return parsed.hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Hard Safety Guard: Validates that the target Supabase environment is safe for automated E2E tests.
 * Throws an immediate error BEFORE any client creation or network traffic if:
 * 1. Target URL or key is missing.
 * 2. Target is remote and not on the explicit disposable project ref allow-list.
 */
export function assertSafeE2EEnvironment(options?: {
  url?: string;
  key?: string;
  allowRemoteEnv?: string;
  disposableAllowListEnv?: string;
  superAdminEmail?: string;
  superAdminPassword?: string;
  staffEmail?: string;
  staffPassword?: string;
}): ValidatedE2EConfig {
  const url = options?.url ?? (process.env.PLAYWRIGHT_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
  const key = options?.key ?? (process.env.PLAYWRIGHT_SUPABASE_KEY || process.env.VITE_SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '');

  if (!url || !key) {
    throw new Error(
      'HARD ABORT: Missing E2E Supabase configuration. PLAYWRIGHT_SUPABASE_URL and PLAYWRIGHT_SUPABASE_KEY must be explicitly set.'
    );
  }

  const isLocal = url.includes('127.0.0.1') || url.includes('localhost');
  const projectRef = extractProjectRef(url);

  if (!isLocal) {
    const allowRemote = (options?.allowRemoteEnv ?? process.env.E2E_ALLOW_REMOTE) === 'true';
    const allowListStr = options?.disposableAllowListEnv ?? process.env.E2E_DISPOSABLE_PROJECT_REF_ALLOW_LIST ?? '';
    const allowedRefs = allowListStr
      .split(',')
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);

    if (!allowRemote) {
      throw new Error(
        `HARD ABORT: Refusing to execute E2E tests against remote target "${url}". Tests must run against a local disposable container (127.0.0.1) or set E2E_ALLOW_REMOTE=true with an explicit disposable project ref allow-list.`
      );
    }

    if (allowedRefs.length === 0 || !allowedRefs.includes(projectRef.toLowerCase())) {
      throw new Error(
        `HARD ABORT: Remote target project ref "${projectRef}" is NOT in the approved disposable staging allow-list (E2E_DISPOSABLE_PROJECT_REF_ALLOW_LIST). Automated tests will not execute against unapproved or production databases.`
      );
    }
  }

  const superAdminEmail = options?.superAdminEmail ?? process.env.E2E_SUPER_ADMIN_EMAIL ?? 'superadmin@kuventory.com';
  const superAdminPassword = options?.superAdminPassword ?? process.env.E2E_SUPER_ADMIN_PASSWORD;
  const staffEmail = options?.staffEmail ?? process.env.E2E_STAFF_EMAIL ?? 'staff@kuventory.com';
  const staffPassword = options?.staffPassword ?? process.env.E2E_STAFF_PASSWORD;

  return {
    targetSupabaseUrl: url,
    targetAnonKey: key,
    superAdminEmail,
    superAdminPassword,
    staffEmail,
    staffPassword,
    isRemote: !isLocal,
    projectRef,
  };
}

/**
 * Creates an authorized test client ONLY after verifying the target environment is safe.
 */
export function createSafeTestClient(config: ValidatedE2EConfig): SupabaseClient {
  return createClient(config.targetSupabaseUrl, config.targetAnonKey);
}
