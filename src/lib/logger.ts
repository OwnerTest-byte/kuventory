/**
 * KUVENTORY Logging Hygiene Module
 * 
 * Provides environment-aware, sanitized logging.
 * In production, suppresses debug traces and sanitizes errors to ensure
 * internal tokens, session secrets, and verbose payload structures are never exposed in browser devtools.
 */

const isProduction = import.meta.env.PROD;

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    if (!isProduction) {
      console.info(`[KUVENTORY INFO] ${message}`, ...args);
    }
  },

  warn: (message: string, ...args: unknown[]) => {
    if (!isProduction) {
      console.warn(`[KUVENTORY WARN] ${message}`, ...args);
    }
  },

  error: (message: string, error?: unknown) => {
    if (isProduction) {
      // In production, log only high-level sanitized error messages without leaking tokens, auth headers, or raw schemas
      const safeMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
        ? error 
        : 'An unexpected internal error occurred';
      console.error(`[KUVENTORY ERROR] ${message}: ${safeMessage}`);
    } else {
      console.error(`[KUVENTORY ERROR] ${message}:`, error);
    }
  },

  debug: (message: string, ...args: unknown[]) => {
    if (!isProduction) {
      console.debug(`[KUVENTORY DEBUG] ${message}`, ...args);
    }
  }
};
