/**
 * Centralized test credential configuration for Playwright E2E suites.
 * Reads strictly from environment variables to prevent accidental credential leakage in version control.
 */

export const TEST_CREDENTIALS = {
  supabaseUrl: process.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || '',
  superAdminEmail: process.env.E2E_SUPER_ADMIN_EMAIL || 'superadmin@kuventory.com',
  superAdminPassword: process.env.E2E_SUPER_ADMIN_PASSWORD || '',
  rootAdminEmail: process.env.E2E_ROOT_ADMIN_EMAIL || 'master@kuventory.com',
  rootAdminPassword: process.env.E2E_SUPER_ADMIN_PASSWORD || '',
  adminEmail: process.env.E2E_ADMIN_EMAIL || 'admin@kuventory.com',
  adminPassword: process.env.E2E_ADMIN_PASSWORD || '',
  staffEmail: process.env.E2E_STAFF_EMAIL || 'staff@kuventory.com',
  staffPassword: process.env.E2E_STAFF_PASSWORD || '',
};
