import app from './app';
import config from '@/config';
import logger from '@/utils/logger';
import db from '@/db';
import redis from '@/db/redis';
import { runPendingMigrations } from '@/db/migrations';
import { prepareComplianceDatabase, startComplianceScheduler } from '@/compliance/runtime';

console.log('=== SERVER STARTING ===');

// Import jobs and workers
// import './jobs/sla-monitor'; // SLA monitoring cron job
// import './workers/email-notification'; // Email worker
// import './workers/report-generation'; // Report worker

const PORT = config.port;

async function startServer() {
  try {
    console.log('Starting server...');
    console.log('Testing database connection...');
    
    // Test database connection
    const dbHealthy = await db.healthCheck();
    console.log('DB Health check result:', dbHealthy);
    
    if (!dbHealthy) {
      throw new Error('Database connection failed');
    }
    logger.info('Database connected successfully');

    console.log('Applying pending database migrations...');
    await runPendingMigrations();
    logger.info('Database migrations checked/applied successfully');

    // Phase 1 schema "qiyas": migrations + role matrix, then the deadline scheduler
    const compliancePool = { connect: () => db.getClient() };
    const ran = await prepareComplianceDatabase(compliancePool);
    logger.info('Qiyas compliance schema ready', { applied: ran });
    startComplianceScheduler(compliancePool, logger);

    console.log('Testing Redis connection...');
    
    // Test Redis connection
    const redisHealthy = await redis.healthCheck();
    console.log('Redis Health check result:', redisHealthy);
    
    if (!redisHealthy) {
      throw new Error('Redis connection failed');
    }
    logger.info('Redis connected successfully');

    console.log('Starting HTTP server...');
    
    // Start server - explicitly bind to 0.0.0.0 to accept both IPv4 and IPv6
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on port ${PORT}`);
      logger.info(`Server running on port ${PORT} in ${config.env} mode`);
      logger.info(`API endpoint: http://localhost:${PORT}/api/v1`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      console.error('Server error:', error);
      logger.error('Server error', error);
      
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use`);
      }
      
      process.exit(1);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, closing server gracefully`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          await db.close();
          await redis.close();
          logger.info('All connections closed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', error);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start server:', error);
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// Start the server
startServer();
