import { describe, it, expect } from 'vitest';
import { differenceInDays, isBefore, startOfDay } from 'date-fns';

interface BatchTestItem {
  id: string;
  batch_code: string;
  quantity: number;
  expiry_date: string | null;
}

/**
 * Standard Kuventory FEFO sorting and priority assignment engine
 */
function sortBatchesByFEFO(batches: BatchTestItem[]): BatchTestItem[] {
  return [...batches].sort((a, b) => {
    // Depleted batches pushed to the bottom
    if (a.quantity <= 0 && b.quantity > 0) return 1;
    if (b.quantity <= 0 && a.quantity > 0) return -1;

    // Batches with no expiry pushed after dated batches
    if (!a.expiry_date && b.expiry_date) return 1;
    if (!b.expiry_date && a.expiry_date) return -1;
    if (!a.expiry_date && !b.expiry_date) return 0;

    return new Date(a.expiry_date!).getTime() - new Date(b.expiry_date!).getTime();
  });
}

function getBatchPriority(batch: BatchTestItem, index: number, referenceDate: Date = new Date()) {
  if (!batch.expiry_date) {
    return { priorityText: 'NORMAL', isExpired: false, daysLeft: null };
  }

  const expiry = new Date(batch.expiry_date);
  const today = startOfDay(referenceDate);
  const isExpired = isBefore(expiry, today);
  const daysLeft = differenceInDays(expiry, today);

  if (isExpired) {
    return { priorityText: 'EXPIRED', isExpired: true, daysLeft };
  }

  if (index === 0) {
    return { priorityText: 'USE FIRST', isExpired: false, daysLeft };
  }

  if (index === 1) {
    return { priorityText: 'NEXT', isExpired: false, daysLeft };
  }

  return { priorityText: 'NORMAL', isExpired: false, daysLeft };
}

describe('FEFO (First-Expired, First-Out) Priority Engine (QA Verification)', () => {
  const mockBatches: BatchTestItem[] = [
    { id: 'b3', batch_code: 'BATCH-2026-03', quantity: 20, expiry_date: '2026-12-31' },
    { id: 'b1', batch_code: 'BATCH-2026-01', quantity: 50, expiry_date: '2026-10-01' },
    { id: 'b2', batch_code: 'BATCH-2026-02', quantity: 30, expiry_date: '2026-11-15' },
    { id: 'b4', batch_code: 'BATCH-NO-EXP', quantity: 15, expiry_date: null },
  ];

  it('correctly sorts active batches by earliest expiration first', () => {
    const sorted = sortBatchesByFEFO(mockBatches);
    expect(sorted[0].id).toBe('b1'); // 2026-10-01
    expect(sorted[1].id).toBe('b2'); // 2026-11-15
    expect(sorted[2].id).toBe('b3'); // 2026-12-31
    expect(sorted[3].id).toBe('b4'); // null expiry date last
  });

  it('depleted batches (qty = 0) are deprioritized below in-stock batches', () => {
    const batchesWithDepleted: BatchTestItem[] = [
      { id: 'depleted', batch_code: 'DEP-01', quantity: 0, expiry_date: '2026-09-01' },
      { id: 'instock', batch_code: 'STK-01', quantity: 25, expiry_date: '2026-12-01' },
    ];
    const sorted = sortBatchesByFEFO(batchesWithDepleted);
    expect(sorted[0].id).toBe('instock');
    expect(sorted[1].id).toBe('depleted');
  });

  it('assigns USE FIRST to the earliest expiring active batch and NEXT to the second', () => {
    const sorted = sortBatchesByFEFO(mockBatches);
    const refDate = new Date('2026-09-23');

    const p0 = getBatchPriority(sorted[0], 0, refDate);
    expect(p0.priorityText).toBe('USE FIRST');
    expect(p0.isExpired).toBe(false);
    expect(p0.daysLeft).toBe(8); // 8 days until 2026-10-01

    const p1 = getBatchPriority(sorted[1], 1, refDate);
    expect(p1.priorityText).toBe('NEXT');
    expect(p1.isExpired).toBe(false);

    const p2 = getBatchPriority(sorted[2], 2, refDate);
    expect(p2.priorityText).toBe('NORMAL');
  });

  it('flags expired batches correctly when expiration date is in the past', () => {
    const expiredBatch: BatchTestItem = {
      id: 'exp1',
      batch_code: 'EXP-PAST',
      quantity: 10,
      expiry_date: '2026-09-01'
    };
    const refDate = new Date('2026-09-23');
    const priority = getBatchPriority(expiredBatch, 0, refDate);

    expect(priority.isExpired).toBe(true);
    expect(priority.priorityText).toBe('EXPIRED');
    expect(priority.daysLeft).toBeLessThan(0);
  });
});
