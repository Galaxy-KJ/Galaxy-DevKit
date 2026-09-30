/**
 * @fileoverview Tests for LiquidityAnalyticsService
 */

import { LiquidityAnalyticsService } from '../../src/services/LiquidityAnalyticsService.js';
import { UnifiedPoolAnalytics } from '../../src/types/analytics.types.js';

describe('LiquidityAnalyticsService', () => {
  let service: LiquidityAnalyticsService;

  const mockSoroswapEngine = {
    getPoolAnalytics: jest.fn().mockResolvedValue({
      poolId: 'soroswap-pool-1',
      tvlUSD: 1000,
      volume24hUSD: 500,
      feesEarned24hUSD: 1.5,
      apy7d: 10,
      fetchedAt: 1234567890,
    }),
  };

  beforeEach(() => {
    service = new LiquidityAnalyticsService({}, mockSoroswapEngine);
  });

  it('should format soroswap response correctly', async () => {
    const result = await service.getPoolAnalytics('soroswap', 'soroswap-pool-1');
    expect(result).toEqual<UnifiedPoolAnalytics>({
      protocol: 'soroswap',
      poolId: 'soroswap-pool-1',
      tvlUSD: 1000,
      volume24hUSD: 500,
      feesEarned24hUSD: 1.5,
      apy7d: 10,
      impermanentLossPercent: undefined,
      fetchedAt: 1234567890,
    });
    expect(mockSoroswapEngine.getPoolAnalytics).toHaveBeenCalledWith('soroswap-pool-1');
  });

  it('should throw when soroswap engine is not provided', async () => {
    const serviceWithoutSoroswap = new LiquidityAnalyticsService({});
    await expect(
      serviceWithoutSoroswap.getPoolAnalytics('soroswap', 'pool')
    ).rejects.toThrow('Soroswap Analytics Engine was not provided');
  });

  it('should throw on unsupported protocol', async () => {
    await expect(
      service.getPoolAnalytics('unknown' as any, 'pool')
    ).rejects.toThrow('Unsupported protocol: unknown');
  });

  it('should return multiple pool analytics', async () => {
    const requests = [
      { protocol: 'soroswap' as const, poolId: 'soroswap-pool-1' },
      { protocol: 'soroswap' as const, poolId: 'soroswap-pool-2' },
    ];
    const results = await service.getMultiplePoolsAnalytics(requests);
    expect(results).toHaveLength(2);
    expect(results[0].protocol).toBe('soroswap');
  });
});
