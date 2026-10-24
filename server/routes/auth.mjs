/**
 * Authentication Routes with Rate Limiting and Server-Authoritative Lockout Protection
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { authLoginLimiter } from '../middleware/rateLimiter.mjs';

const router = Router();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'anon-key-placeholder';

let supabaseClient = null;
function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

/**
 * POST /api/auth/login
 * Enforces IP throttling + Account-Level 5-Failure / 30-Minute Lockout Policy.
 */
router.post('/login', authLoginLimiter, async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      error: 'Email and password are required.',
      code: 'MISSING_CREDENTIALS'
    });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const clientIp = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'API Client';
  const supabase = getSupabase();

  try {
    // 1. Server-authoritative lockout pre-check
    const { data: lockCheck } = await supabase.rpc('check_account_lockout', {
      p_email: cleanEmail,
      p_ip: clientIp,
    });

    if (lockCheck && lockCheck.is_locked) {
      return res.status(423).json({
        error: 'Your sign-in is temporarily paused after repeated failed attempts.',
        code: 'AUTH_LOCKED',
        is_locked: true,
        locked_until: lockCheck.locked_until,
        seconds_remaining: lockCheck.seconds_remaining,
        lockout_token: lockCheck.lockout_token
      });
    }

    // 2. Credential verification via Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password
    });

    if (error) {
      // 3. Atomically record failed attempt in database
      const { data: attemptResult } = await supabase.rpc('record_login_attempt', {
        p_email: cleanEmail,
        p_success: false,
        p_ip: clientIp,
        p_user_agent: userAgent
      });

      if (attemptResult && attemptResult.is_locked) {
        return res.status(423).json({
          error: 'Your sign-in is temporarily paused after 5 failed attempts.',
          code: 'AUTH_LOCKED',
          is_locked: true,
          locked_until: attemptResult.locked_until,
          seconds_remaining: attemptResult.seconds_remaining,
          lockout_token: attemptResult.lockout_token
        });
      }

      const remaining = 5 - (attemptResult?.failed_attempts || 1);
      return res.status(401).json({
        error: remaining > 0 
          ? `Invalid email or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.`
          : 'Invalid email or password.',
        code: 'AUTH_FAILED',
        attempts_remaining: Math.max(0, remaining)
      });
    }

    // 4. On success: clear lockout counter atomically
    await supabase.rpc('record_login_attempt', {
      p_email: cleanEmail,
      p_success: true,
      p_ip: clientIp,
      p_user_agent: userAgent
    });

    return res.status(200).json({
      success: true,
      session: {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        user: data.user
      }
    });
  } catch (err) {
    console.error('[Auth Error]:', err);
    return res.status(500).json({
      error: 'An internal authentication error occurred.',
      code: 'AUTH_SERVER_ERROR'
    });
  }
});

export default router;
