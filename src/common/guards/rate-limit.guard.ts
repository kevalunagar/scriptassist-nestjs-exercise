import { RATE_LIMIT_KEY } from '@common/decorators/rate-limit.decorator';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { Observable } from 'rxjs';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();

    const config = this.reflector.getAllAndOverride<{ limit: number; windowMs: number }>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    ) || { limit: 100, windowMs: 60 * 1000 };

    const hashedIp = createHash('sha256').update(request.ip).digest('hex');
    return this.handleRateLimit(hashedIp, config.limit, config.windowMs);
  }

  private async handleRateLimit(
    hashedIp: string,
    maxRequests: number,
    windowMs: number,
  ): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const key = `rate_limit:${hashedIp}`;

    try {
      const pipeline = this.redis.pipeline();
      pipeline.zremrangebyscore(key, '-inf', windowStart);
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      pipeline.zcard(key);
      pipeline.expire(key, Math.ceil(windowMs / 1000) + 10);
      const results = await pipeline.exec();
      const count = results?.[2]?.[1] as number;
      if (count > maxRequests) {
        throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
      }
      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      return true;
    }
  }
}
