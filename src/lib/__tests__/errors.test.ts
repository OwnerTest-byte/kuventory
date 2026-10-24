import { describe, it, expect } from 'vitest';
import {
  normalizeUserError,
  classifyThrownError,
  KuventoryError,
  type ErrorClass
} from '../errors';

describe('normalizeUserError — actionable, user-safe classification', () => {
  const cases: Array<{ raw: string | Error; expected: ErrorClass; expectPassThrough?: boolean }> = [
    { raw: 'Failed to fetch', expected: 'DEPENDENCY_UNAVAILABLE' },
    { raw: 'TypeError: NetworkError when attempting to fetch resource', expected: 'DEPENDENCY_UNAVAILABLE' },
    { raw: 'A recovery request for this identifier was recently submitted.', expected: 'RATE_LIMITED' },
    { raw: 'Account locked for 30 minutes after 5 consecutive failed login attempts.', expected: 'RATE_LIMITED' },
    { raw: 'Permission Denied: Administrators may only review recovery requests for Staff accounts.', expected: 'FORBIDDEN', expectPassThrough: true },
    { raw: 'Unauthorized: authentication required to review recovery requests.', expected: 'UNAUTHENTICATED' },
    { raw: 'CORRECTION_REVISION_CONFLICT: worksheet was updated elsewhere', expected: 'CONFLICT' },
    { raw: 'duplicate key value violates unique constraint "x"', expected: 'CONFLICT' },
    { raw: 'No worksheet exists for the selected date.', expected: 'NOT_FOUND', expectPassThrough: true },
    { raw: 'Insufficient stock: requested 10, available 4.', expected: 'INSUFFICIENT_STOCK', expectPassThrough: true },
    { raw: 'Password must be at least 8 characters.', expected: 'VALIDATION_ERROR', expectPassThrough: true },
    { raw: 'The server returned an unreadable response.', expected: 'OUTCOME_UNKNOWN' },
    { raw: 'something completely novel', expected: 'INTERNAL_ERROR' },
  ];

  it.each(cases)('classifies "$raw" as $expected', ({ raw, expected }) => {
    const err = raw instanceof Error ? raw : new Error(raw);
    expect(classifyThrownError(err)).toBe(expected);
  });

  it('passes RPC-authored human messages through and prefixes the operation', () => {
    const res = normalizeUserError(
      new Error('Permission Denied: Administrators may only unlock Staff accounts.'),
      'unlock this account'
    );
    expect(res.code).toBe('FORBIDDEN');
    expect(res.title).toBe('You do not have permission for this action');
    expect(res.message).toContain('Unlock this account could not be completed.');
    expect(res.message).toContain('Permission Denied: Administrators may only unlock Staff accounts.');
    expect(res.retrySafe).toBe(false);
  });

  it('never exposes internal database jargon', () => {
    const res = normalizeUserError(new Error('relation "public.foo" does not exist'), 'load the report');
    expect(res.message).not.toContain('relation');
    expect(res.message).not.toContain('public.foo');
    expect(res.message).toMatch(/Load the report could not be completed\./);
  });

  it('treats unknown outcomes as NOT retry-safe (a blind retry could duplicate)', () => {
    const res = normalizeUserError(new Error('The request could not be reached'), 'submit');
    expect(res.code).toBe('OUTCOME_UNKNOWN');
    expect(res.retrySafe).toBe(false);
  });

  it('marks connection failures as retry-safe and says the work is preserved', () => {
    const res = normalizeUserError(new Error('fetch failed'), 'save this item');
    expect(res.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(res.retrySafe).toBe(true);
    expect(res.message).toMatch(/unsaved work is still on the screen/i);
  });

  it('respects pre-classified KuventoryError codes', () => {
    const err = new KuventoryError('RATE_LIMITED', 'Please wait 95 seconds.', { retryable: true, retryAfter: 95 });
    const res = normalizeUserError(err, 'resubmit');
    expect(res.code).toBe('RATE_LIMITED');
    expect(res.message).toContain('Please wait 95 seconds.');
  });

  it('handles non-Error thrown values without crashing', () => {
    const res = normalizeUserError({ message: 'Password must be at least 6 characters long.' }, 'create the user');
    expect(res.code).toBe('VALIDATION_ERROR');
  });
});
