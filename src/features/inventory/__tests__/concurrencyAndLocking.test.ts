import { describe, it, expect } from 'vitest';

interface ConcurrencyItemState {
  id: string;
  item_name: string;
  current_qty: number;
  version: number;
  is_locked?: boolean;
}

/**
 * Optimistic Concurrency Control (OCC) Stock Mutation Function
 * Verifies version before modifying row, incrementing version atomically.
 */
export function deductStockWithOCC(
  item: ConcurrencyItemState,
  quantityToDeduct: number,
  expectedVersion?: number | null
): { success: boolean; updatedItem?: ConcurrencyItemState; error?: string; code?: string } {
  // If an expected version is provided, verify match (OCC check)
  if (expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== item.version) {
    return {
      success: false,
      error: `Concurrency conflict: Expected version ${expectedVersion} but item is currently at version ${item.version}.`,
      code: 'CONCURRENCY_CONFLICT',
    };
  }

  // Stock availability check
  if (item.current_qty < quantityToDeduct) {
    return {
      success: false,
      error: `Insufficient stock: requested ${quantityToDeduct}, available ${item.current_qty}.`,
      code: 'INSUFFICIENT_STOCK',
    };
  }

  // Atomically update balance and advance version
  const updatedItem: ConcurrencyItemState = {
    ...item,
    current_qty: item.current_qty - quantityToDeduct,
    version: item.version + 1,
  };

  return {
    success: true,
    updatedItem,
  };
}

/**
 * RBAC & Force Override Permission Evaluator
 */
export function evaluateForceOverridePermission(
  userRole: string,
  isRecordLocked: boolean
): { allowed: boolean; reason?: string } {
  const normalizedRole = userRole.toUpperCase();

  // If record is not locked, any standard operation can proceed
  if (!isRecordLocked) {
    return { allowed: true };
  }

  // If record IS locked, ONLY MASTER_ADMIN can force override
  if (normalizedRole === 'MASTER_ADMIN') {
    return { allowed: true, reason: 'MASTER_ADMIN_BYPASS_GRANTED' };
  }

  return {
    allowed: false,
    reason: `Permission denied: Role '${normalizedRole}' cannot override finalized/locked records. Requires MASTER_ADMIN.`,
  };
}

describe('Database Concurrency & Transaction Safety (Unit Tests)', () => {
  it('successfully deducts stock and increments version when versions match', () => {
    const initialItem: ConcurrencyItemState = {
      id: 'item-101',
      item_name: 'Espresso Beans 1kg',
      current_qty: 100,
      version: 1,
    };

    const result = deductStockWithOCC(initialItem, 15, 1);

    expect(result.success).toBe(true);
    expect(result.updatedItem?.current_qty).toBe(85);
    expect(result.updatedItem?.version).toBe(2);
  });

  it('detects concurrency conflict and rejects stale mutation when expected version does not match', () => {
    const modifiedItem: ConcurrencyItemState = {
      id: 'item-101',
      item_name: 'Espresso Beans 1kg',
      current_qty: 85,
      version: 2, // Changed by user A
    };

    // User B attempts to deduct using stale version 1
    const result = deductStockWithOCC(modifiedItem, 10, 1);

    expect(result.success).toBe(false);
    expect(result.code).toBe('CONCURRENCY_CONFLICT');
    expect(result.error).toContain('Concurrency conflict');
  });

  it('rejects deduction when requested quantity exceeds available stock', () => {
    const item: ConcurrencyItemState = {
      id: 'item-102',
      item_name: 'Almond Milk 1L',
      current_qty: 5,
      version: 3,
    };

    const result = deductStockWithOCC(item, 10, 3);

    expect(result.success).toBe(false);
    expect(result.code).toBe('INSUFFICIENT_STOCK');
    expect(result.error).toContain('Insufficient stock');
  });

  it('allows MASTER_ADMIN to force override locked records', () => {
    const res = evaluateForceOverridePermission('MASTER_ADMIN', true);
    expect(res.allowed).toBe(true);
    expect(res.reason).toBe('MASTER_ADMIN_BYPASS_GRANTED');
  });

  it('blocks regular ADMIN and STAFF from modifying locked records without MASTER_ADMIN role', () => {
    const adminRes = evaluateForceOverridePermission('ADMIN', true);
    expect(adminRes.allowed).toBe(false);
    expect(adminRes.reason).toContain('Requires MASTER_ADMIN');

    const staffRes = evaluateForceOverridePermission('STAFF', true);
    expect(staffRes.allowed).toBe(false);
  });
});
