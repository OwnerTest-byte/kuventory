/**
 * Security and Input Sanitization Middleware
 * Provides XSS prevention and SQL injection heuristic rejection.
 */

// Patterns that indicate malicious SQL injection attempts in user input
const SQLI_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|EXEC|EXECUTE)\b.*\b(FROM|INTO|TABLE|DATABASE)\b)/i,
  /(\bUNION\s+(ALL\s+)?SELECT\b)/i,
  /(--\s*$|\/\*.*\*\/)/,
  /('|"|\b)\s*OR\s*('|"|\b)?\d+('|"|\b)?\s*=\s*('|"|\b)?\d+/i,
  /('|"|\b)\s*OR\s*('|"|\b)[a-zA-Z0-9]+('|"|\b)?\s*=\s*('|"|\b)[a-zA-Z0-9]+/i,
  /;\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/i,
];

// Patterns that indicate XSS injection
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript\s*:/gi,
  /onload\s*=/gi,
  /onerror\s*=/gi,
  /onclick\s*=/gi,
  /<iframe\b[^>]*>/gi,
];

/**
 * Sanitizes a single string value:
 * - Strips dangerous HTML/script tags
 * - Trims whitespace
 */
export function sanitizeString(val) {
  if (typeof val !== 'string') return val;

  let cleaned = val;
  for (const pattern of XSS_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  // Strip dangerous angle brackets while preserving normal punctuation
  cleaned = cleaned.replace(/<[^>]*>/g, '');
  return cleaned.trim();
}

/**
 * Checks whether a string contains SQL injection patterns
 */
export function detectSqlInjection(val) {
  if (typeof val !== 'string') return false;
  return SQLI_PATTERNS.some((pattern) => pattern.test(val));
}

/**
 * Recursively sanitizes an object, array, or primitive value,
 * and throws or returns flag if SQL injection is detected.
 */
export function sanitizeDeep(data) {
  if (data === null || data === undefined) return { clean: data, hasSqli: false };

  if (typeof data === 'string') {
    if (detectSqlInjection(data)) {
      return { clean: data, hasSqli: true };
    }
    return { clean: sanitizeString(data), hasSqli: false };
  }

  if (Array.isArray(data)) {
    const cleanArr = [];
    for (const item of data) {
      const res = sanitizeDeep(item);
      if (res.hasSqli) return { clean: data, hasSqli: true };
      cleanArr.push(res.clean);
    }
    return { clean: cleanArr, hasSqli: false };
  }

  if (typeof data === 'object') {
    const cleanObj = {};
    for (const [key, val] of Object.entries(data)) {
      if (detectSqlInjection(key)) {
        return { clean: data, hasSqli: true };
      }
      const res = sanitizeDeep(val);
      if (res.hasSqli) return { clean: data, hasSqli: true };
      cleanObj[key] = res.clean;
    }
    return { clean: cleanObj, hasSqli: false };
  }

  return { clean: data, hasSqli: false };
}

/**
 * Express middleware to sanitize body, query, and params
 */
export function inputSanitizer(req, res, next) {
  // Check and sanitize query params
  if (req.query && Object.keys(req.query).length > 0) {
    const queryRes = sanitizeDeep(req.query);
    if (queryRes.hasSqli) {
      return res.status(400).json({
        error: 'Invalid input detected: suspected SQL injection pattern in query parameters.',
        code: 'SECURITY_SQLI_DETECTED'
      });
    }
    req.query = queryRes.clean;
  }

  // Check and sanitize body
  if (req.body && typeof req.body === 'object') {
    const bodyRes = sanitizeDeep(req.body);
    if (bodyRes.hasSqli) {
      return res.status(400).json({
        error: 'Invalid input detected: suspected SQL injection pattern in request body.',
        code: 'SECURITY_SQLI_DETECTED'
      });
    }
    req.body = bodyRes.clean;
  }

  next();
}
