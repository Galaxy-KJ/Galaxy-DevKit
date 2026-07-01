/**
 * @fileoverview Volume-based automation trigger
 * @description Queries Horizon trade history for a DEX pool and fires when
 *              the rolling 24-hour volume exceeds a configurable threshold.
 *
 * Roadmap item #48 / Issue #303.
 *
 * Design notes
 * ───────────────────────────────────────────────────────────────────────────
 * Horizon does not expose a single "pool volume" endpoint.  Volume is derived
 * by summing `base_amount` from all trades in the relevant liquidity pool
 * (or asset pair) over the last 24 hours via the `/trades` endpoint with a
 * `trade_type=liquidity_pool` filter.
 *
 * The class is designed for dependency injection:
 *   - `HorizonFetcher` is the only external I/O boundary; pass a mock in tests.
 *   - No network calls are made in the constructor.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** A raw trade record returned by the Horizon `/trades` endpoint. */
export interface HorizonTrade {
  /** ISO-8601 timestamp of when the trade was recorded. */
  ledger_close_time: string;
  /** Amount of the base asset exchanged, as a numeric string (e.g. "42.5000000"). */
  base_amount: string;
  /** Amount of the counter asset exchanged. */
  counter_amount: string;
  /** Identifies the trade as coming from a liquidity pool when set. */
  trade_type?: 'orderbook' | 'liquidity_pool';
}

/** Subset of the Horizon trades page response we care about. */
export interface HorizonTradesPage {
  _embedded: {
    records: HorizonTrade[];
  };
}

/**
 * Minimal HTTP fetcher interface.
 * Inject a real `fetch`-based implementation in production and a mock in tests.
 */
export interface HorizonFetcher {
  fetchTrades(url: string): Promise<HorizonTradesPage>;
}

/** Configuration passed to {@link VolumeTrigger.trackPoolVolume}. */
export interface VolumeTrackConfig {
  /** Stellar liquidity pool ID (56-char hex). */
  poolId: string;
  /**
   * Volume threshold in base-asset units (as a numeric string).
   * The trigger fires when 24-hour volume **exceeds** this value.
   */
  threshold24h: string;
}

/** Detailed result of a single volume check. */
export interface VolumeCheckResult {
  /** Whether the 24-hour volume exceeded the threshold. */
  triggered: boolean;
  /** Computed 24-hour volume in base-asset units. */
  volume24h: number;
  /** Threshold value that was evaluated against. */
  threshold: number;
  /** Number of trades included in the volume computation. */
  tradeCount: number;
  /** ISO-8601 timestamp of the check. */
  checkedAt: string;
}

/** Options for the `VolumeTrigger` constructor. */
export interface VolumeTriggerOptions {
  /** Horizon base URL. @default 'https://horizon.stellar.org' */
  horizonUrl?: string;
  /**
   * Rolling window in milliseconds used to filter trades.
   * @default 86_400_000 (24 hours)
   */
  windowMs?: number;
  /**
   * Maximum number of trades fetched per page from Horizon.
   * @default 200
   */
  pageLimit?: number;
}

// ── Default Horizon fetcher ───────────────────────────────────────────────────

/**
 * Production fetcher that calls the real Horizon REST API.
 * Separated from `VolumeTrigger` so it can be swapped in tests without
 * patching global `fetch`.
 */
export class DefaultHorizonFetcher implements HorizonFetcher {
  async fetchTrades(url: string): Promise<HorizonTradesPage> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Horizon request failed: ${response.status} ${response.statusText} — ${url}`,
      );
    }
    return response.json() as Promise<HorizonTradesPage>;
  }
}

// ── VolumeTrigger ─────────────────────────────────────────────────────────────

/**
 * Volume-based automation trigger for Stellar DEX liquidity pools.
 *
 * @example
 * ```ts
 * const trigger = new VolumeTrigger();
 *
 * // Fire when XLM/USDC pool volume exceeds 500,000 units in 24 h
 * const fired = await trigger.trackPoolVolume(
 *   'abc123...poolId',
 *   '500000',
 * );
 *
 * if (fired) {
 *   // rebalance liquidity, alert, etc.
 * }
 * ```
 */
export class VolumeTrigger {
  private readonly fetcher: HorizonFetcher;
  private readonly horizonUrl: string;
  private readonly windowMs: number;
  private readonly pageLimit: number;

  constructor(
    options: VolumeTriggerOptions = {},
    fetcher?: HorizonFetcher,
  ) {
    this.horizonUrl = options.horizonUrl ?? 'https://horizon.stellar.org';
    this.windowMs    = options.windowMs  ?? 86_400_000; // 24 h
    this.pageLimit   = options.pageLimit ?? 200;
    this.fetcher     = fetcher ?? new DefaultHorizonFetcher();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Query Horizon trade history for `poolId` and return `true` when the
   * rolling 24-hour volume exceeds `threshold24h`.
   *
   * This is the method named in the issue spec.
   *
   * @param poolId      Stellar liquidity pool ID.
   * @param threshold24h Volume threshold as a numeric string.
   */
  async trackPoolVolume(poolId: string, threshold24h: string): Promise<boolean> {
    const result = await this.check({ poolId, threshold24h });
    return result.triggered;
  }

  /**
   * Extended version of {@link trackPoolVolume} that returns full diagnostics.
   * Prefer this method when you need the computed volume or trade count.
   */
  async check(config: VolumeTrackConfig): Promise<VolumeCheckResult> {
    const threshold = Number(config.threshold24h);
    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new Error(
        `threshold24h must be a non-negative numeric string, got "${config.threshold24h}"`,
      );
    }

    if (!config.poolId || config.poolId.trim() === '') {
      throw new Error('poolId must be a non-empty string');
    }

    const trades   = await this.fetchRecentTrades(config.poolId);
    const volume24h = this.computeVolume(trades);

    return {
      triggered: volume24h > threshold,
      volume24h,
      threshold,
      tradeCount: trades.length,
      checkedAt: new Date().toISOString(),
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Fetch trades from Horizon for the given pool, filtered to the rolling
   * time window. Returns only trades within the configured `windowMs`.
   */
  private async fetchRecentTrades(poolId: string): Promise<HorizonTrade[]> {
    const url = this.buildTradesUrl(poolId);
    const page = await this.fetcher.fetchTrades(url);
    const records = page._embedded?.records ?? [];

    const cutoff = Date.now() - this.windowMs;

    return records.filter((trade) => {
      const tradeTime = new Date(trade.ledger_close_time).getTime();
      return Number.isFinite(tradeTime) && tradeTime >= cutoff;
    });
  }

  /**
   * Sum `base_amount` across all trades.
   * Non-numeric values are skipped gracefully (treated as 0).
   */
  private computeVolume(trades: HorizonTrade[]): number {
    return trades.reduce((sum, trade) => {
      const amount = parseFloat(trade.base_amount);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }

  /**
   * Build the Horizon `/trades` URL for a liquidity pool.
   * Uses `trade_type=liquidity_pool` so only AMM trades are counted,
   * and `order=desc` so the most recent trades come first.
   */
  private buildTradesUrl(poolId: string): string {
    const params = new URLSearchParams({
      liquidity_pool_id: poolId,
      trade_type: 'liquidity_pool',
      order: 'desc',
      limit: String(this.pageLimit),
    });
    return `${this.horizonUrl}/trades?${params.toString()}`;
  }
}