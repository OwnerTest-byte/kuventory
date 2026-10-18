import { describe, it, expect } from 'vitest';
import { escapeCsvField } from '@/features/reports/export/csv';

describe('escapeCsvField (CSV Formula Injection & Escaping)', () => {
  it('neutralizes formula injection characters (=, +, -, @)', () => {
    expect(escapeCsvField('=cmd|"/C calc"!A0')).toBe(`"'=cmd|""/C calc""!A0"`);
    expect(escapeCsvField('+12345')).toBe(`'+12345`);
    expect(escapeCsvField('-12345')).toBe(`'-12345`);
    expect(escapeCsvField('@SUM(1,2)')).toBe(`"'@SUM(1,2)"`);
  });

  it('escapes fields with commas, newlines, and internal quotes', () => {
    expect(escapeCsvField('Item, Special')).toBe('"Item, Special"');
    expect(escapeCsvField('Item "Quote"')).toBe('"Item ""Quote"""');
    expect(escapeCsvField('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
  });

  it('handles null, undefined and numeric inputs cleanly', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
    expect(escapeCsvField(42.5)).toBe('42.5');
  });
});
