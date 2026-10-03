/**
 * @fileoverview Path payment (swap) implementation for Galaxy DevKit
 * @description Supports multi-hop routing, slippage control, strict-send /
 *   strict-receive modes, and fee estimation before execution.
 * @see Issue #267 — Path payment improvements
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import {
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { findOptimalPath, type QuotedRoute, type RouteFinderOptions } from './route-finder';
import { PathPaymentError } from './path-payment-error';

export { PathPaymentError };

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SLIPPAGE  = 0.005;
const MIN_SLIPPAGE      = 0;
const MAX_SLIPPAGE      = 0.5;
const TX_TIMEOUT_SECS   = 30;
const HORIZON_TESTNET   = 'https://horizon-testnet.stellar.org';
const HORIZON_MAINNET   = 'https://horizon.stellar.org';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NetworkType = 'testnet' | 'mainnet';

export interface PathPaymentOptions {
  sourceAsset: Asset;
  destinationAsset: Asset;
  amount: string;
  slippageTolerance?: number;
  mode: 'strict-send' | 'strict-receive';
  destination?: string;
  network?: NetworkType;
  path?: Asset[];
  quotedSourceAmount?: string;
  quotedDestinationAmount?: string;
}

export interface FeeEstimate {
  baseFeeStroops: number;
  baseFeeXlm: string;
  operationCount: number;
}

export interface PathPaymentResult {
  signedXdr: string;
  hash: string;
  path: Asset[];
  slippageAdjustedAmount: string;
  feeEstimate: FeeEstimate;
  network: NetworkType;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getHorizonUrl(network: NetworkType): string {
  return network === 'mainnet' ? HORIZON_MAINNET : HORIZON_TESTNET;
}

function getNetworkPassphrase(network: NetworkType): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

function adjustQuotedAmount(amount: string, slippage: number, direction: 'down' | 'up'): string {
  const [whole, frac = ''] = amount.split('.');
  if (!/^\d+$/.test(whole) || (frac !== '' && !/^\d+$/.test(frac))) {
    throw new PathPaymentError(`quoted amount is not a decimal string (received "${amount}")`, 'INVALID_AMOUNT');
  }
  const scale = 10n ** 7n;
  const digits = (frac + '0000000').slice(0, 7);
  const base = BigInt(whole) * scale + BigInt(digits);
  const bps = BigInt(Math.round(slippage * 1_000_000));
  const moved = direction === 'down'
    ? (base * (1_000_000n - bps)) / 1_000_000n
    : (base * (1_000_000n + bps) + 1_000_000n - 1n) / 1_000_000n;
  if (moved <= 0n) {
    throw new PathPaymentError('Slippage leaves a non-positive bound', 'INVALID_SLIPPAGE');
  }
  const w = moved / scale;
  const f = (moved % scale).toString().padStart(7, '0');
  return `${w}.${f}`;
}

async function resolveQuote(
  options: PathPaymentOptions,
  horizonUrl: string,
): Promise<QuotedRoute> {
  if (options.path) {
    if (!options.quotedSourceAmount || !options.quotedDestinationAmount) {
      throw new PathPaymentError(
        'explicit path requires a quoted destinationAmount and sourceAmount',
        'NO_PATH_FOUND',
      );
    }
    return {
      path: options.path,
      sourceAmount: options.quotedSourceAmount,
      destinationAmount: options.quotedDestinationAmount,
    };
  }
  try {
    return await findOptimalPath({
      sourceAsset: options.sourceAsset,
      destinationAsset: options.destinationAsset,
      amount: options.amount,
      mode: options.mode,
      horizonUrl,
    } as RouteFinderOptions);
  } catch (err) {
    if (err instanceof PathPaymentError) throw err;
    throw new PathPaymentError(
      `Route discovery failed: ${err instanceof Error ? err.message : String(err)}`,
      'NETWORK_ERROR',
    );
  }
}

function protectedAmount(quote: QuotedRoute, slippage: number, mode: PathPaymentOptions['mode']): string {
  return mode === 'strict-send'
    ? adjustQuotedAmount(quote.destinationAmount, slippage, 'down')
    : adjustQuotedAmount(quote.sourceAmount, slippage, 'up');
}

function validateSlippage(slippage: number): void {
  if (!Number.isFinite(slippage) || slippage < MIN_SLIPPAGE || slippage > MAX_SLIPPAGE) {
    throw new PathPaymentError(
      `slippageTolerance must be between ${MIN_SLIPPAGE} and ${MAX_SLIPPAGE} (received ${slippage})`,
      'INVALID_SLIPPAGE',
    );
  }
}

function validateAmount(amount: string): void {
  const n = parseFloat(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new PathPaymentError(
      `amount must be a positive number string (received "${amount}")`,
      'INVALID_AMOUNT',
    );
  }
}

function buildFeeEstimate(baseFee: string): FeeEstimate {
  const baseFeeStroops = parseInt(baseFee, 10);
  return {
    baseFeeStroops,
    baseFeeXlm: (baseFeeStroops / 10_000_000).toFixed(7),
    operationCount: 1,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function estimatePathPayment(
  options: Omit<PathPaymentOptions, 'destination'>,
): Promise<{
  slippageAdjustedAmount: string;
  feeEstimate: FeeEstimate;
  path: Asset[];
}> {
  const slippage = options.slippageTolerance ?? DEFAULT_SLIPPAGE;
  validateSlippage(slippage);
  validateAmount(options.amount);

  if (options.sourceAsset.equals(options.destinationAsset)) {
    throw new PathPaymentError(
      'sourceAsset and destinationAsset must be different',
      'SAME_ASSET',
    );
  }

  const network = options.network ?? 'testnet';
  const quote = await resolveQuote(options, getHorizonUrl(network));
  const slippageAdjustedAmount = protectedAmount(quote, slippage, options.mode);
  const feeEstimate = buildFeeEstimate(BASE_FEE);

  return { slippageAdjustedAmount, feeEstimate, path: quote.path };
}

export async function executePathPayment(
  keypair: Keypair,
  options: PathPaymentOptions,
): Promise<PathPaymentResult> {
  const slippage = options.slippageTolerance ?? DEFAULT_SLIPPAGE;
  validateSlippage(slippage);
  validateAmount(options.amount);

  if (options.sourceAsset.equals(options.destinationAsset)) {
    throw new PathPaymentError(
      'sourceAsset and destinationAsset must be different',
      'SAME_ASSET',
    );
  }

  const network     = options.network ?? 'testnet';
  const horizonUrl  = getHorizonUrl(network);
  const passphrase  = getNetworkPassphrase(network);
  const destination = options.destination ?? keypair.publicKey();

  const quote = await resolveQuote(options, horizonUrl);
  const path = quote.path;
  const slippageAdjustedAmount = protectedAmount(quote, slippage, options.mode);

  let account: Horizon.AccountResponse;
  try {
    const server = new Horizon.Server(horizonUrl);
    account = await server.loadAccount(keypair.publicKey());
  } catch (err) {
    throw new PathPaymentError(
      `Failed to load account: ${err instanceof Error ? err.message : String(err)}`,
      'NETWORK_ERROR',
    );
  }

  let operation: ReturnType<typeof Operation.pathPaymentStrictSend>;
  try {
    if (options.mode === 'strict-send') {
      operation = Operation.pathPaymentStrictSend({
        sendAsset:  options.sourceAsset,
        sendAmount: options.amount,
        destAsset:  options.destinationAsset,
        destMin:    slippageAdjustedAmount,
        destination,
        path,
      });
    } else {
      operation = Operation.pathPaymentStrictReceive({
        sendAsset:  options.sourceAsset,
        sendMax:    slippageAdjustedAmount,
        destAsset:  options.destinationAsset,
        destAmount: options.amount,
        destination,
        path,
      });
    }
  } catch (err) {
    throw new PathPaymentError(
      `Failed to build operation: ${err instanceof Error ? err.message : String(err)}`,
      'BUILD_FAILED',
    );
  }

  const feeEstimate = buildFeeEstimate(BASE_FEE);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: passphrase,
  })
    .addOperation(operation)
    .setTimeout(TX_TIMEOUT_SECS)
    .build();

  tx.sign(keypair);

  return {
    signedXdr:              tx.toXDR(),
    hash:                   tx.hash().toString('hex'),
    path,
    slippageAdjustedAmount,
    feeEstimate,
    network,
  };
}