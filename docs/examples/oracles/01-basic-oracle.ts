/**
 * @fileoverview Basic Oracle Usage Example
 * @description Simple example of using a single oracle source
 * @example
 * ```bash
 * npx ts-node docs/examples/oracles/01-basic-oracle.ts
 * ```
 */

import {
  IOracleSource,
  PriceData,
  SourceInfo,
} from '../../../packages/core/oracles/dist/index.js';

/**
 * Example CoinGecko oracle source implementation
 */
class CoinGeckoSource implements IOracleSource {
  readonly name = 'coingecko';

  async getPrice(symbol: string): Promise<PriceData> {
    // In a real implementation, this would call the CoinGecko API
    console.log(`Fetching price for ${symbol} from CoinGecko...`);

    // Simulate API call
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`
    );
    const data = await response.json();

    return {
      symbol,
      price: data[symbol]?.usd || 0,
      timestamp: new Date(),
      source: this.name,
    };
  }

  async getPrices(symbols: string[]): Promise<PriceData[]> {
    return Promise.all(symbols.map(s => this.getPrice(s)));
  }

  getSourceInfo(): SourceInfo {
    return {
      name: this.name,
      description: 'CoinGecko cryptocurrency price API',
      version: '1.0.0',
      supportedSymbols: ['bitcoin', 'ethereum', 'stellar'],
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.getPrice('bitcoin');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Main example function
 */
async function main() {
  console.log('🔮 Basic Oracle Usage Example\n');

  // Create oracle source
  const coingecko = new CoinGeckoSource();

  // Check source info
  const info = coingecko.getSourceInfo();
  console.log('Source Info:', info);

  // Check health
  const healthy = await coingecko.isHealthy();
  console.log('Source Healthy:', healthy);

  // Get single price
  try {
    const price = await coingecko.getPrice('stellar');
    console.log(`\nStellar Price: $${price.price.toFixed(4)}`);
    console.log(`Timestamp: ${price.timestamp}`);
    console.log(`Source: ${price.source}`);
  } catch (error) {
    console.error('Error fetching price:', error);
  }

  // Get multiple prices
  try {
    const prices = await coingecko.getPrices(['bitcoin', 'ethereum']);
    console.log('\nMultiple Prices:');
    prices.forEach(p => {
      console.log(`  ${p.symbol}: $${p.price.toFixed(2)}`);
    });
  } catch (error) {
    console.error('Error fetching prices:', error);
  }
}

// Run example
main().catch(console.error);
