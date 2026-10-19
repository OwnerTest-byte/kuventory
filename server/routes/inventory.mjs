/**
 * Inventory Management & Concurrency-Safe Transaction Endpoints
 * Employs row-level locking (SELECT ... FOR UPDATE) and OCC versioning.
 */
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { authenticateUser, requireForceOverridePermission } from '../middleware/rbac.mjs';

const router = Router();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'anon-key-placeholder';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Creates a request-scoped Supabase client forwarding the authenticated user's JWT.
 * Preserves database auth.uid(), RLS policy enforcement, and audit ledger integrity.
 */
function getRequestSupabase(req) {
  const token = req.token || (req.headers?.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);
  const options = token
    ? {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    : {};
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options);
}

/**
 * Service role client reserved exclusively for privileged server-only administrative tasks.
 */
function getServiceRoleSupabase() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured on the server.');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * GET /api/inventory/batches
 * Fetches batches for an item, strictly excluding depleted batches (quantity > 0).
 * Requires authenticated session.
 */
router.get('/batches', authenticateUser, async (req, res) => {
  try {
    const { itemId } = req.query;
    const supabase = getRequestSupabase(req);

    let query = supabase
      .from('stock_batches')
      .select('*')
      .gt('quantity', 0) // Explicit database-level exclusion of 0-quantity batches
      .order('expiry_date', { ascending: true, nullsFirst: false });

    if (itemId) {
      query = query.eq('item_id', itemId);
    }

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ error: error.message, code: 'DB_QUERY_ERROR' });
    }

    res.json({ batches: data });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /api/inventory/consume
 * Concurrency-Safe Stock Deduction Endpoint
 * Employs row-level locking (SELECT ... FOR UPDATE) and OCC (version checking)
 * inside a database transaction to prevent race conditions during simultaneous requests.
 */
router.post('/consume', authenticateUser, async (req, res) => {
  const { itemId, quantity, reason = 'Direct Consumption', expectedVersion } = req.body || {};

  if (!itemId || !quantity || Number(quantity) <= 0) {
    return res.status(400).json({
      error: 'Invalid payload: itemId and positive quantity are required.',
      code: 'INVALID_PAYLOAD'
    });
  }

  const supabase = getRequestSupabase(req);

  try {
    // Call stored procedure execute within strict database transaction with row locks
    const { data, error } = await supabase.rpc('consume_stock', {
      p_item_id: itemId,
      p_quantity: Number(quantity),
      p_reason: reason,
      p_expected_version: expectedVersion !== undefined ? Number(expectedVersion) : null
    });

    if (error) {
      // Check if the error is due to a concurrency collision (OCC version mismatch)
      if (error.message && error.message.includes('CONCURRENCY_CONFLICT')) {
        return res.status(409).json({
          error: 'Concurrency conflict: This item was modified by another transaction. Please refresh and retry.',
          code: 'CONCURRENCY_CONFLICT'
        });
      }

      // Check if insufficient stock
      if (error.message && error.message.includes('Insufficient stock')) {
        return res.status(400).json({
          error: error.message,
          code: 'INSUFFICIENT_STOCK'
        });
      }

      return res.status(500).json({
        error: error.message,
        code: 'TRANSACTION_ERROR'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Stock deducted successfully within strict transaction lock.',
      result: data
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || 'An unexpected error occurred during stock transaction.',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

/**
 * POST /api/daily-inventory/:id/force-override
 * Master Admin Bypass Endpoint: Force-overrides and unlocks a locked daily inventory record.
 * Only users with MASTER_ADMIN privileges are allowed to execute this override.
 */
router.post(
  '/daily-inventory/:id/force-override',
  authenticateUser,
  requireForceOverridePermission,
  async (req, res) => {
    const { id } = req.params;
    const { reason = 'Master Admin Force Override' } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: 'Inventory ID is required', code: 'INVALID_ID' });
    }

    try {
      const supabase = getRequestSupabase(req);
      const { data, error } = await supabase.rpc('force_override_daily_inventory', {
        p_inventory_id: id,
        p_reason: reason
      });

      if (error) {
        return res.status(500).json({ error: error.message, code: 'OVERRIDE_ERROR' });
      }

      return res.status(200).json({
        success: true,
        message: 'Daily inventory record successfully unlocked via MASTER_ADMIN force override.',
        result: data
      });
    } catch (err) {
      return res.status(500).json({ error: err.message, code: 'INTERNAL_ERROR' });
    }
  }
);

export default router;
