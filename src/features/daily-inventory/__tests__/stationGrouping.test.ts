import { describe, it, expect } from 'vitest';

interface TestItem {
  id: string;
  name: string;
  category_id?: string | null;
  section: string;
  beginning_qty: number;
  add_qty: number;
  sales_am: number;
  sales_pm: number;
}

function groupItemsByStation(
  items: TestItem[],
  categories: { id: string; name: string }[]
) {
  const usedCatIds = new Set<string>();
  const stationMap: Record<string, { id: string; name: string; items: TestItem[] }> = {};

  categories.forEach(cat => {
    usedCatIds.add(cat.id);
    stationMap[cat.name.toUpperCase()] = {
      id: cat.id,
      name: cat.name,
      items: []
    };
  });

  items.forEach(item => {
    const sec = (item.section || 'OTHER').toUpperCase();
    if (stationMap[sec]) {
      stationMap[sec].items.push(item);
    } else {
      if (!stationMap[sec]) {
        stationMap[sec] = {
          id: item.category_id || sec.toLowerCase(),
          name: item.section,
          items: []
        };
      }
      stationMap[sec].items.push(item);
    }
  });

  return Object.values(stationMap);
}

function calculateStationTotals(items: TestItem[]) {
  return items.reduce((acc, item) => {
    const total = item.beginning_qty + item.add_qty;
    const ending = total - item.sales_am - item.sales_pm;
    return {
      beg: acc.beg + item.beginning_qty,
      add: acc.add + item.add_qty,
      total: acc.total + total,
      am: acc.am + item.sales_am,
      pm: acc.pm + item.sales_pm,
      end: acc.end + ending
    };
  }, { beg: 0, add: 0, total: 0, am: 0, pm: 0, end: 0 });
}

describe('Dynamic Station & Category Grouping', () => {
  const mockCategories = [
    { id: 'cat-1', name: 'GRILLED STOCK' },
    { id: 'cat-2', name: 'PORTION STOCK' },
    { id: 'cat-3', name: 'PER CASES' },
    { id: 'cat-4', name: 'BEVERAGES' },
    { id: 'cat-5', name: 'SNACKS' },
  ];

  it('correctly creates stations for all database categories including empty ones', () => {
    const mockItems: TestItem[] = [
      { id: 'i1', name: 'ADIDAS', section: 'GRILLED STOCK', beginning_qty: 10, add_qty: 0, sales_am: 0, sales_pm: 0 },
      { id: 'i2', name: 'CHICKEN BBQ', section: 'GRILLED STOCK', beginning_qty: 20, add_qty: 5, sales_am: 2, sales_pm: 3 },
      { id: 'i3', name: 'COKE CAN', section: 'BEVERAGES', beginning_qty: 50, add_qty: 10, sales_am: 5, sales_pm: 5 },
    ];

    const stations = groupItemsByStation(mockItems, mockCategories);

    expect(stations.length).toBe(5);
    const grilled = stations.find(s => s.name === 'GRILLED STOCK');
    const beverages = stations.find(s => s.name === 'BEVERAGES');
    const snacks = stations.find(s => s.name === 'SNACKS');

    expect(grilled?.items.length).toBe(2);
    expect(beverages?.items.length).toBe(1);
    expect(snacks?.items.length).toBe(0); // Empty category station ready for adding items
  });

  it('accurately calculates station totals for beginning, stock in, sales and ending', () => {
    const grilledItems: TestItem[] = [
      { id: 'i1', name: 'BETAMAX', section: 'GRILLED STOCK', beginning_qty: 50, add_qty: 0, sales_am: 10, sales_pm: 5 },
      { id: 'i2', name: 'HOTDOG', section: 'GRILLED STOCK', beginning_qty: 10, add_qty: 20, sales_am: 5, sales_pm: 5 },
    ];

    const totals = calculateStationTotals(grilledItems);

    expect(totals.beg).toBe(60);
    expect(totals.add).toBe(20);
    expect(totals.total).toBe(80);
    expect(totals.am).toBe(15);
    expect(totals.pm).toBe(10);
    expect(totals.end).toBe(55);
  });

  it('supports dynamically added categories that did not exist initially', () => {
    const extendedCategories = [
      ...mockCategories,
      { id: 'cat-6', name: 'DESSERTS & PASTRIES' }
    ];

    const mockItems: TestItem[] = [
      { id: 'i1', name: 'HALO-HALO', section: 'DESSERTS & PASTRIES', beginning_qty: 15, add_qty: 5, sales_am: 3, sales_pm: 2 }
    ];

    const stations = groupItemsByStation(mockItems, extendedCategories);
    const dessertsStation = stations.find(s => s.name === 'DESSERTS & PASTRIES');

    expect(dessertsStation).toBeDefined();
    expect(dessertsStation?.items.length).toBe(1);
    expect(dessertsStation?.items[0].name).toBe('HALO-HALO');
  });
});
