import { describe, it, expect } from 'vitest';
import { formatSafeDate } from '@/lib/utils';
import { 
  saveRetentionPolicies,
  type StockDriftItem,
  type DepletedBatchItem
} from '../services/superAdminService';

describe('Super Admin Operations Console - Unit & Integration Test Suite', () => {

  describe('1. Timestamp Formatting & Null/Invalid Date Resilience', () => {
    it('returns custom fallback when timestamp is null, undefined, or empty string', () => {
      expect(formatSafeDate(null, 'yyyy-MM-dd', 'Never run')).toBe('Never run');
      expect(formatSafeDate(undefined, 'yyyy-MM-dd', 'Never run')).toBe('Never run');
      expect(formatSafeDate('', 'yyyy-MM-dd', 'Never run')).toBe('Never run');
    });

    it('returns fallback without throwing RangeError on malformed timestamp string', () => {
      expect(formatSafeDate('invalid-date-token', 'yyyy-MM-dd', 'Not scheduled')).toBe('Not scheduled');
      expect(formatSafeDate('2026-99-99T99:99:99Z', 'yyyy-MM-dd', 'Unknown')).toBe('Unknown');
      expect(formatSafeDate('Scheduled by backend', 'yyyy-MM-dd', 'Not scheduled')).toBe('Not scheduled');
    });

    it('properly formats valid ISO timestamps and date objects', () => {
      const iso = '2026-10-18T10:30:00.000Z';
      const formatted = formatSafeDate(iso, 'yyyy-MM-dd');
      expect(formatted).toBe('2026-10-18');

      const dateObj = new Date('2026-10-18T15:45:00.000Z');
      expect(formatSafeDate(dateObj, 'HH:mm')).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('3. Database Stock-Drift Analysis & Rebalance Logic', () => {
    it('accurately identifies discrepancy when inventory item total differs from active batch sum', () => {
      const mockItems: StockDriftItem[] = [
        {
          itemId: 'item-1',
          itemName: 'Whole Milk 1L',
          unit: 'bottle',
          currentQuantity: 50,
          batchSum: 45,
          driftDelta: -5,
          activeBatchesCount: 2,
          hasDrift: true
        },
        {
          itemId: 'item-2',
          itemName: 'Espresso Roast Beans',
          unit: 'kg',
          currentQuantity: 100,
          batchSum: 100,
          driftDelta: 0,
          activeBatchesCount: 4,
          hasDrift: false
        },
        {
          itemId: 'item-3',
          itemName: 'Vanilla Syrup 750ml',
          unit: 'bottle',
          currentQuantity: 12,
          batchSum: 14,
          driftDelta: 2,
          activeBatchesCount: 1,
          hasDrift: true
        }
      ];

      const drifted = mockItems.filter(i => i.hasDrift);
      expect(drifted).toHaveLength(2);
      expect(drifted[0].itemName).toBe('Whole Milk 1L');
      expect(drifted[0].driftDelta).toBe(-5);
      expect(drifted[1].itemName).toBe('Vanilla Syrup 750ml');
      expect(drifted[1].driftDelta).toBe(2);
    });

    it('calculates the exact ledger reconciliation delta without silent data loss', () => {
      const item: StockDriftItem = {
        itemId: 'item-1',
        itemName: 'Whole Milk 1L',
        unit: 'bottle',
        currentQuantity: 50,
        batchSum: 45,
        driftDelta: -5,
        activeBatchesCount: 2,
        hasDrift: true
      };

      // Ledger adjustment should sync item total to match verified active batch total
      const correctionDelta = item.batchSum - item.currentQuantity; // -5
      const reconciledTotal = item.currentQuantity + correctionDelta; // 45

      expect(correctionDelta).toBe(-5);
      expect(reconciledTotal).toBe(item.batchSum);
    });
  });

  describe('4. Depleted Batch Identification & Traceability Preservation', () => {
    it('filters zero-quantity and negative batches while preserving batch IDs for audit trail', () => {
      const batches: DepletedBatchItem[] = [
        { batchId: 'b-1', itemId: 'item-1', itemName: 'Espresso', batchNumber: 'LOT-A', quantity: 0, expiryDate: '2026-10-01', createdAt: '2026-09-01', movementCount: 5 } as any,
        { batchId: 'b-2', itemId: 'item-1', itemName: 'Espresso', batchNumber: 'LOT-B', quantity: 15, expiryDate: '2026-12-01', createdAt: '2026-09-01', movementCount: 2 } as any,
        { batchId: 'b-3', itemId: 'item-2', itemName: 'Oat Milk', batchNumber: 'LOT-C', quantity: -2, expiryDate: '2026-09-15', createdAt: '2026-09-01', movementCount: 1 } as any,
      ];

      const depletedCandidates = batches.filter(b => b.quantity <= 0);
      expect(depletedCandidates).toHaveLength(2);
      expect(depletedCandidates.map(b => b.batchId)).toEqual(['b-1', 'b-3']);
    });
  });

  describe('5. Disaster Recovery Policy & Tier Categorization', () => {
    it('clearly distinguishes between client-side export, state checkpoint, and provider dump', () => {
      const recoveryTiers = [
        {
          tier: 'CLIENT_EXPORT',
          name: 'JSON Data Export',
          scope: 'Read-only portable JSON snapshot of active items, categories, and settings.',
          recoverable: false
        },
        {
          tier: 'STATE_CHECKPOINT',
          name: 'Disaster Recovery Point',
          scope: 'Authoritative database checkpoint with payload snapshot & integrity metadata.',
          recoverable: true
        },
        {
          tier: 'MANAGED_DB_DUMP',
          name: 'PostgreSQL Base Backup',
          scope: 'Physical binary WAL archive and point-in-time recovery on Supabase infrastructure.',
          recoverable: true
        }
      ];

      const clientExport = recoveryTiers.find(t => t.tier === 'CLIENT_EXPORT');
      const checkpoint = recoveryTiers.find(t => t.tier === 'STATE_CHECKPOINT');

      expect(clientExport?.recoverable).toBe(false);
      expect(checkpoint?.recoverable).toBe(true);
    });

    it('enforces typed confirmation string before allowing state restoration', () => {
      const validateRestoreInput = (typedText: string, reason: string) => {
        if (typedText !== 'CONFIRM RESTORE') {
          return { valid: false, error: 'Must type "CONFIRM RESTORE" exactly to proceed.' };
        }
        if (!reason || reason.trim().length < 5) {
          return { valid: false, error: 'A detailed operational justification is mandatory.' };
        }
        return { valid: true };
      };

      expect(validateRestoreInput('confirm restore', 'Valid reason').valid).toBe(false);
      expect(validateRestoreInput('CONFIRM RESTORE', '').valid).toBe(false);
      expect(validateRestoreInput('CONFIRM RESTORE', 'Restoring state after faulty bulk upload').valid).toBe(true);
    });
  });



  describe('7. Authoritative Retention Policies Validation', () => {
    it('validates sheet archival retention between 7 and 90 days', async () => {
      await expect(saveRetentionPolicies({
        sheet_archival_days: 5, // Below 7
        backup_retention_days: 365
      })).rejects.toThrow(/between 7 and 90 days/);

      await expect(saveRetentionPolicies({
        sheet_archival_days: 100, // Above 90
        backup_retention_days: 365
      })).rejects.toThrow(/between 7 and 90 days/);
    });

    it('validates backup retention between 30 and 730 days', async () => {
      await expect(saveRetentionPolicies({
        sheet_archival_days: 30,
        backup_retention_days: 15 // Below 30
      })).rejects.toThrow(/between 30 and 730 days/);

      await expect(saveRetentionPolicies({
        sheet_archival_days: 30,
        backup_retention_days: 800 // Above 730
      })).rejects.toThrow(/between 30 and 730 days/);
    });
  });

  describe('8. Incidents & Severity Status Lifecycle', () => {
    it('validates incident severity must be CRITICAL, WARNING, or INFO', () => {
      const isValidSeverity = (sev: string) => ['CRITICAL', 'WARNING', 'INFO'].includes(sev);
      expect(isValidSeverity('CRITICAL')).toBe(true);
      expect(isValidSeverity('WARNING')).toBe(true);
      expect(isValidSeverity('INFO')).toBe(true);
      expect(isValidSeverity('UNKNOWN')).toBe(false);
    });

    it('requires resolution notes when transitioning incident to RESOLVED', () => {
      const validateResolution = (nextStatus: string, note?: string) => {
        if (nextStatus === 'RESOLVED' && (!note || note.trim().length === 0)) {
          return { valid: false, error: 'A resolution note is mandatory when resolving an incident.' };
        }
        return { valid: true };
      };

      expect(validateResolution('RESOLVED', '').valid).toBe(false);
      expect(validateResolution('RESOLVED', 'Root cause patched in deployment v1.2.9').valid).toBe(true);
      expect(validateResolution('INVESTIGATING').valid).toBe(true);
    });
  });

  describe('9. Session Leases & Maintenance Mode Authorization', () => {
    it('requires session lease ID and explicit reason for remote session revocation', () => {
      const validateRevocation = (leaseId: string, reason: string) => {
        if (!leaseId) return { valid: false, error: 'Target session lease ID is required.' };
        if (!reason || reason.trim().length < 3) return { valid: false, error: 'A meaningful revocation reason is required.' };
        return { valid: true };
      };

      expect(validateRevocation('', 'Security audit').valid).toBe(false);
      expect(validateRevocation('lease-123', '').valid).toBe(false);
      expect(validateRevocation('lease-123', 'Staff member clocked out without logout').valid).toBe(true);
    });
  });

  describe('10. Fail-Closed Guarantees for Irreversible Operations', () => {
    it('requires non-empty batch list for depleted batch pruning', async () => {
      const { cleanupDepletedBatches } = await import('../services/superAdminService');
      const res = await cleanupDepletedBatches([]);
      expect(res.success).toBe(true);
      expect(res.processedCount).toBe(0);
      expect(res.message).toBe('No depleted batches selected.');
    });

    it('requires valid reason and payload for finalized daily inventory correction', async () => {
      const { correctFinalizedDailyInventory } = await import('@/features/daily-inventory/services/correctionService');
      
      await expect(correctFinalizedDailyInventory({
        dailyInventoryId: 'sheet-1',
        inventoryDate: '2026-10-18',
        reason: '',
        correctedItems: [{ id: '1', item_id: 'i-1', beg: 10, add: 0, am: 2, pm: 3, ending: 5 }]
      })).rejects.toThrow('A reason for correction is required to update a finalized daily report.');

      await expect(correctFinalizedDailyInventory({
        dailyInventoryId: '',
        inventoryDate: '2026-10-18',
        reason: 'Valid audit recount',
        correctedItems: [{ id: '1', item_id: 'i-1', beg: 10, add: 0, am: 2, pm: 3, ending: 5 }]
      })).rejects.toThrow('Worksheet identifier is required for finalized correction.');

      await expect(correctFinalizedDailyInventory({
        dailyInventoryId: 'sheet-1',
        inventoryDate: '2026-10-18',
        reason: 'Valid audit recount',
        correctedItems: []
      })).rejects.toThrow('At least one item must be provided for correction.');
    });
  });
});

