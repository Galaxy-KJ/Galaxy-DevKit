import {
  calculateFeeApr,
  calculateLpPositionAnalytics,
  calculateSoroswapPoolAnalytics,
  calculateSpotPrice,
  calculateTvlUsd,
  estimateFeeRevenueUsd,
  estimateImpermanentLossPct,
  normalizeSoroswapAmount,
} from '../../src/protocols/soroswap/analytics';
import { Asset } from '../../src/types/defi-types';

describe('soroswap analytics helpers', () => {
  const token0: Asset = { code: 'XLM', type: 'native' };
  const token1: Asset = {
    code: 'USDC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    type: 'credit_alphanum4',
  };

  it('normalizes raw stroop values', () => {
    expect(normalizeSoroswapAmount(12345678n)).toBeCloseTo(1.2345678);
  });

  it('handles number, decimal-string, blank-string, and non-finite inputs safely', () => {
    expect(normalizeSoroswapAmount(12345678)).toBeCloseTo(1.2345678);
    expect(normalizeSoroswapAmount('12345678.9')).toBeCloseTo(1.2345678);
    expect(normalizeSoroswapAmount('')).toBe(0);
    expect(normalizeSoroswapAmount(Number.NaN as unknown as number)).toBe(0);
  });

  it('returns zero when spot price base reserve is empty', () => {
    expect(calculateSpotPrice(0n, 2000000n)).toBe(0);
  });

  it('calculates spot price from normalized reserves', () => {
    expect(calculateSpotPrice(1000000n, 2500000n)).toBeCloseTo(2.5);
  });

  it('calculates tvl from reserve balances and usd prices', () => {
    const tvlUsd = calculateTvlUsd({
      reserve0: 10000000n,
      reserve1: 50000000n,
      token0PriceUsd: 0.1,
      token1PriceUsd: 1,
    });

    expect(tvlUsd).toBeCloseTo(5.1);
  });

  it('returns zero tvl when prices are missing', () => {
    expect(
      calculateTvlUsd({
        reserve0: 10000000n,
        reserve1: 50000000n,
      })
    ).toBe(0);
  });

  it('estimates 24h fee revenue from volume', () => {
    expect(estimateFeeRevenueUsd(100000, 0.003)).toBeCloseTo(300);
  });

  it('annualizes fee apr from tvl and daily volume', () => {
    expect(
      calculateFeeApr({
        tvlUsd: 10000,
        volume24hUsd: 100000,
        feeRate: 0.003,
      })
    ).toBeCloseTo(10.95);
  });

  it('returns zero apr when tvl is zero', () => {
    expect(
      calculateFeeApr({
        tvlUsd: 0,
        volume24hUsd: 100000,
      })
    ).toBe(0);
  });

  it('estimates impermanent loss percentage from price change', () => {
    expect(estimateImpermanentLossPct(4, 1)).toBeCloseTo(20, 5);
  });

  it('returns zero impermanent loss for invalid price ratios', () => {
    expect(estimateImpermanentLossPct(0, 1)).toBe(0);
    expect(estimateImpermanentLossPct(2, 0)).toBe(0);
  });

  it('calculates lp position analytics from pool share', () => {
    const lpAnalytics = calculateLpPositionAnalytics({
      reserve0: 100000000n,
      reserve1: 500000000n,
      totalSupply: 10000000n,
      token0PriceUsd: 0.1,
      token1PriceUsd: 1,
      volume24hUsd: 100000,
      feeRate: 0.003,
      lpPosition: {
        lpTokenAmount: 1000000n,
        initialPriceRatio: 5,
      },
    });

    expect(lpAnalytics.poolShare).toBeCloseTo(0.1);
    expect(lpAnalytics.token0Underlying).toBeCloseTo(1);
    expect(lpAnalytics.token1Underlying).toBeCloseTo(5);
    expect(lpAnalytics.positionValueUsd).toBeCloseTo(5.1);
    expect(lpAnalytics.estimatedFees24hUsd).toBeCloseTo(30);
    expect(lpAnalytics.projectedFeeApr).toBeGreaterThan(0);
    expect(lpAnalytics.impermanentLossPct).toBe(0);
  });

  it('guards lp analytics against empty total supply', () => {
    const lpAnalytics = calculateLpPositionAnalytics({
      reserve0: 100000000n,
      reserve1: 500000000n,
      totalSupply: 0n,
      token0PriceUsd: 0.1,
      token1PriceUsd: 1,
      lpPosition: {
        lpTokenAmount: 1000000n,
      },
    });

    expect(lpAnalytics.poolShare).toBe(0);
    expect(lpAnalytics.positionValueUsd).toBe(0);
  });

  it('builds soroswap pool analytics with lp position details', () => {
    const analytics = calculateSoroswapPoolAnalytics({
      poolAddress: 'CPOOL',
      token0,
      token1,
      reserve0: 100000000n,
      reserve1: 500000000n,
      totalSupply: 10000000n,
      options: {
        token0PriceUsd: 0.1,
        token1PriceUsd: 1,
        volume24hUsd: 100000,
        volume7dUsd: 700000,
        volume30dUsd: 3000000,
        lpPosition: {
          lpTokenAmount: 1000000n,
          initialPriceRatio: 2,
        },
        lastUpdated: 1234567890,
      },
    });

    expect(analytics.poolAddress).toBe('CPOOL');
    expect(analytics.reserve0Normalized).toBeCloseTo(10);
    expect(analytics.reserve1Normalized).toBeCloseTo(50);
    expect(analytics.tvlUsd).toBeCloseTo(51);
    expect(analytics.volume24hUsd).toBe(100000);
    expect(analytics.volume7dUsd).toBe(700000);
    expect(analytics.volume30dUsd).toBe(3000000);
    expect(analytics.fees24hUsd).toBeCloseTo(300);
    expect(analytics.feeApr).toBeCloseTo((300 * 365) / 51);
    expect(analytics.priceToken0InToken1).toBeCloseTo(5);
    expect(analytics.priceToken1InToken0).toBeCloseTo(0.2);
    expect(analytics.totalSupply).toBe(10000000n);
    expect(analytics.lastUpdated).toBe(1234567890);
    expect(analytics.lpPosition?.poolShare).toBeCloseTo(0.1);
    expect(analytics.lpPosition?.impermanentLossPct).toBeGreaterThan(0);
  });

  it('keeps analytics finite for empty pools', () => {
    const analytics = calculateSoroswapPoolAnalytics({
      poolAddress: 'EMPTY',
      token0,
      token1,
      reserve0: 0n,
      reserve1: 0n,
      totalSupply: 0n,
      options: {
        token0PriceUsd: 0.1,
        token1PriceUsd: 1,
        volume24hUsd: Number.NaN,
        feeRate: Number.NaN,
      },
    });

    expect(analytics.priceToken0InToken1).toBe(0);
    expect(analytics.priceToken1InToken0).toBe(0);
    expect(analytics.feeApr).toBe(0);
    expect(analytics.fees24hUsd).toBe(0);
    expect(analytics.tvlUsd).toBe(0);
  });

  it('defaults optional raw fields to zero when omitted', () => {
    const analytics = calculateSoroswapPoolAnalytics({
      poolAddress: 'NO_SUPPLY',
      token0,
      token1,
      reserve0: '10000000',
      reserve1: '20000000',
    });

    expect(analytics.totalSupply).toBe(0n);
    expect(analytics.volume24hUsd).toBe(0);
    expect(analytics.fees24hUsd).toBe(0);
  });
});
