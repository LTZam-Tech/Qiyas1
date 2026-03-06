import Queue from 'bull';
import config from '@/config';
import logger from '@/utils/logger';

// Email job queue
export const emailQueue = new Queue('email', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
  },
});

// Report job queue
export const reportQueue = new Queue('report', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
  },
});

// Email job types
export interface EmailJob {
  to: string;
  subject: string;
  template: 'task_assignment' | 'task_reminder' | 'escalation' | 'review_completed';
  data: any;
}

// Report job types
export interface ReportJob {
  type: 'completion' | 'detailed' | 'dashboard_snapshot';
  userId: number;
  filters?: any;
}

emailQueue.on('completed', (job) => {
  logger.info(`Email job ${job.id} completed`);
});

emailQueue.on('failed', (job, err) => {
  logger.error(`Email job ${job.id} failed`, err);
});

reportQueue.on('completed', (job) => {
  logger.info(`Report job ${job.id} completed`);
});

reportQueue.on('failed', (job, err) => {
  logger.error(`Report job ${job.id} failed`, err);
});

logger.info('Job queues initialized');
