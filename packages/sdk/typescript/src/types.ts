/** Hand-maintained REST wire types. OpenAPI generation is unavailable upstream.
 * Source: packages/api/rest/src/routes/defi.routes.ts and core/defi-protocols types.
 * Dates are JSON strings; amounts retain decimal precision as strings. */
export type Network = 'testnet' | 'mainnet';

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface GalaxyClientOptions {
  /** Server root, optionally with a reverse-proxy path prefix; omit /api/v1. */
  baseUrl: string;
  apiKey?: string;
  /** Current REST DeFi configuration supports testnet only. */
  network?: Network;
  timeoutMs?: number;
  /** Injectable HTTP layer; defaults to the browser/Node native fetch. */
  fetch?: typeof fetch;
}

export interface Asset {
  code: string;
  issuer?: string;
  type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
}

export interface QuoteRequest {
  assetIn: string;
  assetOut: string;
  amountIn: string;
}

export interface SwapQuote {
  tokenIn: Asset;
  tokenOut: Asset;
  amountIn: string;
  amountOut: string;
  priceImpact: string;
  minimumReceived: string;
  path: string[];
  validUntil: string;
}

export interface AggregatorQuoteRequest extends QuoteRequest {
  /** Two nonnegative weights, passed as the REST comma-separated query value. */
  splits?: readonly [number, number];
}

export interface AggregatorQuote {
  assetIn: Asset;
  assetOut: Asset;
  amountIn: string;
  routes: Array<{
    venue: 'soroswap' | 'sdex' | 'aquarius';
    amountIn: string;
    amountOut: string;
    priceImpact: number;
    path: string[];
  }>;
  totalAmountOut: string;
  effectivePrice: number;
  savingsVsBestSingle: number;
  totalPriceImpact: number;
}

export interface PositionBalance { asset: Asset; amount: string; valueUSD: string }
export interface BlendPosition {
  address: string;
  supplied: PositionBalance[];
  borrowed: PositionBalance[];
  healthFactor: string;
  collateralValue: string;
  debtValue: string;
  supply?: PositionBalance[];
  borrow?: PositionBalance[];
  totalSupply?: string;
  totalBorrow?: string;
  supplyAPY?: string;
  borrowAPY?: string;
}

/** The current REST handlers put UNSIGNED XDR in `hash`, not a submitted hash.
 * No method in this client signs or submits a transaction. */
export interface TransactionResult {
  hash: string;
  status: 'pending' | 'success' | 'failed';
  ledger: number;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface BlendOperationRequest { asset: string; amount: string; signerPublicKey: string }
export interface SwapRequest extends QuoteRequest { minAmountOut: string; signerPublicKey: string }
export interface AddLiquidityRequest {
  assetA: string; assetB: string; amountA: string; amountB: string; signerPublicKey: string;
}
export interface RemoveLiquidityRequest {
  assetA: string; assetB: string; poolAddress: string; lpAmount: string;
  signerPublicKey: string; minAmountA?: string; minAmountB?: string;
}

/** Capability descriptor, deliberately not a client for invented endpoints. */
export interface UnavailableClient {
  readonly available: false;
  readonly reason: string;
}
