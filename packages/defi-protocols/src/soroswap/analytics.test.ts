/**
 * @fileoverview Unit tests for Soroswap pool analytics (#272)
 * @description Covers TVL calculation, APY, impermanent loss, caching,
 *   error handling, and the module-level convenience API.
 *   Zero real network calls — all fetch responses are mocked.
 * @author Galaxy DevKit Team
 */

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ─── Imports ──────────────────────────────────────────────────────────────────

import {
  calculateImpermanentLoss,
  calculateApy7d,
  calculateTvl,
  AnalyticsCache,
  AnalyticsError,
  SoroswapAnalyticsEngine,
  configureAnalytics,
  getPoolAnalytics,
  getAllPoolsAnalytics,
} from './analytics';
import type { VolumeSnapshot } from './types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const POOL_ID   = 'CPOOL123456789012345678901234567890123456789012345678';
const ASSET_A   = 'CUSDC123456789012345678901234567890123456789012345678';
const ASSET_B   = 'CXLM0123456789012345678901234567890123456789012345678';

const POOL_RESPONSE = {
  id:          POOL_ID,
  token0:      { id: ASSET_A },
  token1:      { id: ASSET_B },
  reserve0:    '1000000000',   // 100 USDC (7 decimals)
  reserve1:    '5000000000',   // 500 XLM
  totalSupply: '1000000',
  feeTier:     30,
  volumeUSD:   '10000',
};

const DAY_DATA = [
  { date: Math.floor((Date.now() - 86400000) / 1000),     dailyVolumeUSD: '5000', dailyFeesUSD: '15' },
  { date: Math.floor((Date.now() - 2 * 86400000) / 1000), dailyVolumeUSD: '4000', dailyFeesUSD: '12' },
  { date: Math.floor((Date.now() - 3 * 86400000) / 1000), dailyVolumeUSD: '6000', dailyFeesUSD: '18' },
];

function mockJsonResponse(data: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok:     status < 400,
    status,
    json:   async () => data,
    statusText: status === 404 ? 'Not Found' : 'OK',
  } as unknown as Response);
}

function mockNetworkError(message = 'ERR_NAME_NOT_RESOLVED') {
  mockFetch.mockRejectedValueOnce(new Error(message));
}

function makeEngine(priceA = 1, priceB = 0.1) {
  return new SoroswapAnalyticsEngine({
    apiUrl:        'https://mock-soroswap.test/api/v1',
    cacheTtlMs:    5000,
    priceResolver: async (asset) => asset === ASSET_A ? priceA : priceB,
  });
}

// ─── calculateImpermanentLoss ─────────────────────────────────────────────────

describe('calculateImpermanentLoss', () => {
  it('returns 0 when price ratio is unchanged', () => {
    expect(calculateImpermanentLoss(1, 1)).toBe(0);
  });

  it('returns 0 for zero initial ratio', () => {
    expect(calculateImpermanentLoss(0, 2)).toBe(0);
  });

  it('returns 0 for zero current ratio', () => {
    expect(calculateImpermanentLoss(1, 0)).toBe(0);
  });

  it('returns positive loss when price doubles', () => {
    // k=2: IL = 2√2/(1+2) - 1 ≈ 0.0572 → 5.72%
    const il = calculateImpermanentLoss(1, 2);
    expect(il).toBeCloseTo(5.72, 1);
  });

  it('returns positive loss when price halves', () => {
    // k=0.5: same IL as k=2 by symmetry
    const il = calculateImpermanentLoss(1, 0.5);
    expect(il).toBeCloseTo(5.72, 1);
  });

  it('returns higher IL for larger price movement (4×)', () => {
    const il2x = calculateImpermanentLoss(1, 2);
    const il4x = calculateImpermanentLoss(1, 4);
    expect(il4x).toBeGreaterThan(il2x);
  });

  it('is symmetric — price up k == price down 1/k', () => {
    const up   = calculateImpermanentLoss(1, 3);
    const down = calculateImpermanentLoss(1, 1 / 3);
    expect(up).toBeCloseTo(down, 5);
  });

  it('returns a number between 0 and 100', () => {
    const il = calculateImpermanentLoss(1, 10);
    expect(il).toBeGreaterThanOrEqual(0);
    expect(il).toBeLessThanOrEqual(100);
  });
});

