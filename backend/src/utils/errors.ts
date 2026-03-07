import { Request, Response, NextFunction } from 'express';
import logger from '@/utils/logger';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public errorCode?: string;

  constructor(message: string, statusCode: number, errorCode?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errorCode = errorCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public errors: any[];

  constructor(message: string, errors: any[] = []) {
    super(message, 422, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class BusinessLogicError extends AppError {
  constructor(message: string, errorCode?: string) {
    super(message, 400, errorCode || 'BUSINESS_LOGIC_ERROR');
  }
}

// RFC 7807 Problem Details format
interface ProblemDetail {
  success: false;
  error: {
    type: string;
    title: string;
    status: number;
    detail: string;
    errors?: any[];
  };
}

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof AppError) {
    const problemDetail: ProblemDetail = {
      success: false,
      error: {
        type: `https://errors.platform.sa/${err.errorCode?.toLowerCase().replace(/_/g, '-') || 'error'}`,
        title: err.message,
        status: err.statusCode,
        detail: err.message,
      },
    };

    if (err instanceof ValidationError && err.errors.length > 0) {
      problemDetail.error.errors = err.errors;
    }

    return res.status(err.statusCode).json(problemDetail);
  }

  // Unhandled errors — use structured logger, never console
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  const problemDetail: ProblemDetail = {
    success: false,
    error: {
      type: 'https://errors.platform.sa/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : err.message,
    },
  };

  return res.status(500).json(problemDetail);
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
