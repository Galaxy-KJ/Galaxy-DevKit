type LRUCacheOptions<K, V> = {
  max?: number;
  ttl?: number;
  dispose?: (value: V, key: K) => void;
  updateAgeOnGet?: boolean;
  updateAgeOnHas?: boolean;
};

type LRUCacheLike<K, V> = {
  get(key: K): V | undefined;
  set(key: K, value: V): LRUCacheLike<K, V>;
  has(key: K): boolean;
  delete(key: K): boolean;
  clear(): void;
  size: number;
};

const LRUCache = require('lru-cache') as unknown as {
  new <K, V>(options?: LRUCacheOptions<K, V>): LRUCacheLike<K, V>;
};
const RedisStore = require('rate-limit-redis') as any;

import rateLimit from 'express-rate-limit';
import { NextFunction, Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuditLogger } from '../services/audit-logger';
import { getRedisClient, isRedisHealthy } from '../lib/redis-client';
import { rateLimitStoreConfig } from '../config/rate-limit-store-config';

const auditLogger = new AuditLogger();

// Bounded, TTL'd cache for walletId -> user_id. Replaces the unbounded Map.
const walletIdToUserIdCache = new LRUCache<string, string>({
  max: rateLimitStoreConfig.walletCacheMaxEntries,
  ttl: rateLimitStoreConfig.walletCacheTtlMs,
});

export function invalidateWalletUserCache(walletId: string): void {
  walletIdToUserIdCache.delete(walletId);
}

let supabaseClient: SupabaseClient | null = null;
function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseURL = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseURL || !supabaseServiceRoleKey) {
      throw new Error(
        'Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
      );
    }
    supabaseClient = createClient(supabaseURL, supabaseServiceRoleKey);
  }
  return supabaseClient;
}

function buildStore(prefix: string) {
  const redis = getRedisClient();
  if (!redis) return undefined;
  return new RedisStore({
    sendCommand: (...args: any[]) => (redis.call as (...args: any[]) => any)(...args),
    prefix,
  });
}

// Best-effort per-process dedupe used only when Redis is unavailable and
// policy is 'open'. When Redis is available, dedupe is done via SET NX so
// it's correct across instances, not just within one process.
const localBreachFallback = new LRUCache<string, number>({
  max: rateLimitStoreConfig.walletCacheMaxEntries,
  ttl: 60 * 1000,
});

// Bounded, TTL'd cache for wallet IDs that failed to resolve to a user.
// Avoids hitting Supabase on every request for the same bad walletId.
const walletLookupMisses = new LRUCache<string, true>({
  max: rateLimitStoreConfig.walletCacheMaxEntries,
  ttl: 30 * 1000,
});

// Module-scope, not nested — must be callable from rateLimitHandler below.
async function shouldLogBreach(key: string, windowMs: number): Promise<boolean> {
  const redis = getRedisClient();
  const breachKey = `rl:breach-logged:${key}`;
  if (redis) {
    const result = await redis.set(breachKey, '1', 'PX', windowMs, 'NX');
    return result === 'OK';
  }
  if (localBreachFallback.get(breachKey)) return false;
  localBreachFallback.set(breachKey, Date.now());
  return true;
}

const rateLimitHandler = (req: Request, res: Response) => {
  const retryAfter = 60;
  const userId = (req as any)._rateLimitUserId || null;
  const limitKey = (req as any)._rateLimitKey || req.ip || 'unknown';

  // Emit exactly once per breach window per key, not once per retry.
  void shouldLogBreach(limitKey, retryAfter * 1000)
    .then((shouldLog) => {
      if (!shouldLog) return;
      return auditLogger.log({
        user_id: userId,
        action: 'rate_limit_exceeded',
        resource: req.originalUrl,
        ip_address: req.ip || null,
        success: false,
        metadata: { retryAfter, endpoint: req.originalUrl },
      });
    })
    .catch((err) => {
      console.warn('[rate-limit] breach audit logging failed:', err);
    });

  res.set('Retry-After', String(retryAfter));
  res.status(429).json({
    error: 'Too many transactions. Try again in 60 seconds.',
    retryAfter,
  });
};

