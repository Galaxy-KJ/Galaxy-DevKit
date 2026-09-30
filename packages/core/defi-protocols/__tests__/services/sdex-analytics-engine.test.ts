/**
 * @fileoverview Tests for SDEXAnalyticsEngine
 * @description Covers TVL pricing, 24h/7d volume traversal across pages,
 *   APY calculation, price resolution and caching.
 */

import { SDEXAnalyticsEngine } from '../../src/services/SDEXAnalyticsEngine.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const USDC = 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

interface FakeTrade {
  ledger_close_time: string;
  base_asset_type: string;
  base_asset_code?: string;
  base_asset_issuer?: string;
  base_amount: string;
}

function trade(ageMs: number, baseAmount: string, native = true): FakeTrade {
  const [code, issuer] = USDC.split(':');
  return {
    ledger_close_time: new Date(Date.now() - ageMs).toISOString(),
    base_asset_type: native ? 'native' : 'credit_alphanum4',
    base_asset_code: native ? undefined : code,
    base_asset_issuer: native ? undefined : issuer,
    base_amount: baseAmount,
  };
}

interface FakePage {
  records: FakeTrade[];
  next: jest.Mock<Promise<FakePage>, []>;
}

function page(records: FakeTrade[], next?: () => Promise<FakePage>): FakePage {
  return {
    records,
    next: jest.fn(next ?? (async () => page([]))),
  };
}

function fakeHorizon(
  reserves: Array<{ asset: string; amount: string }> | undefined,
  firstPage: FakePage
) {
  const poolCall = jest.fn().mockResolvedValue({ reserves });
  const tradesCall = jest.fn().mockResolvedValue(firstPage);
  const tradesBuilder = {
    forLiquidityPool: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    call: tradesCall,
  };
  return {
    server: {
      liquidityPools: () => ({ liquidityPoolId: () => ({ call: poolCall }) }),
      trades: () => tradesBuilder,
    },
    poolCall,
    tradesBuilder,
  };
}

function engineWith(
  horizon: ReturnType<typeof fakeHorizon>,
  config: ConstructorParameters<typeof SDEXAnalyticsEngine>[0] = {}
): SDEXAnalyticsEngine {
  const engine = new SDEXAnalyticsEngine(config);
  (engine as unknown as { horizon: unknown }).horizon = horizon.server;
  return engine;
}

const prices: Record<string, number> = { native: 0.1, [USDC]: 1 };
const priceResolver = jest.fn(async (asset: string) => prices[asset]);

describe('SDEXAnalyticsEngine', () => {
  beforeEach(() => {
    priceResolver.mockClear();
  });

  it('computes TVL, volumes, fees and APY from pool reserves and trades', async () => {
    const horizon = fakeHorizon(
      [
        { asset: 'native', amount: '10000' },
        { asset: USDC, amount: '1000' },
      ],
      page([trade(HOUR, '1000'), trade(2 * DAY, '100', false), trade(8 * DAY, '999999')])
    );
    const engine = engineWith(horizon, { priceResolver });

    const result = await engine.getPoolAnalytics('pool-1');

    // TVL: 10000 XLM * 0.1 + 1000 USDC * 1
    expect(result.tvlUSD).toBe(2000);
    // 24h: 1000 XLM * 0.1 = 100; 7d adds 100 USDC; the 8-day-old trade is excluded
    expect(result.volume24hUSD).toBe(100);
    expect(result.feesEarned24hUSD).toBeCloseTo(0.3);
    const fees7d = 200 * 0.003;
    expect(result.apy7d).toBeCloseTo((fees7d / 2000) * (365 / 7) * 100);
    expect(result.protocol).toBe('sdex');
    expect(result.poolId).toBe('pool-1');
    expect(horizon.tradesBuilder.forLiquidityPool).toHaveBeenCalledWith('pool-1');
    expect(priceResolver).toHaveBeenCalledWith(USDC);
  });

  it('follows pagination until it reaches trades older than 7 days', async () => {
    const lastPage = page([trade(3 * DAY, '10'), trade(9 * DAY, '10')]);
    const firstPage = page([trade(HOUR, '10')], async () => lastPage);
    const horizon = fakeHorizon(
      [
        { asset: 'native', amount: '100' },
        { asset: USDC, amount: '10' },
      ],
      firstPage
    );
    const engine = engineWith(horizon, { priceResolver });

    const result = await engine.getPoolAnalytics('pool-2');

    expect(firstPage.next).toHaveBeenCalledTimes(1);
    expect(lastPage.next).not.toHaveBeenCalled();
    expect(result.volume24hUSD).toBeCloseTo(1);
  });

  it('stops when a page comes back empty', async () => {
    const firstPage = page([trade(HOUR, '10')]);
    const horizon = fakeHorizon(
      [
        { asset: 'native', amount: '100' },
        { asset: USDC, amount: '10' },
      ],
      firstPage
    );
    const engine = engineWith(horizon, { priceResolver });

    await engine.getPoolAnalytics('pool-3');

    expect(firstPage.next).toHaveBeenCalledTimes(1);
  });

  it('reports zero TVL and APY when reserves are not a two-asset pair', async () => {
    const horizon = fakeHorizon(undefined, page([]));
    const engine = engineWith(horizon, { priceResolver });

    const result = await engine.getPoolAnalytics('pool-4');

    expect(result.tvlUSD).toBe(0);
    expect(result.apy7d).toBe(0);
    expect(result.volume24hUSD).toBe(0);
  });

  it('throws when no priceResolver is configured', async () => {
    const horizon = fakeHorizon(
      [
        { asset: 'native', amount: '1' },
        { asset: USDC, amount: '1' },
      ],
      page([])
    );
    const engine = engineWith(horizon);

    await expect(engine.getPoolAnalytics('pool-5')).rejects.toThrow(
      'A priceResolver is required'
    );
  });

  it('serves cached results within the TTL and refetches after it expires', async () => {
    const horizon = fakeHorizon(undefined, page([]));
    const engine = engineWith(horizon, { priceResolver, cacheTtlMs: 1_000 });
    const nowSpy = jest.spyOn(Date, 'now');

    try {
      nowSpy.mockReturnValue(1_000_000);
      const first = await engine.getPoolAnalytics('pool-6');
      const second = await engine.getPoolAnalytics('pool-6');
      expect(second).toBe(first);
      expect(horizon.poolCall).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(1_000_000 + 1_001);
      await engine.getPoolAnalytics('pool-6');
      expect(horizon.poolCall).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
