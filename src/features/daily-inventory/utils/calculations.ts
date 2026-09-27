/**
 * Kuventory Daily Inventory Arithmetic Helpers
 * Standardized functions matching database formulas:
 * Total Stock = Beg + Add
 * Ending Stock = Total Stock - (AM + PM)
 * Discrepancy = Physical Count - Ending Stock
 */

export function calculateTotalStock(beg: number = 0, add: number = 0): number {
  const result = (Number(beg) || 0) + (Number(add) || 0);
  return Number(result.toFixed(2));
}

export function calculateEndingStock(
  totalStockOrBeg: number = 0,
  stockInOrAm: number = 0,
  pmOutOrZero: number = 0,
  pmOutIfFourArgs?: number
): number {
  if (pmOutIfFourArgs !== undefined) {
    // 4-arg signature: (beg, add, am, pm)
    const total = (Number(totalStockOrBeg) || 0) + (Number(stockInOrAm) || 0);
    const sales = (Number(pmOutOrZero) || 0) + (Number(pmOutIfFourArgs) || 0);
    const ending = total - sales;
    const rounded = Number(ending.toFixed(2));
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  // 3-arg signature: (totalStock, amOut, pmOut)
  const sales = (Number(stockInOrAm) || 0) + (Number(pmOutOrZero) || 0);
  const ending = (Number(totalStockOrBeg) || 0) - sales;
  const rounded = Number(ending.toFixed(2));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function calculateDiscrepancy(physicalCount?: number, endingStock: number = 0): number {
  if (physicalCount === undefined || physicalCount === null || isNaN(physicalCount)) {
    return 0;
  }
  const variance = physicalCount - endingStock;
  return Number(variance.toFixed(2));
}
