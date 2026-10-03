/**
 * Real-Time Notifications via Server-Sent Events (SSE)
 * Replaces slow polling with instant real-time event streaming.
 */
import { Router } from 'express';

const router = Router();

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
 */
router.post('/publish', (req, res) => {
  const { title, message, type = 'info', metadata = {} } = req.body || {};
  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required', code: 'INVALID_PAYLOAD' });
  }

  const notification = {
    id: `notif-${Date.now()}`,
    title,
    message,
    type,
    metadata,
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
});

/**
 * GET /api/notifications/clients
 * Returns count of active SSE stream listeners
 */
router.get('/clients', (_req, res) => {
  res.json({ activeClients: sseClients.size });
});

export default router;
