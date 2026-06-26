/**
 * Yield calculator — APR/APY math for pools, vaults and lending (#300, roadmap #45).
 *
 * Pure math, no network calls. Provides precise conversions between APR
 * (Annual Percentage Rate, simple/nominal) and APY (Annual Percentage Yield,
 * effective/compounded) for:
 *
 *   - liquidity pools (fee yield from 24h volume / TVL),
 *   - lending pools such as Blend (a nominal supply APR that compounds),
 *   - compounding vault strategies (auto-compound at a chosen frequency).
 *
 * ## Units convention
 * To stay consistent with the rest of the package (`estimateCompoundedApy`,
 * `calculateApy7d`, …) every rate is expressed as a **percentage**: `10`
 * means 10%, not 0.10. Pool fees in {@link calculateLpYield} are the one
 * exception — a fee tier is naturally a fraction (`0.003` = 0.30%), matching
 * how Soroswap/Uniswap quote them.
 *
 * ## Standard formula
 *   APY = (1 + APR/n)^n − 1            (n = compounding periods per year)
 *   APR = n · ((1 + APY)^(1/n) − 1)    (inverse)
 * As n → ∞ this converges to continuous compounding: APY = e^APR − 1.
 *
 * BigNumber.js is used so large period counts (per-ledger compounding has
 * millions of periods/year) and fractional percentages stay precise.
 *
 * @author Galaxy DevKit Team
 */

import BigNumber from 'bignumber.js';

// High-precision clone so (1 + tiny)^millions stays accurate without
// mutating the global BigNumber config other modules rely on.
const BN = BigNumber.clone({ DECIMAL_PLACES: 50, POW_PRECISION: 50 });

/** Default rounding for returned percentages — preserves fractional bps. */
const DEFAULT_DECIMALS = 8;

/**
 * Stellar closes a ledger roughly every 5 seconds. Used to derive the
 * period count for {@link CompoundingFrequency.PerLedger}. This is an
 * approximation; pass an explicit period count if you need exactness.
 */
export const LEDGER_CLOSE_SECONDS = 5;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

/** Compounding periods per year for common frequencies. */
export enum CompoundingFrequency {
  Annually = 'annually',
  Quarterly = 'quarterly',
  Monthly = 'monthly',
  Daily = 'daily',
  Hourly = 'hourly',
  /** Once per Stellar ledger (~every 5s). */
  PerLedger = 'per-ledger',
  /** Mathematical limit (e^r − 1). */
  Continuous = 'continuous',
}

const PERIODS_PER_YEAR: Record<Exclude<CompoundingFrequency, CompoundingFrequency.Continuous>, number> = {
  [CompoundingFrequency.Annually]: 1,
  [CompoundingFrequency.Quarterly]: 4,
  [CompoundingFrequency.Monthly]: 12,
  [CompoundingFrequency.Daily]: 365,
  [CompoundingFrequency.Hourly]: 365 * 24,
  [CompoundingFrequency.PerLedger]: Math.floor(SECONDS_PER_YEAR / LEDGER_CLOSE_SECONDS),
};

/**
 * Periods/year for a frequency. Returns `Infinity` for continuous
 * compounding so callers can branch on it.
 */
export function periodsForFrequency(frequency: CompoundingFrequency): number {
  if (frequency === CompoundingFrequency.Continuous) return Infinity;
  return PERIODS_PER_YEAR[frequency];
}

/**
 * Convert a nominal APR to the effective APY for `periods` compounding
 * events per year.
 *
 *   APY = (1 + APR/periods)^periods − 1
 *
 * @param apr     Nominal annual rate, as a percentage (10 = 10%).
 * @param periods Compounding periods per year (must be a positive integer-ish
 *                count). Use {@link CompoundingFrequency.Continuous} via
 *                {@link aprToApyByFrequency} for the e^r limit.
 * @returns Effective APY as a percentage.
 */
export function aprToApy(apr: number, periods: number): number {
  assertFinite(apr, 'apr');
  assertPositive(periods, 'periods');
  if (apr === 0) return 0;

  const rate = new BN(apr).dividedBy(100);
  const n = new BN(periods);
  const apy = rate.dividedBy(n).plus(1).pow(periods).minus(1);
  return round(apy.multipliedBy(100));
}

