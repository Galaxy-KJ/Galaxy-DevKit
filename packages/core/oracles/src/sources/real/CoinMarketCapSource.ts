/**
 * @fileoverview CoinMarketCap Oracle Source
 * @version 1.0.0
 */

import { IOracleSource } from '../../types/IOracleSource.js';
import { PriceData, SourceInfo } from '../../types/oracle-types.js';

const SYMBOL_TO_CMC_ID: Record<string, number> = {
     XLM: 512,
     BTC: 1,
     ETH: 1027,
     USDC: 3408,
     USDT: 825,
     SOL: 5426,
     ADA: 2010,
     DOT: 6636,
     AVAX: 9462,
     LINK: 1975,
     UNI: 7083,
     ATOM: 3794,
     DOGE: 74,
     MATIC: 3890,
     LTC: 2,
     BCH: 1831,
     XRP: 52,
     ALGO: 4030,
     NEAR: 6535,
     FTM: 3513,
     AAVE: 7278,
     CRV: 6538,
     MKR: 1518,
     SNX: 2586,
     COMP: 5692,
     SUSHI: 6758,
     YFI: 5864,
};

export class CoinMarketCapSource implements IOracleSource {
     readonly name = 'coinmarketcap';
     private readonly apiKey: string;
     private readonly baseUrl = 'https://pro-api.coinmarketcap.com/v1';

     constructor(apiKey?: string) {
          this.apiKey = apiKey ?? process.env.CMC_API_KEY ?? '';
          if (!this.apiKey) {
               throw new Error('CoinMarketCap API key is required. Pass it or set CMC_API_KEY env var.');
          }
     }

     private normalizeSymbol(symbol: string): string {
          return (symbol.split('/')[0] || symbol).trim().toUpperCase();
     }

     async getPrice(symbol: string): Promise<PriceData> {
          const base = this.normalizeSymbol(symbol);
          if (!SYMBOL_TO_CMC_ID[base]) {
               throw new Error(`Unsupported symbol: ${symbol}`);
          }

          const url = `${this.baseUrl}/cryptocurrency/quotes/latest?symbol=${base}&convert=USD`;
          const response = await fetch(url, {
               headers: {
                    'X-CMC_PRO_API_KEY': this.apiKey,
                    'Content-Type': 'application/json',
               },
          });

          if (!response.ok) {
               throw new Error(`CoinMarketCap API error: ${response.status} ${response.statusText}`);
          }

          const data = (await response.json()) as {
               data: Record<string, { quote: { USD: { price: number } } }>;
          };

          const price = data.data[base]?.quote?.USD?.price;
          if (price == null || typeof price !== 'number' || !Number.isFinite(price)) {
               throw new Error(`Invalid price data for ${symbol}`);
          }

          return {
               symbol: base,
               price,
               timestamp: new Date(),
               source: this.name,
               metadata: { cmcId: SYMBOL_TO_CMC_ID[base], apiVersion: 'v1' },
          };
     }

     async getPrices(symbols: string[]): Promise<PriceData[]> {
          const bases = symbols.map((s) => this.normalizeSymbol(s));
          const filtered = bases.filter((b) => Boolean(SYMBOL_TO_CMC_ID[b]));

          if (filtered.length === 0) return [];

          const url = `${this.baseUrl}/cryptocurrency/quotes/latest?symbol=${filtered.join(',')}&convert=USD`;
          const response = await fetch(url, {
               headers: {
                    'X-CMC_PRO_API_KEY': this.apiKey,
                    'Content-Type': 'application/json',
               },
          });

          if (!response.ok) {
               throw new Error(`CoinMarketCap API error: ${response.status} ${response.statusText}`);
          }

          const data = (await response.json()) as {
               data: Record<string, { quote: { USD: { price: number } } }>;
          };

          const results: PriceData[] = [];
          for (const base of filtered) {
               const price = data.data[base]?.quote?.USD?.price;
               if (price != null && typeof price === 'number' && Number.isFinite(price)) {
                    results.push({
                         symbol: base,
                         price,
                         timestamp: new Date(),
                         source: this.name,
                         metadata: { cmcId: SYMBOL_TO_CMC_ID[base], apiVersion: 'v1' },
                    });
               }
          }

          return results;
     }

     getSourceInfo(): SourceInfo {
          return {
               name: this.name,
               description: 'CoinMarketCap cryptocurrency price API',
               version: '1.0.0',
               supportedSymbols: Object.keys(SYMBOL_TO_CMC_ID),
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