/**
 * @fileoverview TWAP calculator
 * @description Computes time-weighted average prices from historical observations.
 */

import { PriceHistoryStore } from './price-history-store.js';

export interface TWAPConfig {
  windowMs: number;
  minDataPoints: number;
}

export class TWAPCalculator {
  private store: PriceHistoryStore;

  constructor(store: PriceHistoryStore = new PriceHistoryStore()) {
    this.store = store;
  }

  async recordPrice(symbol: string, price: number, timestamp: number = Date.now()): Promise<void> {
    this.store.recordPrice(symbol, price, timestamp);
  }

  async getTWAP(symbol: string, config: TWAPConfig): Promise<number> {
    this.assertValidConfig(config);
    this.assertValidSymbol(symbol);

    const history = this.store.getHistoryWithinWindow(symbol, config.windowMs);

    if (history.length < config.minDataPoints) {
      throw new Error(
        `Insufficient TWAP history: got ${history.length}, required ${config.minDataPoints}`
      );
    }

    const now = Date.now();
    let weightedSum = 0;
    let totalDuration = 0;

    for (let i = 0; i < history.length; i += 1) {
      const entry = history[i];
      const nextTimestamp =
        i + 1 < history.length ? history[i + 1].timestamp : now;
      const duration = Math.max(0, nextTimestamp - entry.timestamp);

      weightedSum += entry.price * duration;
      totalDuration += duration;
    }

    if (totalDuration === 0) {
      return history.reduce((sum, entry) => sum + entry.price, 0) / history.length;
    }

    return weightedSum / totalDuration;
  }

  private assertValidConfig(config: TWAPConfig): void {
    if (typeof config !== 'object' || config === null) {
      throw new Error('TWAPConfig must be an object');
    }
    if (!Number.isFinite(config.windowMs) || config.windowMs <= 0) {
      throw new Error('TWAPConfig.windowMs must be a positive number');
    }
    if (!Number.isInteger(config.minDataPoints) || config.minDataPoints < 1) {
      throw new Error('TWAPConfig.minDataPoints must be a positive integer');
    }
  }

  private assertValidSymbol(symbol: string): void {
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Symbol must be a non-empty string');
    }
  }
}