// ─── calculateTvl ─────────────────────────────────────────────────────────────

describe('calculateTvl', () => {
  it('returns 0 when both prices are 0', () => {
    expect(calculateTvl({ reserveA: 1000n, reserveB: 1000n }, 0, 0)).toBe(0);
  });

  it('calculates TVL correctly with 7-decimal reserves', () => {
    // 100 USDC ($1) + 500 XLM ($0.1) = $100 + $50 = $150
    const tvl = calculateTvl(
      { reserveA: 1_000_000_000n, reserveB: 5_000_000_000n },
      1,
      0.1,
    );
    expect(tvl).toBeCloseTo(150, 5);
  });

  it('scales linearly with price', () => {
    const tvlA = calculateTvl({ reserveA: 1_000_000_000n, reserveB: 0n }, 1, 0);
    const tvlB = calculateTvl({ reserveA: 1_000_000_000n, reserveB: 0n }, 2, 0);
    expect(tvlB).toBeCloseTo(tvlA * 2, 5);
  });

  it('supports custom decimals', () => {
    // 1 token with 6 decimals, price $1 → TVL = $1
    const tvl = calculateTvl({ reserveA: 1_000_000n, reserveB: 0n }, 1, 0, 6, 6);
    expect(tvl).toBeCloseTo(1, 5);
  });
});

// ─── calculateApy7d ──────────────────────────────────────────────────────────

describe('calculateApy7d', () => {
  function makeSnap(daysAgo: number, feesUSD: number): VolumeSnapshot {
    const date = new Date(Date.now() - daysAgo * 86_400_000)
      .toISOString()
      .split('T')[0];
    return { poolId: POOL_ID, date, volumeUSD: feesUSD * 100, feesUSD };
  }

  it('returns 0 when TVL is 0', () => {
    expect(calculateApy7d([makeSnap(1, 100)], 0)).toBe(0);
  });

  it('returns 0 when no snapshots', () => {
    expect(calculateApy7d([], 100_000)).toBe(0);
  });

  it('calculates APY correctly', () => {
    // $45 fees over 7 days on $150 TVL → ($45/$150) × (365/7) × 100 ≈ 156.4%
    const snaps = [
      makeSnap(1, 15),
      makeSnap(2, 12),
      makeSnap(3, 18),
    ];
    const apy = calculateApy7d(snaps, 150);
    expect(apy).toBeCloseTo((45 / 150) * (365 / 7) * 100, 1);
  });

  it('ignores snapshots older than 7 days', () => {
    const recent = makeSnap(1, 100);
    const old    = makeSnap(10, 10_000); // should be excluded
    const apy1 = calculateApy7d([recent], 10_000);
    const apy2 = calculateApy7d([recent, old], 10_000);
    expect(apy1).toBeCloseTo(apy2, 5);
  });

  it('returns higher APY for higher fees', () => {
    const low  = calculateApy7d([makeSnap(1, 10)],  10_000);
    const high = calculateApy7d([makeSnap(1, 100)], 10_000);
    expect(high).toBeGreaterThan(low);
  });
});

// ─── AnalyticsCache ───────────────────────────────────────────────────────────

