/**
 * @fileoverview TWAP window math
 * @description Pure segment-weighted TWAP calculation, mirroring the
 *   on-chain `compute_twap_window` in `packages/contracts/price-oracle/src/twap.rs`
 *   so that on-chain and off-chain results can be compared directly.
 */

export interface TwapObservation {
  price: number;
  timestamp: number; // epoch milliseconds
}

/**
 * Compute the time-weighted average price over `[windowStartMs, nowMs]`.
 *
 * For each observation, the weighted interval is the overlap between its
 * active range (`[observation.timestamp, nextObservation.timestamp_or_now]`)
 * and the requested window. An observation older than `windowStartMs` still
 * contributes for the portion of the window it was the latest known price —
 * this correctly handles gaps larger than the window between updates.
 *
 * Falls back to the mean of whichever observations fall inside the window
 * when every segment collapses to zero duration (e.g. a single observation,
 * or all observations sharing one timestamp); if none fall inside the
 * window either, falls back further to the most recent observation.
 */
export function computeTwapWindow(
  history: TwapObservation[],
  nowMs: number,
  windowStartMs: number
): number {
  if (history.length === 0) {
    throw new Error('Cannot compute TWAP over an empty price history');
  }

  let weightedSum = 0;
  let totalDuration = 0;

  for (let i = 0; i < history.length; i += 1) {
    const entry = history[i]!;
    const endTime = i + 1 < history.length ? history[i + 1]!.timestamp : nowMs;

    const segmentStart = Math.max(entry.timestamp, windowStartMs);
    const segmentEnd = Math.min(endTime, nowMs);
    const duration = Math.max(0, segmentEnd - segmentStart);

    weightedSum += entry.price * duration;
    totalDuration += duration;
  }

  if (totalDuration === 0) {
    const inWindow = history.filter(
      (entry) => entry.timestamp >= windowStartMs && entry.timestamp <= nowMs
    );
    if (inWindow.length > 0) {
      return inWindow.reduce((sum, entry) => sum + entry.price, 0) / inWindow.length;
    }
    return history[history.length - 1]!.price;
  }

  return weightedSum / totalDuration;
}
