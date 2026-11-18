import express, { Application, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import rateLimit from 'express-rate-limit';
import config from '@/config';
import { errorHandler } from '@/utils/errors';
import logger from '@/utils/logger';

// v1 routes: only sign-in stays mounted (security B2, Option A). The other v1 modules remain in the
// tree, unmounted, for a later cleanup PR; the live frontend and /api/v2 use none of them.
import authRoutes from '@/modules/auth/auth.routes';
import db from '@/db';
import { authenticate } from '@/middleware/auth';
import { evidenceDepsFromEnv, mountComplianceApi } from '@/compliance/runtime';
import { mountFrameworkUploadParser } from '@/compliance/api/router';

const app: Application = express();
// Behind the installation's reverse proxy (deploy/nginx.conf): trust its X-Forwarded-* headers so
// rate limits and audit records see the user's address. TRUST_PROXY=false when exposed directly.
if (process.env.TRUST_PROXY !== 'false' && process.env.NODE_ENV === 'production') app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: config.env === 'production',
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
}));

// Body parsing. Framework and crosswalk uploads (about 730 KB) get their own 2 MB parser first;
// the global parser then skips their already-parsed body, so BODY_LIMIT does not apply to them.
mountFrameworkUploadParser(app);
app.use(express.json({ limit: config.security.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.security.bodyLimit }));
// Express 5 leaves req.body undefined when a request has no body (Express 4 gave {}). Keep {} so
// handlers that destructure the body answer with a validation error (400), not a crash (500).
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.body === undefined) req.body = {};
  next();
});

// Cookie parsing
app.use(cookieParser());

// Compression
app.use(compression());

// CSRF protection (csurf, double-submit with a secret cookie). Every POST/PUT/PATCH/DELETE must carry
// x-csrf-token matching the httpOnly _csrf secret; the SPA gets the token from GET /api/v1/auth/csrf (or
// from login/refresh) via the readable csrfToken cookie. Both cookies are SameSite=strict.
app.use(
  csurf({
    cookie: {
      key: '_csrf',
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  }),
);
app.use((err: Error & { code?: string }, _req: Request, res: Response, next: NextFunction) => {
  if (err.code !== 'EBADCSRFTOKEN') return next(err);
  return res.status(403).json({
    success: false,
    error: {
      type: 'https://errors.platform.sa/csrf',
      title: 'Invalid CSRF token',
      status: 403,
      detail: 'CSRF validation failed',
    },
  });
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: config.security.rateLimitMaxRequests,
  message: {
    success: false,
    error: {
      type: 'https://errors.platform.sa/rate-limit',
      title: 'Too Many Requests',
      status: 429,
      detail: 'Too many requests from this IP, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);

// Request logging
app.use((_req, _res, next) => {
  logger.info(`${_req.method} ${_req.path}`, {
    ip: _req.ip,
    userAgent: _req.get('user-agent'),
  });
  next();
});

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  const db = await import('@/db');
  const redis = await import('@/db/redis');
  
  const dbHealthy = await db.default.healthCheck();
  const redisHealthy = await redis.default.healthCheck();

  const status = dbHealthy && redisHealthy ? 'healthy' : 'unhealthy';
  const statusCode = status === 'healthy' ? 200 : 503;

  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy ? 'up' : 'down',
      redis: redisHealthy ? 'up' : 'down',
    },
  });
});

// API routes. The static /api/v1/uploads mount and the users, perspectives, axes, standards, tasks,
// org-structure, submissions, reviews, dashboard, reports and notifications v1 routers are retired
// (C1, C2, C8, C18, N8, N9, NC1-NC3): their paths now fall through to the 404 handler below.
app.use('/api/v1/auth', authRoutes);

// Phase 1 compliance API (docs/phase1), alongside the legacy v1 routes
mountComplianceApi(app, { connect: () => db.getClient() }, authenticate, evidenceDepsFromEnv(logger));

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      type: 'https://errors.platform.sa/not-found',
      title: 'Not Found',
      status: 404,
      detail: `Cannot ${req.method} ${req.path}`,
    },
  });
});

// Error handler
app.use(errorHandler);

export default app;
