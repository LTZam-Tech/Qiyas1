import dotenv from 'dotenv';
import path from 'path';
import { assertProductionSecrets } from './secretPolicy';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

interface Config {
  env: string;
  port: number;
  apiPrefix: string;
  
  // Database
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl: boolean;
    poolMin: number;
    poolMax: number;
  };
  
  // Redis
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  
  // MinIO / S3
  storage: {
    endpoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
    buckets: {
      evidence: string;
      reports: string;
      templates: string;
    };
  };
  
  // JWT
  jwt: {
    accessSecret: string;
    accessExpiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
    algorithm: 'HS256' | 'RS256';
    accessPrivateKey?: string;
    accessPublicKey?: string;
  };
  
  // Security
  security: {
    bcryptRounds: number;
    maxLoginAttempts: number;
    lockoutDurationMinutes: number;
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;
    bodyLimit: string;
  };

  // Auth/session
  auth: {
    refreshTokenCookieMaxAgeMs: number;
    csrfCookieMaxAgeMs: number;
  };
  
  // File Upload
  upload: {
    maxFileSizeMB: number;
    allowedMimeTypes: string[];
    virusScanEnabled: boolean;
  };
  
  // CORS
  cors: {
    origin: string[];
    credentials: boolean;
  };
}

const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8080', 10),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
    database: process.env.POSTGRES_DB || 'qiyas_platform',
    user: process.env.POSTGRES_USER || 'qiyas_user',
    password: process.env.POSTGRES_PASSWORD || 'change_me',
    ssl: process.env.POSTGRES_SSL === 'true',
    poolMin: 2,
    poolMax: 10,
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6380', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  
  storage: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9100', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ROOT_USER || 'minioadmin',
    secretKey: process.env.MINIO_ROOT_PASSWORD || 'minioadmin',
    buckets: {
      evidence: 'evidence',
      reports: 'reports',
      templates: 'templates',
    },
  },
  
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'change-this-secret-in-production',
    accessExpiresIn: '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-this-refresh-secret',
    refreshExpiresIn: '30d',
    algorithm: (process.env.JWT_ALGORITHM === 'RS256' ? 'RS256' : 'HS256'),
    accessPrivateKey: process.env.JWT_ACCESS_PRIVATE_KEY,
    accessPublicKey: process.env.JWT_ACCESS_PUBLIC_KEY,
  },
  
  security: {
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockoutDurationMinutes: 15,
    rateLimitWindowMs: 60 * 1000, // 1 minute
    rateLimitMaxRequests: 100,
    bodyLimit: process.env.BODY_LIMIT || '512kb',
  },

  auth: {
    refreshTokenCookieMaxAgeMs: parseInt(
      process.env.REFRESH_TOKEN_COOKIE_MAX_AGE_MS || String(30 * 24 * 60 * 60 * 1000),
      10
    ),
    csrfCookieMaxAgeMs: parseInt(
      process.env.CSRF_COOKIE_MAX_AGE_MS || String(30 * 24 * 60 * 60 * 1000),
      10
    ),
  },
  
  upload: {
    maxFileSizeMB: parseInt(process.env.UPLOAD_MAX_FILE_SIZE_MB || '25', 10),
    allowedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/png',
      'image/jpeg',
      'image/jpg',
    ],
    virusScanEnabled: true,
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:4200',
      'http://127.0.0.1:4200',
    ],
    credentials: true,
  },
};

// Validate required config. Secrets are checked separately by the secret policy (C4).
const requiredEnvVars = [
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_DB',
  'POSTGRES_USER',
  'REDIS_HOST',
  'REDIS_PORT',
  'MINIO_ENDPOINT',
  'MINIO_PORT',
];

if (config.env === 'production') {
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Length, entropy, placeholder and uniqueness checks on every secret, and the RS256 key presence check.
  assertProductionSecrets(process.env, config);
}

export default config;