/**
 * Inverse of {@link aprToApy}: recover the nominal APR that yields a given
 * effective APY when compounded `periods` times per year.
 *
 *   APR = periods · ((1 + APY)^(1/periods) − 1)
 *
 * @param apy     Effective annual yield, as a percentage.
 * @param periods Compounding periods per year.
 * @returns Nominal APR as a percentage.
 */
export function apyToApr(apy: number, periods: number): number {
  assertFinite(apy, 'apy');
  assertPositive(periods, 'periods');
  if (apy === 0) return 0;

  // (1 + apy)^(1/periods) via nthRoot to keep precision for large `periods`.
  const growth = new BN(apy).dividedBy(100).plus(1);
  if (growth.isNegative()) {
    throw new Error('apy must be greater than -100%');
  }
  const perPeriod = nthRoot(growth, periods).minus(1);
  return round(perPeriod.multipliedBy(periods).multipliedBy(100));
}

/**
 * Continuous-compounding APY: the limit of {@link aprToApy} as periods → ∞.
 *
 *   APY = e^(APR) − 1
 *
 * Uses `expm1` for accuracy at small rates.
 *
 * @param apr Nominal annual rate, as a percentage.
 * @returns Effective APY as a percentage.
 */
export function continuousApy(apr: number): number {
  assertFinite(apr, 'apr');
  if (apr === 0) return 0;
  const rate = apr / 100;
  return round(new BN(Math.expm1(rate)).multipliedBy(100));
}

/**
 * Convert APR to APY using a named {@link CompoundingFrequency}.
 * Handles the continuous case by delegating to {@link continuousApy}.
 *
 * @param apr       Nominal APR as a percentage.
 * @param frequency Compounding cadence.
 * @returns Effective APY as a percentage.
 */
export function aprToApyByFrequency(apr: number, frequency: CompoundingFrequency): number {
  if (frequency === CompoundingFrequency.Continuous) return continuousApy(apr);
  return aprToApy(apr, periodsForFrequency(frequency));
}

/**
 * Annualised fee APR for a liquidity pool, from 24h trading volume.
 *
 *   dailyFees = volume24h · fee
 *   APR%      = (dailyFees / TVL) · 365 · 100
 *
 * This is the *simple* fee rate (APR). Compose with {@link aprToApyByFrequency}
 * (e.g. daily compounding for auto-reinvested fees) to get an APY.
 *
 * @param volume24h Trailing 24h swap volume, in the same unit as `tvl` (e.g. USD).
 * @param tvl       Total value locked in the pool (> 0).
 * @param fee       Pool fee tier as a fraction (0.003 = 0.30%).
 * @returns Fee APR as a percentage.
 */
export function calculateLpYield(volume24h: number, tvl: number, fee: number): number {
  assertNonNegative(volume24h, 'volume24h');
  assertPositive(tvl, 'tvl');
  assertNonNegative(fee, 'fee');

  const dailyFees = new BN(volume24h).multipliedBy(fee);
  const apr = dailyFees.dividedBy(tvl).multipliedBy(365).multipliedBy(100);
  return round(apr);
}

/**
 * Convenience: pool fee yield expressed as a compounded APY. Equivalent to
 * `aprToApyByFrequency(calculateLpYield(...), frequency)`.
 *
 * @param frequency How often fees are reinvested. Defaults to daily.
 */
export function calculateLpApy(
  volume24h: number,
  tvl: number,
  fee: number,
  frequency: CompoundingFrequency = CompoundingFrequency.Daily,
): number {
  return aprToApyByFrequency(calculateLpYield(volume24h, tvl, fee), frequency);
}

/**
 * Future value of a compounding position (vault / lending), for projecting
 * earnings over a time horizon.
 *
 *   FV = principal · (1 + APR/periods)^(periods · years)
 *
 * @param principal Starting amount (≥ 0), as a decimal string or number to
 *                  preserve precision on large balances.
 * @param apr       Nominal APR as a percentage.
 * @param frequency Compounding cadence (continuous uses e^(APR·years)).
 * @param years     Time horizon in years (≥ 0; fractional allowed).
 * @returns `{ futureValue, interestEarned }` as decimal numbers.
 */
