import { describe, it, expect } from 'vitest';
// @ts-expect-error JS module imported into TS test suite
import { sanitizeString, detectSqlInjection, sanitizeDeep } from '../../server/middleware/security.mjs';
import { evaluateForceOverridePermission } from '../features/inventory/__tests__/concurrencyAndLocking.test';

describe('Server Security & Input Sanitization (Unit Tests)', () => {
  it('strips malicious XSS script tags and event handlers', () => {
    const dirty = '<script>alert("xss")</script>Vanilla Syrup<img src=x onerror=alert(1)>';
    const clean = sanitizeString(dirty);
    expect(clean).toBe('Vanilla Syrup');
    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('onerror');
  });

  it('detects common SQL injection heuristic patterns', () => {
    expect(detectSqlInjection("admin' OR '1'='1")).toBe(true);
    expect(detectSqlInjection("1; DROP TABLE inventory_items;--")).toBe(true);
    expect(detectSqlInjection("' UNION SELECT * FROM users--")).toBe(true);
    expect(detectSqlInjection("SELECT * FROM profiles")).toBe(true);
  });

  it('allows safe, legitimate user input without flagging SQL injection', () => {
    expect(detectSqlInjection('Fresh Whole Milk (1 Gallon)')).toBe(false);
    expect(detectSqlInjection('Batch #2026-A: Delivered on schedule')).toBe(false);
    expect(detectSqlInjection('Espresso Beans / Medium Dark Roast')).toBe(false);
  });

  it('recursively sanitizes complex objects and identifies injected fields', () => {
    const maliciousPayload = {
      itemName: 'Matcha Powder',
      description: '<b>High Grade</b><script>fetch("evil.com")</script>',
      maliciousQuery: "' OR 1=1--",
    };

    const result = sanitizeDeep(maliciousPayload);
    expect(result.hasSqli).toBe(true); // Should flag SQL injection in payload

    const safePayload = {
      itemName: 'Matcha Powder',
      description: '<b>High Grade</b> Premium tea',
      tags: ['organic', 'tea'],
    };

    const safeResult = sanitizeDeep(safePayload);
    expect(safeResult.hasSqli).toBe(false);
    expect((safeResult.clean as any).description).toBe('High Grade Premium tea');
  });

  it('enforces RBAC privilege levels: MASTER_ADMIN has universal override capability', () => {
    const masterAdmin = evaluateForceOverridePermission('MASTER_ADMIN', true);
    expect(masterAdmin.allowed).toBe(true);
    expect(masterAdmin.reason).toBe('MASTER_ADMIN_BYPASS_GRANTED');

    const admin = evaluateForceOverridePermission('ADMIN', true);
    expect(admin.allowed).toBe(false);

    const staff = evaluateForceOverridePermission('STAFF', true);
    expect(staff.allowed).toBe(false);
  });
});
