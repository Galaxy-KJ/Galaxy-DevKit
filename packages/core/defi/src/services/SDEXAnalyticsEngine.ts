import { Horizon } from '@stellar/stellar-sdk';
import { UnifiedPoolAnalytics, LiquidityAnalyticsConfig } from '../types/analytics.types.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SDEX_FEE_BPS = 30; // 0.3%
const DAYS_PER_YEAR = 365;

export class SDEXAnalyticsEngine {
  private horizon: Horizon.Server;
  private cache = new Map<string, { data: UnifiedPoolAnalytics; expiresAt: number }>();
  private cacheTtlMs: number;
  private priceResolver: (asset: string) => Promise<number>;

  constructor(config: LiquidityAnalyticsConfig = {}) {
    this.horizon = new Horizon.Server(config.horizonUrl || 'https://horizon.stellar.org');
    this.cacheTtlMs = config.cacheTtlMs || 60_000;
    this.priceResolver = config.priceResolver || (() => Promise.resolve(0));
  }

  private async resolvePrice(assetObj: any): Promise<number> {
    const assetString = assetObj.asset === 'native' ? 'native' : `${assetObj.asset.split(':')[0]}:${assetObj.asset.split(':')[1]}`;
    return this.priceResolver(assetString);
  }

  async getPoolAnalytics(poolId: string): Promise<UnifiedPoolAnalytics> {
    const cached = this.cache.get(poolId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    // 1. Fetch Pool info for TVL
    const pool = await this.horizon.liquidityPools().liquidityPoolId(poolId).call();
    
    let tvlUSD = 0;
    if (pool.reserves && pool.reserves.length === 2) {
      const priceA = await this.resolvePrice(pool.reserves[0]);
      const priceB = await this.resolvePrice(pool.reserves[1]);
      
      const valA = parseFloat(pool.reserves[0].amount) * priceA;
      const valB = parseFloat(pool.reserves[1].amount) * priceB;
      tvlUSD = valA + valB;
    }

    // 2. Fetch 24h volume
    const oneDayAgo = new Date(Date.now() - MS_PER_DAY);
    let volume24hUSD = 0;
    
    // We traverse up to 10 pages maximum to prevent rate limiting
    let page = await this.horizon.liquidityPools().liquidityPoolId(poolId).trades().order('desc').limit(200).call();
    let keepGoing = true;
    let pageCount = 0;
    const MAX_PAGES = 10;

    while (keepGoing && page.records.length > 0 && pageCount < MAX_PAGES) {
      pageCount++;
      for (const trade of page.records) {
        const tradeDate = new Date(trade.ledger_close_time);
        if (tradeDate < oneDayAgo) {
          keepGoing = false;
          break;
        }

        // Calculate trade value in USD
        // We find which asset was bought/sold and use its price.
        // It's safer to price the base asset.
        const basePrice = await this.resolvePrice({ asset: trade.base_asset_type === 'native' ? 'native' : `${trade.base_asset_code}:${trade.base_asset_issuer}` });
        const tradeValueUSD = parseFloat(trade.base_amount) * basePrice;
        volume24hUSD += tradeValueUSD;
      }

      if (keepGoing) {
        page = await page.next();
      }
    }

    const feesEarned24hUSD = volume24hUSD * (SDEX_FEE_BPS / 10000);
    const apy7d = tvlUSD > 0 ? (feesEarned24hUSD * DAYS_PER_YEAR) / tvlUSD * 100 : 0;

    const result: UnifiedPoolAnalytics = {
      protocol: 'sdex',
      poolId,
      tvlUSD,
      volume24hUSD,
      feesEarned24hUSD,
      apy7d,
      fetchedAt: Date.now(),
    };

    this.cache.set(poolId, { data: result, expiresAt: Date.now() + this.cacheTtlMs });
    return result;
  }
}
