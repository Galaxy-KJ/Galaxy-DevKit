/**
 * LP position model (#284).
 *
 * Companion to `il-calculator.ts`. Production wiring fills these from
 * the Soroswap pool analytics service (#272) and the price oracle
 * (#276) — both called out as deferred deps in the issue. This
 * module is intentionally a pure-type + small-builder surface so the
 * IL calculator stays consumer-agnostic.
 */

import type { LPEntrySnapshot, PriceSnapshot } from './il-calculator.js';

export interface LPPosition {
  poolId: string;
  /** Account or wallet that owns the LP shares. */
  owner: string;
  tokenA: { code: string; issuer?: string };
  tokenB: { code: string; issuer?: string };
  entry: LPEntrySnapshot;
  /** Latest spot prices at read time. */
  current: PriceSnapshot;
  /** Fees the position has accrued since entry, in USD. */
  feesAccruedUSD?: number;
}

/**
 * Lightweight builder so consumers can construct a position without
 * remembering every required field; intentionally minimal — extend
 * here when the oracle / pool analytics modules land their richer
 * record types.
 */
export function buildLPPosition(args: Omit<LPPosition, 'feesAccruedUSD'> & { feesAccruedUSD?: number }): LPPosition {
  return {
    feesAccruedUSD: 0,
    ...args,
  };
}
