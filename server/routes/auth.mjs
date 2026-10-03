/**
 * Authentication Routes with Rate Limiting Protection
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
 * Strict rate limiting applied to mitigate brute force credential stuffing attacks.
 */
router.post('/login', authLoginLimiter, async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      error: 'Email and password are required.',
      code: 'MISSING_CREDENTIALS'
    });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({
        error: error.message || 'Invalid email or password.',
        code: 'AUTH_FAILED'
      });
    }

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
