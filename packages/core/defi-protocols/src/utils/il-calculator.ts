/**
 * Impermanent-loss calculator (#284).
 *
 * Pure math. Given an LP entry snapshot (token amounts + prices) and
 * a current snapshot, computes:
 *
 *   - the value of the LP position today,
 *   - the value the user would have if they had simply held the
 *     same token amounts (the counterfactual),
 *   - the impermanent loss as both an absolute USD figure and a
 *     percentage of the held value.
 *
 * Uses the standard Uniswap-v2 / x*y=k constant-product formula. The
 * formula is fee-agnostic — fees earned by the LP position are added
 * as `feesAccruedUSD` so callers can show net IL, not gross.
 *
 * No network calls. The companion module `lp-position.ts` defines the
 * data shape; production wiring fills it from Soroswap pool analytics
 * (#272) and an oracle (#276) per the issue's deferred deps.
 */

import BigNumber from 'bignumber.js';

export interface PriceSnapshot {
  /** Spot price of token A in USD. */
  priceAUSD: number;
  /** Spot price of token B in USD. */
  priceBUSD: number;
}

export interface LPEntrySnapshot extends PriceSnapshot {
  /** Token A amount deposited at LP entry. */
  amountA: string;
  /** Token B amount deposited at LP entry. */
  amountB: string;
}

export interface ILCalcInput {
  entry: LPEntrySnapshot;
  current: PriceSnapshot;
  /** Fees the LP has accrued since entry, in USD. Defaults to 0. */
  feesAccruedUSD?: number;
}

export interface ILResult {
  entryValueUSD: number;
  currentLPValueUSD: number;
  holdValueUSD: number;
  impermanentLossPercent: number;
  impermanentLossUSD: number;
  netReturnUSD: number;
  netReturnPercent: number;
}

const DEFAULT_DECIMALS = 6;

/**
 * Constant-product (x*y=k) IL formula.
 *
 *   poolValueRatio = 2 * sqrt(priceRatio) / (1 + priceRatio)
 *   IL%            = poolValueRatio - 1
 *
 * where `priceRatio = (priceA_now / priceA_entry) / (priceB_now / priceB_entry)`.
 */
export function calculateImpermanentLoss(input: ILCalcInput): ILResult {
  const { entry, current, feesAccruedUSD = 0 } = input;
  assertPositive(entry.priceAUSD, 'entry.priceAUSD');
  assertPositive(entry.priceBUSD, 'entry.priceBUSD');
  assertPositive(current.priceAUSD, 'current.priceAUSD');
  assertPositive(current.priceBUSD, 'current.priceBUSD');

  const amountA = new BigNumber(entry.amountA);
  const amountB = new BigNumber(entry.amountB);
  assertNonNeg(amountA, 'entry.amountA');
  assertNonNeg(amountB, 'entry.amountB');

  const entryValue = amountA.multipliedBy(entry.priceAUSD).plus(amountB.multipliedBy(entry.priceBUSD));
  const holdValue = amountA
    .multipliedBy(current.priceAUSD)
    .plus(amountB.multipliedBy(current.priceBUSD));

  // priceRatio = (currentPriceA / entryPriceA) / (currentPriceB / entryPriceB)
  const priceRatioA = new BigNumber(current.priceAUSD).dividedBy(entry.priceAUSD);
  const priceRatioB = new BigNumber(current.priceBUSD).dividedBy(entry.priceBUSD);
  const priceRatio = priceRatioA.dividedBy(priceRatioB);

  const sqrtPriceRatio = priceRatio.sqrt();
  const denom = priceRatio.plus(1);
  // Guard division against the degenerate case (impossible at this
  // point because priceRatio is positive and finite, but defensive
  // for future callers passing exotic values).
  const poolValueRatio = denom.isZero() ? new BigNumber(1) : sqrtPriceRatio.multipliedBy(2).dividedBy(denom);

  const currentLpValue = holdValue.multipliedBy(poolValueRatio);
  const ilUSD = currentLpValue.minus(holdValue); // negative when IL is incurred
  const ilPct = holdValue.isZero()
    ? new BigNumber(0)
    : currentLpValue.dividedBy(holdValue).minus(1).multipliedBy(100);

  const netReturnUSD = currentLpValue.plus(feesAccruedUSD).minus(entryValue);
  const netReturnPct = entryValue.isZero()
    ? new BigNumber(0)
    : netReturnUSD.dividedBy(entryValue).multipliedBy(100);

  return {
    entryValueUSD: round(entryValue),
    currentLPValueUSD: round(currentLpValue),
    holdValueUSD: round(holdValue),
    impermanentLossPercent: round(ilPct),
    impermanentLossUSD: round(ilUSD),
    netReturnUSD: round(netReturnUSD),
    netReturnPercent: round(netReturnPct),
  };
}

/**
 * Project IL across a handful of price scenarios so the UI can
 * render the "what-if" panel the issue calls out (+50%, +100%, -50%).
 *
 * The scenarios apply to token A's price only — token B's price is
 * held flat. Callers wanting both legs perturbed pass custom scenarios.
 */
export function projectImpermanentLoss(
  entry: LPEntrySnapshot,
  current: PriceSnapshot,
  scenarios: Array<{ label: string; priceADeltaPercent: number }> = [
    { label: '-50%', priceADeltaPercent: -50 },
    { label: '+50%', priceADeltaPercent: 50 },
    { label: '+100%', priceADeltaPercent: 100 },
  ],
): Array<{ label: string; il: ILResult }> {
  return scenarios.map(({ label, priceADeltaPercent }) => {
    const projected: PriceSnapshot = {
      priceAUSD: current.priceAUSD * (1 + priceADeltaPercent / 100),
      priceBUSD: current.priceBUSD,
    };
    return { label, il: calculateImpermanentLoss({ entry, current: projected }) };
  });
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

function assertNonNeg(value: BigNumber, label: string): void {
  if (!value.isFinite() || value.isNegative()) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}

function round(value: BigNumber, decimals = DEFAULT_DECIMALS): number {
  return value.decimalPlaces(decimals).toNumber();
}
