import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  private readonly sensitiveFields = [
    'password',
    'token',
    'authorization',
    'cookie',
    'secret',
    'key',
    'pass',
    'auth',
    'bearer',
    'credentials',
  ];

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const method = req.method;
    const url = req.url;
    const userAgent = req.headers['user-agent'];
    const ip = req.ip;
    const now = Date.now();
    const userId = req.user?.id || req.user?.userId || req.headers['user-id'] || 'anonymous';

    this.logger.log(`Incoming Request: ${method} ${url}`, {
      method,
      url,
      ip,
      userAgent,
      userId,
      headers: this.sanitizeObject(req.headers),
      query: req.query,
      body: this.sanitizeObject(req.body),
    });

    return next.handle().pipe(
      tap({
        next: responseData => {
          const responseTime = Date.now() - now;
          this.logger.log(
            `Outgoing Response: ${method} ${url} - ${res.statusCode} - ${responseTime}ms`,
            {
              method,
              url,
              statusCode: res.statusCode,
              responseTime,
              userId,
              responseSize: JSON.stringify(responseData).length,
              response: this.sanitizeObject(responseData),
            },
          );
        },
        error: err => {
          const responseTime = Date.now() - now;
          this.logger.error(
            `Error Response: ${method} ${url} - ${err.status || 500} - ${responseTime}ms`,
            {
              method,
              url,
              statusCode: err.status || 500,
              responseTime,
              userId,
              error: err.message,
              stack: err.stack,
            },
          );
        },
      }),
    );
  }

  private sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase();
      const isSensitive = this.sensitiveFields.some(field => keyLower.includes(field));

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
