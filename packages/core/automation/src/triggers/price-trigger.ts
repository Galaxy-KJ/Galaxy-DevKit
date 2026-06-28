/**
 * @fileoverview Price-based automation trigger
 * @description Evaluates oracle price feeds against threshold conditions for
 *              automated trading strategies (stop-loss, conditional swaps, etc.).
 */

import { OracleAggregator } from '@galaxy-kj/core-oracles';

export interface PriceTriggerConfig {
  assetIn: string;
  assetOut: string;
  condition: 'above' | 'below';
  threshold: string;
}

export class PriceTrigger {
  constructor(private readonly oracle: OracleAggregator) {}

  /**
   * Query OracleAggregator for the asset pair rate and evaluate the condition.
   */
  async evaluate(config: PriceTriggerConfig): Promise<boolean> {
    const threshold = Number(config.threshold);
    if (!Number.isFinite(threshold)) {
      throw new Error('threshold must be a numeric string');
    }

    const price = await this.resolvePairPrice(config.assetIn, config.assetOut);
    if (price === undefined) {
      return false;
    }

    return config.condition === 'above'
      ? price > threshold
      : price < threshold;
  }

  private async resolvePairPrice(
    assetIn: string,
    assetOut: string
  ): Promise<number | undefined> {
    const symbols = [assetIn, assetOut];
    const prices = await this.oracle.getAggregatedPrices(symbols);
    const priceMap = new Map(
      prices.map((entry) => [entry.symbol.toUpperCase(), entry.price])
    );

    const inPrice = this.lookupPrice(priceMap, assetIn);
    const outPrice = this.lookupPrice(priceMap, assetOut);

    if (inPrice === undefined || outPrice === undefined || outPrice === 0) {
      return undefined;
    }

    return inPrice / outPrice;
  }

  private lookupPrice(
    priceMap: Map<string, number>,
    asset: string
  ): number | undefined {
    return (
      priceMap.get(asset.toUpperCase()) ??
      priceMap.get(asset.toLowerCase()) ??
      priceMap.get(asset)
    );
  }
}
