import type { ErrorCode } from '@nexusdesk/shared';
import { ERROR_CODES } from '@nexusdesk/shared';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  static unauthorized(message = 'Unauthorized', code: ErrorCode = ERROR_CODES.UNAUTHORIZED): AppError {
    return new AppError(code, message, 401);
  }

  static forbidden(message = 'Forbidden', code: ErrorCode = ERROR_CODES.FORBIDDEN): AppError {
    return new AppError(code, message, 403);
  }

  static notFound(message = 'Not found', code: ErrorCode = ERROR_CODES.NOT_FOUND): AppError {
    return new AppError(code, message, 404);
  }

  static conflict(message = 'Conflict', code: ErrorCode = ERROR_CODES.CONFLICT): AppError {
    return new AppError(code, message, 409);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(ERROR_CODES.VALIDATION, message, 400, details);
  }

  static badRequest(message: string, code: ErrorCode = ERROR_CODES.BAD_REQUEST): AppError {
    return new AppError(code, message, 400);
  }

  static tooMany(message = 'Too many requests'): AppError {
    return new AppError(ERROR_CODES.RATE_LIMITED, message, 429);
  }

  static internal(message = 'Internal server error'): AppError {
    return new AppError(ERROR_CODES.INTERNAL, message, 500);
  }
}
