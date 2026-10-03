import { describe, it, expect } from 'vitest';
import type { StockBatch } from '../types';

/**
 * 0-Quantity Batch Filter & FEFO Allocation Queue Logic
 * Mirrors the exact filtering and ordering implemented in ItemDetailsPage and the API.
 */
export function filterAndSortAllocationQueue(batches: StockBatch[]): StockBatch[] {
  // 1. Mandatory 0-Quantity filter: strictly exclude depleted batches (quantity <= 0)
  const activeBatches = batches.filter((batch) => batch.quantity > 0);

  // 2. FEFO Ordering: earliest expiry date first; null expiry date last
  return activeBatches.sort((a, b) => {
    if (!a.expiry_date && b.expiry_date) return 1;
    if (!b.expiry_date && a.expiry_date) return -1;
    if (!a.expiry_date && !b.expiry_date) return 0;
    return new Date(a.expiry_date!).getTime() - new Date(b.expiry_date!).getTime();
  });
}

describe('0-Quantity Batch Filtering & FEFO Allocation Queue (Unit Tests)', () => {
  const mixedBatches: StockBatch[] = [
    {
      id: 'batch-zero-1',
      item_id: 'item-1',
      batch_code: 'BATCH-DEPLETED-A',
      quantity: 0,
      expiry_date: '2026-10-10',
      created_at: '2026-09-01T00:00:00Z',
      version: 1,
    },
    {
      id: 'batch-active-1',
      item_id: 'item-1',
      batch_code: 'BATCH-EXP-NOV',
      quantity: 25,
      expiry_date: '2026-11-20',
      created_at: '2026-09-02T00:00:00Z',
      version: 1,
    },
    {
      id: 'batch-zero-2',
      item_id: 'item-1',
      batch_code: 'BATCH-DEPLETED-B',
      quantity: 0,
      expiry_date: '2026-10-05',
      created_at: '2026-09-03T00:00:00Z',
      version: 1,
    },
    {
      id: 'batch-active-2',
      item_id: 'item-1',
      batch_code: 'BATCH-EXP-OCT',
      quantity: 15,
      expiry_date: '2026-10-15',
      created_at: '2026-09-04T00:00:00Z',
      version: 1,
    },
    {
      id: 'batch-no-exp',
      item_id: 'item-1',
      batch_code: 'BATCH-NO-EXPIRY',
      quantity: 40,
      expiry_date: null,
      created_at: '2026-09-05T00:00:00Z',
      version: 1,
    },
  ];

  it('filters out all 0-quantity batches from the allocation queue', () => {
    const queue = filterAndSortAllocationQueue(mixedBatches);

    // Should only have 3 active batches
    expect(queue).toHaveLength(3);
    expect(queue.some((b) => b.quantity === 0)).toBe(false);
    expect(queue.some((b) => b.id === 'batch-zero-1')).toBe(false);
    expect(queue.some((b) => b.id === 'batch-zero-2')).toBe(false);
  });

  it('orders active batches strictly by FEFO (earliest expiry first, null expiry last)', () => {
    const queue = filterAndSortAllocationQueue(mixedBatches);

    expect(queue[0].batch_code).toBe('BATCH-EXP-OCT'); // 2026-10-15
    expect(queue[1].batch_code).toBe('BATCH-EXP-NOV'); // 2026-11-20
    expect(queue[2].batch_code).toBe('BATCH-NO-EXPIRY'); // null expiry date
  });

  it('returns an empty array when all batches have 0 quantity', () => {
    const depletedOnly: StockBatch[] = [
      {
        id: 'b-01',
        item_id: 'item-1',
        batch_code: 'DEP-1',
        quantity: 0,
        expiry_date: '2026-10-01',
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'b-02',
        item_id: 'item-1',
        batch_code: 'DEP-2',
        quantity: 0,
        expiry_date: '2026-11-01',
        created_at: '2026-09-01T00:00:00Z',
      },
    ];

    const queue = filterAndSortAllocationQueue(depletedOnly);
    expect(queue).toEqual([]);
    expect(queue.length).toBe(0);
  });

  it('handles negative or invalid quantities defensively by filtering them out', () => {
    const anomalousBatches: StockBatch[] = [
      {
        id: 'b-neg',
        item_id: 'item-1',
        batch_code: 'NEG-1',
        quantity: -5,
        expiry_date: '2026-10-01',
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'b-valid',
        item_id: 'item-1',
        batch_code: 'VALID-1',
        quantity: 12,
        expiry_date: '2026-10-02',
        created_at: '2026-09-01T00:00:00Z',
      },
    ];

    const queue = filterAndSortAllocationQueue(anomalousBatches);
    expect(queue).toHaveLength(1);
    expect(queue[0].batch_code).toBe('VALID-1');
  });
});

