import { HttpClient } from './http.js';
import type {
  GalaxyClientOptions, RequestOptions, UnavailableClient, QuoteRequest, SwapQuote,
  AggregatorQuoteRequest, AggregatorQuote, BlendPosition, BlendOperationRequest,
  TransactionResult, SwapRequest, AddLiquidityRequest, RemoveLiquidityRequest,
} from './types.js';

function quoteQuery(input: QuoteRequest): Record<string, string> {
  return { assetIn: input.assetIn, assetOut: input.assetOut, amountIn: input.amountIn };
}

/** Read positions and build unsigned Blend transactions through REST. */
export class BlendClient {
  constructor(private readonly http: HttpClient) {}
  getPosition(publicKey: string, options?: RequestOptions): Promise<BlendPosition> {
    if (!/^G[A-Z2-7]{55}$/.test(publicKey)) throw new TypeError('publicKey must be a Stellar account address');
    return this.http.request('GET', `blend/position/${encodeURIComponent(publicKey)}`, {}, undefined, options);
  }
  supply(input: BlendOperationRequest, options?: RequestOptions): Promise<TransactionResult> { return this.operation('supply', input, options); }
  withdraw(input: BlendOperationRequest, options?: RequestOptions): Promise<TransactionResult> { return this.operation('withdraw', input, options); }
  borrow(input: BlendOperationRequest, options?: RequestOptions): Promise<TransactionResult> { return this.operation('borrow', input, options); }
  repay(input: BlendOperationRequest, options?: RequestOptions): Promise<TransactionResult> { return this.operation('repay', input, options); }
  private operation(action: string, input: BlendOperationRequest, options?: RequestOptions): Promise<TransactionResult> {
    const { asset, amount, signerPublicKey } = input;
    return this.http.request('POST', `blend/${action}`, {}, { asset, amount, signerPublicKey }, options);
  }
}

/** Soroswap quote and unsigned transaction endpoints. */
export class SoroswapClient {
  constructor(private readonly http: HttpClient) {}
  getQuote(input: QuoteRequest, options?: RequestOptions): Promise<SwapQuote> {
    return this.http.request('GET', 'swap/quote', quoteQuery(input), undefined, options);
  }
  swap(input: SwapRequest, options?: RequestOptions): Promise<TransactionResult> {
    const { minAmountOut, signerPublicKey } = input;
    return this.http.request('POST', 'swap', {}, { ...quoteQuery(input), minAmountOut, signerPublicKey }, options);
  }
  addLiquidity(input: AddLiquidityRequest, options?: RequestOptions): Promise<TransactionResult> {
    const { assetA, assetB, amountA, amountB, signerPublicKey } = input;
    return this.http.request('POST', 'liquidity/add', {}, { assetA, assetB, amountA, amountB, signerPublicKey }, options);
  }
  removeLiquidity(input: RemoveLiquidityRequest, options?: RequestOptions): Promise<TransactionResult> {
    const { assetA, assetB, poolAddress, lpAmount, signerPublicKey, minAmountA, minAmountB } = input;
    return this.http.request('POST', 'liquidity/remove', {}, { assetA, assetB, poolAddress, lpAmount, signerPublicKey, minAmountA, minAmountB }, options);
  }
}

/** Compare venues, optionally using the REST endpoint's two-way split. */
export class AggregatorClient {
  constructor(private readonly http: HttpClient) {}
  getQuote(input: AggregatorQuoteRequest, options?: RequestOptions): Promise<AggregatorQuote> {
    if (input.splits && (input.splits.length !== 2 || input.splits.some(n => !Number.isFinite(n) || n < 0))) {
      throw new TypeError('splits must contain two finite nonnegative weights');
    }
    return this.http.request('GET', 'aggregator/quote', { ...quoteQuery(input), splits: input.splits?.join(',') }, undefined, options);
  }
}

/** Browser/Node facade for the currently mounted Galaxy REST API.
 * The server chooses its network. Mainnet is rejected until REST supports selection. */
export class GalaxyClient {
  readonly network = 'testnet' as const;
  readonly wallets: UnavailableClient = Object.freeze({ available: false, reason: 'The wallet router is not mounted in the REST server.' });
  readonly oracles: UnavailableClient = Object.freeze({ available: false, reason: 'The REST server has no oracle endpoints.' });
  readonly automation: UnavailableClient = Object.freeze({ available: false, reason: 'The REST server has no automation endpoints.' });
  readonly defi: Readonly<{ blend: BlendClient; soroswap: SoroswapClient; aggregator: AggregatorClient }>;

  constructor(options: GalaxyClientOptions) {
    if (options.network !== undefined && options.network !== 'testnet') {
      throw new TypeError('Only testnet is supported by the current REST DeFi configuration; network cannot switch the server');
    }
    const http = new HttpClient(options);
    this.defi = Object.freeze({ blend: new BlendClient(http), soroswap: new SoroswapClient(http), aggregator: new AggregatorClient(http) });
  }
}
