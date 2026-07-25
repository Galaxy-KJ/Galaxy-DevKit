/**
 * @fileoverview twap-math tests
 * @description Mirrors the edge cases covered on-chain in
 *   packages/contracts/price-oracle/src/test.rs (empty buffer, single data
 *   point, large gaps, partial windows) so both implementations agree.
 */

import { computeTwapWindow, type TwapObservation } from '../../src/verification/twap-math.js';

describe('computeTwapWindow', () => {
  it('throws on an empty history', () => {
    expect(() => computeTwapWindow([], 1000, 0)).toThrow('empty price history');
  });

  it('degrades to the single price when only one observation is in the window', () => {
    const history: TwapObservation[] = [{ price: 1.5, timestamp: 1000 }];
    const twap = computeTwapWindow(history, 1000, 700); // window [700, 1000]
    expect(twap).toBe(1.5);
  });

  it('holds the last known price constant across a gap larger than the window', () => {
    const history: TwapObservation[] = [{ price: 1.0, timestamp: 0 }];
    const nowMs = 10_000;
    const windowMs = 300; // window [9700, 10000], far after the only observation
    const twap = computeTwapWindow(history, nowMs, nowMs - windowMs);
    expect(twap).toBe(1.0);
  });

  it('matches a plain average when window covers the full history with identical timestamps', () => {
    const history: TwapObservation[] = [
      { price: 1.0, timestamp: 500 },
      { price: 2.0, timestamp: 500 },
    ];
    const twap = computeTwapWindow(history, 500, 0);
    expect(twap).toBe(1.5);
  });

  it('excludes data before windowStart', () => {
    const history: TwapObservation[] = [
      { price: 1.0, timestamp: 0 },
      { price: 2.0, timestamp: 500 },
    ];
    const nowMs = 600;
    const windowStartMs = 550; // [550, 600] — entirely after the price changed to 2.0
    const twap = computeTwapWindow(history, nowMs, windowStartMs);
    expect(twap).toBe(2.0);
  });

  it('time-weights a partial-window overlap correctly', () => {
    const history: TwapObservation[] = [
      { price: 1.0, timestamp: 0 },
      { price: 2.0, timestamp: 500 },
    ];
    const nowMs = 500;
    const windowStartMs = 400; // [400, 500]: 100ms of price 1.0, 0ms of price 2.0
    const twap = computeTwapWindow(history, nowMs, windowStartMs);
    expect(twap).toBe(1.0);
  });
});
