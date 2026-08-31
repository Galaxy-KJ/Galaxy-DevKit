import { CacheManager, DEFAULT_CHANNEL_CONFIGS } from '../cache-manager.js';

describe('CacheManager — configure', () => {
  it('resizes a channel in place without dropping existing entries', async () => {
    const manager = new CacheManager({ 'oracle-price': { maxSize: 10 } });
    await manager.set('oracle-price', 'oracle:XLM', { price: 1 });
    await manager.set('oracle-price', 'oracle:USDC', { price: 2 });

    manager.configure('oracle-price', { maxSize: 50 });

    expect(await manager.get('oracle-price', 'oracle:XLM')).toEqual({ price: 1 });
    expect(await manager.get('oracle-price', 'oracle:USDC')).toEqual({ price: 2 });
    expect(manager.getConfig('oracle-price').maxSize).toBe(50);
  });

  it('is safe to call repeatedly — later config wins, no data loss for entries that still fit', async () => {
    const manager = new CacheManager({ 'oracle-price': { maxSize: 10 } });
    await manager.set('oracle-price', 'oracle:XLM', { price: 1 });

    manager.configure('oracle-price', { maxSize: 20 });
    manager.configure('oracle-price', { ttlMs: 5000 });
    manager.configure('oracle-price', { maxSize: 30 });

    expect(await manager.get('oracle-price', 'oracle:XLM')).toEqual({ price: 1 });
    expect(manager.getConfig('oracle-price')).toMatchObject({ maxSize: 30, ttlMs: 5000 });
  });

  it('only evicts the minimum needed when shrinking below the current entry count', async () => {
    const manager = new CacheManager({ 'oracle-price': { maxSize: 10 } });
    await manager.set('oracle-price', 'a', 1);
    await manager.set('oracle-price', 'b', 2);
    await manager.set('oracle-price', 'c', 3);

    manager.configure('oracle-price', { maxSize: 2 });

    expect(await manager.get('oracle-price', 'a')).toBeNull(); // oldest, evicted
    expect(await manager.get('oracle-price', 'b')).toBe(2);
    expect(await manager.get('oracle-price', 'c')).toBe(3);
  });

  it('throws for an unknown cache type instead of silently no-oping', () => {
    const manager = new CacheManager();
    expect(() => manager.configure('not-a-real-type' as any, { maxSize: 5 })).toThrow();
  });
});

describe('CacheManager — deleteByPrefix', () => {
  it('deletes only matching keys in the given channel', async () => {
    const manager = new CacheManager();
    await manager.set('oracle-price', 'oracle:XLM:coingecko', 1);
    await manager.set('oracle-price', 'oracle:XLM:cmc', 2);
    await manager.set('oracle-price', 'oracle:USDC:coingecko', 3);

    const removed = manager.deleteByPrefix('oracle-price', 'oracle:XLM:');

    expect(removed).toBe(2);
    expect(await manager.get('oracle-price', 'oracle:XLM:coingecko')).toBeNull();
    expect(await manager.get('oracle-price', 'oracle:USDC:coingecko')).toBe(3);
  });
});

describe('CacheManager — invalidate (refactored off private-field access)', () => {
  it('still supports wildcard invalidation', async () => {
    const manager = new CacheManager();
    await manager.set('account-balance', 'balance:GABC:XLM', 1);
    await manager.set('account-balance', 'balance:GABC:USDC', 2);
    await manager.set('account-balance', 'balance:GXYZ:XLM', 3);

    await manager.invalidate('account-balance', 'balance:GABC:*');

    expect(await manager.get('account-balance', 'balance:GABC:XLM')).toBeNull();
    expect(await manager.get('account-balance', 'balance:GABC:USDC')).toBeNull();
    expect(await manager.get('account-balance', 'balance:GXYZ:XLM')).toBe(3);
  });

  it('still supports exact-key invalidation', async () => {
    const manager = new CacheManager();
    await manager.set('static-data', 'contract:blend-pool', 'addr');

    await manager.invalidate('static-data', 'contract:blend-pool');

    expect(await manager.get('static-data', 'contract:blend-pool')).toBeNull();
  });
});

describe('CacheManager — event-driven invalidation still works after the refactor', () => {
  it('newPriceFeed clears the price and aggregated entries for that symbol', async () => {
    const manager = new CacheManager();
    await manager.set('oracle-price', 'XLM', 1);
    await manager.set('oracle-price', 'aggregated:XLM', 2);

    manager.events.emit('newPriceFeed', 'XLM');
    // invalidate() is async and fired via `void`; give the microtask a tick.
    await Promise.resolve();
    await Promise.resolve();

    expect(await manager.get('oracle-price', 'XLM')).toBeNull();
    expect(await manager.get('oracle-price', 'aggregated:XLM')).toBeNull();
  });
});

describe('DEFAULT_CHANNEL_CONFIGS sanity', () => {
  it('oracle-price defaults are unchanged by this refactor', () => {
    expect(DEFAULT_CHANNEL_CONFIGS['oracle-price']).toEqual({
      ttlMs: 15000,
      staleWhileRevalidate: true,
      swrTtlMs: 30000,
      maxSize: 1000,
    });
  });
});