/**
 * Pure Batch Status Classifier & Active Expiry View Filter Logic.
 * Directly mirrors the business rule in database views, API queries, and StockBatchesPage.
 */
export function classifyBatchStatus(
  batch: { quantity: number; expiry_date: string | null }, 
  referenceDate = new Date('2026-10-03T00:00:00Z')
): 'DEPLETED' | 'EXPIRED' | 'EXPIRING_SOON' | 'ACTIVE' {
  // CRITICAL RULE: If quantity <= 0, it is DEPLETED first. Never classify as active expired or expiring soon.
  if (batch.quantity <= 0) {
    return 'DEPLETED';
  }
  if (!batch.expiry_date) {
    return 'ACTIVE';
  }
  const expiry = new Date(batch.expiry_date);
  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);

  if (expiry < ref) {
    return 'EXPIRED';
  }
  const diffDays = Math.ceil((expiry.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 14) {
    return 'EXPIRING_SOON';
  }
  return 'ACTIVE';
}

export function filterActiveExpiringBatches(
  batches: StockBatch[], 
  referenceDate = new Date('2026-10-03T00:00:00Z'), 
  thresholdDays = 14
): StockBatch[] {
  return batches.filter(b => {
    if (b.quantity <= 0) return false; // Strictly positive quantity
    if (!b.expiry_date) return false;
    const expiry = new Date(b.expiry_date);
    const ref = new Date(referenceDate);
    ref.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((expiry.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= thresholdDays;
  });
}

export function filterActiveExpiredBatches(
  batches: StockBatch[], 
  referenceDate = new Date('2026-10-03T00:00:00Z')
): StockBatch[] {
  return batches.filter(b => {
    if (b.quantity <= 0) return false; // Strictly positive quantity
    if (!b.expiry_date) return false;
    const expiry = new Date(b.expiry_date);
    const ref = new Date(referenceDate);
    ref.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);
    return expiry < ref;
  });
}

describe('Zero-Stock Expiry Rule: 5 Critical Cases (Directive Section 1)', () => {
  const refDate = new Date('2026-10-03T00:00:00Z');

  // Case 1: expired + zero quantity
  const case1_expiredZero: StockBatch = {
    id: 'case-1',
    item_id: 'item-1',
    batch_code: 'B-EXP-ZERO',
    quantity: 0,
    expiry_date: '2026-09-15', // Past date
    created_at: '2026-08-01T00:00:00Z',
  };

  // Case 2: expiring soon + zero quantity
  const case2_expiringSoonZero: StockBatch = {
    id: 'case-2',
    item_id: 'item-1',
    batch_code: 'B-EXPIRING-ZERO',
    quantity: 0,
    expiry_date: '2026-10-08', // 5 days from refDate (within 14 days)
    created_at: '2026-09-01T00:00:00Z',
  };

  // Case 3: expiring soon + positive quantity
  const case3_expiringSoonPositive: StockBatch = {
    id: 'case-3',
    item_id: 'item-1',
    batch_code: 'B-EXPIRING-POS',
    quantity: 20,
    expiry_date: '2026-10-08', // 5 days from refDate (within 14 days)
    created_at: '2026-09-01T00:00:00Z',
  };

  // Case 4: expired + positive quantity
  const case4_expiredPositive: StockBatch = {
    id: 'case-4',
    item_id: 'item-1',
    batch_code: 'B-EXPIRED-POS',
    quantity: 12,
    expiry_date: '2026-09-20', // Past date
    created_at: '2026-08-10T00:00:00Z',
  };

  // Case 5: no expiry
  const case5_noExpiry: StockBatch = {
    id: 'case-5',
    item_id: 'item-1',
    batch_code: 'B-NO-EXPIRY',
    quantity: 50,
    expiry_date: null,
    created_at: '2026-09-15T00:00:00Z',
  };

  const allBatches = [
    case1_expiredZero,
    case2_expiringSoonZero,
    case3_expiringSoonPositive,
    case4_expiredPositive,
    case5_noExpiry,
  ];

  it('Case 1: Expired + Zero Quantity must be classified as DEPLETED and excluded from active expired view', () => {
    expect(classifyBatchStatus(case1_expiredZero, refDate)).toBe('DEPLETED');
    const expiredView = filterActiveExpiredBatches([case1_expiredZero], refDate);
    expect(expiredView).toHaveLength(0);
    const expiringView = filterActiveExpiringBatches([case1_expiredZero], refDate);
    expect(expiringView).toHaveLength(0);
  });

  it('Case 2: Expiring Soon + Zero Quantity must be classified as DEPLETED and excluded from active expiring view', () => {
    expect(classifyBatchStatus(case2_expiringSoonZero, refDate)).toBe('DEPLETED');
    const expiringView = filterActiveExpiringBatches([case2_expiringSoonZero], refDate);
    expect(expiringView).toHaveLength(0);
    const expiredView = filterActiveExpiredBatches([case2_expiringSoonZero], refDate);
    expect(expiredView).toHaveLength(0);
  });

  it('Case 3: Expiring Soon + Positive Quantity must be classified as EXPIRING_SOON and included in active expiring view', () => {
    expect(classifyBatchStatus(case3_expiringSoonPositive, refDate)).toBe('EXPIRING_SOON');
    const expiringView = filterActiveExpiringBatches([case3_expiringSoonPositive], refDate);
    expect(expiringView).toHaveLength(1);
    expect(expiringView[0].batch_code).toBe('B-EXPIRING-POS');
    const expiredView = filterActiveExpiredBatches([case3_expiringSoonPositive], refDate);
    expect(expiredView).toHaveLength(0);
  });

  it('Case 4: Expired + Positive Quantity must be classified as EXPIRED and included in active expired view', () => {
    expect(classifyBatchStatus(case4_expiredPositive, refDate)).toBe('EXPIRED');
    const expiredView = filterActiveExpiredBatches([case4_expiredPositive], refDate);
    expect(expiredView).toHaveLength(1);
    expect(expiredView[0].batch_code).toBe('B-EXPIRED-POS');
    const expiringView = filterActiveExpiringBatches([case4_expiredPositive], refDate);
    expect(expiringView).toHaveLength(0);
  });

  it('Case 5: No Expiry must be classified as ACTIVE and excluded from both active expiry views', () => {
    expect(classifyBatchStatus(case5_noExpiry, refDate)).toBe('ACTIVE');
    const expiredView = filterActiveExpiredBatches([case5_noExpiry], refDate);
    expect(expiredView).toHaveLength(0);
    const expiringView = filterActiveExpiringBatches([case5_noExpiry], refDate);
    expect(expiringView).toHaveLength(0);
  });

  it('Correctly separates Active Expiry View from Historical Records without destructive deletion', () => {
    // Active expiring stock view only returns case 3
    const activeExpiring = filterActiveExpiringBatches(allBatches, refDate);
    expect(activeExpiring.map(b => b.id)).toEqual(['case-3']);

    // Active expired stock view only returns case 4
    const activeExpired = filterActiveExpiredBatches(allBatches, refDate);
    expect(activeExpired.map(b => b.id)).toEqual(['case-4']);

    // Full historical inventory records remain intact (all 5 records preserved)
    expect(allBatches).toHaveLength(5);
    expect(allBatches.some(b => b.id === 'case-1')).toBe(true);
    expect(allBatches.some(b => b.id === 'case-2')).toBe(true);
  });
});
