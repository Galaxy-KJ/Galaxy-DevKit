export interface BlendPositionLike {
  collateralValue?: string;
  debtValue?: string;
  healthFactor?: string;
  supplyAPY?: string;
  borrowAPY?: string;
  supplied?: { amount: string; valueUSD?: string }[];
}

export interface SoroswapLpLike {
  poolLabel: string;
  valueUSD: number;
  feeApr?: number;
}

export interface PositionRow {
  protocol: string;
  type: string;
  value: number;
  healthFactor: number | null;
  apy: string | null;
}

export interface AllocationEntry {
  label: string;
  value: number;
}

export interface SimulatedPnl {
  costBasis: number;
  pnl: number;
  percent: number;
}

function num(value?: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildBlendRow(position: BlendPositionLike): PositionRow {
  const hasCollateral = position.collateralValue !== undefined || position.debtValue !== undefined;
  const value = hasCollateral
    ? num(position.collateralValue) - num(position.debtValue)
    : (position.supplied ?? []).reduce((sum, item) => sum + num(item.valueUSD), 0);

  return {
    protocol: 'Blend',
    type: 'Lending',
    value,
    healthFactor: position.healthFactor !== undefined ? num(position.healthFactor) : null,
    apy: position.supplyAPY ?? null,
  };
}

export function buildSoroswapRow(lp: SoroswapLpLike): PositionRow {
  return {
    protocol: 'Soroswap',
    type: 'Liquidity Pool',
    value: lp.valueUSD,
    healthFactor: null,
    apy: lp.feeApr !== undefined ? `${lp.feeApr.toFixed(2)}%` : null,
  };
}

export function totalValue(rows: PositionRow[]): number {
  return rows.reduce((sum, row) => sum + row.value, 0);
}

export function allocation(rows: PositionRow[]): AllocationEntry[] {
  const byProtocol = new Map<string, number>();
  rows.forEach((row) => {
    if (row.value <= 0) return;
    byProtocol.set(row.protocol, (byProtocol.get(row.protocol) ?? 0) + row.value);
  });
  return [...byProtocol.entries()].map(([label, value]) => ({ label, value }));
}

export function simulatedCostBasisPnl(currentValue: number, factor = 0.9): SimulatedPnl {
  const costBasis = currentValue * factor;
  const pnl = currentValue - costBasis;
  return {
    costBasis,
    pnl,
    percent: costBasis !== 0 ? (pnl / costBasis) * 100 : 0,
  };
}
