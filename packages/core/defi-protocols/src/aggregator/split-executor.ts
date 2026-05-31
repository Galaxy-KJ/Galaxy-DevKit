/**
 * Split trade execution (#275).
 *
 * Takes an `AggregatorQuote` whose `routes[]` already encode the
 * percentage split across venues and submits each route in parallel
 * via the caller-supplied submitter. Returns the combined fill
 * summary the issue's acceptance criteria call for.
 *
 * The submitter is injected so this module stays free of any
 * Stellar / Soroban / RPC wiring — production callers pass a
 * function that builds and submits the per-venue transaction;
 * tests pass a fake.
 */

import BigNumber from 'bignumber.js';
import type { AggregatorQuote, AggregatorRoute, AggregatorVenue } from './types.js';

const DISPLAY_DECIMALS = 7;

/** Result of executing a single route in the split. */
export interface SplitExecutionEntry {
  source: AggregatorVenue;
  percentage: number;
  amountIn: string;
  amountOut: string;
  /** Hash of the submitted transaction (or any opaque id). */
  txId?: string;
  /** When falsy the route failed; the error message lands in `error`. */
  ok: boolean;
  error?: string;
}

export interface SplitExecution {
  splits: SplitExecutionEntry[];
  totalOutput: string;
  /** weighted average price = totalOutput / totalSuccessfulInput. */
  averagePrice: number;
  totalFees: string;
  /** True when every route succeeded. False when at least one failed. */
  allSucceeded: boolean;
}

/**
 * Submitter contract. Production wiring builds + submits the route's
 * trade transaction and returns the venue's reported output and the
 * Stellar tx hash. Tests pass a recording fake.
 */
export type SplitRouteSubmitter = (
  route: AggregatorRoute,
) => Promise<{ outputAmount: string; txId?: string; feePaid?: string }>;

export interface ExecuteSplitTradeOptions {
  /**
   * Minimum input per route. Routes whose `amountIn` falls below
   * this floor are skipped (the issue calls out "configurable
   * minimum split size to avoid dust trades").
   */
  minSplitInput?: string;
  /**
   * When `true` (the default), a failing submitter rejects the
   * whole split with the underlying error. Pass `false` to allow
   * partial fills — successful routes are kept and failures land
   * in `splits[].error`.
   */
  abortOnError?: boolean;
}

/**
 * Execute an aggregator quote across its venues.
 *
 * Returns immediately when no executable routes remain after the
 * `minSplitInput` filter.
 */
export async function executeSplitTrade(
  quote: AggregatorQuote,
  submit: SplitRouteSubmitter,
  options: ExecuteSplitTradeOptions = {},
): Promise<SplitExecution> {
  const { minSplitInput = '0', abortOnError = true } = options;
  const minBn = new BigNumber(minSplitInput);

  const executable = quote.routes.filter(
    (r) => new BigNumber(r.amountIn).isGreaterThanOrEqualTo(minBn),
  );
  if (executable.length === 0) {
    return {
      splits: [],
      totalOutput: '0',
      averagePrice: 0,
      totalFees: '0',
      allSucceeded: false,
    };
  }

  const totalInput = executable
    .reduce((sum, r) => sum.plus(r.amountIn), new BigNumber(0))
    .toFixed(DISPLAY_DECIMALS);

  // Submit each route in parallel. `Promise.allSettled` so a single
  // venue failure can be reported (and optionally tolerated) without
  // collapsing the whole Promise tree.
  const settled = await Promise.allSettled(executable.map((r) => submit(r)));

  let totalOutBn = new BigNumber(0);
  let totalFeesBn = new BigNumber(0);
  let allOk = true;
  const splits: SplitExecutionEntry[] = settled.map((result, i) => {
    const route = executable[i];
    const percentage = pctOf(route.amountIn, totalInput);
    if (result.status === 'fulfilled') {
      const { outputAmount, txId, feePaid } = result.value;
      totalOutBn = totalOutBn.plus(outputAmount);
      if (feePaid) totalFeesBn = totalFeesBn.plus(feePaid);
      return {
        source: route.venue,
        percentage,
        amountIn: route.amountIn,
        amountOut: outputAmount,
        txId,
        ok: true,
      };
    }
    allOk = false;
    return {
      source: route.venue,
      percentage,
      amountIn: route.amountIn,
      amountOut: '0',
      ok: false,
      error: errorMessage(result.reason),
    };
  });

  if (!allOk && abortOnError) {
    const firstFailure = splits.find((s) => !s.ok);
    throw new Error(
      `Split trade execution failed on venue '${firstFailure?.source}': ${firstFailure?.error}`,
    );
  }

  const totalOutput = totalOutBn.decimalPlaces(DISPLAY_DECIMALS).toFixed(DISPLAY_DECIMALS);
  const successfulInput = splits
    .filter((s) => s.ok)
    .reduce((sum, s) => sum.plus(s.amountIn), new BigNumber(0));
  const averagePrice = successfulInput.isZero()
    ? 0
    : totalOutBn.dividedBy(successfulInput).decimalPlaces(DISPLAY_DECIMALS).toNumber();
  const totalFees = totalFeesBn.decimalPlaces(DISPLAY_DECIMALS).toFixed(DISPLAY_DECIMALS);

  return { splits, totalOutput, averagePrice, totalFees, allSucceeded: allOk };
}

function pctOf(part: string, total: string): number {
  const t = new BigNumber(total);
  if (t.isZero()) return 0;
  return new BigNumber(part).dividedBy(t).multipliedBy(100).decimalPlaces(4).toNumber();
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'unknown submitter error';
}
