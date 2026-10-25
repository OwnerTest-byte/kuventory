import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Regression guard for migration 20261026160000 (staff request pipeline +
 * role boundary):
 *  - the staff_change_requests table with its RLS (own-or-admin SELECT,
 *    own PENDING INSERT, NO client UPDATE/DELETE),
 *  - submit RPC: per-type payload validation, duplicate-pending guard,
 *    admin notifications, masked audit,
 *  - review RPC: Approve & Apply / Return / Reject, in-transaction apply,
 *    FAILED-not-fake-success, self-review blocked, requester notified,
 *  - the role boundary: direct client writes to catalog/stock/worksheet
 *    structure are admin-only; staff worksheet edits restricted to
 *    add/sales_am/sales_pm by the trigger; receive/corrections untouched.
 */

const MIGRATION_FILE = '20261026160000_staff_change_requests_and_role_boundary.sql';

function readMigration(): string {
  const migrationPath = path.resolve(__dirname, '../../supabase/migrations', MIGRATION_FILE);
  expect(fs.existsSync(migrationPath), `missing migration ${MIGRATION_FILE}`).toBe(true);
  return fs.readFileSync(migrationPath, 'utf8');
}

describe('Staff change requests + role boundary migration contract', () => {
  const sql = readMigration();

  it('creates the request table with the seven types and five statuses', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.staff_change_requests \(/);
    expect(sql).toContain("'ADD_ITEM', 'EDIT_ITEM', 'ARCHIVE_ITEM', 'ADJUST_STOCK',");
    expect(sql).toContain("'REASSIGN_TABLE', 'ADD_CATEGORY', 'REMOVE_FROM_SHEET'");
    expect(sql).toContain("status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'FAILED'))");
  });

  it('RLS: own-or-admin SELECT, own PENDING INSERT, no client UPDATE/DELETE', () => {
    expect(sql).toContain('ALTER TABLE public.staff_change_requests ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('requested_by = (SELECT auth.uid())\n    OR public.is_admin()');
    expect(sql).toContain('WITH CHECK (requested_by = (SELECT auth.uid()) AND status = \'PENDING\')');
    // The file must not create any UPDATE or DELETE policy on the table.
    expect(sql).not.toMatch(/CREATE POLICY[^;]*ON public\.staff_change_requests[^;]*FOR UPDATE/i);
    expect(sql).not.toMatch(/CREATE POLICY[^;]*ON public\.staff_change_requests[^;]*FOR DELETE/i);
    expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_change_requests');
  });

  it('submit RPC validates per type and guards duplicates', () => {
    const fn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.submit_staff_change_request'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.review_staff_change_request')
    );
    expect(fn).toContain('A reason describing the requested change is required');
    expect(fn).toContain('An expiry date is required when requesting initial stock');
    expect(fn).toContain('Specify at least one field to change');
    expect(fn).toContain('A station with that name already exists');
    expect(fn).toContain('no longer exists or the sheet is finalized');
    expect(fn).toContain('You already have a pending request for this item');
    expect(fn).toContain("'STAFF_CHANGE_REQUEST_SUBMITTED'");
  });

  it('review RPC implements the three actions with in-transaction apply', () => {
    const fn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.review_staff_change_request'),
      sql.indexOf('4. ROLE BOUNDARY')
    );
    expect(fn).toContain("v_clean_decision NOT IN ('APPROVE', 'RETURN', 'REJECT')");
    expect(fn).toContain('you cannot review your own change request');
    expect(fn).toContain("WHEN 'ADD_ITEM' THEN");
    expect(fn).toContain('public.create_inventory_item_with_initial_stock(');
    expect(fn).toContain('public.adjust_stock_to_target(');
    expect(fn).toContain("WHEN 'REMOVE_FROM_SHEET' THEN");
    // FAILED-not-fake-success
    expect(fn).toContain("status = 'FAILED'");
    expect(fn).toContain("'Apply failed: ' || SQLERRM");
    expect(fn).toContain("'STAFF_CHANGE_REQUEST_APPLIED'");
    // Notes required for RETURN/REJECT
    expect(fn).toContain('Notes are required when returning or rejecting a request');
  });

  it('role boundary: catalog/stock/worksheet structure are admin-writes', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.inventory_items');
    expect(sql).toContain('DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.categories');
    expect(sql.match(/WITH CHECK \(public\.is_admin\(\)\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql).toContain('DROP POLICY IF EXISTS "Users can delete daily_inventory_items if parent is DRAFT" ON public.daily_inventory_items');
    expect(sql).toContain('DROP POLICY IF EXISTS "Authenticated users can insert daily inventory revisions" ON public.daily_inventory_revisions');
    // Sheet updates tightened: staff cannot flip sheet state.
    expect(sql).toContain('DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.daily_inventory;');
  });

  it('staff worksheet edits restricted to operational columns by the trigger', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.guard_daily_inventory_item_edits()');
    const trigger = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_daily_inventory_item_edits()'));
    expect(trigger).toContain('NEW.beg IS DISTINCT FROM OLD.beg');
    expect(trigger).toContain('NEW.item_id IS DISTINCT FROM OLD.item_id');
    expect(trigger).toContain('Only administrators can modify worksheet structure');
    expect(trigger).toContain('CREATE TRIGGER trg_staff_editable_daily_items');
  });

  it('leaves the staff receive path and corrections flow untouched', () => {
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.receive_daily_inventory_stock');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.submit_correction_request');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.finalize_daily_inventory');
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
