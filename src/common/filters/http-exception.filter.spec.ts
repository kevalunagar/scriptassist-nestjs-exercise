import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AbstractHttpAdapter } from '@nestjs/core';
import { AllExceptionsFilter } from './http-exception.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let httpAdapter: AbstractHttpAdapter;
  let mockHost: any;
  let mockRequest: any;
  let mockResponse: any;

  beforeEach(() => {
    httpAdapter = {
      reply: jest.fn(),
      getRequestUrl: jest.fn(),
    } as any;

    mockRequest = {
      method: 'GET',
      url: '/test',
    };

    mockResponse = {};

    mockHost = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    };

    filter = new AllExceptionsFilter(httpAdapter);
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  it('should handle HttpException correctly', () => {
    const exception = new HttpException('Test error', HttpStatus.BAD_REQUEST);
    filter.catch(exception, mockHost);

    expect(httpAdapter.reply).toHaveBeenCalledWith(
      mockResponse,
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Test error',
      }),
      HttpStatus.BAD_REQUEST,
    );
  });

  it('should handle TypeError as BAD_REQUEST', () => {
    const exception = new TypeError('Type error');
    filter.catch(exception, mockHost);

    expect(httpAdapter.reply).toHaveBeenCalledWith(
      mockResponse,
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Type error',
      }),
      HttpStatus.BAD_REQUEST,
    );
  });

  it('should handle validation errors as UNPROCESSABLE_ENTITY', () => {
    const exception = new Error('validation failed');
    filter.catch(exception, mockHost);

    expect(httpAdapter.reply).toHaveBeenCalledWith(
      mockResponse,
      expect.objectContaining({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'validation failed',
      }),
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  });

  it('should handle unknown errors as INTERNAL_SERVER_ERROR', () => {
    const exception = new Error('Unknown error');
    filter.catch(exception, mockHost);

    expect(httpAdapter.reply).toHaveBeenCalledWith(
      mockResponse,
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        error: undefined,
        path: undefined,
      }),
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });

  it('should log error for 500+ status codes', () => {
    const exception = new Error('Server error');
    filter.catch(exception, mockHost);

    expect(Logger.prototype.error).toHaveBeenCalled();
  });

  it('should log warning for 400-499 status codes', () => {
    const exception = new HttpException('Bad Request', HttpStatus.BAD_REQUEST);
    filter.catch(exception, mockHost);

    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it('should include details for HTTP exceptions with status < 500', () => {
    const details = ['validation error 1', 'validation error 2'];
    const exception = new HttpException(
      {
        message: 'Validation failed',
        error: 'Bad Request',
        details,
      },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost);

    expect(httpAdapter.reply).toHaveBeenCalledWith(
      mockResponse,
      expect.objectContaining({
        details,
      }),
      HttpStatus.BAD_REQUEST,
    );
  });

  it('should handle string exceptions', () => {
    const exception = 'String error message';
    filter.catch(exception, mockHost);

    expect(httpAdapter.reply).toHaveBeenCalledWith(
      mockResponse,
      expect.objectContaining({
        message: 'String error message',
      }),
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });
});
