/**
 * yield-calculator tests (#300, roadmap #45).
 *
 * Covers APR↔APY conversions across compounding frequencies, LP fee yield,
 * compounded value projection, the stateful YieldCalculator wrapper, and
 * input validation / edge cases. Pure math — no network.
 */

import {
  aprToApy,
  apyToApr,
  continuousApy,
  aprToApyByFrequency,
  calculateLpYield,
  calculateLpApy,
  projectCompoundedValue,
  periodsForFrequency,
  CompoundingFrequency,
  YieldCalculator,
  LEDGER_CLOSE_SECONDS,
} from '../../src/utils/yield-calculator';

describe('aprToApy (#300)', () => {
  it('equals APR when compounded once a year (periods = 1)', () => {
    expect(aprToApy(10, 1)).toBeCloseTo(10, 9);
  });

  it('matches the standard (1 + r/n)^n − 1 for daily compounding', () => {
    // (1 + 0.10/365)^365 − 1 ≈ 10.5155%
    expect(aprToApy(10, 365)).toBeCloseTo(10.5155, 3);
  });

  it('monthly < daily < continuous for the same APR', () => {
    const monthly = aprToApy(10, 12);
    const daily = aprToApy(10, 365);
    const cont = continuousApy(10);
    expect(monthly).toBeLessThan(daily);
    expect(daily).toBeLessThan(cont);
    expect(monthly).toBeCloseTo(10.4713, 3);
  });

  it('returns 0 for a 0% APR', () => {
    expect(aprToApy(0, 365)).toBe(0);
  });

  it('handles fractional percentages without losing precision', () => {
    // 0.5% APR, daily compounding — must stay > APR but tiny.
    const apy = aprToApy(0.5, 365);
    expect(apy).toBeGreaterThan(0.5);
    expect(apy).toBeCloseTo(0.50125, 4);
  });

  it('supports per-ledger compounding (millions of periods) ≈ continuous', () => {
    const perLedger = aprToApy(10, periodsForFrequency(CompoundingFrequency.PerLedger));
    expect(perLedger).toBeCloseTo(continuousApy(10), 4);
  });

  it('throws on non-positive periods', () => {
    expect(() => aprToApy(10, 0)).toThrow(/periods/);
    expect(() => aprToApy(10, -5)).toThrow(/periods/);
  });

  it('throws on a non-finite APR', () => {
    expect(() => aprToApy(NaN, 365)).toThrow(/apr/);
    expect(() => aprToApy(Infinity, 365)).toThrow(/apr/);
  });
});

describe('apyToApr (#300)', () => {
  it('is the inverse of aprToApy (round-trips)', () => {
    const apr = 12.5;
    const apy = aprToApy(apr, 365);
    expect(apyToApr(apy, 365)).toBeCloseTo(apr, 4);
  });

  it('equals APY when periods = 1 (n === 1 path)', () => {
    expect(apyToApr(10, 1)).toBeCloseTo(10, 9);
  });

  it('uses the sqrt path for periods = 2 and stays consistent', () => {
    const apr = apyToApr(21, 2); // (1.21)^(1/2) = 1.1 → 2*(0.1) = 20%
    expect(apr).toBeCloseTo(20, 6);
  });

  it('returns 0 for a 0% APY', () => {
    expect(apyToApr(0, 12)).toBe(0);
  });

  it('throws when APY ≤ -100%', () => {
    expect(() => apyToApr(-150, 12)).toThrow(/greater than -100/);
  });

  it('throws on invalid inputs', () => {
    expect(() => apyToApr(NaN, 12)).toThrow(/apy/);
    expect(() => apyToApr(10, 0)).toThrow(/periods/);
  });
});

describe('continuousApy (#300)', () => {
  it('computes e^r − 1', () => {
    // e^0.10 − 1 ≈ 10.5171%
    expect(continuousApy(10)).toBeCloseTo(10.5171, 3);
  });

  it('returns 0 for 0% and stays precise for tiny rates', () => {
    expect(continuousApy(0)).toBe(0);
    expect(continuousApy(0.01)).toBeCloseTo(0.0100005, 6);
  });

  it('throws on non-finite input', () => {
    expect(() => continuousApy(NaN)).toThrow(/apr/);
  });
});

describe('aprToApyByFrequency (#300)', () => {
  it('delegates to continuousApy for the continuous case', () => {
    expect(aprToApyByFrequency(10, CompoundingFrequency.Continuous)).toBeCloseTo(continuousApy(10), 9);
  });

  it('matches aprToApy(_, 365) for daily', () => {
    expect(aprToApyByFrequency(10, CompoundingFrequency.Daily)).toBeCloseTo(aprToApy(10, 365), 9);
  });

  it('matches aprToApy(_, 8760) for hourly', () => {
    expect(aprToApyByFrequency(10, CompoundingFrequency.Hourly)).toBeCloseTo(aprToApy(10, 365 * 24), 9);
  });
});

