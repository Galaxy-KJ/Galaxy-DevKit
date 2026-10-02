import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { LRUCache } from 'lru-cache';
import { NextFunction, Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuditLogger } from '../services/audit-logger';
import { getRedisClient, isRedisHealthy } from '../lib/redis-client';
import { rateLimitStoreConfig } from '../config/rate-limit-store-config';

const auditLogger = new AuditLogger();

// ---------------------------------------------------------------------------
// Bounded caches (module scope — never nested inside a handler)
// ---------------------------------------------------------------------------

const walletIdToUserIdCache = new LRUCache<string, string>({
  max: rateLimitStoreConfig.walletCacheMaxEntries,
  ttl: rateLimitStoreConfig.walletCacheTtlMs,
});

export function invalidateWalletUserCache(walletId: string): void {
  walletIdToUserIdCache.delete(walletId);
}

const walletLookupMisses = new LRUCache<string, true>({
  max: rateLimitStoreConfig.walletCacheMaxEntries,
  ttl: 30 * 1000,
});

// Bounded fallback for breach-dedupe when Redis is unavailable.
// TTL matches the breach window (60s) — NOT an arbitrary 5 minutes.
const localBreachFallback = new LRUCache<string, number>({
  max: rateLimitStoreConfig.walletCacheMaxEntries,
  ttl: 60 * 1000,
});

// ---------------------------------------------------------------------------
// Supabase client (singleton)
// ---------------------------------------------------------------------------

let supabaseClient: SupabaseClient | null = null;
function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

// ---------------------------------------------------------------------------
// Redis-backed store builder
// ---------------------------------------------------------------------------

function buildStore(prefix: string) {
  const redis = getRedisClient();
  if (!redis) return undefined;
  return new RedisStore({
    sendCommand: (...args: string[]) => (redis as any).call(...args),
    prefix,
  });
}

const submitTxUserStore = buildStore('rl:submit-tx:user:');
const submitTxGlobalStore = buildStore('rl:submit-tx:global:');

// ---------------------------------------------------------------------------
// Breach-audit dedupe (exactly once per breach window, not once per retry)
// ---------------------------------------------------------------------------

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
  res.status(429).json({ error: 'Too many transactions. Try again in 60 seconds.', retryAfter });
};

function denyStoreUnavailable(_req: Request, res: Response) {
  res.status(503).json({ error: 'Rate limiting temporarily unavailable. Please retry shortly.' });
}

let loggedUnavailableOnce = false;
function logStoreUnavailableOnce() {
  if (loggedUnavailableOnce) return;
  loggedUnavailableOnce = true;
  console.error(
    `[rate-limit] Redis store unavailable for submit-tx. Configured behavior: ` +
      `${rateLimitStoreConfig.submitTxFailBehavior === 'closed' ? 'fail-closed (503)' : 'fail-open (in-memory fallback)'}.`
  );
}

function withRedisHealthGuard(builtLimiter: ReturnType<typeof rateLimit>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isRedisHealthy()) {
      logStoreUnavailableOnce();
      if (rateLimitStoreConfig.submitTxFailBehavior === 'closed') {
        return denyStoreUnavailable(req, res);
      }
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

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Limiters
// ---------------------------------------------------------------------------

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