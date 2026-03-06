import Redis from 'ioredis';
import config from '@/config';
import logger from '@/utils/logger';

class RedisClient {
  private client: Redis;
  private static instance: RedisClient;

  private constructor() {
    this.client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      logger.info('Redis connected');
    });

    this.client.on('error', (err) => {
      logger.error('Redis error', err);
    });

    this.client.on('ready', () => {
      logger.info('Redis ready');
    });
  }

  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  public getClient(): Redis {
    return this.client;
  }

  public async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  public async set(key: string, value: string, expirySeconds?: number): Promise<'OK'> {
    if (expirySeconds) {
      return await this.client.setex(key, expirySeconds, value);
    }
    return await this.client.set(key, value);
  }

  public async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  public async exists(key: string): Promise<number> {
    return await this.client.exists(key);
  }

  public async incr(key: string): Promise<number> {
    return await this.client.incr(key);
  }

  public async expire(key: string, seconds: number): Promise<number> {
    return await this.client.expire(key, seconds);
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      logger.error('Redis health check failed', error);
      return false;
    }
  }

  public async close(): Promise<void> {
    await this.client.quit();
    logger.info('Redis connection closed');
  }
}

export default RedisClient.getInstance();
