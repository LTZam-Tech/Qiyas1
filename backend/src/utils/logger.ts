import winston from 'winston';
import config from '@/config';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  let metaStr = '';
  if (Object.keys(meta).length > 0) {
    metaStr = `\n${JSON.stringify(meta, null, 2)}`;
  }
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

// Create logger instance
const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    // Console transport
    new winston.transports.Console({
      format: combine(
        colorize(),
        logFormat
      ),
    }),
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' }),
  ],
});

// Don't log to files in test environment
if (process.env.NODE_ENV === 'test') {
  logger.clear();
  logger.add(new winston.transports.Console({ silent: true }));
}

export default logger;
