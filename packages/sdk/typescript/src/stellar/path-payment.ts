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
import { findOptimalPath, type RouteFinderOptions } from './route-finder';

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

export class PathPaymentError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INVALID_SLIPPAGE'
      | 'INVALID_AMOUNT'
      | 'NO_PATH_FOUND'
      | 'SAME_ASSET'
      | 'BUILD_FAILED'
      | 'NETWORK_ERROR',
  ) {
    super(message);
    this.name = 'PathPaymentError';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getHorizonUrl(network: NetworkType): string {
  return network === 'mainnet' ? HORIZON_MAINNET : HORIZON_TESTNET;
}

function getNetworkPassphrase(network: NetworkType): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

function applySlippage(
  amount: string,
  slippage: number,
  mode: 'strict-send' | 'strict-receive',
): string {
  const value = parseFloat(amount);
  const adjusted =
    mode === 'strict-send'
      ? value * (1 - slippage)
      : value * (1 + slippage);
  return adjusted.toFixed(7);
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

  if (options.path === null) {
    throw new PathPaymentError('No swap path found', 'NO_PATH_FOUND');
  }

  const network    = options.network ?? 'testnet';
  const horizonUrl = getHorizonUrl(network);

  const path = options.path ?? await findOptimalPath({
    sourceAsset:      options.sourceAsset,
    destinationAsset: options.destinationAsset,
    amount:           options.amount,
    mode:             options.mode,
    horizonUrl,
  } as RouteFinderOptions);

  const slippageAdjustedAmount = applySlippage(options.amount, slippage, options.mode);
  const feeEstimate = buildFeeEstimate(BASE_FEE);

  return { slippageAdjustedAmount, feeEstimate, path };
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

  let path: Asset[];
  try {
    path = options.path ?? await findOptimalPath({
      sourceAsset:      options.sourceAsset,
      destinationAsset: options.destinationAsset,
      amount:           options.amount,
      mode:             options.mode,
      horizonUrl,
    } as RouteFinderOptions);
  } catch (err) {
    throw new PathPaymentError(
      `Route discovery failed: ${err instanceof Error ? err.message : String(err)}`,
      'NETWORK_ERROR',
    );
  }

  const slippageAdjustedAmount = applySlippage(options.amount, slippage, options.mode);

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