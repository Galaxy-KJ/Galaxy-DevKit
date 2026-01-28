/**
 * @fileoverview Oracle Aggregator Usage Example
 * @description Example of using OracleAggregator with multiple sources
 * @example
 * ```bash
 * npx ts-node docs/examples/oracles/02-aggregator.ts
 * ```
 */

import {
  OracleAggregator,
  IOracleSource,
  PriceData,
  SourceInfo,
  MedianStrategy,
} from '../../../packages/core/oracles/dist/index.js';

/**
 * Mock CoinGecko source for demonstration
 */
class MockCoinGeckoSource implements IOracleSource {
  readonly name = 'coingecko';

  async getPrice(symbol: string): Promise<PriceData> {
    // Simulate slight variation
    const basePrice = symbol === 'stellar' ? 0.15 : 50000;
    const variation = (Math.random() - 0.5) * 0.02; // ±1%
    const price = basePrice * (1 + variation);

    return {
      symbol,
      price,
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
      description: 'Mock CoinGecko API',
      version: '1.0.0',
      supportedSymbols: ['bitcoin', 'ethereum', 'stellar'],
    };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}

/**
 * Mock CoinMarketCap source
 */
class MockCoinMarketCapSource implements IOracleSource {
  readonly name = 'coinmarketcap';

  async getPrice(symbol: string): Promise<PriceData> {
    // Different base prices to simulate real variation
    const basePrice = symbol === 'stellar' ? 0.16 : 51000;
    const variation = (Math.random() - 0.5) * 0.015; // ±0.75%
    const price = basePrice * (1 + variation);

    return {
      symbol,
      price,
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
      description: 'Mock CoinMarketCap API',
      version: '1.0.0',
      supportedSymbols: ['bitcoin', 'ethereum', 'stellar'],
    };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}

/**
 * Main example function
 */
async function main() {
  console.log('🔮 Oracle Aggregator Usage Example\n');

  // Create aggregator with custom config
  const aggregator = new OracleAggregator(
    {
      minSources: 2,
      maxDeviationPercent: 5,
      maxStalenessMs: 30000,
    },
    {
      ttlMs: 10000, // 10 second cache
    }
  );

  // Create sources
  const coingecko = new MockCoinGeckoSource();
  const coinmarketcap = new MockCoinMarketCapSource();

  // Add sources to aggregator
  aggregator.addSource(coingecko, 0.6); // 60% weight
  aggregator.addSource(coinmarketcap, 0.4); // 40% weight

  console.log(
    'Added sources:',
    aggregator.getSourceHealth().map(s => s.name)
  );

  // Set aggregation strategy
  aggregator.setStrategy(new MedianStrategy());
  console.log('Using strategy:', aggregator.getStrategy().getName());

  // Get aggregated price
  try {
    console.log('\nFetching aggregated Stellar price...');
    const result = await aggregator.getAggregatedPrice('stellar');

    console.log(`Aggregated Price: $${result.price.toFixed(4)}`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`Sources Used: ${result.sourcesUsed.length}`);
    console.log(`Outliers Filtered: ${result.outliersFiltered.length}`);
    console.log(`Timestamp: ${result.timestamp}`);

    if (result.sourcesUsed.length > 0) {
      console.log('\nSource Details:');
      result.sourcesUsed.forEach(source => {
        console.log(`  ${source.source}: $${source.price.toFixed(4)}`);
      });
    }
  } catch (error) {
    console.error('Error getting aggregated price:', error);
  }

  // Get multiple symbols
  try {
    console.log('\nFetching multiple symbols...');
    const results = await aggregator.getAggregatedPrices([
      'bitcoin',
      'ethereum',
    ]);

    results.forEach(result => {
      console.log(
        `${result.symbol}: $${result.price.toFixed(2)} (confidence: ${(result.confidence * 100).toFixed(1)}%)`
      );
    });
  } catch (error) {
    console.error('Error getting multiple prices:', error);
  }

  // Demonstrate caching
  console.log('\nTesting cache...');
  const start = Date.now();
  await aggregator.getAggregatedPrice('stellar'); // Should use cache
  const duration = Date.now() - start;
  console.log(`Cached request took ${duration}ms`);
}

// Run example
main().catch(console.error);
