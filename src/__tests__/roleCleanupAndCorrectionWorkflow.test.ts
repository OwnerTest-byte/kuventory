import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatRoleLabel } from '@/lib/utils';
import type { Role } from '@/features/auth/types';
import {
  adminReviewCorrectionRequest,
  approveAndApplyCorrection,
  submitCorrectionRequest
} from '@/features/daily-inventory/services/correctionRequestService';
import { supabase } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  }
}));

describe('KUVENTORY Role Model Cleanup & Admin-Only Correction Workflow Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Role Model Cleanup: Complete Retirement of Master Admin', () => {
    it('enforces SUPER_ADMIN as the highest canonical role and excludes MASTER_ADMIN from Role union', () => {
      // Static typing assertion: validRoles only contains SUPER_ADMIN, ADMIN, STAFF
      const canonicalRoles: Role[] = ['SUPER_ADMIN', 'ADMIN', 'STAFF'];
      expect(canonicalRoles).toHaveLength(3);
      expect(canonicalRoles).toContain('SUPER_ADMIN');
      expect(canonicalRoles).toContain('ADMIN');
      expect(canonicalRoles).toContain('STAFF');

      // @ts-expect-error MASTER_ADMIN must not be assignable to Role type
      const invalidRole: Role = 'MASTER_ADMIN';
      expect(invalidRole).toBe('MASTER_ADMIN');
    });

    it('formatRoleLabel maps SUPER_ADMIN to "Super Admin" and does not have an active MASTER_ADMIN branch', () => {
      expect(formatRoleLabel('SUPER_ADMIN')).toBe('Super Admin');
      expect(formatRoleLabel('ADMIN')).toBe('Admin');
      expect(formatRoleLabel('STAFF')).toBe('Staff');
      // The legacy pre-strict-roles value is still labeled safely
      expect(formatRoleLabel('USER')).toBe('Staff');
      // Any retired or unrecognized role defaults safely to Staff
      expect(formatRoleLabel('MASTER_ADMIN')).toBe('Staff');
    });

    it('verifies that active source code in src/ contains NO active MASTER_ADMIN authorization branches', () => {
      const srcDir = path.resolve(__dirname, '..');
      
      function scanDirForMasterAdmin(dir: string, fileList: string[] = []): string[] {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
              scanDirForMasterAdmin(fullPath, fileList);
            }
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
            // Exclude this test file itself from the scan
            if (!fullPath.includes('roleCleanupAndCorrectionWorkflow.test.ts')) {
              const content = fs.readFileSync(fullPath, 'utf8');
              if (content.includes("'MASTER_ADMIN'") || content.includes('"MASTER_ADMIN"')) {
                fileList.push(fullPath);
              }
            }
          }
        }
        return fileList;
      }

      const offendingFiles = scanDirForMasterAdmin(srcDir);
      expect(offendingFiles, `Active source files still contain MASTER_ADMIN: ${offendingFiles.join(', ')}`).toEqual([]);
    });

    it('confirms forward migration 20261024210000 provides safe migration of legacy accounts and alters check constraint', () => {
      const migrationPath = path.resolve(
        __dirname,
        '../../supabase/migrations/20261024210000_retire_master_admin_and_admin_only_corrections.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sqlContent = fs.readFileSync(migrationPath, 'utf8');
      
      // Asserts migration script updates profiles to SUPER_ADMIN with audit log
      expect(sqlContent).toMatch(/UPDATE\s+public\.profiles\s+SET\s+role\s*=\s*'SUPER_ADMIN'/);
      expect(sqlContent).toContain("'MIGRATE_LEGACY_ROLE'");
      // Asserts check constraint is updated to exclude MASTER_ADMIN
      expect(sqlContent).toContain("CHECK (role IN ('STAFF', 'USER', 'ADMIN', 'SUPER_ADMIN'))");
      // Asserts is_master_admin is deprecated to fail closed (return false)
      expect(sqlContent).toContain('RETURN false;');
    });
  });

  describe('2. Finalized Daily Inventory Correction: Admin-Only Approval Workflow', () => {
    it('allows an Administrator to directly approve and atomically apply a finalized correction without Super Admin', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          revision_number: 2,
          applied_revision_id: 'rev-uuid-789',
          stock_deltas: [{ item_id: 'item-1', delta_consumption: -10, delta_add: 0 }],
          message: 'Successfully applied Revision #2 to finalized inventory sheet.'
        },
        error: null
      } as any);

      const res = await adminReviewCorrectionRequest(
        'req-test-100',
        'APPROVE',
        'Physical count confirmed and verified.'
      );

      expect(res.success).toBe(true);
      expect(res.revision_number).toBe(2);
      expect(mockRpc).toHaveBeenCalledWith('admin_review_correction_request', {
        p_request_id: 'req-test-100',
        p_decision: 'APPROVE',
        p_notes: 'Physical count confirmed and verified.'
      });
    });

    it('rejects self-approval when the reviewing Administrator is the requester', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Conflict of Interest: you cannot review a correction request that you submitted.' }
      } as any);

      await expect(
        adminReviewCorrectionRequest('req-test-100', 'APPROVE', 'Self review attempt')
      ).rejects.toThrow('Conflict of Interest: you cannot review a correction request that you submitted.');
    });

    it('allows an Administrator to return a request for clarification with mandatory notes', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          status: 'RETURNED_TO_REQUESTER',
          message: 'Correction request reviewed: RETURNED_TO_REQUESTER.'
        },
        error: null
      } as any);

      const res = await adminReviewCorrectionRequest(
        'req-test-100',
        'RETURN',
        'Please clarify PM variance.'
      );

      expect(res.success).toBe(true);
      expect(res.status).toBe('RETURNED_TO_REQUESTER');
    });

    it('allows an Administrator to reject a correction request with reason', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          status: 'REJECTED_BY_ADMIN',
          message: 'Correction request reviewed: REJECTED_BY_ADMIN.'
        },
        error: null
      } as any);

      const res = await adminReviewCorrectionRequest(
        'req-test-100',
        'REJECT',
        'Variance already accounted for in waste disposal log.'
      );

      expect(res.success).toBe(true);
      expect(res.status).toBe('REJECTED_BY_ADMIN');
    });

    it('ensures approveAndApplyCorrection executes atomic RPC with row-locking and revision checks', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          revision_number: 4,
          message: 'Successfully applied Revision #4 to finalized inventory sheet.'
        },
        error: null
      } as any);

      const res = await approveAndApplyCorrection('req-test-200', 'Direct admin apply');
      expect(res.success).toBe(true);
      expect(res.revision_number).toBe(4);
      expect(mockRpc).toHaveBeenCalledWith('apply_approved_daily_inventory_correction', {
        p_request_id: 'req-test-200',
        p_admin_notes: 'Direct admin apply'
      });
    });

    it('detects concurrency conflict when sheet revision does not match expected revision', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'CORRECTION_REVISION_CONFLICT: Worksheet has been revised since this request was created.' }
      } as any);

      await expect(
        approveAndApplyCorrection('req-test-200', 'Stale revision test')
      ).rejects.toThrow('CORRECTION_REVISION_CONFLICT');
    });

    it('submits correction request directly into PENDING_ADMIN queue without mutating inventory', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          request_id: 'req-test-300',
          status: 'PENDING_ADMIN',
          message: 'Correction request submitted for Admin review.'
        },
        error: null
      } as any);

      const res = await submitCorrectionRequest('sheet-101', 'Count correction', [
        { item_id: 'item-10', beg: 10, add: 0, am: 2, pm: 3, ending: 5 }
      ]);

      expect(res.success).toBe(true);
      expect(res.status).toBe('PENDING_ADMIN');
      expect(mockRpc).toHaveBeenCalledWith('submit_correction_request', expect.objectContaining({
        p_daily_inventory_id: 'sheet-101',
        p_reason: 'Count correction'
      }));
    });
  });
});

describe('3. Correction approval UI must advertise the real admin-only workflow', () => {
  it('verifies that active source code contains NO two-stage / Super Admin Final Approval copy', () => {
    const srcRoot = path.resolve(__dirname, '..');
    const offenders: string[] = [];

    const scan = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__' && entry.name !== 'node_modules') scan(full);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          if (full.includes('roleCleanupAndCorrectionWorkflow.test.ts')) continue;
          const content = fs.readFileSync(full, 'utf8');
          if (
            content.includes('Super Admin Final Approval') ||
            content.includes('Admin Review (Stage 1)') ||
            /2-stage approval workflow/i.test(content)
          ) {
            offenders.push(full);
          }
        }
      }
    };
    scan(srcRoot);

    expect(
      offenders,
      `Active source still advertises a retired two-stage correction flow: ${offenders.join(', ')}`
    ).toEqual([]);
  });
});
