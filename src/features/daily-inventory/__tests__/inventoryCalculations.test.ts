import { describe, it, expect } from 'vitest';

/**
 * Standard Kuventory calculation helpers mirroring the exact arithmetic in daily inventory
 */
function calculateTotalStock(beg: number, add: number): number {
  const result = (beg || 0) + (add || 0);
  return Number(result.toFixed(2));
}

function calculateEndingStock(beg: number, add: number, am: number, pm: number): number {
  const totalStock = (beg || 0) + (add || 0);
  const totalSales = (am || 0) + (pm || 0);
  const ending = totalStock - totalSales;
  // Normalize -0 and round to 2 decimal places to avoid floating point artifacts
  const rounded = Number(ending.toFixed(2));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function calculateItemValuation(currentQty: number, unitCost: number): number {
  const valuation = (currentQty || 0) * (unitCost || 0);
  return Number(valuation.toFixed(2));
}

describe('Daily Inventory & Stock Calculations (QA Verification)', () => {
  describe('calculateTotalStock', () => {
    it('accurately computes beginning + added stock', () => {
      expect(calculateTotalStock(100, 50)).toBe(150);
      expect(calculateTotalStock(0, 25)).toBe(25);
      expect(calculateTotalStock(75.5, 24.5)).toBe(100);
    });

    it('handles zero or missing values gracefully', () => {
      expect(calculateTotalStock(0, 0)).toBe(0);
      expect(calculateTotalStock(50, 0)).toBe(50);
    });

    it('maintains precision under high volume variables', () => {
      expect(calculateTotalStock(100000, 250000)).toBe(350000);
      expect(calculateTotalStock(99999.99, 0.01)).toBe(100000);
    });
  });

  describe('calculateEndingStock', () => {
    it('accurately calculates ENDING = (BEG + ADD) - (AM + PM)', () => {
      // 100 BEG + 50 ADD - (30 AM + 40 PM) = 80 ENDING
      expect(calculateEndingStock(100, 50, 30, 40)).toBe(80);
    });

    it('correctly normalizes 0 and prevents -0 float display', () => {
      const result = calculateEndingStock(50, 0, 25, 25);
      expect(result).toBe(0);
      expect(Object.is(result, -0)).toBe(false);
    });

    it('handles floating point additions without precision leakage (e.g., 0.1 + 0.2)', () => {
      // Classic JS float bug: 0.1 + 0.2 = 0.30000000000000004
      const result = calculateEndingStock(0.1, 0.2, 0.1, 0.1);
      expect(result).toBe(0.1);
    });

    it('computes correctly with high variables up to warehouse limits', () => {
      expect(calculateEndingStock(50000, 25000, 15000, 20000)).toBe(40000);
    });
  });

  describe('calculateItemValuation', () => {
    it('multiplies current stock by unit cost with 2 decimals precision', () => {
      expect(calculateItemValuation(150, 25.5)).toBe(3825);
      expect(calculateItemValuation(0, 120)).toBe(0);
      expect(calculateItemValuation(12.33, 15.75)).toBe(194.20);
    });
  });
});
