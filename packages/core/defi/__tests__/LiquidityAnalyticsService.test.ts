import { LiquidityAnalyticsService } from '../src/services/LiquidityAnalyticsService.js';
import { UnifiedPoolAnalytics } from '../src/types/analytics.types.js';

describe('LiquidityAnalyticsService', () => {
  let service: LiquidityAnalyticsService;
  
  const mockSoroswapEngine = {
    getPoolAnalytics: jest.fn().mockResolvedValue({
      poolId: 'soroswap-pool-1',
      tvlUSD: 1000,
      volume24hUSD: 500,
      feesEarned24hUSD: 1.5,
      apy7d: 10,
      fetchedAt: 1234567890
    })
  };

  beforeEach(() => {
    service = new LiquidityAnalyticsService({}, mockSoroswapEngine);
  });

  it('should format soroswap response correctly', async () => {
    const result = await service.getPoolAnalytics('soroswap', 'soroswap-pool-1');
    expect(result).toEqual({
      protocol: 'soroswap',
      poolId: 'soroswap-pool-1',
      tvlUSD: 1000,
      volume24hUSD: 500,
      feesEarned24hUSD: 1.5,
      apy7d: 10,
      impermanentLossPercent: undefined,
      fetchedAt: 1234567890
    });
    expect(mockSoroswapEngine.getPoolAnalytics).toHaveBeenCalledWith('soroswap-pool-1');
  });

  it('should throw on unsupported protocol', async () => {
    await expect(service.getPoolAnalytics('unknown' as any, 'pool')).rejects.toThrow('Unsupported protocol: unknown');
  });
});
