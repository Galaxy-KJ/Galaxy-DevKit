/**
 * @fileoverview Custom Oracle Source Implementation Example
 * @description How to implement a custom IOracleSource
 * @example
 * ```bash
 * npx ts-node docs/examples/oracles/04-custom-source.ts
 * ```
 */

import {
  IOracleSource,
  PriceData,
  SourceInfo,
  OracleAggregator,
} from '../../../packages/core/oracles/src';

/**
 * Example: CoinGecko Oracle Source Implementation
 * 
 * This demonstrates how to implement IOracleSource interface
 * for a real-world price API (CoinGecko).
 */
class CoinGeckoSource implements IOracleSource {
  readonly name = 'coingecko';
  private readonly apiKey?: string;
  private readonly baseUrl = 'https://api.coingecko.com/api/v3';

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch price for a single symbol
   * Maps symbol to CoinGecko coin ID
   */
  async getPrice(symbol: string): Promise<PriceData> {
    // Map symbol to CoinGecko ID
    const coinId = this.mapSymbolToCoinId(symbol);

    const url = `${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=usd`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['x-cg-demo-api-key'] = this.apiKey;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(
        `CoinGecko API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    const price = data[coinId]?.usd;

    if (!price || typeof price !== 'number') {
      throw new Error(`Invalid price data for ${symbol}`);
    }

    return {
      symbol,
      price,
      timestamp: new Date(),
      source: this.name,
      metadata: {
        coinId,
        apiVersion: 'v3',
      },
    };
  }

  /**
   * Fetch prices for multiple symbols
   * Optimized to use batch API if available
   */
  async getPrices(symbols: string[]): Promise<PriceData[]> {
    // CoinGecko supports batch requests
    const coinIds = symbols.map((s) => this.mapSymbolToCoinId(s)).join(',');
    const url = `${this.baseUrl}/simple/price?ids=${coinIds}&vs_currencies=usd`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['x-cg-demo-api-key'] = this.apiKey;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(
        `CoinGecko API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    const prices: PriceData[] = [];

    for (const symbol of symbols) {
      const coinId = this.mapSymbolToCoinId(symbol);
      const price = data[coinId]?.usd;

      if (price && typeof price === 'number') {
        prices.push({
          symbol,
          price,
          timestamp: new Date(),
          source: this.name,
          metadata: {
            coinId,
            apiVersion: 'v3',
          },
        });
      }
    }

    return prices;
  }

  /**
   * Get source information
   */
  getSourceInfo(): SourceInfo {
    return {
      name: this.name,
      description: 'CoinGecko cryptocurrency price API',
      version: '1.0.0',
      supportedSymbols: [
        'XLM',
        'BTC',
        'ETH',
        'USDC',
        'USDT',
        // Add more supported symbols
      ],
      metadata: {
        apiUrl: this.baseUrl,
        rateLimit: '50 calls/minute (free tier)',
      },
    };
  }

  /**
   * Health check
   * Tests if the API is accessible
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Use a common coin (bitcoin) for health check
      await this.getPrice('BTC');
      return true;
    } catch (error) {
      console.error(`CoinGecko health check failed:`, error);
      return false;
    }
  }

  /**
   * Map symbol to CoinGecko coin ID
   * This is a simplified mapping - in production, use a comprehensive mapping
   */
  private mapSymbolToCoinId(symbol: string): string {
    const mapping: Record<string, string> = {
      XLM: 'stellar',
      BTC: 'bitcoin',
      ETH: 'ethereum',
      USDC: 'usd-coin',
      USDT: 'tether',
    };

    const coinId = mapping[symbol.toUpperCase()];
    if (!coinId) {
      throw new Error(`Unsupported symbol: ${symbol}`);
    }

    return coinId;
  }
}

/**
 * Example: Simple HTTP-based Oracle Source
 * 
 * This is a simpler example that fetches from a generic HTTP endpoint
 */
class SimpleHttpSource implements IOracleSource {
  readonly name = 'simple-http';
  private readonly apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  async getPrice(symbol: string): Promise<PriceData> {
    const url = `${this.apiUrl}/price/${symbol}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();

    return {
      symbol,
      price: data.price,
      timestamp: new Date(data.timestamp || Date.now()),
      source: this.name,
    };
  }

  async getPrices(symbols: string[]): Promise<PriceData[]> {
    return Promise.all(symbols.map((s) => this.getPrice(s)));
  }

  getSourceInfo(): SourceInfo {
    return {
      name: this.name,
      description: 'Simple HTTP-based price source',
      version: '1.0.0',
      supportedSymbols: [],
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Main example function
 */
async function main() {
  console.log('🔧 Custom Oracle Source Implementation Example\n');

  // Example 1: Using CoinGecko source
  console.log('1. Creating CoinGecko source...');
  const coingecko = new CoinGeckoSource();
  console.log('✅ CoinGecko source created\n');

  console.log('   Source Info:');
  const info = coingecko.getSourceInfo();
  console.log(`   Name: ${info.name}`);
  console.log(`   Description: ${info.description}`);
  console.log(`   Supported Symbols: ${info.supportedSymbols.join(', ')}\n`);

  // Note: This will fail in example without real API access
  // Uncomment to test with real API:
  /*
  try {
    console.log('2. Fetching price from CoinGecko...');
    const price = await coingecko.getPrice('XLM');
    console.log(`✅ Price: $${price.price} (${price.source})\n`);
  } catch (error) {
    console.log(`⚠️  API call failed (expected in example): ${(error as Error).message}\n`);
  }
  */

  // Example 2: Using simple HTTP source
  console.log('2. Creating simple HTTP source...');
  const httpSource = new SimpleHttpSource('https://api.example.com');
  console.log('✅ Simple HTTP source created\n');

  // Example 3: Adding custom source to aggregator
  console.log('3. Adding custom source to aggregator...');
  const aggregator = new OracleAggregator();

  // For demonstration, we'll use a mock source
  // In real usage, you would use your custom source:
  // aggregator.addSource(coingecko, 1.0);

  console.log('✅ Custom source can be added to aggregator\n');

  console.log('📝 Implementation Checklist:');
  console.log('   ✅ Implement IOracleSource interface');
  console.log('   ✅ Implement getPrice(symbol) method');
  console.log('   ✅ Implement getPrices(symbols[]) method');
  console.log('   ✅ Implement getSourceInfo() method');
  console.log('   ✅ Implement isHealthy() method');
  console.log('   ✅ Handle errors gracefully');
  console.log('   ✅ Add retry logic if needed');
  console.log('   ✅ Map symbols to API-specific identifiers');
  console.log('   ✅ Add source to aggregator with weight\n');

  console.log('✅ Example completed!');
}

// Run example
// @ts-ignore - Node.js globals for example execution
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    // @ts-ignore
    process.exit(1);
  });
}

export { main, CoinGeckoSource, SimpleHttpSource };
