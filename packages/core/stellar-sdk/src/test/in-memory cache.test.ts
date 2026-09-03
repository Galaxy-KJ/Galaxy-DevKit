import { InMemoryCache } from '../in-memory-cache.js';

describe('InMemoryCache — resize', () => {
  it('growing preserves all existing entries', async () => {
    const cache = new InMemoryCache(2);
    await cache.set('a', 1);
    await cache.set('b', 2);

    const evicted = cache.resize(10);

    expect(evicted).toBe(0);
    expect(await cache.get('a')).toBe(1);
    expect(await cache.get('b')).toBe(2);
    expect(cache.getMaxSize()).toBe(10);
  });

  it('shrinking evicts only the minimum needed, oldest first, and keeps the rest', async () => {
    const cache = new InMemoryCache(10);
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('c', 3);

    const evicted = cache.resize(2);

    expect(evicted).toBe(1);
    expect(await cache.get('a')).toBeNull(); // oldest, evicted
    expect(await cache.get('b')).toBe(2); // survives
    expect(await cache.get('c')).toBe(3); // survives
    expect(cache.getMaxSize()).toBe(2);
  });

  it('shrinking to the current size evicts nothing', async () => {
    const cache = new InMemoryCache(10);
    await cache.set('a', 1);
    await cache.set('b', 2);

    const evicted = cache.resize(2);

    expect(evicted).toBe(0);
    expect(await cache.get('a')).toBe(1);
    expect(await cache.get('b')).toBe(2);
  });

  it('rejects an invalid maxSize without mutating state', () => {
    const cache = new InMemoryCache(5);
    expect(() => cache.resize(-1)).toThrow();
    expect(() => cache.resize(NaN)).toThrow();
    expect(cache.getMaxSize()).toBe(5);
  });
});

describe('InMemoryCache — deleteByPrefix', () => {
  it('deletes only matching keys and returns the count removed', async () => {
    const cache = new InMemoryCache(10);
    await cache.set('oracle:XLM:coingecko', 1);
    await cache.set('oracle:XLM:cmc', 2);
    await cache.set('oracle:USDC:coingecko', 3);
    await cache.set('unrelated:key', 4);

    const removed = cache.deleteByPrefix('oracle:XLM:');

    expect(removed).toBe(2);
    expect(await cache.get('oracle:XLM:coingecko')).toBeNull();
    expect(await cache.get('oracle:XLM:cmc')).toBeNull();
    expect(await cache.get('oracle:USDC:coingecko')).toBe(3);
    expect(await cache.get('unrelated:key')).toBe(4);
  });

  it('returns 0 when nothing matches', async () => {
    const cache = new InMemoryCache(10);
    await cache.set('a', 1);
    expect(cache.deleteByPrefix('nope:')).toBe(0);
    expect(await cache.get('a')).toBe(1);
  });
});

describe('InMemoryCache — keys', () => {
  it('returns a snapshot of current keys without exposing values or the internal Map', async () => {
    const cache = new InMemoryCache(10);
    await cache.set('a', 1);
    await cache.set('b', 2);

    const keys = cache.keys();

    expect(keys.sort()).toEqual(['a', 'b']);
    expect(Array.isArray(keys)).toBe(true);
  });
});