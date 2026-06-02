/**
 * @fileoverview On-Chain Oracle Source
 * @description Price feed source that reads price data directly from a deployed
 *   Soroban Price Oracle contract on the Stellar network.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-05-27
 */

import {
  Account,
  Contract,
  nativeToScVal,
  Networks,
  rpc as SorobanRpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';

import { IOracleSource } from '../../types/IOracleSource.js';
import { PriceData, SourceInfo } from '../../types/oracle-types.js';

/** Price scale factor: 6 implied decimal places (matches on-chain contract). */
const PRICE_SCALE = 1_000_000n;

/** A dummy public key used for read-only transaction simulations */
const SIMULATION_PUBLIC_KEY = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

/**
 * Real oracle source that queries a deployed Soroban price oracle contract.
 */
export class OnChainOracleSource implements IOracleSource {
  readonly name = 'on-chain-oracle';
  private readonly contractId: string;
  private readonly rpcUrl: string;
  private readonly networkPassphrase: string;
  private readonly rpcServer: SorobanRpc.Server;

  constructor(
    contractId: string,
    rpcUrl: string,
    networkPassphrase: string = Networks.TESTNET
  ) {
    if (!contractId) {
      throw new Error('Contract ID is required for OnChainOracleSource');
    }
    if (!rpcUrl) {
      throw new Error('RPC URL is required for OnChainOracleSource');
    }

    this.contractId = contractId;
    this.rpcUrl = rpcUrl;
    this.networkPassphrase = networkPassphrase;
    this.rpcServer = new SorobanRpc.Server(rpcUrl, {
      allowHttp: rpcUrl.startsWith('http://'),
    });
  }

  /**
   * Helper to parse a symbol string into base and quote symbols.
   * If no quote is specified (e.g. "XLM"), defaults to "USDC".
   */
  private parseSymbol(symbol: string): { base: string; quote: string } {
    if (symbol.includes('/')) {
      const [base, quote] = symbol.split('/');
      return {
        base: base!.trim().toUpperCase(),
        quote: quote!.trim().toUpperCase(),
      };
    }
    return {
      base: symbol.trim().toUpperCase(),
      quote: 'USDC',
    };
  }

  /**
   * Fetch price for a single symbol from the Soroban smart contract.
   */
  async getPrice(symbol: string): Promise<PriceData> {
    const { base, quote } = this.parseSymbol(symbol);
    const contract = new Contract(this.contractId);

    // Build get_price invocation: get_price(base, quote)
    const getPriceOp = contract.call(
      'get_price',
      xdr.ScVal.scvSymbol(base),
      xdr.ScVal.scvSymbol(quote)
    );

    // Construct a dummy account and transaction builder for simulation
    const dummyAccount = new Account(SIMULATION_PUBLIC_KEY, '0');
    const tx = new TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(getPriceOp)
      .setTimeout(30)
      .build();

    try {
      const simulation = await this.rpcServer.simulateTransaction(tx);

      if (SorobanRpc.Api.isSimulationError(simulation)) {
        throw new Error(`Soroban RPC simulation failed: ${simulation.error}`);
      }

      if (!simulation.result || !simulation.result.retval) {
        throw new Error(`Invalid simulation response: no return value for ${symbol}`);
      }

      // Parse PriceEntry struct: { price: i128, timestamp: u64, pusher: Address }
      const native = scValToNative(simulation.result.retval);
      if (!native || typeof native !== 'object') {
        throw new Error(`Failed to decode price entry for ${symbol}`);
      }

      const { price, timestamp } = native as {
        price: bigint;
        timestamp: bigint;
        pusher: string;
      };

      if (price === undefined || timestamp === undefined) {
        throw new Error(`Decoded price entry lacks required fields for ${symbol}`);
      }

      // Convert scaled integer price to standard float number
      const priceFloat = Number(price) / Number(PRICE_SCALE);
      const date = new Date(Number(timestamp) * 1000);

      return {
        symbol: symbol.toUpperCase(),
        price: priceFloat,
        timestamp: date,
        source: this.name,
        metadata: {
          contractId: this.contractId,
          base,
          quote,
          rawPrice: price.toString(),
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to get on-chain price for ${symbol}: ${message}`);
    }
  }

  /**
   * Fetch prices for multiple symbols in parallel.
   */
  async getPrices(symbols: string[]): Promise<PriceData[]> {
    const promises = symbols.map(async (symbol) => {
      try {
        return await this.getPrice(symbol);
      } catch (err: unknown) {
        // If one symbol fails, we log it but continue processing others
        console.warn(`[OnChainOracleSource] Failed to fetch price for ${symbol}:`, err);
        return null;
      }
    });

    const results = await Promise.all(promises);
    return results.filter((r): r is PriceData => r !== null);
  }

  /**
   * Get metadata info for this oracle source.
   */
  getSourceInfo(): SourceInfo {
    return {
      name: this.name,
      description: 'On-chain Soroban Price Oracle contract client',
      version: '1.0.0',
      supportedSymbols: [], // Empty means supports all pairs deployed on the contract
      metadata: {
        contractId: this.contractId,
        rpcUrl: this.rpcUrl,
      },
    };
  }

  /**
   * Health check to verify contract availability on the RPC node.
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Fetch account details of the contract to check if it exists/is active
      await this.rpcServer.getLedgerEntries(
        new Contract(this.contractId).getFootprint()
      );
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Standalone client class exactly as requested in Issue #276.
 */
export class OnChainOracle {
  private readonly source: OnChainOracleSource;

  constructor(
    contractId: string,
    rpcUrl: string,
    networkPassphrase?: string
  ) {
    this.source = new OnChainOracleSource(contractId, rpcUrl, networkPassphrase);
  }

  /**
   * Get price for a single symbol
   * @param {string} symbol - e.g. "XLM" or "XLM/USDC"
   * @returns {Promise<{ price: number; timestamp: number }>}
   */
  async getPrice(symbol: string): Promise<{ price: number; timestamp: number }> {
    const data = await this.source.getPrice(symbol);
    return {
      price: data.price,
      timestamp: data.timestamp.getTime(),
    };
  }

  /**
   * Get prices for multiple symbols as a Map
   * @param {string[]} symbols - e.g. ["XLM", "BTC"]
   * @returns {Promise<Map<string, number>>}
   */
  async getPrices(symbols: string[]): Promise<Map<string, number>> {
    const datas = await this.source.getPrices(symbols);
    const map = new Map<string, number>();
    for (const data of datas) {
      map.set(data.symbol, data.price);
    }
    return map;
  }
}
