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

/* ===========================================================================
 * USER-FACING ERROR LAYER (Stage 4 error-handling standard)
 * Builds on the ErrorClass taxonomy above: every user-visible failure is
 * normalized into a plain-language title + message + next step. RPC-authored
 * human-readable messages pass through; internal jargon (SQL, schema names,
 * stack fragments, tokens) is never shown to users.
 * =========================================================================== */

export interface UserFacingError {
  code: ErrorClass;
  title: string;
  message: string;
  /** True when retrying cannot create a duplicate side effect. */
  retrySafe: boolean;
}

const INTERNAL_JARGON =
  /relation "|column |schema "|function public\.|PGRST\d|syntax error|invalid input syntax|return type|jwt|anon key|apikey|stack trace|node_modules|\.ts:\d+|uuid: "|violates|unique constraint/i;

/**
 * Categories whose typical raw messages are terse machine noise (fetch
 * failures, timeouts, unknown outcomes) always use the curated safe copy.
 * The remaining categories usually carry RPC-authored human sentences,
 * which are passed through.
 */
const CURATED_ONLY: ReadonlySet<ErrorClass> = new Set([
  'DEPENDENCY_UNAVAILABLE',
  'OUTCOME_UNKNOWN',
  'SCHEMA_MISMATCH',
  'INTEGRITY_VIOLATION',
  'INTERNAL_ERROR',
]);

const TEXT_CLASSIFIERS: Array<{ code: ErrorClass; test: RegExp }> = [
  { code: 'DEPENDENCY_UNAVAILABLE', test: /failed to fetch|networkerror|fetch failed|network error|offline|timed? ?out|timeout|connection (refused|reset|closed|interrupted)|err_internet|err_name/i },
  { code: 'RATE_LIMITED', test: /too many|throttled|rate.?limit|wait \d+ seconds?|recently submitted|cooldown|locked for \d+ minutes|still locked/i },
  { code: 'FORBIDDEN', test: /forbidden|permission denied|only administrators|only a super administrator|access denied|may only|not authorized to|unauthorized to manage|your own (correction|recovery)|self-?unlock/i },
  { code: 'UNAUTHENTICATED', test: /unauthorized|not authenticated|invalid login|email or password|authentication required|sign in again|session.*(expired|invalid)/i },
  { code: 'CONFLICT', test: /conflict|duplicate|already exists|already (been )?(used|resolved|applied)|revision conflict|concurrent/i },
  { code: 'NOT_FOUND', test: /not found|no worksheet exists|does not exist|no longer exists|missing record|was removed/i },
  { code: 'INSUFFICIENT_STOCK', test: /insufficient|not enough stock/i },
  { code: 'OUTCOME_UNKNOWN', test: /could not be reached|unreadable response|outcome.*(unknown|uncertain)|no response/i },
  { code: 'VALIDATION_ERROR', test: /must be|required|cannot be empty|at least \d+ (characters|units)|invalid (email|value|format|input)|passwords do not match|greater than|negative/i },
  { code: 'SCHEMA_MISMATCH', test: /schema|missing or unexposed/i },
  { code: 'INTEGRITY_VIOLATION', test: /integrity|constraint violation/i },
];

const USER_COPY: Record<ErrorClass, { title: string; message: string; retrySafe: boolean }> = {
  VALIDATION_ERROR: {
    title: 'Check the entered information',
    message: 'Some of the entered information could not be accepted. Your input has been kept — adjust the values and try again.',
    retrySafe: true,
  },
  UNAUTHENTICATED: {
    title: 'Sign-in required',
    message: 'Your session needs attention before this action can continue. Sign in again; if you cannot, use the account recovery link on the login page.',
    retrySafe: true,
  },
  FORBIDDEN: {
    title: 'You do not have permission for this action',
    message: 'Your account is not authorized to perform this operation. If you believe you should have access, contact your administrator through the official support channels.',
    retrySafe: false,
  },
  NOT_FOUND: {
    title: 'This record is no longer available',
    message: 'The record you are working with was removed or never existed. Go back, refresh the list, and pick the current entry.',
    retrySafe: false,
  },
  CONFLICT: {
    title: 'This was changed by someone else',
    message: "The record was updated elsewhere or this action was already completed. Refresh the latest data before continuing so you don't overwrite anyone's work.",
    retrySafe: false,
  },
  INSUFFICIENT_STOCK: {
    title: 'Not enough stock for this operation',
    message: 'The available quantity is lower than requested. Refresh the current stock levels and adjust the amounts.',
    retrySafe: true,
  },
  RATE_LIMITED: {
    title: 'Please wait before trying again',
    message: 'A safety limit is active for this action. Wait for the shown remaining time — the restriction is enforced by the server and cannot be skipped by refreshing.',
    retrySafe: true,
  },
  DEPENDENCY_UNAVAILABLE: {
    title: 'Connection problem',
    message: 'The server could not be reached, so nothing was changed. Check your internet connection and try again — your unsaved work is still on the screen.',
    retrySafe: true,
  },
  OUTCOME_UNKNOWN: {
    title: 'The result could not be confirmed',
    message: 'The request was sent but the server did not confirm the outcome, so it is not safe to submit it again automatically. Check the current state (for example by refreshing the data) before deciding to repeat it.',
    retrySafe: false,
  },
  SCHEMA_MISMATCH: {
    title: 'This version of the app is out of step with the database',
    message: 'The required database object is missing or not yet deployed. Ask your administrator to verify that all pending database updates have been applied.',
    retrySafe: false,
  },
  INTEGRITY_VIOLATION: {
    title: 'The change would break data consistency',
    message: 'The operation was rejected to keep records consistent. Refresh the data and check the related records before trying again.',
    retrySafe: true,
  },
  INTERNAL_ERROR: {
    title: 'Something unexpected interrupted this action',
    message: 'The operation did not complete and nothing was reported as saved. Try again; if the problem continues, contact your administrator and mention what you were doing.',
    retrySafe: false,
  },
};

export function classifyThrownError(err: unknown): ErrorClass {
  if (err instanceof KuventoryError) return err.code;

  // Supabase/PostgREST-shaped errors carry a machine code.
  const asAny = err as { code?: string; status?: number };
  if (asAny?.code) {
    const mapped = classifyDatabaseError(err);
    if (mapped.code !== 'INTERNAL_ERROR') return mapped.code;
  }

  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : String((err as any)?.message ?? err ?? '');

  for (const { code, test } of TEXT_CLASSIFIERS) {
    if (test.test(raw)) return code;
  }
  return 'INTERNAL_ERROR';
}

/**
 * Normalize any thrown value into a user-safe, actionable explanation.
 * `operation` names the affected action (e.g. 'save this item') so the user
 * knows exactly what was — and was not — affected.
 */
export function normalizeUserError(err: unknown, operation?: string): UserFacingError {
  const code = classifyThrownError(err);
  const base = USER_COPY[code];

  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : String((err as any)?.message ?? '');

  // This project's RPCs deliberately RAISE human-readable messages; pass
  // those through. Machine noise and internal jargon get the safe copy.
  const useCuratedCopy = CURATED_ONLY.has(code) || INTERNAL_JARGON.test(raw);
  const detail = !useCuratedCopy && raw.trim().length > 0 ? raw.trim() : base.message;

  const op = operation ? operation.replace(/\.$/, '') : null;
  const opPrefix = op ? `${op[0].toUpperCase()}${op.slice(1)} could not be completed. ` : '';

  return {
    code,
    title: base.title,
    message: `${opPrefix}${detail}`,
    retrySafe: base.retrySafe,
  };
}
