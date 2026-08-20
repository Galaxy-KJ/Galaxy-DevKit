/**
 * @fileoverview Configuration for the shared rate-limit store and the
 *               wallet->user identity cache used by submit-tx limiting.
 * @author Galaxy DevKit Team
 */

export interface RateLimitStoreConfig {
  redisUrl: string | undefined;
  /** Behavior for general API rate limiting (rate-limiter.ts) when Redis is unreachable. */
  generalFailBehavior: 'open' | 'closed';
  /**
   * Behavior for submit-tx rate limiting (rate-limit.ts) when Redis is unreachable.
   * Defaults to 'closed': this endpoint pays real Stellar network fees from a
   * sponsor account, so silently degrading to per-process counters under a
   * Redis outage would let each instance issue its own free quota.
   */
  submitTxFailBehavior: 'open' | 'closed';
  walletCacheMaxEntries: number;
  walletCacheTtlMs: number;
}

function readFailBehavior(name: string, fallback: 'open' | 'closed'): 'open' | 'closed' {
  const raw = process.env[name];
  return raw === 'open' || raw === 'closed' ? raw : fallback;
}

export const rateLimitStoreConfig: RateLimitStoreConfig = {
  redisUrl: process.env.REDIS_URL,
  generalFailBehavior: readFailBehavior('RATE_LIMIT_FAIL_BEHAVIOR_GENERAL', 'open'),
  submitTxFailBehavior: readFailBehavior('RATE_LIMIT_FAIL_BEHAVIOR_SUBMIT_TX', 'closed'),
  walletCacheMaxEntries: parseInt(process.env.WALLET_USER_CACHE_MAX_ENTRIES || '5000', 10),
  walletCacheTtlMs: parseInt(process.env.WALLET_USER_CACHE_TTL_MS || String(5 * 60 * 1000), 10),
};