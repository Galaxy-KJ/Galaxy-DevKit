import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globalCache, DEFAULT_CHANNEL_CONFIGS } from '@galaxy-kj/core-stellar-sdk';
import { PriceCache } from '../price-cache.js';
import { PriceData, AggregatedPrice } from '../../types/oracle-types.js';

// __dirname (not import.meta.url) — this repo's ts-jest setup transpiles
// to CommonJS at test time (see jest.config.js's moduleNameMapper hack for
// resolving relative `.js`-suffixed ESM-style imports back to `.ts`, which
// wouldn't be needed under real ESM).
const SOURCE_FILE = path.join(__dirname, '../price-cache.ts');

function makePrice(symbol: string, price: number, source = 'coingecko'): PriceData {
  return { symbol, price, timestamp: new Date(), source };
}

function makeAggregated(symbol: string, price: number): AggregatedPrice {
  return {
    symbol,
    price,
    timestamp: new Date(),
    confidence: 1,
    sourcesUsed: ['coingecko'],
    outliersFiltered: [],
    sourceCount: 1,
  };
}

afterEach(async () => {
  // PriceCache reconfigures the process-wide 'oracle-price' channel, so
  // each test must restore it — otherwise tests leak config/state into
  // each other via the shared globalCache singleton.
  globalCache.configure('oracle-price', DEFAULT_CHANNEL_CONFIGS['oracle-price']);
  await globalCache.clear();
});

describe('PriceCache source', () => {
  it('contains no `as any` escapes', () => {
    const source = readFileSync(SOURCE_FILE, 'utf8');
    expect(source).not.toMatch(/as\s+any/);
  });
});

describe('PriceCache — shared-channel reconfiguration is non-destructive', () => {
  it('a price written before construction is still readable after a second PriceCache changes maxSize', () => {
    const first = new PriceCache();
    first.setPrice(makePrice('XLM', 0.12));

    // This used to reach into globalCache's private fields and swap out
    // the live cache instance, silently dropping everything written above.
    const second = new PriceCache({ maxSize: 5000 });

    expect(first.getPrice('XLM', 'coingecko')).toEqual(
      expect.objectContaining({ symbol: 'XLM', price: 0.12 })
    );
    expect(second.getPrice('XLM', 'coingecko')).toEqual(
      expect.objectContaining({ symbol: 'XLM', price: 0.12 })
    );
  });

  it('constructing several PriceCache instances with different configs never wipes prior entries', () => {
    const a = new PriceCache();
    a.setPrice(makePrice('XLM', 0.12));

    new PriceCache({ maxSize: 200 });
    new PriceCache({ ttlMs: 5000 });
    new PriceCache({ maxSize: 9000, ttlMs: 10000 });

    expect(a.getPrice('XLM', 'coingecko')?.price).toBe(0.12);
  });

  it('shrinking maxSize evicts only enough entries to fit, not everything', () => {
    const cache = new PriceCache({ maxSize: 100 });
    cache.setPrice(makePrice('AAA', 1));
    cache.setPrice(makePrice('BBB', 2));
    cache.setPrice(makePrice('CCC', 3));

    // eslint-disable-next-line no-new
    new PriceCache({ maxSize: 2 });

    const remaining = [
      cache.getPrice('AAA', 'coingecko'),
      cache.getPrice('BBB', 'coingecko'),
      cache.getPrice('CCC', 'coingecko'),
    ].filter((p) => p !== null);

    expect(remaining.length).toBe(2);
    // Oldest write (AAA) is the one evicted by the oldest-first policy.
    expect(cache.getPrice('AAA', 'coingecko')).toBeNull();
    expect(cache.getPrice('CCC', 'coingecko')?.price).toBe(3);
  });
});

describe('PriceCache — invalidate via public API', () => {
  it('removes all source-scoped entries for a symbol plus its aggregate, leaving other symbols intact', () => {
    const cache = new PriceCache();
    cache.setPrice(makePrice('XLM', 0.1, 'coingecko'));
    cache.setPrice(makePrice('XLM', 0.11, 'cmc'));
    cache.setAggregatedPrice(makeAggregated('XLM', 0.105));
    cache.setPrice(makePrice('USDC', 1, 'coingecko'));

    cache.invalidate('XLM');

    expect(cache.getPrice('XLM', 'coingecko')).toBeNull();
    expect(cache.getPrice('XLM', 'cmc')).toBeNull();
    expect(cache.getAggregatedPrice('XLM')).toBeNull();
    expect(cache.getPrice('USDC', 'coingecko')?.price).toBe(1);
  });

  it('invalidating a single source only removes that source', () => {
    const cache = new PriceCache();
    cache.setPrice(makePrice('XLM', 0.1, 'coingecko'));
    cache.setPrice(makePrice('XLM', 0.11, 'cmc'));

    cache.invalidate('XLM', 'coingecko');

    expect(cache.getPrice('XLM', 'coingecko')).toBeNull();
    expect(cache.getPrice('XLM', 'cmc')?.price).toBe(0.11);
  });
});

describe('PriceCache — clear/getStats', () => {
  it('clear only removes oracle: namespaced entries', () => {
    const cache = new PriceCache();
    cache.setPrice(makePrice('XLM', 0.1));
    cache.setAggregatedPrice(makeAggregated('XLM', 0.1));

    cache.clear();

    expect(cache.getPrice('XLM', 'coingecko')).toBeNull();
    expect(cache.getAggregatedPrice('XLM')).toBeNull();
  });

  it('getStats reports price vs aggregated counts correctly', () => {
    const cache = new PriceCache();
    cache.setPrice(makePrice('XLM', 0.1, 'coingecko'));
    cache.setPrice(makePrice('USDC', 1, 'coingecko'));
    cache.setAggregatedPrice(makeAggregated('XLM', 0.1));

    const stats = cache.getStats();

    expect(stats.priceCount).toBe(2);
    expect(stats.aggregatedCount).toBe(1);
    expect(stats.totalSize).toBe(3);
  });
});