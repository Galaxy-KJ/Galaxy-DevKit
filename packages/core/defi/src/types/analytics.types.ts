export interface UnifiedPoolAnalytics {
  protocol: 'sdex' | 'soroswap';
  poolId: string;
  tvlUSD: number;
  volume24hUSD: number;
  feesEarned24hUSD: number;
  apy7d: number | null;
  impermanentLossPercent?: number;
  fetchedAt: number;
}

export interface LiquidityAnalyticsConfig {
  horizonUrl?: string;
  cacheTtlMs?: number;
  priceResolver?: (assetString: string) => Promise<number>;
}

export type PriceResolver = (assetString: string) => Promise<number>;
