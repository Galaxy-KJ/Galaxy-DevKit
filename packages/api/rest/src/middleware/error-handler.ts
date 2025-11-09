/**
 * @fileoverview Error handling middleware
 * @description Comprehensive error handling for REST API
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { Request, Response, NextFunction } from 'express';
import {
  AuthenticationError,
  PermissionError,
  RateLimitError,
  AuthErrorCode,
} from '../types/auth-types';

/**
 * Error response interface
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    stack?: string;
  };
}

/**
 * Error handler middleware
 * Handles all errors and returns appropriate responses
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error
  console.error('Error:', err);

  // Handle specific error types
  if (err instanceof AuthenticationError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: {},
      },
    });
    return;
  }

  if (err instanceof PermissionError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: {},
      },
    });
    return;
  }

  if (err instanceof RateLimitError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: {
          resetTime: err.resetTime?.toISOString(),
        },
      },
    });
    return;
  }

  // Handle validation errors (from Joi or similar)
  if (err.name === 'ValidationError') {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
        details: {},
      },
    });
    return;
  }

  // Handle database errors
  if (err.name === 'DatabaseError' || err.message.includes('database')) {
    res.status(500).json({
      error: {
        code: 'DATABASE_ERROR',
        message: 'Database error occurred',
        details: process.env.NODE_ENV === 'development' ? { originalError: err.message } : {},
      },
    });
    return;
  }

  // Handle default errors
  const statusCode = (err as any).statusCode || 500;
  const errorCode = (err as any).code || 'INTERNAL_SERVER_ERROR';

  res.status(statusCode).json({
    error: {
      code: errorCode,
      message: err.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? { stack: err.stack } : {},
    },
  });
}

/**
 * Not found handler middleware
 * Handles 404 errors
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      details: {},
    },
  });
}

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors
 * @param fn - Async function to wrap
 * @returns Wrapped function
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

