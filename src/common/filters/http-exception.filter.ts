import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AbstractHttpAdapter } from '@nestjs/core';
import { Request } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapter: AbstractHttpAdapter) {}

  catch(exception: any, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request: Request = ctx.getRequest();
    const httpStatus = this.getHttpStatus(exception);
    const severity = this.getSeverity(httpStatus);

    const logMessage = this.getLogMessage(exception, request);
    switch (severity) {
      case 'ERROR':
        this.logger.error(logMessage, exception.stack);
        break;
      case 'WARN':
        this.logger.warn(logMessage);
        break;
      default:
        this.logger.log(logMessage);
    }

    const responseBody = this.createResponseBody(exception, httpStatus, request);
    this.httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }

  private getHttpStatus(exception: any): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    if (exception instanceof TypeError) {
      return HttpStatus.BAD_REQUEST;
    }
    if (exception instanceof Error && exception.message.includes('validation')) {
      return HttpStatus.UNPROCESSABLE_ENTITY;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getSeverity(status: number): 'ERROR' | 'WARN' | 'INFO' {
    if (status >= 500) return 'ERROR';
    if (status >= 400) return 'WARN';
    return 'INFO';
  }

  private getLogMessage(exception: any, request: Request): string {
    return `[${request.method}] ${request.url} - ${exception.message || 'Internal server error'}`;
  }

  private createResponseBody(exception: any, httpStatus: number, request: Request) {
    let message: string | Record<string, any>;
    let error: string | undefined;
    let details: any[] | undefined;

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (response instanceof Object) {
        message = response['message'];
        error = response['error'];
        if (httpStatus < 500 && response['details']) {
          details = response['details'];
        }
      } else {
        message = response;
      }
    } else if (typeof exception === 'string') {
      message = exception;
    } else {
      message =
        httpStatus >= 500 ? 'Internal server error' : (exception.message ?? 'An error occurred');
    }

    return {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path: this.httpAdapter.getRequestUrl(request),
      message,
      error,
      ...(details && { details }),
    };
  }
}
