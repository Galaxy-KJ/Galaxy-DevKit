/**
 * @fileoverview Time-series storage for TWAP observations
 * @description Stores and prunes historical price snapshots for TWAP computation.
 */

export interface PriceObservation {
  price: number;
  timestamp: number;
}

const DEFAULT_MAX_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

export class PriceHistoryStore {
  private histories: Map<string, PriceObservation[]>;
  private maxRetentionMs: number;

  constructor(maxRetentionMs: number = DEFAULT_MAX_RETENTION_MS) {
    this.histories = new Map();
    this.maxRetentionMs = maxRetentionMs;
  }

  /**
   * Record a new price observation for a symbol.
   */
  recordPrice(symbol: string, price: number, timestamp: number = Date.now()): void {
    this.assertValidSymbol(symbol);
    this.assertValidPrice(price);

    const history = this.histories.get(symbol) ?? [];
    history.push({ price, timestamp });

    this.histories.set(symbol, this.pruneHistory(history, timestamp));
  }

  /**
   * Return the full recorded history for a symbol.
   */
  getHistory(symbol: string): PriceObservation[] {
    this.assertValidSymbol(symbol);
    const entries = this.histories.get(symbol) ?? [];
    return [...entries].sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Return observations within the requested rolling window.
   */
  getHistoryWithinWindow(symbol: string, windowMs: number): PriceObservation[] {
    this.assertValidSymbol(symbol);
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new Error('windowMs must be a positive number');
    }

    const now = Date.now();
    const history = this.getHistory(symbol);
    return history.filter((entry) => entry.timestamp >= now - windowMs);
  }

  /**
   * Remove expired observations from all symbols.
   */
  pruneExpired(): void {
    const now = Date.now();

    for (const [symbol, history] of this.histories.entries()) {
      const pruned = history.filter(
        (entry) => entry.timestamp >= now - this.maxRetentionMs
      );
      if (pruned.length > 0) {
        this.histories.set(symbol, pruned);
      } else {
        this.histories.delete(symbol);
      }
    }
  }

  /**
   * Clear all stored observations.
   */
  clear(): void {
    this.histories.clear();
  }

  private pruneHistory(history: PriceObservation[], nowMs: number): PriceObservation[] {
    return history.filter(
      (entry) => entry.timestamp >= nowMs - this.maxRetentionMs
    );
  }

  private assertValidSymbol(symbol: string): void {
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Symbol must be a non-empty string');
    }
  }

  private assertValidPrice(price: number): void {
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Price must be a positive finite number');
    }
  }
}
