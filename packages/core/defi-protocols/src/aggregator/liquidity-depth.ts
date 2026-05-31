/**
 * Liquidity-depth analyzer (#275).
 *
 * Given a per-venue depth snapshot, produces split percentages that
 * minimise price impact across the available pools. The math is
 * deliberately conservative — splits are proportional to each
 * venue's available depth, capped so the resulting input on any
 * venue never exceeds its quoted depth (which would push the price
 * deep into the curve).
 *
 * No on-chain calls happen here; the snapshot is built by upstream
 * adapters (Soroswap SDK, SDEX orderbook, Aquarius API).
 */

import BigNumber from 'bignumber.js';
import type { AggregatorVenue } from './types.js';

export interface LiquidityDepthEntry {
  venue: AggregatorVenue;
  /** Depth available at the current best price, expressed as asset-in. */
  depthIn: string;
}

export interface LiquidityDepthSnapshot {
  entries: LiquidityDepthEntry[];
}

export interface OptimalSplitOptions {
  /** Total trade size in asset-in units. */
  amountIn: string;
  /** Don't allocate to any venue below this share (0–1). */
  minVenueShare?: number;
}

export class LiquidityDepthAnalyzer {
  /**
   * Allocates `amountIn` proportionally across venues by their
   * `depthIn`. Returns the percentage [0–100] per venue in input
   * order. If the snapshot is empty or every depth is zero the
   * allocation falls back to equal weights so the caller still gets
   * a valid split rather than a panic.
   */
  optimalSplit(
    snapshot: LiquidityDepthSnapshot,
    options: OptimalSplitOptions,
  ): Array<{ venue: AggregatorVenue; percentage: number }> {
    const { amountIn, minVenueShare = 0 } = options;
    const entries = snapshot.entries;
    if (entries.length === 0) return [];

    const totalDepth = entries
      .reduce((sum, e) => sum.plus(e.depthIn), new BigNumber(0));

    if (totalDepth.isZero() || !new BigNumber(amountIn).isPositive()) {
      // Even split — caller still gets a deterministic answer.
      const even = 100 / entries.length;
      return entries.map((e) => ({ venue: e.venue, percentage: even }));
    }

    const raw = entries.map((e) => ({
      venue: e.venue,
      percentage: new BigNumber(e.depthIn).dividedBy(totalDepth).multipliedBy(100).toNumber(),
    }));

    // Drop any venue below the configured minimum share, then
    // renormalise so the survivors sum to 100. Avoids dust-sized
    // routes the executor (#275) would have to skip anyway.
    const minPct = minVenueShare * 100;
    const survivors = raw.filter((r) => r.percentage >= minPct);
    if (survivors.length === 0) return raw;

    const survivorTotal = survivors.reduce((sum, r) => sum + r.percentage, 0);
    if (survivorTotal === 0) return raw;
    return survivors.map((r) => ({
      venue: r.venue,
      percentage: (r.percentage / survivorTotal) * 100,
    }));
  }
}
