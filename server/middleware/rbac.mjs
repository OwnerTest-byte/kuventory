/**
 * Role-Based Access Control (RBAC) Middleware
 * Enforces permissions with SUPER_ADMIN universal override capabilities.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'anon-key-placeholder';

let defaultSupabaseClient = null;
function getSupabase() {
  if (!defaultSupabaseClient) {
    defaultSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return defaultSupabaseClient;
}

/**
 * Creates a request-scoped Supabase client that forwards the verified caller Bearer token.
 * Ensures PostgREST queries enforce caller RLS and authenticated context.
 */
export function getAuthenticatedSupabaseClient(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

/**
 * Extracts and verifies the authenticated user from the Authorization header or fallback test headers.
 */
export async function authenticateUser(req, res, next) {
  try {
    // 1. Allow explicit test/dev headers for unit testing and CI (Strictly disallowed in production)
    const devRole = req.headers['x-user-role'];
    const devUserId = req.headers['x-user-id'];
    if (devRole && (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development')) {
      const normalizedDevRole = devRole.toUpperCase();
      const isSuper = normalizedDevRole === 'SUPER_ADMIN';
      req.user = {
        id: devUserId || 'test-user-id',
        role: isSuper ? 'SUPER_ADMIN' : normalizedDevRole,
        isSuperAdmin: isSuper,
        canForceOverride: isSuper
      };
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required. Missing or malformed Bearer token.',
        code: 'AUTH_REQUIRED'
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    // 2. Validate token with Supabase Auth
    const authClient = getAuthenticatedSupabaseClient(token);
    const {
      data: { user },
      error: authError
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return res.status(401).json({
        error: 'Invalid, expired, or revoked authentication session token.',
        code: 'TOKEN_INVALID'
      });
    }

    // 3. Fetch canonical role from database profile (Single Source of Truth)
    const { data: profile, error: profileError } = await authClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return res.status(403).json({
        error: 'Unable to verify authenticated user profile role. Profile not found or permission denied.',
        code: 'ROLE_VERIFICATION_FAILED'
      });
    }

    const rawRole = (profile?.role || '').toUpperCase();
    const isSuperAdmin = rawRole === 'SUPER_ADMIN';
    const canonicalRole = isSuperAdmin ? 'SUPER_ADMIN' : rawRole;

    req.user = {
      id: user.id,
      email: user.email,
      role: canonicalRole,
      rawRole,
      isSuperAdmin,
      canForceOverride: isSuperAdmin
    };

    next();
  } catch (err) {
    console.error('[RBAC] Authentication error:', err);
    return res.status(500).json({
      error: 'Authentication failed due to an internal server error.',
      code: 'AUTH_INTERNAL_ERROR'
    });
  }
}

/**
 * RBAC Guard Middleware:
 * Allows access if the user's role is in `allowedRoles`,
 * OR if the user is a `SUPER_ADMIN` (universal bypass).
 */
export function requireRole(allowedRoles = []) {
  const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required before permission evaluation.',
        code: 'AUTH_REQUIRED'
      });
    }

    // SUPER_ADMIN has absolute bypass-level permissions across all operational endpoints
    if (req.user.isSuperAdmin || req.user.role === 'SUPER_ADMIN') {
      req.bypassedBySuperAdmin = true;
      return next();
    }

    // Check if user's role matches any allowed role
    if (normalizedAllowed.includes(req.user.role) || normalizedAllowed.includes(req.user.rawRole)) {
      return next();
    }

    return res.status(403).json({
      error: `Access denied: role '${req.user.role}' lacks sufficient privileges. Required: [${normalizedAllowed.join(', ')}].`,
      code: 'FORBIDDEN_ROLE'
    });
  };
}

/**
 * Force Override Verification Middleware:
 * Validates whether the user has the authority to override a locked/finalized record.
 */
export function requireForceOverridePermission(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.', code: 'AUTH_REQUIRED' });
  }

  if (req.user.isSuperAdmin || req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  return res.status(403).json({
    error: 'Permission denied: Super Admin authorization required to force override locked records.',
    code: 'PERMISSION_DENIED_OVERRIDE'
  });
}
