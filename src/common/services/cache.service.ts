import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly namespace = 'app-cache:';

  constructor(@InjectRedis() private readonly redis: Redis) {}

  private sanitizeKey(key: string): string {
    if (!key || typeof key !== 'string') {
      throw new Error('Cache key must be a non-empty string');
    }
    return this.namespace + key.replace(/\s+/g, '_').toLowerCase();
  }

  async set(key: string, value: any, ttlSeconds = 300): Promise<void> {
    const cacheKey = this.sanitizeKey(key);
    try {
      const serialized = JSON.stringify(value);
      await this.redis.set(cacheKey, serialized, 'EX', ttlSeconds);
      this.logger.debug(`Set cache key: ${cacheKey} (ttl: ${ttlSeconds}s)`);
    } catch (err) {
      this.logger.error(`Error setting cache key: ${cacheKey}`, err);
      throw err;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const cacheKey = this.sanitizeKey(key);
    try {
      const data = await this.redis.get(cacheKey);
      if (!data) {
        this.logger.debug(`Cache miss for key: ${cacheKey}`);
        return null;
      }
      return JSON.parse(data) as T;
    } catch (err) {
      this.logger.error(`Error getting cache key: ${cacheKey}`, err);
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    const cacheKey = this.sanitizeKey(key);
    try {
      const result = await this.redis.del(cacheKey);
      this.logger.debug(`Deleted cache key: ${cacheKey}`);
      return result > 0;
    } catch (err) {
      this.logger.error(`Error deleting cache key: ${cacheKey}`, err);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await this.redis.keys(this.namespace + '*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.warn(`Cleared all cache keys in namespace: ${this.namespace}`);
      }
    } catch (err) {
      this.logger.error('Error clearing cache', err);
      throw err;
    }
  }

  async has(key: string): Promise<boolean> {
    const cacheKey = this.sanitizeKey(key);
    try {
      const exists = await this.redis.exists(cacheKey);
      return exists === 1;
    } catch (err) {
      this.logger.error(`Error checking existence of cache key: ${cacheKey}`, err);
      return false;
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const cacheKeys = keys.map(k => this.sanitizeKey(k));
    try {
      const results = await this.redis.mget(...cacheKeys);
      return results.map(r => (r ? JSON.parse(r) : null));
    } catch (err) {
      this.logger.error('Error in bulk get', err);
      return keys.map(() => null);
    }
  }

  async mset(pairs: { key: string; value: any; ttlSeconds?: number }[]): Promise<void> {
    for (const { key, value, ttlSeconds = 300 } of pairs) {
      await this.set(key, value, ttlSeconds);
    }
  }

  async stats(): Promise<{ count: number }> {
    const keys = await this.redis.keys(this.namespace + '*');
    return { count: keys.length };
  }
}
