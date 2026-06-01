/**
 * @fileoverview Off-chain oracle aggregator daemon with deviation-gated on-chain push
 */

import { OracleAggregator } from './OracleAggregator.js';
import { MedianStrategy } from './strategies/MedianStrategy.js';
import { AggregatorScheduler } from './scheduler.js';
import { createOracleSources, type OracleSourceConfig } from './sources/index.js';
import type { AggregatedPrice } from '../types/oracle-types.js';

export interface AggregatorConfig {
  sources: OracleSourceConfig[];
  symbols: string[];
  updateIntervalMs: number;
  deviationThresholdPercent: number;
  onChainOracleId: string;
  pushPrice?: (symbol: string, price: number, oracleId: string) => Promise<void>;
}

export interface PricePushEvent {
  symbol: string;
  price: number;
  previousPrice?: number;
  deviationPercent: number;
  pushedAt: Date;
}

/**
 * Daemon-style service that aggregates multi-source prices and pushes on-chain
 * only when the deviation threshold is crossed.
 */
export class PriceAggregatorService {
  private readonly config: AggregatorConfig;
  private readonly aggregator: OracleAggregator;
  private scheduler: AggregatorScheduler | null = null;
  private lastPushedPrices = new Map<string, number>();
  private readonly pushLog: PricePushEvent[] = [];

  constructor(config: AggregatorConfig) {
    this.config = config;
    this.aggregator = new OracleAggregator({ minSources: Math.min(2, config.sources.length) });
    this.aggregator.setStrategy(new MedianStrategy());

    for (const source of createOracleSources(config.sources)) {
      this.aggregator.addSource(source);
    }
  }

  async start(): Promise<void> {
    if (this.scheduler?.isRunning) return;

    this.scheduler = new AggregatorScheduler(
      () => this.runUpdateCycle(),
      {
        intervalMs: this.config.updateIntervalMs,
        runImmediately: true,
        onError: (err) => {
          console.error('[PriceAggregatorService] cycle failed, scheduler continues:', err);
        },
      },
    );

    await this.scheduler.start();
  }

  async stop(): Promise<void> {
    this.scheduler?.stop();
    this.scheduler = null;
  }

  get isRunning(): boolean {
    return this.scheduler?.isRunning ?? false;
  }

  async getAggregatedPrice(symbol: string): Promise<AggregatedPrice> {
    return this.aggregator.getAggregatedPrice(symbol);
  }

  getPushLog(): PricePushEvent[] {
    return [...this.pushLog];
  }

  /**
   * Run one aggregation + conditional push cycle for all configured symbols.
   */
  async runUpdateCycle(): Promise<void> {
    for (const symbol of this.config.symbols) {
      const aggregated = await this.getAggregatedPrice(symbol);
      await this.maybePush(symbol, aggregated.price);
    }
  }

  private async maybePush(symbol: string, price: number): Promise<void> {
    const previous = this.lastPushedPrices.get(symbol);
    const deviationPercent = previous === undefined
      ? Number.POSITIVE_INFINITY
      : Math.abs(((price - previous) / previous) * 100);

    if (previous !== undefined && deviationPercent < this.config.deviationThresholdPercent) {
      return;
    }

    if (this.config.pushPrice) {
      await this.config.pushPrice(symbol, price, this.config.onChainOracleId);
    }

    this.lastPushedPrices.set(symbol, price);
    this.pushLog.push({
      symbol,
      price,
      previousPrice: previous,
      deviationPercent: Number.isFinite(deviationPercent) ? deviationPercent : 0,
      pushedAt: new Date(),
    });
  }
}

export function calculateDeviationPercent(previous: number, next: number): number {
  if (previous === 0) return Number.POSITIVE_INFINITY;
  return Math.abs(((next - previous) / previous) * 100);
}
