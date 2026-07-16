/**
 * @fileoverview Unit tests for the Galaxy DevKit caching layer
 * @description Verifies InMemoryCache and CacheManager: TTL expiry, LRU eviction,
 *              request deduplication (stampede prevention), stale-while-revalidate,
 *              event-based invalidation, and hit/miss metrics.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-07-15
 */

import { InMemoryCache } from '../cache/in-memory-cache.js';
import { CacheManager, DEFAULT_CHANNEL_CONFIGS } from '../cache/cache-manager.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── InMemoryCache ──────────────────────────────────────────────────────────

describe('InMemoryCache', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache(10);
  });

  describe('basic get / set', () => {
    it('returns null for missing keys', async () => {
      expect(await cache.get('missing')).toBeNull();
    });

    it('stores and retrieves a value', async () => {
      await cache.set('key1', { foo: 'bar' });
      const result = await cache.get<{ foo: string }>('key1');
      expect(result).toEqual({ foo: 'bar' });
    });

    it('overwrites an existing key', async () => {
      await cache.set('key1', 'first');
      await cache.set('key1', 'second');
      expect(await cache.get<string>('key1')).toBe('second');
    });
  });

  describe('TTL expiry', () => {
    it('returns null after TTL expires', async () => {
      await cache.set('key1', 'value', { ttlMs: 50 });
      await sleep(60);
      expect(await cache.get<string>('key1')).toBeNull();
    });

    it('returns value before TTL expires', async () => {
      await cache.set('key1', 'value', { ttlMs: 500 });
      await sleep(50);
      expect(await cache.get<string>('key1')).toBe('value');
    });
  });

  describe('delete', () => {
    it('removes a cached entry', async () => {
      await cache.set('key1', 'value');
      await cache.delete('key1');
      expect(await cache.get<string>('key1')).toBeNull();
    });

    it('is a no-op for missing keys', async () => {
      await expect(cache.delete('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('clear', () => {
    it('removes all entries and resets stats', async () => {
      await cache.set('a', 1);
      await cache.set('b', 2);
      await cache.get<number>('a');
      await cache.clear();
      expect(await cache.get<number>('a')).toBeNull();
      const stats = await cache.getStats();
      expect(stats.keys).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1); // the get after clear
    });
  });

  describe('LRU eviction', () => {
    it('evicts the oldest entry when maxSize is exceeded', async () => {
      const small = new InMemoryCache(3);
      await small.set('a', 1);
      await small.set('b', 2);
      await small.set('c', 3);
      await small.set('d', 4); // triggers eviction of 'a'
      expect(await small.get<number>('a')).toBeNull();
      expect(await small.get<number>('d')).toBe(4);
    });

    it('refreshes LRU position on read', async () => {
      const small = new InMemoryCache(3);
      await small.set('a', 1);
      await small.set('b', 2);
      await small.set('c', 3);
      await small.get<number>('a'); // 'a' is now most-recently used
      await small.set('d', 4);     // should evict 'b', not 'a'
      expect(await small.get<number>('a')).toBe(1);
      expect(await small.get<number>('b')).toBeNull();
    });
  });

  describe('hit / miss metrics', () => {
    it('counts hits and misses correctly', async () => {
      await cache.set('x', 'val');
      await cache.get<string>('x');   // hit
      await cache.get<string>('x');   // hit
      await cache.get<string>('y');   // miss

      const stats = await cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.keys).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('reports 0 hitRate with no requests', async () => {
      const stats = await cache.getStats();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('request deduplication (stampede prevention)', () => {
    it('coalesces concurrent fetches for the same key into one call', async () => {
      let callCount = 0;
      const fetchFn = async () => {
        callCount++;
        await sleep(50);
        return 'fetched';
      };

      const [r1, r2, r3] = await Promise.all([
        cache.getOrFetch('shared', fetchFn, { ttlMs: 5000 }),
        cache.getOrFetch('shared', fetchFn, { ttlMs: 5000 }),
        cache.getOrFetch('shared', fetchFn, { ttlMs: 5000 }),
      ]);

      expect(callCount).toBe(1);
      expect(r1).toBe('fetched');
      expect(r2).toBe('fetched');
      expect(r3).toBe('fetched');
    });

    it('serves subsequent calls from cache without fetching again', async () => {
      let callCount = 0;
      const fetchFn = async () => { callCount++; return 'result'; };

      await cache.getOrFetch('key', fetchFn, { ttlMs: 5000 });
      await cache.getOrFetch('key', fetchFn, { ttlMs: 5000 });

      expect(callCount).toBe(1);
    });
  });

  describe('stale-while-revalidate (SWR)', () => {
    it('returns stale value while background refresh happens', async () => {
      let fetchCount = 0;
      const fetchFn = async () => { fetchCount++; await sleep(50); return `v${fetchCount}`; };

      // Prime the cache with a short TTL
      const first = await cache.getOrFetch('swr', fetchFn, { ttlMs: 30, staleWhileRevalidate: true, swrTtlMs: 2000 });
      expect(first).toBe('v1');

      // Wait for TTL to expire but stay within SWR window
      await sleep(40);

      // Should return stale immediately (v1) and kick off background refresh
      const stale = await cache.getOrFetch('swr', fetchFn, { ttlMs: 30, staleWhileRevalidate: true, swrTtlMs: 2000 });
      expect(stale).toBe('v1');

      // Allow background refresh to complete
      await sleep(100);

      // Now the fresh value should be in cache
      const fresh = await cache.getOrFetch('swr', fetchFn, { ttlMs: 30, staleWhileRevalidate: true, swrTtlMs: 2000 });
      expect(fresh).toBe('v2');
    });
  });

  describe('synchronous helpers', () => {
    it('getSync / setSync work correctly', () => {
      cache.setSync('syncKey', 'syncVal', { ttlMs: 5000 });
      expect(cache.getSync<string>('syncKey')).toBe('syncVal');
    });

    it('deleteSync removes a key', () => {
      cache.setSync('key', 'val');
      cache.deleteSync('key');
      expect(cache.getSync<string>('key')).toBeNull();
    });

    it('getSync returns null for expired entries', async () => {
      cache.setSync('exp', 'val', { ttlMs: 30 });
      await sleep(40);
      expect(cache.getSync<string>('exp')).toBeNull();
    });
  });
});

// ─── CacheManager ───────────────────────────────────────────────────────────

describe('CacheManager', () => {
  let manager: CacheManager;

  beforeEach(() => {
    manager = new CacheManager();
  });

  describe('getOrFetch', () => {
    it('fetches and caches a value', async () => {
      let calls = 0;
      const result = await manager.getOrFetch('horizon-response', 'acct:GTEST', async () => {
        calls++;
        return { accountId: 'GTEST' };
      });
      expect(result).toEqual({ accountId: 'GTEST' });
      expect(calls).toBe(1);
    });

    it('serves from cache on second call', async () => {
      let calls = 0;
      const fn = async () => { calls++; return 'data'; };
      await manager.getOrFetch('static-data', 'contract:pool', fn);
      await manager.getOrFetch('static-data', 'contract:pool', fn);
      expect(calls).toBe(1);
    });
  });

  describe('channel isolation', () => {
    it('uses different caches per channel type', async () => {
      await manager.set('oracle-price', 'XLM', { price: 0.12 });
      await manager.set('account-balance', 'XLM', { balance: '1000' });

      const oracleVal = await manager.get<{ price: number }>('oracle-price', 'XLM');
      const balanceVal = await manager.get<{ balance: string }>('account-balance', 'XLM');

      expect(oracleVal?.price).toBe(0.12);
      expect(balanceVal?.balance).toBe('1000');
    });
  });

  describe('invalidation', () => {
    it('deletes a specific key', async () => {
      await manager.set('horizon-response', 'tx:abc123', { hash: 'abc' });
      await manager.invalidate('horizon-response', 'tx:abc123');
      expect(await manager.get('horizon-response', 'tx:abc123')).toBeNull();
    });

    it('deletes all keys matching a prefix wildcard', async () => {
      await manager.set('account-balance', 'balance:GUSER:XLM', 100);
      await manager.set('account-balance', 'balance:GUSER:USDC', 200);
      await manager.set('account-balance', 'balance:GOTHER:XLM', 999);

      await manager.invalidate('account-balance', 'balance:GUSER:*');

      expect(await manager.get('account-balance', 'balance:GUSER:XLM')).toBeNull();
      expect(await manager.get('account-balance', 'balance:GUSER:USDC')).toBeNull();
      expect(await manager.get<number>('account-balance', 'balance:GOTHER:XLM')).toBe(999);
    });
  });

  describe('clear', () => {
    it('clears all channels', async () => {
      await manager.set('oracle-price', 'XLM', 0.12);
      await manager.set('horizon-response', 'account-info:GTEST', {});
      await manager.clear();
      expect(await manager.get('oracle-price', 'XLM')).toBeNull();
      expect(await manager.get('horizon-response', 'account-info:GTEST')).toBeNull();
    });
  });

  describe('getStats', () => {
    it('returns aggregated stats across all channels', async () => {
      await manager.getOrFetch('oracle-price', 'XLM', async () => 0.12);
      await manager.get('oracle-price', 'XLM'); // hit
      await manager.get('oracle-price', 'MISSING'); // miss

      const stats = await manager.getStats();
      expect(stats.total.hits).toBeGreaterThanOrEqual(1);
      expect(stats.total.misses).toBeGreaterThanOrEqual(1);
      expect(stats.total.hitRate).toBeGreaterThan(0);
      expect(stats['oracle-price']).toBeDefined();
    });
  });

  describe('DEFAULT_CHANNEL_CONFIGS', () => {
    it('has short TTL for oracle prices', () => {
      expect(DEFAULT_CHANNEL_CONFIGS['oracle-price'].ttlMs).toBeLessThanOrEqual(30000);
    });

    it('has long TTL for static-data', () => {
      expect(DEFAULT_CHANNEL_CONFIGS['static-data'].ttlMs).toBeGreaterThanOrEqual(3600000);
    });

    it('enables SWR for account-balance', () => {
      expect(DEFAULT_CHANNEL_CONFIGS['account-balance'].staleWhileRevalidate).toBe(true);
    });
  });

  describe('event-based invalidation', () => {
    it('invalidates oracle-price keys on newPriceFeed event', async () => {
      await manager.set('oracle-price', 'XLM', { price: 0.12 });
      await manager.set('oracle-price', 'aggregated:XLM', { price: 0.12 });

      manager.events.emit('newPriceFeed', 'XLM');
      await sleep(20); // allow microtask queue to flush

      expect(await manager.get('oracle-price', 'XLM')).toBeNull();
      expect(await manager.get('oracle-price', 'aggregated:XLM')).toBeNull();
    });

    it('invalidates account caches on transaction event', async () => {
      await manager.set('account-balance', 'balance:GTEST:XLM', '1000');
      await manager.set('horizon-response', 'account-info:GTEST', {});
      await manager.set('horizon-response', 'tx-history:GTEST', []);

      manager.events.emit('transaction', 'GTEST');
      await sleep(20);

      expect(await manager.get('account-balance', 'balance:GTEST:XLM')).toBeNull();
      expect(await manager.get('horizon-response', 'account-info:GTEST')).toBeNull();
    });
  });
});
