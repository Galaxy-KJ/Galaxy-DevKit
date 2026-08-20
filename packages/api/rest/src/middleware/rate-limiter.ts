/**
 * @fileoverview Rate limiting middleware
 * @description Implements rate limiting per user, API key, and IP address,
 *              backed by a shared Redis store so limits are enforced across
 *              all instances rather than per-process.
 * @author Galaxy DevKit Team
 * @version 2.0.0
 * @since 2024-12-01
 */

import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { RateLimitOptions, AuthErrorCode } from '../types/auth-types';
import { authConfig } from '../config/auth-config';
import { getRedisClient } from '../lib/redis-client';
import { rateLimitStoreConfig } from '../config/rate-limit-store-config';

function getClientIP(req: Request): string {
  return req.ip || (req.socket.remoteAddress as string) || 'unknown';
}

function buildStore() {
  const redis = getRedisClient();
  if (!redis) return undefined;

  // Keep the store local to this package so it does not depend on the
  // optional rate-limit-redis package or its version-specific typings.
  return {
    async increment(key: string) {
      const redisKey = `rl:general:${key}`;
      const totalHits = Number(await redis.incr(redisKey));
      if (totalHits === 1) {
        await redis.expire(redisKey, Math.ceil(authConfig.rateLimit.windowMs / 1000));
      }
      const ttl = Number(await redis.ttl(redisKey));
      return {
        totalHits,
        resetTime: new Date(Date.now() + Math.max(ttl, 0) * 1000),
      };
    },
    async decrement(key: string) {
      await redis.decr(`rl:general:${key}`);
    },
    async resetKey(key: string) {
      await redis.del(`rl:general:${key}`);
    },
  } as any;
}

/**
 * Create a rate limiter with custom options, backed by the shared Redis
 * store. If Redis is unavailable, behavior is governed by
 * rateLimitStoreConfig.generalFailBehavior — never a silent in-memory
 * fallback.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const store = buildStore();

  if (!store) {
    if (rateLimitStoreConfig.generalFailBehavior === 'closed') {
      console.error(
        '[rate-limiter] Redis unavailable and RATE_LIMIT_FAIL_BEHAVIOR_GENERAL=closed — ' +
        'denying all requests until the store recovers.'
      );
      return (req: Request, res: Response) => {
        res.status(503).json({
          error: {
            code: AuthErrorCode.RATE_LIMIT_EXCEEDED,
            message: 'Rate limiting store unavailable; requests are temporarily blocked.',
            details: {},
          },
        });
      };
    }
    console.warn(
      '[rate-limiter] REDIS_URL not configured or Redis unreachable — falling back to ' +
      'per-process MemoryStore (RATE_LIMIT_FAIL_BEHAVIOR_GENERAL=open). Limits will NOT ' +
      'be shared across instances. This should only happen in local development.'
    );
  }

  return rateLimit({
    windowMs: options.windowMs,
    max: options.maxRequests,
    message: options.message || 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    skipFailedRequests: options.skipFailedRequests || false,
    store, // undefined only when explicitly failing open (see above)
    keyGenerator: (options.keyGenerator as any) || ((req: Request): string => getClientIP(req)),
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

export function userRateLimiter() {
  const keyGen = (req: Request): string => {
    if (req.user?.userId) return `user:${req.user.userId}`;
    return getClientIP(req);
  };

  return createRateLimiter({
    windowMs: authConfig.rateLimit.windowMs,
    maxRequests: authConfig.rateLimit.maxRequests,
    message: 'Too many requests from this user, please try again later.',
    keyGenerator: keyGen as any,
  });
}

// NOTE: this cache holds per-API-key *limiter instances*, one per
// (apiKeyId, quota) pair. It's unrelated to the wallet->user identity
// cache in rate-limit.ts (that one caches DB lookup results, not
// middleware). Bounded eviction here was already correct; unchanged.
const MAX_CACHE_SIZE = 1000;
const apiKeyRateLimiterCache = new Map<string, ReturnType<typeof createRateLimiter>>();

export function apiKeyRateLimiter() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.apiKey && req.authMethod === 'api_key') {
        const windowMs = authConfig.rateLimit.windowMs;
        const maxRequests = req.apiKey.rateLimit ?? authConfig.rateLimit.apiKeyMaxRequests;
        const cacheKey = `${req.apiKey.id}:${maxRequests}`;

        let rateLimiter = apiKeyRateLimiterCache.get(cacheKey);
        if (!rateLimiter) {
          rateLimiter = createRateLimiter({
            windowMs,
            maxRequests,
            message: 'API key rate limit exceeded, please try again later.',
            keyGenerator: (req: Express.Request) => {
              const r = req as Request;
              return `api_key:${r.apiKey!.id}`;
            },
          });

          if (apiKeyRateLimiterCache.size >= MAX_CACHE_SIZE) {
            const firstKey = apiKeyRateLimiterCache.keys().next().value;
            if (firstKey !== undefined) apiKeyRateLimiterCache.delete(firstKey);
          }

          apiKeyRateLimiterCache.set(cacheKey, rateLimiter);
        }

        rateLimiter(req, res, next);
        return;
      }
      next();
    } catch (error) {
      console.error('API key rate limiter error:', error);
      next();
    }
  };
}

export function ipRateLimiter() {
  const keyGen = (req: Request): string => getClientIP(req);
  return createRateLimiter({
    windowMs: authConfig.rateLimit.windowMs,
    maxRequests: authConfig.rateLimit.ipMaxRequests,
    message: 'Too many requests from this IP, please try again later.',
    keyGenerator: keyGen as any,
  });
}

export function endpointRateLimiter(endpoint: string, limit: number) {
  const keyGen = (req: Request): string => {
    if (req.user?.userId) return `endpoint:${endpoint}:user:${req.user.userId}`;
    if (req.apiKey) return `endpoint:${endpoint}:api_key:${req.apiKey.id}`;
    return `endpoint:${endpoint}:ip:${getClientIP(req)}`;
  };

  return createRateLimiter({
    windowMs: authConfig.rateLimit.windowMs,
    maxRequests: limit,
    message: `Rate limit exceeded for ${endpoint}, please try again later.`,
    keyGenerator: keyGen as any,
  });
}

export function rateLimiterMiddleware() {
  const ipLimiter = ipRateLimiter();
  const userLimiter = userRateLimiter();
  const apiKeyLimiter = apiKeyRateLimiter();

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (req.user && req.authMethod === 'jwt') {
        userLimiter(req, res, next);
        return;
      }
      if (req.apiKey && req.authMethod === 'api_key') {
        apiKeyLimiter(req, res, next);
        return;
      }
      ipLimiter(req, res, next);
    } catch (error) {
      console.error('Rate limiter middleware error:', error);
      next();
    }
  };
}

export function strictRateLimiter() {
  const keyGen = (req: Request): string => {
    if (req.user?.userId) return `strict:user:${req.user.userId}`;
    if (req.apiKey) return `strict:api_key:${req.apiKey.id}`;
    return `strict:ip:${getClientIP(req)}`;
  };

  return createRateLimiter({
    windowMs: authConfig.rateLimit.windowMs,
    maxRequests: Math.min(authConfig.rateLimit.maxRequests, authConfig.rateLimit.ipMaxRequests),
    message: 'Rate limit exceeded, please try again later.',
    keyGenerator: keyGen as any,
  });
}