describe('calculateLpYield (#300)', () => {
  it('annualises daily fees over TVL', () => {
    // 1M volume * 0.30% fee = 3000/day; /10M TVL * 365 * 100 = 10.95%
    expect(calculateLpYield(1_000_000, 10_000_000, 0.003)).toBeCloseTo(10.95, 6);
  });

  it('returns 0 when there is no volume', () => {
    expect(calculateLpYield(0, 10_000_000, 0.003)).toBe(0);
  });

  it('scales linearly with volume', () => {
    const a = calculateLpYield(1_000_000, 10_000_000, 0.003);
    const b = calculateLpYield(2_000_000, 10_000_000, 0.003);
    expect(b).toBeCloseTo(a * 2, 6);
  });

  it('throws on non-positive TVL', () => {
    expect(() => calculateLpYield(1000, 0, 0.003)).toThrow(/tvl/);
    expect(() => calculateLpYield(1000, -1, 0.003)).toThrow(/tvl/);
  });

  it('throws on negative volume or fee', () => {
    expect(() => calculateLpYield(-1, 100, 0.003)).toThrow(/volume24h/);
    expect(() => calculateLpYield(1000, 100, -0.001)).toThrow(/fee/);
  });
});

describe('calculateLpApy (#300)', () => {
  it('compounds the fee APR (default daily) above the simple APR', () => {
    const apr = calculateLpYield(1_000_000, 10_000_000, 0.003);
    const apy = calculateLpApy(1_000_000, 10_000_000, 0.003);
    expect(apy).toBeGreaterThan(apr);
  });

  it('respects an explicit frequency', () => {
    const annually = calculateLpApy(1_000_000, 10_000_000, 0.003, CompoundingFrequency.Annually);
    expect(annually).toBeCloseTo(calculateLpYield(1_000_000, 10_000_000, 0.003), 6);
  });
});

describe('projectCompoundedValue (#300)', () => {
  it('computes annual future value and interest', () => {
    const r = projectCompoundedValue(1000, 10, CompoundingFrequency.Annually, 1);
    expect(r.futureValue).toBeCloseTo(1100, 6);
    expect(r.interestEarned).toBeCloseTo(100, 6);
  });

  it('compounds across multiple years', () => {
    const r = projectCompoundedValue(1000, 10, CompoundingFrequency.Annually, 2);
    expect(r.futureValue).toBeCloseTo(1210, 6); // 1000 * 1.1^2
  });

  it('supports continuous compounding (P·e^{r·t})', () => {
    const r = projectCompoundedValue(1000, 10, CompoundingFrequency.Continuous, 1);
    expect(r.futureValue).toBeCloseTo(1105.1709, 3);
  });

  it('returns the principal unchanged over a 0-year horizon', () => {
    const r = projectCompoundedValue(1000, 10, CompoundingFrequency.Daily, 0);
    expect(r.futureValue).toBeCloseTo(1000, 6);
    expect(r.interestEarned).toBeCloseTo(0, 6);
  });

  it('preserves precision on large balances passed as strings', () => {
    const r = projectCompoundedValue('1000000000', 5, CompoundingFrequency.Annually, 1);
    expect(r.futureValue).toBeCloseTo(1_050_000_000, 2);
  });

  it('throws on negative principal or years', () => {
    expect(() => projectCompoundedValue(-1, 10, CompoundingFrequency.Daily, 1)).toThrow(/principal/);
    expect(() => projectCompoundedValue(1000, 10, CompoundingFrequency.Daily, -1)).toThrow(/years/);
  });
});

describe('periodsForFrequency (#300)', () => {
  it('returns Infinity for continuous', () => {
    expect(periodsForFrequency(CompoundingFrequency.Continuous)).toBe(Infinity);
  });

  it('returns the expected period counts', () => {
    expect(periodsForFrequency(CompoundingFrequency.Annually)).toBe(1);
    expect(periodsForFrequency(CompoundingFrequency.Quarterly)).toBe(4);
    expect(periodsForFrequency(CompoundingFrequency.Monthly)).toBe(12);
    expect(periodsForFrequency(CompoundingFrequency.Daily)).toBe(365);
    expect(periodsForFrequency(CompoundingFrequency.Hourly)).toBe(8760);
    expect(periodsForFrequency(CompoundingFrequency.PerLedger)).toBe(
      Math.floor((365 * 24 * 60 * 60) / LEDGER_CLOSE_SECONDS),
    );
  });
});

describe('YieldCalculator (#300)', () => {
  it('rounds to the configured number of decimals', () => {
    const calc = new YieldCalculator({ decimals: 4 });
    expect(calc.aprToApy(10, 365)).toBe(10.5156);
  });

  it('defaults to 8 decimals and exposes the full API', () => {
    const calc = new YieldCalculator();
    expect(calc.apyToApr(calc.aprToApy(10, 365), 365)).toBeCloseTo(10, 4);
    expect(calc.continuousApy(10)).toBeCloseTo(10.5171, 3);
    expect(calc.aprToApyByFrequency(10, CompoundingFrequency.Daily)).toBeCloseTo(10.5155, 3);
    expect(calc.calculateLpYield(1_000_000, 10_000_000, 0.003)).toBeCloseTo(10.95, 4);
    expect(calc.calculateLpApy(1_000_000, 10_000_000, 0.003)).toBeGreaterThan(10.95);
  });

  it('rounds projection results too', () => {
    const calc = new YieldCalculator({ decimals: 2 });
    const r = calc.projectCompoundedValue(1000, 10, CompoundingFrequency.Continuous, 1);
    expect(r.futureValue).toBe(1105.17);
  });
});
