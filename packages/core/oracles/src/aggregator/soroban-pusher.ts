/**
 * @fileoverview Soroban transaction submitter for off-chain oracle updates
 */

import {
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc as SorobanRpc,
} from '@stellar/stellar-sdk';

const DEFAULT_PRICE_SCALE = 1_000_000;

export interface SorobanOraclePusherConfig {
  contractId: string;
  rpcUrl: string;
  secretKey: string;
  networkPassphrase?: string;
  priceScale?: number;
  updateFunction?: string;
  transactionTimeoutSeconds?: number;
}

export interface SorobanPushResult {
  symbol: string;
  price: number;
  scaledPrice: string;
  transactionHash?: string;
  status: string;
}

/**
 * Submits aggregated oracle prices to a Soroban contract.
 *
 * The default contract entrypoint is `update_price(base: Symbol, quote: Symbol,
 * price: i128)`. Symbols without an explicit quote default to USD.
 */
export class SorobanOraclePusher {
  private readonly server: SorobanRpc.Server;
  private readonly keypair: Keypair;
  private readonly contract: Contract;
  private readonly networkPassphrase: string;
  private readonly priceScale: number;
  private readonly updateFunction: string;
  private readonly transactionTimeoutSeconds: number;

  constructor(config: SorobanOraclePusherConfig) {
    if (!config.contractId) throw new Error('Soroban oracle contractId is required');
    if (!config.rpcUrl) throw new Error('Soroban rpcUrl is required');
    if (!config.secretKey) throw new Error('Soroban source secretKey is required');

    this.server = new SorobanRpc.Server(config.rpcUrl, {
      allowHttp: config.rpcUrl.startsWith('http://'),
    });
    this.keypair = Keypair.fromSecret(config.secretKey);
    this.contract = new Contract(config.contractId);
    this.networkPassphrase = config.networkPassphrase ?? Networks.TESTNET;
    this.priceScale = config.priceScale ?? DEFAULT_PRICE_SCALE;
    this.updateFunction = config.updateFunction ?? 'update_price';
    this.transactionTimeoutSeconds = config.transactionTimeoutSeconds ?? 30;
  }

  async pushPrice(symbol: string, price: number): Promise<SorobanPushResult> {
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Cannot push invalid oracle price for ${symbol}: ${price}`);
    }

    const { base, quote } = parsePair(symbol);
    const source = await this.server.getAccount(this.keypair.publicKey());
    const scaledPrice = BigInt(Math.round(price * this.priceScale));
    const operation = this.contract.call(
      this.updateFunction,
      nativeToScVal(base, { type: 'symbol' }),
      nativeToScVal(quote, { type: 'symbol' }),
      nativeToScVal(scaledPrice, { type: 'i128' })
    );

    const transaction = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(this.transactionTimeoutSeconds)
      .build();

    const prepared = await this.server.prepareTransaction(transaction);
    prepared.sign(this.keypair);
    const response = await this.server.sendTransaction(prepared);

    return {
      symbol: `${base}/${quote}`,
      price,
      scaledPrice: scaledPrice.toString(),
      transactionHash: response.hash,
      status: response.status,
    };
  }
}

export function parsePair(symbol: string): { base: string; quote: string } {
  const hasExplicitQuote = symbol.includes('/');
  const [rawBase, rawQuote] = symbol.split('/');
  const base = (rawBase ?? '').trim().toUpperCase();
  const quote = (hasExplicitQuote ? rawQuote ?? '' : 'USD').trim().toUpperCase();

  if (!base || !quote) {
    throw new Error(`Invalid oracle symbol pair: ${symbol}`);
  }

  return { base, quote };
}
