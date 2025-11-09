/**
 * @fileoverview Rate limiting middleware
 * @description Implements rate limiting per user, API key, and IP address
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { RateLimitOptions, AuthErrorCode } from '../types/auth-types';
import { authConfig } from '../config/auth-config';

/**
 * Create a rate limiter with custom options
 * @param options - Rate limit options
 * @returns Express rate limit middleware
 */
export function createRateLimiter(options: RateLimitOptions) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.maxRequests,
    message: options.message || 'Too many requests, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    skipFailedRequests: options.skipFailedRequests || false,
    keyGenerator: (options.keyGenerator as any) || ((req: Request): string => {
      // Default: use IP address
      return (req.ip || (req.socket.remoteAddress as string) || 'unknown');
    }),
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        error: {
          code: AuthErrorCode.RATE_LIMIT_EXCEEDED,
          message: options.message || 'Too many requests, please try again later.',
          details: {
            retryAfter: Math.ceil(options.windowMs / 1000),
          },
        },
      });
    },
  });
}

/**
 * User-based rate limiter
 * Limits requests per authenticated user
 * @returns Express middleware
 */
export function userRateLimiter() {
  const keyGen = (req: Request): string => {
    if (req.user?.userId) {
      return `user:${req.user.userId}`;
    }
    // Fallback to IP if user not authenticated
    return (req.ip || (req.socket.remoteAddress as string) || 'unknown');
  };
  
  return createRateLimiter({
    windowMs: authConfig.rateLimit.windowMs,
    maxRequests: authConfig.rateLimit.maxRequests,
    message: 'Too many requests from this user, please try again later.',
    keyGenerator: keyGen as any,
  });
}

/**
 * API key-based rate limiter
 * Limits requests per API key (uses API key's custom rate limit if set)
 * @returns Express middleware
 */
export function apiKeyRateLimiter() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // If API key is present, use its custom rate limit
      if (req.apiKey && req.authMethod === 'api_key') {
        const rateLimiter = createRateLimiter({
          windowMs: authConfig.rateLimit.windowMs,
          maxRequests: req.apiKey.rateLimit || authConfig.rateLimit.apiKeyMaxRequests,
          message: 'API key rate limit exceeded, please try again later.',
          keyGenerator: () => `api_key:${req.apiKey!.id}`,
        });

        rateLimiter(req, res, next);
        return;
      }

      // If no API key, continue without rate limiting (will be handled by user or IP limiter)
      next();
    } catch (error) {
      console.error('API key rate limiter error:', error);
      next();
    }
  };
}

/**
 * IP-based rate limiter
 * Limits requests per IP address (for unauthenticated requests)
 * @returns Express middleware
 */
export function ipRateLimiter() {
  const keyGen = (req: Request): string => {
    return (req.ip || (req.socket.remoteAddress as string) || 'unknown');
  };
  
  return createRateLimiter({
    windowMs: authConfig.rateLimit.windowMs,
    maxRequests: authConfig.rateLimit.ipMaxRequests,
    message: 'Too many requests from this IP, please try again later.',
    keyGenerator: keyGen as any,
  });
}

/**
 * Endpoint-specific rate limiter
 * Creates a rate limiter for a specific endpoint
 * @param endpoint - Endpoint path (for identification)
 * @param limit - Maximum requests per window
 * @returns Express middleware
 */
export function endpointRateLimiter(endpoint: string, limit: number) {
  const keyGen = (req: Request): string => {
    if (req.user?.userId) {
      return `endpoint:${endpoint}:user:${req.user.userId}`;
    }
    if (req.apiKey) {
      return `endpoint:${endpoint}:api_key:${req.apiKey.id}`;
    }
    return `endpoint:${endpoint}:ip:${req.ip || (req.socket.remoteAddress as string) || 'unknown'}`;
  };
  
  return createRateLimiter({
    windowMs: authConfig.rateLimit.windowMs,
    maxRequests: limit,
    message: `Rate limit exceeded for ${endpoint}, please try again later.`,
    keyGenerator: keyGen as any,
  });
}

/**
 * General rate limiter middleware
 * Applies rate limiting based on authentication method
 * @returns Express middleware
 */
export function rateLimiterMiddleware() {
  // Create separate limiters for different scenarios
  const ipLimiter = ipRateLimiter();
  const userLimiter = userRateLimiter();

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // If user is authenticated, use user-based rate limiting
      if (req.user && req.authMethod === 'jwt') {
        userLimiter(req, res, next);
        return;
      }

      // If API key is present, use API key rate limiting
      if (req.apiKey && req.authMethod === 'api_key') {
        // Apply API key rate limiting
        const apiKeyLimiter = createRateLimiter({
          windowMs: authConfig.rateLimit.windowMs,
          maxRequests: req.apiKey.rateLimit || authConfig.rateLimit.apiKeyMaxRequests,
          message: 'API key rate limit exceeded, please try again later.',
          keyGenerator: () => `api_key:${req.apiKey!.id}`,
        });
        apiKeyLimiter(req, res, next);
        return;
      }

      // Otherwise, use IP-based rate limiting
      ipLimiter(req, res, next);
    } catch (error) {
      console.error('Rate limiter middleware error:', error);
      next();
    }
  };
}

/**
 * Strict rate limiter
 * Applies the strictest rate limiting (lowest limit)
 * @returns Express middleware
 */
export function strictRateLimiter() {
  const keyGen = (req: Request): string => {
    if (req.user?.userId) {
      return `strict:user:${req.user.userId}`;
    }
    if (req.apiKey) {
      return `strict:api_key:${req.apiKey.id}`;
    }
    return `strict:ip:${req.ip || (req.socket.remoteAddress as string) || 'unknown'}`;
  };
  
  return createRateLimiter({
    windowMs: authConfig.rateLimit.windowMs,
    maxRequests: Math.min(
      authConfig.rateLimit.maxRequests,
      authConfig.rateLimit.ipMaxRequests
    ),
    message: 'Rate limit exceeded, please try again later.',
    keyGenerator: keyGen as any,
  });
}

