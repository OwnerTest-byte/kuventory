import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Regression guard for migration 20261026150000 (strict roles + grants heal):
 *  - the system has exactly three roles: STAFF, ADMIN, SUPER_ADMIN — legacy
 *    'USER' rows are normalized and the constraint makes anything else
 *    impossible,
 *  - every RPC allowlist that gated staff abilities references the canonical
 *    STAFF role (receive/draft stay staff-accessible),
 *  - the view-grant heal restores authenticated reachability for
 *    inventory_stock_view (the live dashboard breakage) and adds an
 *    admin-only inspection RPC so the divergence class is visible.
 */

const MIGRATION_FILE = '20261026150000_strict_roles_and_grants_repair.sql';

function readMigration(): string {
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations', MIGRATION_FILE);
  expect(fs.existsSync(migrationPath), `missing migration ${MIGRATION_FILE}`).toBe(true);
  return fs.readFileSync(migrationPath, 'utf8');
}

describe('Strict roles + grants repair migration contract', () => {
  const sql = readMigration();

  it('normalizes legacy USER rows and enforces the three-role constraint', () => {
    expect(sql).toContain("UPDATE public.profiles SET role = 'STAFF' WHERE role = 'USER'");
    expect(sql).toContain("ADD CONSTRAINT profiles_role_check\n  CHECK (role IN ('STAFF', 'ADMIN', 'SUPER_ADMIN'))");
  });

  it('handle_new_user defaults to STAFF with the first-bootstrap-admin rule intact', () => {
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.handle_new_user'));
    expect(fn).toContain("v_role TEXT := 'STAFF'");
    expect(fn).toContain("v_role := 'ADMIN'");
  });

  it('admin_create_user + admin_update_user_role use the canonical allowlists', () => {
    const createFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_create_user'));
    expect(createFn).toContain("NOT IN ('STAFF', 'ADMIN', 'SUPER_ADMIN')");
    expect(createFn).toContain('only a Super Administrator can create a Super Administrator');
    expect(createFn).not.toContain('MASTER_ADMIN');

    const updateFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_update_user_role'));
    expect(updateFn).toContain("p_role NOT IN ('STAFF', 'ADMIN')");
    expect(updateFn).toContain("v_current_role = 'ADMIN' AND p_role = 'STAFF'");
  });

  it('staff abilities keep working: receive + draft allowlists include STAFF', () => {
    const receiveFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.receive_daily_inventory_stock'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.create_daily_inventory_draft')
    );
    expect(receiveFn).toContain("NOT IN ('STAFF', 'ADMIN', 'SUPER_ADMIN')");

    const draftFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.create_daily_inventory_draft'),
      sql.indexOf('GRANT EXECUTE ON FUNCTION public.create_daily_inventory_draft')
    );
    expect(draftFn).toContain("NOT IN ('STAFF', 'ADMIN', 'SUPER_ADMIN')");
  });

  it('unlock_account + recovery review use the canonical STAFF role in RBAC', () => {
    const unlockFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.unlock_account'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.review_assisted_recovery_request')
    );
    expect(unlockFn).toContain("v_target_profile.role != 'STAFF'");
    expect(unlockFn).toContain('Administrators may only unlock Staff accounts');
    expect(unlockFn).toContain("escalation_anchor_kept_until");

    const reviewFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.review_assisted_recovery_request'),
      sql.indexOf('GRANT SELECT ON ALL TABLES IN SCHEMA public')
    );
    expect(reviewFn).toContain("COALESCE(v_target_role, 'STAFF')");
    expect(reviewFn).toContain('Administrators may only review recovery requests for Staff accounts');
  });

  it('heals the view grants (the live dashboard breakage) and reaffirms security_invoker', () => {
    expect(sql).toContain('GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated');
    expect(sql).toContain('GRANT SELECT ON public.inventory_stock_view TO authenticated');
    expect(sql).toContain('GRANT SELECT ON public.stock_history_view TO authenticated');
    expect(sql).toContain('GRANT SELECT ON public.active_expiring_stock_view TO authenticated');
    expect(sql.match(/ALTER VIEW IF EXISTS public\.\w+ SET \(security_invoker = true\)/g)?.length).toBe(3);
  });

  it('adds the admin-only authenticated-grants inspection RPC', () => {
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.inspect_authenticated_grants'));
    expect(fn).toContain("v_caller_role NOT IN ('ADMIN', 'SUPER_ADMIN')");
    expect(fn).toContain('inventory_stock_view');
    expect(fn).toContain("REVOKE EXECUTE ON FUNCTION public.inspect_authenticated_grants() FROM anon, PUBLIC");
  });
});
