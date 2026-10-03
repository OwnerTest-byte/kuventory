/**
 * Kuventory Production Security Gateway & API Server
 * Configures Helmet security headers, rate limiters, input sanitization, and transaction endpoints.
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { inputSanitizer } from './middleware/security.mjs';
import { generalApiLimiter } from './middleware/rateLimiter.mjs';
import authRoutes from './routes/auth.mjs';
import inventoryRoutes from './routes/inventory.mjs';
import notificationRoutes from './routes/notifications.mjs';

dotenv.config();

export function createServer() {
  const app = express();

  // 1. Helmet Security Headers Configuration
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: [
            "'self'",
            'https:',
            'wss:',
            'http://127.0.0.1:54321',
            'ws://127.0.0.1:54321',
          ],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false, // Allows cross-origin image loads
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'deny' }, // Anti-clickjacking
      xssFilter: true,
      noSniff: true, // Prevent MIME sniffing
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })
  );

  // 2. Cross-Origin Resource Sharing (CORS)
  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-user-role', 'x-user-id'],
    })
  );

  // 3. Body Parsing with safe size limits (supports base64 image strings)
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // 4. Input Sanitization (strips malicious script tags and rejects SQL injection patterns)
  app.use(inputSanitizer);

  // 5. Global API Rate Limiter
  app.use('/api', generalApiLimiter);

  // 6. Health & Status Check Endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'kuventory-security-gateway'
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });

  // 7. Core Feature Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/notifications', notificationRoutes);

  // 8. 404 Route Handler
  app.use((_req, res) => {
    res.status(404).json({
      error: 'API endpoint not found',
      code: 'NOT_FOUND'
    });
  });

  // 9. Centralized Error Handler
  app.use((err, _req, res, _next) => {
    console.error('[SERVER ERROR]:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
      code: err.code || 'INTERNAL_ERROR'
    });
  });

  return app;
}

export const app = createServer();

// Auto-start server when run directly
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`[Kuventory Gateway] Server running securely on port ${PORT}`);
  });
}
