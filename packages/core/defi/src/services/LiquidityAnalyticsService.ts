import { UnifiedPoolAnalytics, LiquidityAnalyticsConfig } from '../types/analytics.types.js';
import { SDEXAnalyticsEngine } from './SDEXAnalyticsEngine.js';

// We import the specific interface from the protocol package if it exports it, 
// otherwise we can assume the consumer will inject it, or we define it structurally.
interface SoroswapEngineLike {
  getPoolAnalytics(poolId: string): Promise<any>;
}

export class LiquidityAnalyticsService {
  private sdexEngine: SDEXAnalyticsEngine;
  private soroswapEngine?: SoroswapEngineLike;

  constructor(config: LiquidityAnalyticsConfig = {}, soroswapEngine?: SoroswapEngineLike) {
    this.sdexEngine = new SDEXAnalyticsEngine(config);
    this.soroswapEngine = soroswapEngine;
  }

  async getPoolAnalytics(protocol: 'sdex' | 'soroswap', poolId: string): Promise<UnifiedPoolAnalytics> {
    if (protocol === 'sdex') {
      return this.sdexEngine.getPoolAnalytics(poolId);
    }

    if (protocol === 'soroswap') {
      if (!this.soroswapEngine) {
        throw new Error('Soroswap Analytics Engine was not provided to LiquidityAnalyticsService');
      }
      
      const soroswapData = await this.soroswapEngine.getPoolAnalytics(poolId);
      
      return {
        protocol: 'soroswap',
        poolId: soroswapData.poolId,
        tvlUSD: soroswapData.tvlUSD,
        volume24hUSD: soroswapData.volume24hUSD,
        feesEarned24hUSD: soroswapData.feesEarned24hUSD,
        apy7d: soroswapData.apy7d,
        impermanentLossPercent: soroswapData.impermanentLossPercent,
        fetchedAt: soroswapData.fetchedAt
      };
    }

    throw new Error(`Unsupported protocol: ${protocol}`);
  }

  async getMultiplePoolsAnalytics(requests: { protocol: 'sdex' | 'soroswap', poolId: string }[]): Promise<UnifiedPoolAnalytics[]> {
    return Promise.all(requests.map(req => this.getPoolAnalytics(req.protocol, req.poolId)));
  }
}
