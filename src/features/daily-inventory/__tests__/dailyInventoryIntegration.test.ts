import { describe, it, expect } from 'vitest';
import { calculateTotalStock, calculateEndingStock, calculateDiscrepancy } from '../utils/calculations';

interface TestItem {
  id: string;
  item_code: string;
  item_name: string;
  category_id: string;
  category_name: string;
  beginning_inventory: number;
  stock_in: number;
  total_available: number;
  am_out: number;
  pm_out: number;
  ending_inventory: number;
  physical_count?: number;
}

interface TestCategory {
  id: string;
  name: string;
}

function groupEntriesByStation(entries: TestItem[], categories: TestCategory[]) {
  const groups: Record<string, { categoryId?: string; items: TestItem[] }> = {};

  // Initialize with all known categories (empty stations have items: [])
  categories.forEach(cat => {
    groups[cat.name.toUpperCase()] = { categoryId: cat.id, items: [] };
  });

  // Assign entries to stations
  entries.forEach(entry => {
    const key = (entry.category_name || 'UNGROUPED').toUpperCase();
    if (!groups[key]) {
      groups[key] = { categoryId: entry.category_id, items: [] };
    }
    groups[key].items.push(entry);
  });

  return groups;
}

function calculateStationTotals(items: TestItem[]) {
  return items.reduce(
    (acc, item) => ({
      beginning: acc.beginning + item.beginning_inventory,
      stockIn: acc.stockIn + item.stock_in,
      totalAvailable: acc.totalAvailable + item.total_available,
      salesAm: acc.salesAm + item.am_out,
      salesPm: acc.salesPm + item.pm_out,
      ending: acc.ending + item.ending_inventory,
      discrepancyCount:
        acc.discrepancyCount +
        (item.physical_count !== undefined && item.physical_count !== item.ending_inventory ? 1 : 0),
    }),
    { beginning: 0, stockIn: 0, totalAvailable: 0, salesAm: 0, salesPm: 0, ending: 0, discrepancyCount: 0 }
  );
}

describe('Daily Inventory & Dynamic Stations Integration', () => {
  it('correctly calculates shifts and variances across dynamic stations', () => {
    const categories: TestCategory[] = [
      { id: 'cat-1', name: 'Grilled Stock' },
      { id: 'cat-2', name: 'Portion Stock' },
      { id: 'cat-3', name: 'Beverages' }, // Newly added custom category!
      { id: 'cat-4', name: 'Desserts' },  // Empty category station
    ];

    const entries: TestItem[] = [
      {
        id: 'e1',
        item_code: 'GRILL-001',
        item_name: 'Pork BBQ',
        category_id: 'cat-1',
        category_name: 'Grilled Stock',
        beginning_inventory: 50,
        stock_in: 20,
        total_available: calculateTotalStock(50, 20),
        am_out: 15,
        pm_out: 25,
        ending_inventory: calculateEndingStock(calculateTotalStock(50, 20), 15, 25),
        physical_count: 30, // 70 - 40 = 30 ending. Physical = 30 => match!
      },
      {
        id: 'e2',
        item_code: 'GRILL-002',
        item_name: 'Chicken Inasal',
        category_id: 'cat-1',
        category_name: 'Grilled Stock',
        beginning_inventory: 30,
        stock_in: 10,
        total_available: 40,
        am_out: 10,
        pm_out: 15,
        ending_inventory: 15,
        physical_count: 12, // Physical 12 vs 15 ending => -3 discrepancy!
      },
      {
        id: 'e3',
        item_code: 'BEV-001',
        item_name: 'Iced Tea Pitcher',
        category_id: 'cat-3',
        category_name: 'Beverages',
        beginning_inventory: 100,
        stock_in: 50,
        total_available: calculateTotalStock(100, 50),
        am_out: 40,
        pm_out: 60,
        ending_inventory: calculateEndingStock(150, 40, 60), // 50
        physical_count: 50,
      },
    ];

    const grouped = groupEntriesByStation(entries, categories);

    // Assert that custom category 'BEVERAGES' is present and grouped
    expect(grouped['BEVERAGES']).toBeDefined();
    expect(grouped['BEVERAGES'].items.length).toBe(1);
    expect(grouped['BEVERAGES'].items[0].item_name).toBe('Iced Tea Pitcher');

    // Assert that empty category 'DESSERTS' exists with 0 items without throwing
    expect(grouped['DESSERTS']).toBeDefined();
    expect(grouped['DESSERTS'].items.length).toBe(0);

    // Assert Grilled Stock station totals
    const grillTotals = calculateStationTotals(grouped['GRILLED STOCK'].items);
    expect(grillTotals.beginning).toBe(80);
    expect(grillTotals.stockIn).toBe(30);
    expect(grillTotals.totalAvailable).toBe(110);
    expect(grillTotals.salesAm).toBe(25);
    expect(grillTotals.salesPm).toBe(40);
    expect(grillTotals.ending).toBe(45);
    expect(grillTotals.discrepancyCount).toBe(1); // e2 had a discrepancy

    // Beverage station totals
    const bevTotals = calculateStationTotals(grouped['BEVERAGES'].items);
    expect(bevTotals.totalAvailable).toBe(150);
    expect(bevTotals.salesAm + bevTotals.salesPm).toBe(100);
    expect(bevTotals.ending).toBe(50);
    expect(bevTotals.discrepancyCount).toBe(0);
  });

  it('accurately reports shift discrepancies when physical count differs from calculated ending', () => {
    const endingStock = calculateEndingStock(100, 30, 20); // 50
    expect(endingStock).toBe(50);

    const matchDiscrepancy = calculateDiscrepancy(50, 50);
    expect(matchDiscrepancy).toBe(0);

    const missingStockDiscrepancy = calculateDiscrepancy(45, 50);
    expect(missingStockDiscrepancy).toBe(-5);

    const excessStockDiscrepancy = calculateDiscrepancy(55, 50);
    expect(excessStockDiscrepancy).toBe(5);
  });
});
