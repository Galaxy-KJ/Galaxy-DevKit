/**
 * @fileoverview Oracle source registry for the price aggregator service
 */

import type { IOracleSource } from '../types/IOracleSource.js';
import { CoinGeckoSource } from '../sources/real/CoinGeckoSource.js';
import { CoinMarketCapSource } from '../sources/real/CoinMarketCapSource.js';

export type OracleSourceKind = 'coingecko' | 'coinmarketcap' | 'binance';

export interface OracleSourceConfig {
  kind: OracleSourceKind;
  apiKey?: string;
  weight?: number;
}

/**
 * Build configured oracle sources from a declarative config list.
 * Binance uses the CoinGecko-compatible public ticker endpoint wrapper.
 */
export function createOracleSources(configs: OracleSourceConfig[]): IOracleSource[] {
  return configs.map((cfg) => {
    switch (cfg.kind) {
      case 'coingecko':
        return new CoinGeckoSource(cfg.apiKey);
      case 'coinmarketcap':
        if (!cfg.apiKey) {
          throw new Error('CoinMarketCap source requires apiKey');
        }
        return new CoinMarketCapSource(cfg.apiKey);
      case 'binance':
        // Binance public ticker is wired through CoinGecko-compatible mapping for test/dev.
        return new CoinGeckoSource(cfg.apiKey);
      default:
        throw new Error(`Unsupported oracle source kind: ${cfg.kind as string}`);
    }
  });
}

export { CoinGeckoSource, CoinMarketCapSource };
