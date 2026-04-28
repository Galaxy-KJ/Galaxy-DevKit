import { Asset } from '../types/defi-types.js';

export type AggregatorVenue = 'soroswap' | 'sdex' | 'aquarius';

export interface AggregatorRoute {
  venue: AggregatorVenue;
  amountIn: string;
  amountOut: string;
  priceImpact: number;
  path: string[];
}

export interface AggregatorQuote {
  assetIn: Asset;
  assetOut: Asset;
  amountIn: string;
  routes: AggregatorRoute[];
  totalAmountOut: string;
  effectivePrice: number;
  savingsVsBestSingle: number;
}
