import { describe, it, expect } from 'vitest';
import {
  KuventoryError,
  createSuccessResult,
  createFailureResult,
  classifyDatabaseError,
  type ErrorClass
} from '@/lib/errors';

describe('Standard Error Taxonomy & Structured Result Suite (Blueprint Section 18.3)', () => {
  it('creates success mutation results with standard envelope', () => {
    const res = createSuccessResult({ count: 5 }, 'Items retrieved', 'req-123');
    expect(res.success).toBe(true);
    expect(res.code).toBe('OK');
    expect(res.message).toBe('Items retrieved');
    expect(res.requestId).toBe('req-123');
    expect(res.data).toEqual({ count: 5 });
    expect(res.retryable).toBe(false);
  });

  it('creates failure mutation results with error class from taxonomy', () => {
    const failure = createFailureResult('INSUFFICIENT_STOCK', 'Not enough batch stock to consume', {
      requestId: 'req-456'
    });
    expect(failure.success).toBe(false);
    expect(failure.code).toBe('INSUFFICIENT_STOCK');
    expect(failure.message).toBe('Not enough batch stock to consume');
    expect(failure.requestId).toBe('req-456');
    expect(failure.retryable).toBe(false);
  });

  it('correctly classifies PGRST202 schema-cache missing RPCs as SCHEMA_MISMATCH', () => {
    const dbErr = { code: 'PGRST202', message: 'Could not find the function in schema cache' };
    const err = classifyDatabaseError(dbErr, 'req-789');
    expect(err).toBeInstanceOf(KuventoryError);
    expect(err.code).toBe<ErrorClass>('SCHEMA_MISMATCH');
    expect(err.retryable).toBe(false);
    expect(err.requestId).toBe('req-789');
  });

  it('correctly classifies authentication failures as UNAUTHENTICATED', () => {
    const dbErr = { code: 'PGRST301', message: 'JWT expired' };
    const err = classifyDatabaseError(dbErr);
    expect(err.code).toBe<ErrorClass>('UNAUTHENTICATED');
    expect(err.retryable).toBe(false);
  });

  it('correctly classifies permission denied as FORBIDDEN', () => {
    const dbErr = { status: 403, message: 'Only admin can perform this operation' };
    const err = classifyDatabaseError(dbErr);
    expect(err.code).toBe<ErrorClass>('FORBIDDEN');
    expect(err.retryable).toBe(false);
  });

  it('correctly classifies unique constraint violation 23505 as CONFLICT', () => {
    const dbErr = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const err = classifyDatabaseError(dbErr);
    expect(err.code).toBe<ErrorClass>('CONFLICT');
    expect(err.retryable).toBe(false);
  });

  it('correctly classifies integrity constraint violations 23503 and 23514 as INTEGRITY_VIOLATION', () => {
    const fkErr = { code: '23503', message: 'violates foreign key constraint' };
    expect(classifyDatabaseError(fkErr).code).toBe<ErrorClass>('INTEGRITY_VIOLATION');

    const checkErr = { code: '23514', message: 'violates check constraint' };
    expect(classifyDatabaseError(checkErr).code).toBe<ErrorClass>('INTEGRITY_VIOLATION');
  });

  it('correctly classifies network and timeout failures as DEPENDENCY_UNAVAILABLE and retryable', () => {
    const netErr = { message: 'Failed to fetch' };
    const err = classifyDatabaseError(netErr);
    expect(err.code).toBe<ErrorClass>('DEPENDENCY_UNAVAILABLE');
    expect(err.retryable).toBe(true);
    expect(err.retryAfter).toBe(3);
  });

  it('converts KuventoryError to standard MutationResult', () => {
    const err = new KuventoryError('RATE_LIMITED', 'Too many attempts', {
      requestId: 'req-rate',
      retryAfter: 60,
      retryable: true
    });
    const result = err.toResult();
    expect(result.success).toBe(false);
    expect(result.code).toBe('RATE_LIMITED');
    expect(result.retryAfter).toBe(60);
    expect(result.retryable).toBe(true);
    expect(result.requestId).toBe('req-rate');
  });
});
