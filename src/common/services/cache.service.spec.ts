import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  let service: CacheService;
  let redis: jest.Mocked<Redis>;

  beforeEach(async () => {
    redis = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      exists: jest.fn(),
      mget: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: 'default_IORedisModuleConnectionToken',
          useValue: redis,
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  describe('sanitizeKey', () => {
    it('should throw error for empty key', async () => {
      await expect(service.set('', 'value')).rejects.toThrow(
        'Cache key must be a non-empty string',
      );
    });

    it('should sanitize key by replacing spaces and converting to lowercase', async () => {
      await service.set('Test Key', 'value');
      expect(redis.set).toHaveBeenCalledWith('app-cache:test_key', expect.any(String), 'EX', 300);
    });
  });

  describe('set', () => {
    it('should successfully set a cache value with default TTL', async () => {
      const key = 'test';
      const value = { data: 'test' };

      await service.set(key, value);

      expect(redis.set).toHaveBeenCalledWith('app-cache:test', JSON.stringify(value), 'EX', 300);
    });

    it('should set a cache value with custom TTL', async () => {
      const key = 'test';
      const value = { data: 'test' };
      const ttl = 600;

      await service.set(key, value, ttl);

      expect(redis.set).toHaveBeenCalledWith('app-cache:test', JSON.stringify(value), 'EX', ttl);
    });

    it('should throw error when redis.set fails', async () => {
      redis.set.mockRejectedValue(new Error('Redis error'));

      await expect(service.set('test', 'value')).rejects.toThrow('Redis error');
    });
  });

  describe('get', () => {
    it('should return parsed data when cache hit', async () => {
      const data = { test: 'data' };
      redis.get.mockResolvedValue(JSON.stringify(data));

      const result = await service.get('test');

      expect(result).toEqual(data);
      expect(redis.get).toHaveBeenCalledWith('app-cache:test');
    });

    it('should return null on cache miss', async () => {
      redis.get.mockResolvedValue(null);

      const result = await service.get('test');

      expect(result).toBeNull();
    });

    it('should return null on redis error', async () => {
      redis.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.get('test');

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should return true when key is successfully deleted', async () => {
      redis.del.mockResolvedValue(1);

      const result = await service.delete('test');

      expect(result).toBe(true);
      expect(redis.del).toHaveBeenCalledWith('app-cache:test');
    });

    it('should return false when key does not exist', async () => {
      redis.del.mockResolvedValue(0);

      const result = await service.delete('test');

      expect(result).toBe(false);
    });

    it('should return false on redis error', async () => {
      redis.del.mockRejectedValue(new Error('Redis error'));

      const result = await service.delete('test');

      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all keys in namespace', async () => {
      const keys = ['app-cache:key1', 'app-cache:key2'];
      redis.keys.mockResolvedValue(keys);
      redis.del.mockResolvedValue(2);

      await service.clear();

      expect(redis.keys).toHaveBeenCalledWith('app-cache:*');
      expect(redis.del).toHaveBeenCalledWith(...keys);
    });

    it('should not call del when no keys exist', async () => {
      redis.keys.mockResolvedValue([]);

      await service.clear();

      expect(redis.del).not.toHaveBeenCalled();
    });

    it('should throw error when redis operation fails', async () => {
      redis.keys.mockRejectedValue(new Error('Redis error'));

      await expect(service.clear()).rejects.toThrow('Redis error');
    });
  });

  describe('has', () => {
    it('should return true when key exists', async () => {
      redis.exists.mockResolvedValue(1);

      const result = await service.has('test');

      expect(result).toBe(true);
      expect(redis.exists).toHaveBeenCalledWith('app-cache:test');
    });

    it('should return false when key does not exist', async () => {
      redis.exists.mockResolvedValue(0);

      const result = await service.has('test');

      expect(result).toBe(false);
    });

    it('should return false on redis error', async () => {
      redis.exists.mockRejectedValue(new Error('Redis error'));

      const result = await service.has('test');

      expect(result).toBe(false);
    });
  });

  describe('mget', () => {
    it('should return parsed values for multiple keys', async () => {
      const keys = ['key1', 'key2'];
      const values = [JSON.stringify({ data: 1 }), JSON.stringify({ data: 2 })];
      redis.mget.mockResolvedValue(values);

      const result = await service.mget(keys);

      expect(result).toEqual([{ data: 1 }, { data: 2 }]);
      expect(redis.mget).toHaveBeenCalledWith('app-cache:key1', 'app-cache:key2');
    });

    it('should handle null values in results', async () => {
      const keys = ['key1', 'key2'];
      redis.mget.mockResolvedValue([JSON.stringify({ data: 1 }), null]);

      const result = await service.mget(keys);

      expect(result).toEqual([{ data: 1 }, null]);
    });

    it('should return null array on redis error', async () => {
      const keys = ['key1', 'key2'];
      redis.mget.mockRejectedValue(new Error('Redis error'));

      const result = await service.mget(keys);

      expect(result).toEqual([null, null]);
    });
  });

  describe('mset', () => {
    it('should set multiple key-value pairs', async () => {
      const pairs = [
        { key: 'key1', value: { data: 1 } },
        { key: 'key2', value: { data: 2 }, ttlSeconds: 600 },
      ];

      await service.mset(pairs);

      expect(redis.set).toHaveBeenCalledTimes(2);
      expect(redis.set).toHaveBeenCalledWith(
        'app-cache:key1',
        JSON.stringify({ data: 1 }),
        'EX',
        300,
      );
      expect(redis.set).toHaveBeenCalledWith(
        'app-cache:key2',
        JSON.stringify({ data: 2 }),
        'EX',
        600,
      );
    });
  });

  describe('stats', () => {
    it('should return correct count of keys', async () => {
      const keys = ['app-cache:key1', 'app-cache:key2'];
      redis.keys.mockResolvedValue(keys);

      const result = await service.stats();

      expect(result).toEqual({ count: 2 });
      expect(redis.keys).toHaveBeenCalledWith('app-cache:*');
    });

    it('should return zero count when no keys exist', async () => {
      redis.keys.mockResolvedValue([]);

      const result = await service.stats();

      expect(result).toEqual({ count: 0 });
    });
  });
});
