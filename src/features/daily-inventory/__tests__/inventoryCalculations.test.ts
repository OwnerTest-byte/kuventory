import { describe, it, expect } from 'vitest';
import { calculateTotalStock, calculateEndingStock, calculateDiscrepancy } from '../utils/calculations';

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

    it('strictly clamps negative ending stock to 0 when sales exceed stock (4-arg signature)', () => {
      // 50 BEG + 0 ADD - (40 AM + 20 PM) => raw is -10, MUST be auto-zeroed to 0
      expect(calculateEndingStock(50, 0, 40, 20)).toBe(0);
      // Extreme deficit: 10 BEG + 5 ADD - (50 AM + 50 PM) => raw is -85, MUST be 0
      expect(calculateEndingStock(10, 5, 50, 50)).toBe(0);
    });

    it('strictly clamps negative ending stock to 0 when sales exceed stock (3-arg signature)', () => {
      // 30 Total - (25 AM + 15 PM) => raw is -10, MUST be auto-zeroed to 0
      expect(calculateEndingStock(30, 25, 15)).toBe(0);
      // 0 Total - (5 AM + 0 PM) => raw is -5, MUST be auto-zeroed to 0
      expect(calculateEndingStock(0, 5, 0)).toBe(0);
    });

    it('safely clamps negative inputs to 0 preventing aberrant calculation', () => {
      expect(calculateEndingStock(-10, -5, 5, 5)).toBe(0);
    });
  });

  describe('calculateDiscrepancy', () => {
    it('accurately calculates physical count minus ending stock', () => {
      expect(calculateDiscrepancy(50, 50)).toBe(0);
      expect(calculateDiscrepancy(45, 50)).toBe(-5);
      expect(calculateDiscrepancy(55, 50)).toBe(5);
    });

    it('returns 0 when physical count is missing or not entered', () => {
      expect(calculateDiscrepancy(undefined, 50)).toBe(0);
      expect(calculateDiscrepancy(NaN, 50)).toBe(0);
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