function denyStoreUnavailable(_req: Request, res: Response) {
  res.status(503).json({
    error: 'Rate limiting temporarily unavailable. Please retry shortly.',
  });
}

const submitTxUserStore = buildStore('rl:submit-tx:user:');
const submitTxGlobalStore = buildStore('rl:submit-tx:global:');

let loggedUnavailableOnce = false;
function logStoreUnavailableOnce() {
  if (loggedUnavailableOnce) return;
  loggedUnavailableOnce = true;
  const msg =
    rateLimitStoreConfig.submitTxFailBehavior === 'closed'
      ? '[rate-limit] Redis unhealthy — submit-tx requests will be denied (503) until it recovers.'
      : '[rate-limit] Redis unhealthy — falling back to per-process counters. Fee-sponsor ' +
        'spend is NOT protected across instances while in this state.';
  console.error(msg);
}

/**
 * Wraps a Redis-store-backed limiter so availability is checked on every
 * request (via isRedisHealthy()), not just once at module load. A
 * mid-session Redis outage or recovery is reflected immediately, and the
 * configured submit-tx fail-open/fail-closed policy is honored at request
 * time — including runtime store errors, not just missing REDIS_URL.
 */
function withRedisHealthGuard(builtLimiter: ReturnType<typeof rateLimit>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isRedisHealthy()) {
      logStoreUnavailableOnce();
      if (rateLimitStoreConfig.submitTxFailBehavior === 'closed') {
        return denyStoreUnavailable(req, res);
      }
      // fail-open: fall through and let the limiter run against whatever
      // store is configured (may itself throw below, handled there).
    }
    return builtLimiter(req, res, (err?: unknown) => {
      if (err) {
        logStoreUnavailableOnce();
        if (rateLimitStoreConfig.submitTxFailBehavior === 'closed') {
          return denyStoreUnavailable(req, res);
        }
        return next();
      }
      return next(err);
    });
  };
}

// Shared between both branches so a change to lookup logic can't silently
// drift between a "wrapped" and "unwrapped" copy (that's how the
// passOnStoreError/generalFailBehavior mismatch happened previously).
const userSubmitTxKeyGenerator = async (req: Request): Promise<string> => {
  const walletId = req.body?.walletId;
  let key: string;

  if (!walletId || typeof walletId !== 'string') {
    key = req.ip || 'unknown';
  } else if (walletLookupMisses.has(walletId)) {
    key = `submit-tx:wallet:${walletId}`;
  } else {
    let userId = walletIdToUserIdCache.get(walletId);
    if (userId) {
      (req as any)._rateLimitUserId = userId;
      key = `submit-tx:user:${userId}`;
    } else {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('smart_wallets')
          .select('user_id')
          .eq('id', walletId)
          .single();

        if (!error && data?.user_id) {
          userId = data.user_id;
          walletIdToUserIdCache.set(walletId, userId!);
          (req as any)._rateLimitUserId = userId;
          key = `submit-tx:user:${userId}`;
        } else {
          walletLookupMisses.set(walletId, true);
          key = `submit-tx:wallet:${walletId}`;
        }
      } catch {
        key = `submit-tx:wallet:${walletId}`;
      }
    }
  }

  (req as any)._rateLimitKey = key;
  return key;
};

export const userSubmitTxLimiter = withRedisHealthGuard(
  rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    legacyHeaders: false,
    standardHeaders: true,
    passOnStoreError: rateLimitStoreConfig.submitTxFailBehavior === 'open',
    store: submitTxUserStore,
    handler: rateLimitHandler,
    keyGenerator: userSubmitTxKeyGenerator,
  })
);

export const globalSubmitTxLimiter = withRedisHealthGuard(
  rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    legacyHeaders: false,
    standardHeaders: true,
    passOnStoreError: rateLimitStoreConfig.submitTxFailBehavior === 'open',
    store: submitTxGlobalStore,
    handler: rateLimitHandler,
    keyGenerator: (req: Request): string => {
      (req as any)._rateLimitKey = 'submit-tx:global';
      return 'submit-tx:global';
    },
  })
);