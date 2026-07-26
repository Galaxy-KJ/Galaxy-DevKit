/**
 * @fileoverview On-chain TWAP integrity verifier
 * @description Independently recomputes the TWAP from raw on-chain price
 *   history and compares it against the contract's own `get_twap_window`
 *   result, to detect a manipulated or diverging on-chain value.
 */

import { OnChainOracleSource } from '../sources/real/OnChainOracleSource.js';
import { computeTwapWindow, type TwapObservation } from './twap-math.js';

export interface TwapVerificationResult {
  /** `true` when the on-chain and recomputed TWAP agree within `toleranceBps`. */
  matches: boolean;
  /** TWAP as reported by the contract's `get_twap_window`. */
  onChainTwap: number;
  /** TWAP recomputed off-chain from the raw price history. */
  recomputedTwap: number;
  /** Absolute difference between the two values, in basis points. */
  diffBps: number;
  /** Raw price history used for the recomputation. */
  history: TwapObservation[];
}

/** Default tolerance: 0.10%, to absorb the small clock skew between the
 * ledger timestamp used on-chain and the wall-clock time read here. */
const DEFAULT_TOLERANCE_BPS = 10;

/**
 * Verify that `source`'s on-chain TWAP over `windowSeconds` matches an
 * independent off-chain recomputation from the same raw history.
 *
 * Throws if the pair has no on-chain price history at all.
 */
export async function verifyOnChainTwap(
  source: OnChainOracleSource,
  symbol: string,
  windowSeconds: number,
  toleranceBps: number = DEFAULT_TOLERANCE_BPS
): Promise<TwapVerificationResult> {
  const [rawHistory, onChainTwap] = await Promise.all([
    source.getPriceHistory(symbol),
    source.getTwapWindow(symbol, windowSeconds),
  ]);

  if (rawHistory.length === 0) {
    throw new Error(`Cannot verify TWAP for ${symbol}: on-chain price history is empty`);
  }

  const history: TwapObservation[] = rawHistory.map((entry) => ({
    price: entry.price,
    timestamp: entry.timestamp.getTime(),
  }));

  const nowMs = Date.now();
  const windowStartMs = nowMs - windowSeconds * 1000;
  const recomputedTwap = computeTwapWindow(history, nowMs, windowStartMs);

  const diffBps =
    onChainTwap === 0
      ? recomputedTwap === 0
        ? 0
        : Number.POSITIVE_INFINITY
      : (Math.abs(recomputedTwap - onChainTwap) / Math.abs(onChainTwap)) * 10_000;

  return {
    matches: diffBps <= toleranceBps,
    onChainTwap,
    recomputedTwap,
    diffBps,
    history,
  };
}
