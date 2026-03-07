import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import config from '@/config';
import { errorHandler } from '@/utils/errors';
import logger from '@/utils/logger';

// Import routes (will be created)
import authRoutes from '@/modules/auth/auth.routes';
import userRoutes from '@/modules/users/users.routes';
import perspectiveRoutes from '@/modules/perspectives/perspectives.routes';
import axisRoutes from '@/modules/axes/axes.routes';
import standardRoutes from '@/modules/standards/standards.routes';
import taskRoutes from '@/modules/tasks/tasks.routes';
import submissionRoutes from '@/modules/submissions/submissions.routes';
import reviewRoutes from '@/modules/reviews/reviews.routes';
import dashboardRoutes from '@/modules/dashboard/dashboard.routes';
import reportRoutes from '@/modules/reports/reports.routes';
import orgStructureRoutes from '@/modules/org-structure/org-structure.routes';

const app: Application = express();

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
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Cookie parsing
app.use(cookieParser());

// Compression
app.use(compression());

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

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/perspectives', perspectiveRoutes);
app.use('/api/v1/axes', axisRoutes);
app.use('/api/v1/standards', standardRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1', orgStructureRoutes);
app.use('/api/v1/submissions', submissionRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/reports', reportRoutes);

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
