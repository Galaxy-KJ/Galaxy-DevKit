/**
 * @fileoverview Harvest timing optimizer for auto-compounding strategies
 */

export interface HarvestOptimizerInput {
  /** Estimated yield earned since last harvest (same units as gas cost) */
  pendingYield: number;
  /** Estimated gas cost for one harvest + reinvest cycle */
  gasCost: number;
  /** Minimum net gain required to justify a harvest */
  minNetGain?: number;
  /** Milliseconds since the last harvest */
  elapsedMs: number;
  /** Minimum interval between harvests in milliseconds */
  minIntervalMs?: number;
  /** Maximum interval between harvests in milliseconds */
  maxIntervalMs?: number;
}

export interface HarvestOptimizerResult {
  shouldHarvest: boolean;
  netGain: number;
  nextHarvestInMs: number;
  reason: string;
}

const DEFAULT_MIN_NET_GAIN = 0;
const DEFAULT_MIN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_MAX_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Decide whether harvesting is net-profitable and estimate the next optimal window.
 */
export function optimizeHarvestTiming(input: HarvestOptimizerInput): HarvestOptimizerResult {
  const minNetGain = input.minNetGain ?? DEFAULT_MIN_NET_GAIN;
  const minIntervalMs = input.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const maxIntervalMs = input.maxIntervalMs ?? DEFAULT_MAX_INTERVAL_MS;

  const netGain = input.pendingYield - input.gasCost;
  const elapsed = Math.max(0, input.elapsedMs);

  if (elapsed < minIntervalMs) {
    return {
      shouldHarvest: false,
      netGain,
      nextHarvestInMs: minIntervalMs - elapsed,
      reason: 'Minimum harvest interval not reached',
    };
  }

  if (netGain > minNetGain) {
    const yieldRatePerMs = input.pendingYield / Math.max(elapsed, 1);
    const msUntilProfitable = yieldRatePerMs > 0
      ? Math.ceil((input.gasCost + minNetGain) / yieldRatePerMs)
      : maxIntervalMs;

    return {
      shouldHarvest: true,
      netGain,
      nextHarvestInMs: Math.min(Math.max(msUntilProfitable, minIntervalMs), maxIntervalMs),
      reason: 'Net gain exceeds threshold',
    };
  }

  const remainingToBreakEven = input.gasCost + minNetGain - input.pendingYield;
  const yieldRatePerMs = input.pendingYield / Math.max(elapsed, 1);
  const nextHarvestInMs = yieldRatePerMs > 0
    ? Math.min(Math.ceil(remainingToBreakEven / yieldRatePerMs), maxIntervalMs)
    : maxIntervalMs;

  return {
    shouldHarvest: false,
    netGain,
    nextHarvestInMs: Math.max(nextHarvestInMs, minIntervalMs),
    reason: 'Pending yield does not cover gas cost yet',
  };
}

export function estimateCompoundedApy(
  baseApyPercent: number,
  harvestsPerYear: number,
): number {
  if (baseApyPercent <= 0 || harvestsPerYear <= 0) return 0;
  const rate = baseApyPercent / 100;
  return (Math.pow(1 + rate / harvestsPerYear, harvestsPerYear) - 1) * 100;
}
