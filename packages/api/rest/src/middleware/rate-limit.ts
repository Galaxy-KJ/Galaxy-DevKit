/**
 * @fileoverview Rate limiting for the fee-sponsored submit-tx endpoint.
 * @description Backed by a shared Redis store (fail-closed by default —
 *              see rate-limit-store-config.ts). The wallet->user cache is
 *              now a bounded, TTL'd LRU instead of an unbounded Map, and
 *              breach audit logs are deduped per key per window.
 * @author Galaxy DevKit Team
 * @version 2.0.0
 */

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { LRUCache } from 'lru-cache';
import { Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuditLogger } from '../services/audit-logger';
import { getRedisClient } from '../lib/redis-client';
import { rateLimitStoreConfig } from '../config/rate-limit-store-config';

const auditLogger = new AuditLogger();

// Bounded, TTL'd cache for walletId -> user_id. Replaces the unbounded Map.
// Entries also expire on their own via TTL, so a wallet ownership change is
// reflected within walletCacheTtlMs even without an explicit invalidation.
const walletIdToUserIdCache = new LRUCache<string, string>({
  max: rateLimitStoreConfig.walletCacheMaxEntries,
  ttl: rateLimitStoreConfig.walletCacheTtlMs,
});

/**
 * Call this from wherever wallet ownership transfer is handled so the
 * cache doesn't serve a stale user_id until the TTL expires.
 */
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
    sendCommand: (...args: string[]) => redis.call(...args) as any,
    prefix,
  });
}

// Best-effort per-process dedupe used only when Redis is unavailable and
// policy is 'open'. When Redis is available, dedupe is done via SET NX so
// it's correct across instances, not just within one process.
const localBreachFallback = new LRUCache<string, number>({
  max: rateLimitStoreConfig.walletCacheMaxEntries,
  ttl: 5 * 60 * 1000,
});

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
const storeUnavailable = !submitTxUserStore;

if (storeUnavailable) {
  const msg =
    rateLimitStoreConfig.submitTxFailBehavior === 'closed'
      ? '[rate-limit] Redis unavailable, RATE_LIMIT_FAIL_BEHAVIOR_SUBMIT_TX=closed — ' +
        'submit-tx requests will be denied until the store recovers.'
      : '[rate-limit] Redis unavailable, RATE_LIMIT_FAIL_BEHAVIOR_SUBMIT_TX=open — ' +
        'falling back to per-process MemoryStore. Fee-sponsor spend is NOT protected ' +
        'across instances while in this state.';
  console.error(msg);
}

export const userSubmitTxLimiter =
  storeUnavailable && rateLimitStoreConfig.submitTxFailBehavior === 'closed'
    ? denyStoreUnavailable
    : rateLimit({
        windowMs: 1 * 60 * 1000,
        max: 10,
        legacyHeaders: false,
        standardHeaders: true,
        store: submitTxUserStore,
        handler: rateLimitHandler,
        keyGenerator: async (req: Request): Promise<string> => {
          const walletId = req.body?.walletId;
          let key: string;

          if (!walletId || typeof walletId !== 'string') {
            key = req.ip || 'unknown';
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
                  key = `submit-tx:wallet:${walletId}`;
                }
              } catch {
                key = `submit-tx:wallet:${walletId}`;
              }
            }
          }

          (req as any)._rateLimitKey = key;
          return key;
        },
      });

export const globalSubmitTxLimiter =
  storeUnavailable && rateLimitStoreConfig.submitTxFailBehavior === 'closed'
    ? denyStoreUnavailable
    : rateLimit({
        windowMs: 1 * 60 * 1000,
        max: 100,
        legacyHeaders: false,
        standardHeaders: true,
        store: submitTxGlobalStore,
        handler: rateLimitHandler,
        keyGenerator: (): string => 'submit-tx:global',
      });