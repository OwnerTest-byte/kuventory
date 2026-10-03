import { describe, it, expect } from 'vitest';

interface InventoryItemRecord {
  id: string;
  item_name: string;
  current_qty: number;
  version: number;
}

interface StockBatchRecord {
  id: string;
  item_id: string;
  batch_code: string;
  quantity: number;
  expiry_date: string;
  version: number;
}

interface MovementLog {
  id: string;
  item_id: string;
  quantity: number;
  previous_qty: number;
  new_qty: number;
  timestamp: number;
}

/**
 * In-Memory Transaction Engine with Row-Level Locking Simulation (SELECT ... FOR UPDATE)
 * Guarantees serial execution of mutations for the same row while running concurrent requests.
 */
class TransactionalInventoryStore {
  public item: InventoryItemRecord;
  public batches: StockBatchRecord[];
  public movements: MovementLog[] = [];
  
  // Row-level lock mutex
  private itemLock: Promise<void> = Promise.resolve();

  constructor(item: InventoryItemRecord, batches: StockBatchRecord[]) {
    this.item = { ...item };
    this.batches = batches.map((b) => ({ ...b }));
  }

  /**
   * Simulates an atomic database transaction with SELECT ... FOR UPDATE
   */
  async consumeStockTransaction(
    quantityToDeduct: number,
    options: { simulateJitterMs?: number; expectedVersion?: number } = {}
  ): Promise<{ success: boolean; newBalance: number; version: number; error?: string }> {
    // Acquire row-level lock on item (equivalent to SELECT ... FOR UPDATE)
    let releaseLock: () => void = () => {};
    const lockWait = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const previousLock = this.itemLock;
    this.itemLock = this.itemLock.then(() => lockWait);

    await previousLock;

    try {
      // Simulate real-world I/O latency inside transaction
      if (options.simulateJitterMs) {
        await new Promise((r) => setTimeout(r, options.simulateJitterMs));
      }

      // Check OCC version if requested
      if (options.expectedVersion !== undefined && options.expectedVersion !== this.item.version) {
        return {
          success: false,
          newBalance: this.item.current_qty,
          version: this.item.version,
          error: 'CONCURRENCY_CONFLICT',
        };
      }

      // Check available stock
      if (this.item.current_qty < quantityToDeduct) {
        return {
          success: false,
          newBalance: this.item.current_qty,
          version: this.item.version,
          error: 'INSUFFICIENT_STOCK',
        };
      }

      const prevQty = this.item.current_qty;
      let remainingToDeduct = quantityToDeduct;

      // Sort batches by FEFO (earliest expiry first)
      const sortedBatches = this.batches
        .filter((b) => b.quantity > 0)
        .sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());

      for (const batch of sortedBatches) {
        if (remainingToDeduct <= 0) break;

        const deductFromBatch = Math.min(batch.quantity, remainingToDeduct);
        batch.quantity -= deductFromBatch;
        batch.version += 1;
        remainingToDeduct -= deductFromBatch;
      }

      // Update item row and advance version atomically
      this.item.current_qty -= quantityToDeduct;
      this.item.version += 1;

      // Record audit log
      this.movements.push({
        id: `mov-${Date.now()}-${Math.random()}`,
        item_id: this.item.id,
        quantity: quantityToDeduct,
        previous_qty: prevQty,
        new_qty: this.item.current_qty,
        timestamp: Date.now(),
      });

      return {
        success: true,
        newBalance: this.item.current_qty,
        version: this.item.version,
      };
    } finally {
      // Release row lock (COMMIT transaction)
      releaseLock();
    }
  }
}

describe('Simultaneous Request Concurrency & Stock Deduction (Integration Test)', () => {
  it('correctly serializes 15 simultaneous stock deduction requests without race conditions', async () => {
    const initialItem: InventoryItemRecord = {
      id: 'item-coffee-01',
      item_name: 'Arabica Signature Roast',
      current_qty: 60, // Total available stock
      version: 1,
    };

    const initialBatches: StockBatchRecord[] = [
      {
        id: 'batch-1',
        item_id: 'item-coffee-01',
        batch_code: 'EXP-SOON',
        quantity: 35, // Expiring sooner
        expiry_date: '2026-10-15',
        version: 1,
      },
      {
        id: 'batch-2',
        item_id: 'item-coffee-01',
        batch_code: 'EXP-LATER',
        quantity: 25, // Expiring later
        expiry_date: '2026-12-01',
        version: 1,
      },
    ];

    const store = new TransactionalInventoryStore(initialItem, initialBatches);

    // 15 simultaneous requests attempting to deduct 5 units each (Total attempted: 75 units, available: 60)
    const deductionRequests = Array.from({ length: 15 }, (_, i) => ({
      requestId: i + 1,
      quantity: 5,
      jitterMs: Math.floor(Math.random() * 5) + 1, // Random network latency
    }));

    // Dispatch all requests concurrently
    const results = await Promise.all(
      deductionRequests.map((req) =>
        store.consumeStockTransaction(req.quantity, { simulateJitterMs: req.jitterMs })
      )
    );

    const successfulRequests = results.filter((r) => r.success);
    const rejectedRequests = results.filter((r) => !r.success);

    // 60 available / 5 = exactly 12 successful deductions
    expect(successfulRequests.length).toBe(12);
    // 15 - 12 = 3 rejected requests due to insufficient stock
    expect(rejectedRequests.length).toBe(3);
    for (const rejected of rejectedRequests) {
      expect(rejected.error).toBe('INSUFFICIENT_STOCK');
    }

    // Verify final state
    expect(store.item.current_qty).toBe(0);
    expect(store.item.version).toBe(1 + 12); // Version incremented exactly 12 times

    // Verify FEFO batch consumption:
    // Batch 1 (35 units) should be fully depleted (0)
    expect(store.batches[0].quantity).toBe(0);
    // Batch 2 (25 units) should also be fully depleted (0)
    expect(store.batches[1].quantity).toBe(0);

    // Verify movement log count
    expect(store.movements.length).toBe(12);

    // Total deducted across all successful movements must equal 60
    const totalDeducted = store.movements.reduce((sum, m) => sum + m.quantity, 0);
    expect(totalDeducted).toBe(60);
  });

  it('guarantees that 0-quantity depleted batches are excluded from active allocation queue after concurrent consumption', async () => {
    const store = new TransactionalInventoryStore(
      { id: 'item-tea', item_name: 'Matcha Powder', current_qty: 20, version: 1 },
      [
        { id: 'b1', item_id: 'item-tea', batch_code: 'MAT-1', quantity: 10, expiry_date: '2026-10-10', version: 1 },
        { id: 'b2', item_id: 'item-tea', batch_code: 'MAT-2', quantity: 10, expiry_date: '2026-11-10', version: 1 },
      ]
    );

    // Deduct 10 units concurrently in two 5-unit chunks
    await Promise.all([
      store.consumeStockTransaction(5, { simulateJitterMs: 2 }),
      store.consumeStockTransaction(5, { simulateJitterMs: 2 }),
    ]);

    // Batch 1 had 10 units and should now have 0
    expect(store.batches[0].quantity).toBe(0);
    // Batch 2 should still have full 10 units
    expect(store.batches[1].quantity).toBe(10);

    // Active queue must exclude Batch 1 completely
    const activeQueue = store.batches.filter((b) => b.quantity > 0);
    expect(activeQueue.length).toBe(1);
    expect(activeQueue[0].id).toBe('b2');
  });
});
