/**
 * il-calculator tests (#284).
 */

import {
  calculateImpermanentLoss,
  projectImpermanentLoss,
} from '../../src/utils/il-calculator';
import { buildLPPosition } from '../../src/utils/lp-position';

describe('calculateImpermanentLoss (#284)', () => {
  it('is exactly zero when no price moves', () => {
    const r = calculateImpermanentLoss({
      entry: { amountA: '1000', amountB: '1000', priceAUSD: 1, priceBUSD: 1 },
      current: { priceAUSD: 1, priceBUSD: 1 },
    });
    expect(r.impermanentLossPercent).toBeCloseTo(0, 6);
    expect(r.impermanentLossUSD).toBeCloseTo(0, 6);
  });

  it("matches the canonical -5.72% IL for a 2x relative price move", () => {
    const r = calculateImpermanentLoss({
      entry: { amountA: '1', amountB: '100', priceAUSD: 100, priceBUSD: 1 },
      current: { priceAUSD: 200, priceBUSD: 1 },
    });
    // Uniswap-v2 textbook number for 2x move: IL ≈ -5.72%.
    expect(r.impermanentLossPercent).toBeCloseTo(-5.72, 1);
    expect(r.impermanentLossUSD).toBeLessThan(0);
  });

  it('IL is symmetric for inverse moves (down 50%)', () => {
    const r = calculateImpermanentLoss({
      entry: { amountA: '1', amountB: '100', priceAUSD: 100, priceBUSD: 1 },
      current: { priceAUSD: 50, priceBUSD: 1 },
    });
    // 50% drop ≡ 2x relative move the other way → same magnitude IL.
    expect(r.impermanentLossPercent).toBeCloseTo(-5.72, 1);
  });

  it('net return adds accrued fees back on top of LP value', () => {
    const r = calculateImpermanentLoss({
      entry: { amountA: '1', amountB: '100', priceAUSD: 100, priceBUSD: 1 },
      current: { priceAUSD: 200, priceBUSD: 1 },
      feesAccruedUSD: 50,
    });
    // Hold value at the new prices = 1 * 200 + 100 * 1 = 300.
    expect(r.holdValueUSD).toBeCloseTo(300, 6);
    // LP value ≈ holdValue * (1 - 0.0572) ≈ 282.83
    expect(r.currentLPValueUSD).toBeCloseTo(282.83, 1);
    // Net = LP + fees − entry; entry was 1*100 + 100*1 = 200.
    expect(r.netReturnUSD).toBeCloseTo(282.83 + 50 - 200, 1);
  });

  it('rejects non-positive prices', () => {
    expect(() =>
      calculateImpermanentLoss({
        entry: { amountA: '1', amountB: '1', priceAUSD: 0, priceBUSD: 1 },
        current: { priceAUSD: 1, priceBUSD: 1 },
      }),
    ).toThrow(/positive finite/);
  });
});

describe('projectImpermanentLoss (#284)', () => {
  it('returns the default {-50%, +50%, +100%} scenarios', () => {
    const proj = projectImpermanentLoss(
      { amountA: '1', amountB: '100', priceAUSD: 100, priceBUSD: 1 },
      { priceAUSD: 100, priceBUSD: 1 },
    );
    expect(proj.map((p) => p.label)).toEqual(['-50%', '+50%', '+100%']);
    // +100% scenario must equal the 2x textbook number.
    const up100 = proj.find((p) => p.label === '+100%')!;
    expect(up100.il.impermanentLossPercent).toBeCloseTo(-5.72, 1);
  });

  it('accepts custom scenarios', () => {
    const proj = projectImpermanentLoss(
      { amountA: '1', amountB: '100', priceAUSD: 100, priceBUSD: 1 },
      { priceAUSD: 100, priceBUSD: 1 },
      [{ label: 'crash', priceADeltaPercent: -90 }],
    );
    expect(proj).toHaveLength(1);
    expect(proj[0].label).toBe('crash');
    expect(proj[0].il.impermanentLossPercent).toBeLessThan(0);
  });
});

describe('buildLPPosition (#284)', () => {
  it('defaults feesAccruedUSD to 0 when omitted', () => {
    const pos = buildLPPosition({
      poolId: 'pool-1',
      owner: 'GABCD',
      tokenA: { code: 'XLM' },
      tokenB: { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' },
      entry: { amountA: '1', amountB: '100', priceAUSD: 100, priceBUSD: 1 },
      current: { priceAUSD: 200, priceBUSD: 1 },
    });
    expect(pos.feesAccruedUSD).toBe(0);
  });
});