describe('AnalyticsCache', () => {
  it('returns null for missing key', () => {
    const cache = new AnalyticsCache<number>();
    expect(cache.get('missing')).toBeNull();
  });

  it('stores and retrieves a value', () => {
    const cache = new AnalyticsCache<string>({ ttlMs: 5000 });
    cache.set('k', 'hello');
    expect(cache.get('k')).toBe('hello');
  });

  it('returns null after TTL expires', async () => {
    const cache = new AnalyticsCache<number>({ ttlMs: 10 });
    cache.set('k', 42);
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.get('k')).toBeNull();
  });

  it('invalidates a specific key', () => {
    const cache = new AnalyticsCache<number>({ ttlMs: 5000 });
    cache.set('k', 1);
    cache.invalidate('k');
    expect(cache.get('k')).toBeNull();
  });

  it('clears all entries', () => {
    const cache = new AnalyticsCache<number>({ ttlMs: 5000 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('tracks size correctly', () => {
    const cache = new AnalyticsCache<number>({ ttlMs: 5000 });
    expect(cache.size).toBe(0);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.size).toBe(2);
  });
});

// ─── SoroswapAnalyticsEngine.getPoolAnalytics ─────────────────────────────────

describe('SoroswapAnalyticsEngine.getPoolAnalytics', () => {
  beforeEach(() => mockFetch.mockClear());

  it('returns a PoolAnalytics object with correct shape', async () => {
    const engine = makeEngine();
    mockJsonResponse(POOL_RESPONSE);
    mockJsonResponse(DAY_DATA);

    const result = await engine.getPoolAnalytics(POOL_ID);

    expect(result.poolId).toBe(POOL_ID);
    expect(typeof result.tvlUSD).toBe('number');
    expect(typeof result.volume24hUSD).toBe('number');
    expect(typeof result.feesEarned24hUSD).toBe('number');
    expect(typeof result.apy7d).toBe('number');
    expect(typeof result.impermanentLossPercent).toBe('number');
    expect(typeof result.fetchedAt).toBe('number');
  });

  it('calculates TVL correctly from reserves and prices', async () => {
    const engine = makeEngine(1, 0.1); // USDC=$1, XLM=$0.1
    mockJsonResponse(POOL_RESPONSE);
    mockJsonResponse([]);

    const result = await engine.getPoolAnalytics(POOL_ID);
    // 100 USDC × $1 + 500 XLM × $0.1 = $150
    expect(result.tvlUSD).toBeCloseTo(150, 1);
  });

  it('calculates 24h fees from volume and fee tier', async () => {
    const engine = makeEngine();
    mockJsonResponse(POOL_RESPONSE); // volumeUSD=10000, feeTier=30
    mockJsonResponse([]);

    const result = await engine.getPoolAnalytics(POOL_ID);
    // 10000 × 0.003 = $30
    expect(result.feesEarned24hUSD).toBeCloseTo(30, 1);
  });

  it('returns cached result on second call', async () => {
    const engine = makeEngine();
    mockJsonResponse(POOL_RESPONSE);
    mockJsonResponse(DAY_DATA);

    await engine.getPoolAnalytics(POOL_ID);
    const second = await engine.getPoolAnalytics(POOL_ID);

    // Only 2 fetch calls for the first request (pool + day-data)
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(second.poolId).toBe(POOL_ID);
  });

  it('refetches after cache is cleared', async () => {
    const engine = makeEngine();
    mockJsonResponse(POOL_RESPONSE);
    mockJsonResponse([]);
    await engine.getPoolAnalytics(POOL_ID);

    engine.clearCache();
    mockJsonResponse(POOL_RESPONSE);
    mockJsonResponse([]);
    await engine.getPoolAnalytics(POOL_ID);

    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('throws POOL_NOT_FOUND on 404', async () => {
    const engine = makeEngine();
    mockJsonResponse({}, 404);

    await expect(engine.getPoolAnalytics(POOL_ID)).rejects.toMatchObject({
      code: 'POOL_NOT_FOUND',
    });
  });

  it('throws FETCH_FAILED on non-404 HTTP error', async () => {
    const engine = makeEngine();
    mockJsonResponse({}, 503);

    await expect(engine.getPoolAnalytics(POOL_ID)).rejects.toMatchObject({
      code: 'FETCH_FAILED',
    });
  });

  it('throws FETCH_FAILED on network error', async () => {
    const engine = makeEngine();
    mockNetworkError();

    await expect(engine.getPoolAnalytics(POOL_ID)).rejects.toMatchObject({
      code: 'FETCH_FAILED',
    });
  });

  it('throws INVALID_INPUT for empty poolId', async () => {
    const engine = makeEngine();
    await expect(engine.getPoolAnalytics('')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('gracefully handles missing day data (APY = 0)', async () => {
    const engine = makeEngine();
    mockJsonResponse(POOL_RESPONSE);
    // day-data endpoint returns 500 → falls back to empty
    mockJsonResponse({}, 500);

    const result = await engine.getPoolAnalytics(POOL_ID);
    expect(result.apy7d).toBe(0);
  });
});

// ─── SoroswapAnalyticsEngine.getAllPoolsAnalytics ─────────────────────────────

describe('SoroswapAnalyticsEngine.getAllPoolsAnalytics', () => {
  beforeEach(() => mockFetch.mockClear());

  it('returns an array of PoolAnalytics', async () => {
    const engine = makeEngine();
    mockJsonResponse([POOL_RESPONSE, { ...POOL_RESPONSE, id: 'CPOOL2' }]);
    mockJsonResponse([]); // day-data pool 1
    mockJsonResponse([]); // day-data pool 2

    const results = await engine.getAllPoolsAnalytics();
    expect(results).toHaveLength(2);
    expect(results[0].poolId).toBe(POOL_ID);
  });

  it('returns empty array when API returns no pools', async () => {
    const engine = makeEngine();
    mockJsonResponse([]);

    const results = await engine.getAllPoolsAnalytics();
    expect(results).toEqual([]);
  });

  it('handles pools wrapped in { pools: [...] }', async () => {
    const engine = makeEngine();
    mockJsonResponse({ pools: [POOL_RESPONSE] });
    mockJsonResponse([]);

    const results = await engine.getAllPoolsAnalytics();
    expect(results).toHaveLength(1);
  });

  it('uses cache on second call', async () => {
    const engine = makeEngine();
    mockJsonResponse([POOL_RESPONSE]);
    mockJsonResponse([]);

    await engine.getAllPoolsAnalytics();
    await engine.getAllPoolsAnalytics();

    expect(mockFetch).toHaveBeenCalledTimes(2); // pool list + day-data only once
  });

  it('throws FETCH_FAILED on API error', async () => {
    const engine = makeEngine();
    mockJsonResponse({}, 500);

    await expect(engine.getAllPoolsAnalytics()).rejects.toMatchObject({
      code: 'FETCH_FAILED',
    });
  });
});

// ─── AnalyticsError ───────────────────────────────────────────────────────────

describe('AnalyticsError', () => {
  it('is an instance of Error', () => {
    expect(new AnalyticsError('msg', 'POOL_NOT_FOUND')).toBeInstanceOf(Error);
  });

  it('has name AnalyticsError', () => {
    expect(new AnalyticsError('msg', 'FETCH_FAILED').name).toBe('AnalyticsError');
  });

  it('exposes code property', () => {
    expect(new AnalyticsError('msg', 'INVALID_INPUT').code).toBe('INVALID_INPUT');
  });
});

// ─── Module-level convenience functions ──────────────────────────────────────

describe('module-level API (getPoolAnalytics / getAllPoolsAnalytics)', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    // Reset the default engine between tests
    configureAnalytics({
      apiUrl:        'https://mock-soroswap.test/api/v1',
      cacheTtlMs:    5000,
      priceResolver: async () => 1,
    });
  });

  it('getPoolAnalytics returns a PoolAnalytics object', async () => {
    mockJsonResponse(POOL_RESPONSE);
    mockJsonResponse([]);

    const result = await getPoolAnalytics(POOL_ID);
    expect(result.poolId).toBe(POOL_ID);
  });

  it('getAllPoolsAnalytics returns an array', async () => {
    mockJsonResponse([POOL_RESPONSE]);
    mockJsonResponse([]);

    const results = await getAllPoolsAnalytics();
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(1);
  });
});