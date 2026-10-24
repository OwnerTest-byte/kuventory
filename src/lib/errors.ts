/**
 * KUVENTORY Standard Error Taxonomy and Structured Mutation Result Module
 * 
 * Mandated by Section 18.3 of KUVENTORY_TOTAL_SYSTEM_AUDIT_AND_REMEDIATION_BLUEPRINT.md:
 * Standard error classes must be used consistently across frontend, trusted APIs, database, and jobs.
 * Every externally visible mutation returns an explicit structured result.
 */

export type ErrorClass =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INSUFFICIENT_STOCK'
  | 'RATE_LIMITED'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'OUTCOME_UNKNOWN'
  | 'SCHEMA_MISMATCH'
  | 'INTEGRITY_VIOLATION'
  | 'INTERNAL_ERROR';

export interface MutationResult<T = unknown> {
  success: boolean;
  code: ErrorClass | 'OK';
  message: string;
  requestId?: string;
  retryable?: boolean;
  retryAfter?: number;
  data?: T;
  error?: string;
}

export class KuventoryError extends Error {
  readonly code: ErrorClass;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly retryAfter?: number;
  readonly details?: unknown;

  constructor(
    code: ErrorClass,
    message: string,
    options?: {
      requestId?: string;
      retryable?: boolean;
      retryAfter?: number;
      details?: unknown;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = 'KuventoryError';
    this.code = code;
    this.requestId = options?.requestId;
    this.retryable = options?.retryable ?? false;
    this.retryAfter = options?.retryAfter;
    this.details = options?.details;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  toResult(): MutationResult<null> {
    return {
      success: false,
      code: this.code,
      message: this.message,
      requestId: this.requestId,
      retryable: this.retryable,
      retryAfter: this.retryAfter,
      error: this.message
    };
  }
}

/**
 * Creates a standard successful mutation result.
 */
export function createSuccessResult<T = void>(
  data?: T,
  message = 'Operation completed successfully',
  requestId?: string
): MutationResult<T> {
  return {
    success: true,
    code: 'OK',
    message,
    requestId,
    data,
    retryable: false
  };
}

/**
 * Creates a standard failure mutation result adhering to Section 18.3.
 */
export function createFailureResult(
  code: ErrorClass,
  message: string,
  options?: {
    requestId?: string;
    retryable?: boolean;
    retryAfter?: number;
  }
): MutationResult<null> {
  return {
    success: false,
    code,
    message,
    requestId: options?.requestId,
    retryable: options?.retryable ?? (code === 'DEPENDENCY_UNAVAILABLE' || code === 'OUTCOME_UNKNOWN'),
    retryAfter: options?.retryAfter,
    error: message
  };
}

/**
 * Maps Supabase / PostgREST / PostgreSQL errors to the standard ErrorClass taxonomy.
 */
export function classifyDatabaseError(
  error: unknown,
  requestId?: string
): KuventoryError {
  if (error instanceof KuventoryError) {
    return error;
  }

  const err = error as { code?: string; message?: string; details?: string; hint?: string; status?: number };
  const rawCode = err?.code || '';
  const rawMsg = err?.message || 'Unknown database error';

  // Schema cache missing RPC or table
  if (rawCode === 'PGRST202' || rawCode === 'PGRST200') {
    return new KuventoryError(
      'SCHEMA_MISMATCH',
      'The requested database procedure or schema object is missing or unexposed.',
      { requestId, retryable: false, details: rawMsg }
    );
  }

  // Authentication errors
  if (rawCode === 'PGRST301' || err?.status === 401 || rawMsg.toLowerCase().includes('jwt') || rawMsg.toLowerCase().includes('not authenticated')) {
    return new KuventoryError(
      'UNAUTHENTICATED',
      'Your session is invalid or has expired. Please log in again.',
      { requestId, retryable: false }
    );
  }

  // Permission / Authorization errors
  if (err?.status === 403 || rawMsg.toLowerCase().includes('permission denied') || rawMsg.toLowerCase().includes('only admin')) {
    return new KuventoryError(
      'FORBIDDEN',
      'You do not have permission to execute this operation.',
      { requestId, retryable: false }
    );
  }

  // Insufficient stock checks
  if (rawMsg.toLowerCase().includes('insufficient') || rawMsg.toLowerCase().includes('not enough stock')) {
    return new KuventoryError(
      'INSUFFICIENT_STOCK',
      rawMsg,
      { requestId, retryable: false }
    );
  }

  // Unique constraint collision
  if (rawCode === '23505') {
    return new KuventoryError(
      'CONFLICT',
      'A record with this identifier or unique business date already exists.',
      { requestId, retryable: false, details: rawMsg }
    );
  }

  // Foreign key or check constraint integrity violation
  if (rawCode === '23503' || rawCode === '23514') {
    return new KuventoryError(
      'INTEGRITY_VIOLATION',
      'Data integrity constraint violation.',
      { requestId, retryable: false, details: rawMsg }
    );
  }

  // Network / timeout
  if (rawMsg.toLowerCase().includes('timeout') || rawMsg.toLowerCase().includes('failed to fetch') || rawMsg.toLowerCase().includes('network')) {
    return new KuventoryError(
      'DEPENDENCY_UNAVAILABLE',
      'Connection to database timed out or failed. Please check network connectivity.',
      { requestId, retryable: true, retryAfter: 3 }
    );
  }

  return new KuventoryError(
    'INTERNAL_ERROR',
    rawMsg,
    { requestId, retryable: false, details: err }
  );
}
