import { describe, it, expect } from 'vitest';
import { getBusinessDateString, formatBusinessDate, getBusinessDateStringPlusDays } from '@/lib/businessDate';

describe('businessDate utilities (Asia/Manila UTC+8)', () => {
  it('correctly maps 1:00 AM Manila time (which is 5:00 PM previous day UTC) to the current Manila date', () => {
    // 2026-10-19T01:00:00+08:00 is 2026-10-18T17:00:00Z
    const lateUtcDate = new Date('2026-10-18T17:00:00Z');
    const result = getBusinessDateString(lateUtcDate);
    // In Manila, it is already Oct 19!
    expect(result).toBe('2026-10-19');
  });

  it('correctly maps 7:59 AM Manila time to the current Manila date', () => {
    // 2026-10-19T07:59:00+08:00 is 2026-10-18T23:59:00Z
    const earlyMorningManila = new Date('2026-10-18T23:59:00Z');
    const result = getBusinessDateString(earlyMorningManila);
    expect(result).toBe('2026-10-19');
  });

  it('returns valid YYYY-MM-DD format for current date', () => {
    const today = getBusinessDateString();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('calculates future business dates adding days', () => {
    const base = new Date('2026-10-18T00:00:00Z'); // 8:00 AM Oct 18 in Manila
    const plus30 = getBusinessDateStringPlusDays(30, base);
    expect(plus30).toBe('2026-11-17');
  });

  it('formats human readable business dates', () => {
    const d = new Date('2026-10-18T00:00:00Z');
    const formatted = formatBusinessDate(d);
    expect(formatted).toContain('2026');
    expect(formatted).toContain('Oct');
  });
});
