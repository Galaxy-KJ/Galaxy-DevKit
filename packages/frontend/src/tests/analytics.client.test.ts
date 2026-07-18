import {
  buildBlendRow,
  buildSoroswapRow,
  totalValue,
  allocation,
  simulatedCostBasisPnl,
} from '../services/analytics.client';

describe('buildBlendRow', () => {
  it('derives net value, health factor and apy when present', () => {
    const row = buildBlendRow({
      collateralValue: '150',
      debtValue: '50',
      healthFactor: '1.8',
      supplyAPY: '4.20',
    });

    expect(row).toEqual({
      protocol: 'Blend',
      type: 'Lending',
      value: 100,
      healthFactor: 1.8,
      apy: '4.20',
    });
  });

  it('marks apy unavailable when the backend omits it', () => {
    const row = buildBlendRow({ collateralValue: '150', debtValue: '50', healthFactor: '1.8' });
    expect(row.apy).toBeNull();
  });

  it('falls back to supplied values when collateral is absent', () => {
    const row = buildBlendRow({ supplied: [{ amount: '10', valueUSD: '30' }, { amount: '5', valueUSD: '20' }] });
    expect(row.value).toBe(50);
    expect(row.healthFactor).toBeNull();
  });
});

describe('buildSoroswapRow', () => {
  it('maps a liquidity position with fee apr', () => {
    const row = buildSoroswapRow({ poolLabel: 'XLM/USDC', valueUSD: 42, feeApr: 3.5 });
    expect(row).toEqual({
      protocol: 'Soroswap',
      type: 'Liquidity Pool',
      value: 42,
      healthFactor: null,
      apy: '3.50%',
    });
  });

  it('marks apy unavailable without a fee apr', () => {
    const row = buildSoroswapRow({ poolLabel: 'XLM/USDC', valueUSD: 42 });
    expect(row.apy).toBeNull();
  });
});

describe('aggregation', () => {
  const rows = [
    buildBlendRow({ collateralValue: '100', debtValue: '0' }),
    buildSoroswapRow({ poolLabel: 'XLM/USDC', valueUSD: 50 }),
  ];

  it('sums the total value across protocols', () => {
    expect(totalValue(rows)).toBe(150);
  });

  it('breaks allocation down by protocol', () => {
    expect(allocation(rows)).toEqual([
      { label: 'Blend', value: 100 },
      { label: 'Soroswap', value: 50 },
    ]);
  });
});

describe('simulatedCostBasisPnl', () => {
  it('derives a simulated cost basis and pnl from the current value', () => {
    const result = simulatedCostBasisPnl(110, 0.9);
    expect(result.costBasis).toBeCloseTo(99);
    expect(result.pnl).toBeCloseTo(11);
    expect(result.percent).toBeCloseTo(11.11, 1);
  });

  it('avoids dividing by zero when the current value is zero', () => {
    expect(simulatedCostBasisPnl(0).percent).toBe(0);
  });
});
