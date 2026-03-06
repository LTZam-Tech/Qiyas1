import app from './app';
import config from '@/config';
import logger from '@/utils/logger';
import db from '@/db';
import redis from '@/db/redis';

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

    console.log('Testing Redis connection...');
    
    // Test Redis connection
    const redisHealthy = await redis.healthCheck();
    console.log('Redis Health check result:', redisHealthy);
    
    if (!redisHealthy) {
      throw new Error('Redis connection failed');
    }
    logger.info('Redis connected successfully');

    console.log('Starting HTTP server...');
    
    // Start server
    const server = app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      logger.info(`Server running on port ${PORT} in ${config.env} mode`);
      logger.info(`API endpoint: http://localhost:${PORT}/api/v1`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
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
