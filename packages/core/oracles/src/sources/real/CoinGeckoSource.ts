/**
 * @fileoverview CoinGecko Oracle Source
 * @description Real price feed from CoinGecko API (mainnet)
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import { IOracleSource } from '../../types/IOracleSource.js';
import { PriceData, SourceInfo } from '../../types/oracle-types.js';

/** CoinGecko coin ID mapping for common symbols */
const SYMBOL_TO_COIN_ID: Record<string, string> = {
  XLM: 'stellar',
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDC: 'usd-coin',
  USDT: 'tether',
  EUR: 'eur',
  SOL: 'solana',
  ADA: 'cardano',
  DOT: 'polkadot',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  DOGE: 'dogecoin',
  MATIC: 'matic-network',
  LTC: 'litecoin',
  BCH: 'bitcoin-cash',
  XRP: 'ripple',
  ALGO: 'algorand',
  NEAR: 'near',
  FTM: 'fantom',
  AAVE: 'aave',
  CRV: 'curve-dao-token',
  MKR: 'maker',
  SNX: 'havven',
  COMP: 'compound-governance-token',
  SUSHI: 'sushi',
  YFI: 'yearn-finance',
};

/**
 * Real oracle source using CoinGecko public API.
 * Use for mainnet; free tier has rate limits (~10–50 calls/min).
 */
export class CoinGeckoSource implements IOracleSource {
  readonly name = 'coingecko';
  private readonly apiKey?: string;
  private readonly baseUrl = 'https://api.coingecko.com/api/v3';

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  /** Normalize symbol (e.g. XLM/USD -> XLM) for API mapping */
  private normalizeSymbol(symbol: string): string {
    const base = (symbol.split('/')[0] || symbol).trim().toUpperCase();
    return base || symbol;
  }

  private mapSymbolToCoinId(symbol: string): string {
    const base = this.normalizeSymbol(symbol);
    const coinId = SYMBOL_TO_COIN_ID[base];
    if (!coinId) {
      throw new Error(`Unsupported symbol: ${symbol} (base: ${base})`);
    }
    return coinId;
  }

  async getPrice(symbol: string): Promise<PriceData> {
    const coinId = this.mapSymbolToCoinId(symbol);
    const baseSymbol = this.normalizeSymbol(symbol);

    const url = `${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=usd`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['x-cg-demo-api-key'] = this.apiKey;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, { usd?: number }>;
    const price = data[coinId]?.usd;
    if (price == null || typeof price !== 'number' || !Number.isFinite(price)) {
      throw new Error(`Invalid price data for ${symbol}`);
    }

    return {
      symbol: baseSymbol,
      price,
      timestamp: new Date(),
      source: this.name,
      metadata: { coinId, apiVersion: 'v3' },
    };
  }

  async getPrices(symbols: string[]): Promise<PriceData[]> {
    const coinIds = symbols.map((s) => this.mapSymbolToCoinId(s)).join(',');
    const url = `${this.baseUrl}/simple/price?ids=${coinIds}&vs_currencies=usd`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['x-cg-demo-api-key'] = this.apiKey;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, { usd?: number }>;
    const results: PriceData[] = [];

    for (const symbol of symbols) {
      const coinId = this.mapSymbolToCoinId(symbol);
      const baseSymbol = this.normalizeSymbol(symbol);
      const price = data[coinId]?.usd;
      if (price != null && typeof price === 'number' && Number.isFinite(price)) {
        results.push({
          symbol: baseSymbol,
          price,
          timestamp: new Date(),
          source: this.name,
          metadata: { coinId, apiVersion: 'v3' },
        });
      }
    }

    return results;
  }

  getSourceInfo(): SourceInfo {
    return {
      name: this.name,
      description: 'CoinGecko cryptocurrency price API (mainnet)',
      version: '1.0.0',
      supportedSymbols: Object.keys(SYMBOL_TO_COIN_ID),
      metadata: { apiUrl: this.baseUrl },
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.getPrice('BTC');
      return true;
    } catch {
      return false;
    }
  }
}
