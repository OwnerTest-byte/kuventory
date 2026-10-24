import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  submitCorrectionRequest,
  fetchCorrectionRequests,
  adminReviewCorrectionRequest,
  superAdminReviewCorrectionRequest,
  type ProposedCorrectionItem
} from '../services/correctionRequestService';
import { correctFinalizedDailyInventory } from '../services/correctionService';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  }
}));

describe('Finalized Daily Inventory Correction Approval & Atomic Reconciliation Suite (Phase 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Staff Correction Request Submission', () => {
    it('rejects submission with empty reason', async () => {
      await expect(
        submitCorrectionRequest('sheet-123', '   ', [
          { item_id: 'item-1', beg: 10, add: 5, am: 2, pm: 3, ending: 10 }
        ])
      ).rejects.toThrow('A legitimate reason is required');
    });

    it('rejects submission with missing items list', async () => {
      await expect(
        submitCorrectionRequest('sheet-123', 'Typo in AM count', [])
      ).rejects.toThrow('At least one proposed item correction must be specified');
    });

    it('successfully calls submit_correction_request RPC without modifying physical stock or daily sheet', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          request_id: 'req-456',
          status: 'PENDING_ADMIN',
          message: 'Correction request submitted for Admin review.'
        },
        error: null
      } as any);

      const items: ProposedCorrectionItem[] = [
        { item_id: 'item-1', item_name: 'Pork Skewers', unit: 'pcs', beg: 50, add: 20, am: 15, pm: 25, ending: 30 }
      ];

      const res = await submitCorrectionRequest('sheet-123', 'AM sales were 15 instead of 25', items);

      expect(res.success).toBe(true);
      expect(res.requestId).toBe('req-456');
      expect(res.status).toBe('PENDING_ADMIN');
      expect(mockRpc).toHaveBeenCalledWith('submit_correction_request', {
        p_daily_inventory_id: 'sheet-123',
        p_reason: 'AM sales were 15 instead of 25',
        p_idempotency_key: expect.stringMatching(/^idem_corr_sheet-123_/),
        p_proposed_items: [
          {
            item_id: 'item-1',
            item_name: 'Pork Skewers',
            unit: 'pcs',
            beg: 50,
            add: 20,
            am: 15,
            pm: 25,
            ending: 30
          }
        ]
      });
    });

    it('throws error if submit_correction_request RPC returns error', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Worksheet is not in FINALIZED status' }
      } as any);

      await expect(
        submitCorrectionRequest('sheet-123', 'Reason here', [
          { item_id: 'item-1', beg: 10, add: 0, am: 0, pm: 0, ending: 10 }
        ])
      ).rejects.toThrow('Worksheet is not in FINALIZED status');
    });
  });

  describe('2. Fetching Correction Requests', () => {
    it('queries daily_inventory_correction_requests table with proper ordering and relations', async () => {
      const mockSelect = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockResolvedValueOnce({
        data: [
          {
            id: 'req-1',
            daily_inventory_id: 'sheet-100',
            status: 'PENDING_ADMIN',
            reason: 'Count miscalculation'
          }
        ],
        error: null
      });

      const mockFrom = vi.mocked(supabase.from);
      mockFrom.mockReturnValue({
        select: mockSelect,
        order: mockOrder,
        eq: mockEq,
      } as any);

      mockSelect.mockReturnValue({
        order: mockOrder,
      });
      mockOrder.mockReturnValue({
        eq: mockEq,
      });

      const results = await fetchCorrectionRequests('sheet-100');
      expect(mockFrom).toHaveBeenCalledWith('daily_inventory_correction_requests');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('req-1');
    });
  });

  describe('3. Admin Stage 1 Review Workflow', () => {
    it('approves and forwards request to Super Admin', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          status: 'PENDING_SUPER_ADMIN',
          message: 'Correction request verified and forwarded to Super Admin for final approval.'
        },
        error: null
      } as any);

      const res = await adminReviewCorrectionRequest(
        'req-456',
        'APPROVE_AND_FORWARD',
        'Physical count verified against store audit log.'
      );

      expect(res.success).toBe(true);
      expect(res.status).toBe('PENDING_SUPER_ADMIN');
      expect(mockRpc).toHaveBeenCalledWith('admin_review_correction_request', {
        p_request_id: 'req-456',
        p_decision: 'APPROVE_AND_FORWARD',
        p_notes: 'Physical count verified against store audit log.'
      });
    });

    it('rejects request with required reviewer explanation', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          status: 'REJECTED_BY_ADMIN',
          message: 'Correction request rejected by Admin.'
        },
        error: null
      } as any);

      const res = await adminReviewCorrectionRequest(
        'req-456',
        'REJECT',
        'Count discrepancy already settled in shift report.'
      );

      expect(res.success).toBe(true);
      expect(res.status).toBe('REJECTED_BY_ADMIN');
    });

    it('prevents self-review when requester is the Admin (enforces separation of duties)', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Separation of duties violation: requester cannot review their own correction request.' }
      } as any);

      await expect(
        adminReviewCorrectionRequest('req-456', 'APPROVE_AND_FORWARD', 'Self approve attempt')
      ).rejects.toThrow('Separation of duties violation');
    });
  });

  describe('4. Super Admin Stage 2 Review & Atomic Stock Reconciliation', () => {
    it('executes atomic application and returns newly minted revision number', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          revision_number: 2,
          message: 'Correction request approved and applied. Revision 2 recorded.'
        },
        error: null
      } as any);

      const res = await superAdminReviewCorrectionRequest(
        'req-456',
        'APPROVE',
        'Approved after reviewing differential stock deltas.'
      );

      expect(res.success).toBe(true);
      expect(res.revision_number).toBe(2);
      expect(mockRpc).toHaveBeenCalledWith('super_admin_review_correction_request', {
        p_request_id: 'req-456',
        p_decision: 'APPROVE',
        p_notes: 'Approved after reviewing differential stock deltas.'
      });
    });

    it('fails closed when database transaction rolls back due to negative stock or concurrent modification', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Stock reconciliation failed: insufficient batch stock to consume.' }
      } as any);

      await expect(
        superAdminReviewCorrectionRequest('req-456', 'APPROVE', 'Attempting approval')
      ).rejects.toThrow('Stock reconciliation failed');
    });
  });

  describe('5. Fail-Closed correctionService (No Fake Success Fallbacks)', () => {
    it('fails closed and aborts correction if correct_finalized_daily_inventory RPC fails', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC correct_finalized_daily_inventory not found in schema cache' }
      } as any);

      // Verify that NO fallback to system_settings or fake success is performed
      await expect(
        correctFinalizedDailyInventory({
          dailyInventoryId: 'sheet-999',
          inventoryDate: '2026-10-24',
          reason: 'Correcting ending stock',
          correctedItems: [
            { id: 'item-row-1', item_id: 'raw-1', beg: 10, add: 5, am: 3, pm: 2, ending: 10 }
          ]
        })
      ).rejects.toThrow('Finalized worksheet correction failed on server: RPC correct_finalized_daily_inventory not found in schema cache');
    });

    it('fails closed if database returns success = false with error message', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: {
          success: false,
          message: 'Only Admin and Super Admin may correct finalized inventory'
        },
        error: null
      } as any);

      await expect(
        correctFinalizedDailyInventory({
          dailyInventoryId: 'sheet-999',
          inventoryDate: '2026-10-24',
          reason: 'Unauthorized test',
          correctedItems: [
            { id: 'item-row-1', item_id: 'raw-1', beg: 10, add: 5, am: 3, pm: 2, ending: 10 }
          ]
        })
      ).rejects.toThrow('Finalized worksheet correction rejected: Only Admin and Super Admin may correct finalized inventory');
    });

    it('succeeds and returns revision number when atomic RPC commits successfully', async () => {
      const mockRpc = vi.mocked(supabase.rpc);
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          revision_number: 3,
          message: 'Revision 3 recorded and stock reconciled successfully.'
        },
        error: null
      } as any);

      const res = await correctFinalizedDailyInventory({
        dailyInventoryId: 'sheet-999',
        inventoryDate: '2026-10-24',
        reason: 'Authorized correction',
        correctedItems: [
          { id: 'item-row-1', item_id: 'raw-1', beg: 10, add: 5, am: 3, pm: 2, ending: 10 }
        ]
      });

      expect(res.success).toBe(true);
      expect(res.revisionNumber).toBe(3);
    });
  });
});
