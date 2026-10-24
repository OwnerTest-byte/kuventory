import { Router } from 'express';
import { authenticateUser, requireRole } from '../middleware/rbac.mjs';

const router = Router();

// Allowed notification types
const ALLOWED_NOTIFICATION_TYPES = new Set([
  'info',
  'warning',
  'error',
  'success',
  'LOW_STOCK',
  'EXPIRING_SOON',
  'DAILY_INVENTORY_REVISED'
]);

// Active SSE client connections
const sseClients = new Set();

/**
 * Broadcast an event to all connected SSE clients
 */
export function broadcastNotification(eventData) {
  const payload = `data: ${JSON.stringify(eventData)}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

/**
 * GET /api/notifications/stream
 * Connects a client to the real-time notification SSE stream.
 */
router.get('/stream', (req, res) => {
  // Set headers for Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable proxy buffering (Nginx, etc.)
  });

  const clientId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const clientObj = { id: clientId, res };
  sseClients.add(clientObj);

  // Send initial connection handshake
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientId, timestamp: new Date().toISOString() })}\n\n`);

  // Heartbeat keep-alive every 25 seconds to prevent gateway timeouts
  const heartbeatTimer = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeatTimer);
      sseClients.delete(clientObj);
    }
  }, 25000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeatTimer);
    sseClients.delete(clientObj);
  });
});

/**
 * POST /api/notifications/publish
 * Allows broadcasting a new notification event to all active clients.
 * Protected: Requires authenticated Admin / Super Admin caller and validated payload.
 */
router.post(
  '/publish',
  authenticateUser,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  (req, res) => {
    const { title, message, type = 'info', metadata = {} } = req.body || {};

    if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > 200) {
      return res.status(400).json({
        error: 'Invalid title: must be a non-empty string up to 200 characters.',
        code: 'INVALID_TITLE'
      });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0 || message.length > 1000) {
      return res.status(400).json({
        error: 'Invalid message: must be a non-empty string up to 1000 characters.',
        code: 'INVALID_MESSAGE'
      });
    }

    const normalizedType = String(type).trim();
    if (!ALLOWED_NOTIFICATION_TYPES.has(normalizedType)) {
      return res.status(400).json({
        error: `Invalid notification type '${type}'. Allowed: [${Array.from(ALLOWED_NOTIFICATION_TYPES).join(', ')}].`,
        code: 'INVALID_TYPE'
      });
    }

    const notification = {
      id: `notif-${Date.now()}`,
      title: title.trim(),
      message: message.trim(),
      type: normalizedType,
      metadata: typeof metadata === 'object' && metadata !== null ? metadata : {},
      published_by: req.user?.id,
      published_by_role: req.user?.role,
      created_at: new Date().toISOString(),
      is_read: false
    };

    broadcastNotification({
      type: 'NOTIFICATION_RECEIVED',
      notification
    });

    return res.status(200).json({
      success: true,
      recipientCount: sseClients.size,
      notification
    });
  }
);

/**
 * GET /api/notifications/clients
 * Returns count of active SSE stream listeners.
 * Protected: Requires authenticated Admin / Super Admin caller.
 */
router.get(
  '/clients',
  authenticateUser,
  requireRole(['ADMIN', 'SUPER_ADMIN']),
  (_req, res) => {
    res.json({ activeClients: sseClients.size });
  }
);

export default router;
