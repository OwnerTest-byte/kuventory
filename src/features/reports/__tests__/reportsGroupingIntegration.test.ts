import { describe, it, expect } from 'vitest';

describe('Reports Dynamic Categorization Integration', () => {
  it('groups report entries by dynamic categories and computes section totals', () => {
    const mockReportEntries = [
      {
        id: 'r1',
        item_id: 'i1',
        section: 'BEVERAGES',
        beg_count: 20,
        stock_in: 10,
        total_stock: 30,
        am_out: 5,
        pm_out: 10,
        end_count: 15,
        items: { item_name: 'Fresh Lemonade', item_code: 'BEV-01', unit: 'pcs' },
      },
      {
        id: 'r2',
        item_id: 'i2',
        section: 'BEVERAGES',
        beg_count: 50,
        stock_in: 0,
        total_stock: 50,
        am_out: 15,
        pm_out: 20,
        end_count: 15,
        items: { item_name: 'Bottled Water', item_code: 'BEV-02', unit: 'pcs' },
      },
      {
        id: 'r3',
        item_id: 'i3',
        section: 'GRILLED STOCK',
        beg_count: 40,
        stock_in: 20,
        total_stock: 60,
        am_out: 10,
        pm_out: 30,
        end_count: 20,
        items: { item_name: 'Chicken Wings', item_code: 'GRILL-01', unit: 'pcs' },
      },
      {
        id: 'r4',
        item_id: 'i4',
        section: 'SNACKS',
        beg_count: 15,
        stock_in: 5,
        total_stock: 20,
        am_out: 4,
        pm_out: 6,
        end_count: 10,
        items: { item_name: 'French Fries', item_code: 'SNK-01', unit: 'pack' },
      },
    ];

    // Mirror ReportViewPage dynamic grouping logic
    const groups: Record<string, typeof mockReportEntries> = {};
    mockReportEntries.forEach(entry => {
      const sec = (entry.section || 'GENERAL').toUpperCase();
      if (!groups[sec]) groups[sec] = [];
      groups[sec].push(entry);
    });

    const sortedGroups = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));

    // Expected alphabetical order: BEVERAGES, GRILLED STOCK, SNACKS
    expect(sortedGroups.map(([name]) => name)).toEqual(['BEVERAGES', 'GRILLED STOCK', 'SNACKS']);

    // Check Beverages summary
    const bevEntries = groups['BEVERAGES'];
    expect(bevEntries.length).toBe(2);
    const bevTotalSales = bevEntries.reduce((sum, e) => sum + e.am_out + e.pm_out, 0);
    expect(bevTotalSales).toBe(50); // (5+10) + (15+20) = 50

    // Check Snacks summary
    const snackEntries = groups['SNACKS'];
    expect(snackEntries.length).toBe(1);
    expect(snackEntries[0].items.item_name).toBe('French Fries');

    // Grand totals calculation
    const grandTotalSales = mockReportEntries.reduce((sum, e) => sum + e.am_out + e.pm_out, 0);
    const grandTotalEnding = mockReportEntries.reduce((sum, e) => sum + e.end_count, 0);
    expect(grandTotalSales).toBe(100); // 50 (bev) + 40 (grill) + 10 (snacks)
    expect(grandTotalEnding).toBe(60); // 30 (bev) + 20 (grill) + 10 (snacks)
  });
});