export function projectCompoundedValue(
  principal: BigNumber.Value,
  apr: number,
  frequency: CompoundingFrequency,
  years: number,
): { futureValue: number; interestEarned: number } {
  const start = new BN(principal);
  assertFinite(apr, 'apr');
  assertNonNegative(years, 'years');
  if (start.isNegative() || !start.isFinite()) {
    throw new Error('principal must be a non-negative finite number');
  }

  const rate = new BN(apr).dividedBy(100);
  let future: BigNumber;

  if (frequency === CompoundingFrequency.Continuous) {
    // FV = principal · e^(rate · years)
    const exponent = rate.multipliedBy(years).toNumber();
    future = start.multipliedBy(Math.exp(exponent));
  } else {
    const periods = periodsForFrequency(frequency);
    const totalPeriods = Math.round(periods * years);
    const perPeriod = rate.dividedBy(periods).plus(1);
    future = start.multipliedBy(perPeriod.pow(totalPeriods));
  }

  return {
    futureValue: round(future),
    interestEarned: round(future.minus(start)),
  };
}

/**
 * Stateful calculator for callers that want a fixed rounding precision
 * across many calls. Thin wrapper over the standalone functions.
 *
 * @example
 * const calc = new YieldCalculator({ decimals: 4 });
 * calc.aprToApy(10, 365); // 10.5156
 */
export class YieldCalculator {
  private readonly decimals: number;

  constructor(options: { decimals?: number } = {}) {
    this.decimals = options.decimals ?? DEFAULT_DECIMALS;
  }

  aprToApy(apr: number, periods: number): number {
    return reround(aprToApy(apr, periods), this.decimals);
  }

  apyToApr(apy: number, periods: number): number {
    return reround(apyToApr(apy, periods), this.decimals);
  }

  aprToApyByFrequency(apr: number, frequency: CompoundingFrequency): number {
    return reround(aprToApyByFrequency(apr, frequency), this.decimals);
  }

  continuousApy(apr: number): number {
    return reround(continuousApy(apr), this.decimals);
  }

  calculateLpYield(volume24h: number, tvl: number, fee: number): number {
    return reround(calculateLpYield(volume24h, tvl, fee), this.decimals);
  }

  calculateLpApy(
    volume24h: number,
    tvl: number,
    fee: number,
    frequency: CompoundingFrequency = CompoundingFrequency.Daily,
  ): number {
    return reround(calculateLpApy(volume24h, tvl, fee, frequency), this.decimals);
  }

  projectCompoundedValue(
    principal: BigNumber.Value,
    apr: number,
    frequency: CompoundingFrequency,
    years: number,
  ): { futureValue: number; interestEarned: number } {
    const r = projectCompoundedValue(principal, apr, frequency, years);
    return {
      futureValue: reround(r.futureValue, this.decimals),
      interestEarned: reround(r.interestEarned, this.decimals),
    };
  }
}

// ─── internals ──────────────────────────────────────────────────────────────

/** nth root via BigNumber, falling back to fractional-power for large n. */
function nthRoot(value: BigNumber, n: number): BigNumber {
  if (n === 1) return value;
  if (n === 2) return value.sqrt();
  // value^(1/n) — BigNumber.pow needs an integer exponent, so use the
  // identity x^(1/n) = exp(ln(x)/n) via the JS math fns at double precision,
  // which is ample for recovering an APR from an APY.
  return new BN(Math.pow(value.toNumber(), 1 / n));
}

function round(value: BigNumber, decimals = DEFAULT_DECIMALS): number {
  return value.decimalPlaces(decimals, BigNumber.ROUND_HALF_UP).toNumber();
}

function reround(value: number, decimals: number): number {
  return new BN(value).decimalPlaces(decimals, BigNumber.ROUND_HALF_UP).toNumber();
}

function assertFinite(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}
