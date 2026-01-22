/**
 * @fileoverview Oracle Aggregator Setup Example
 * @description Basic setup and usage of OracleAggregator
 * @example
 * ```bash
 * npx ts-node docs/examples/oracles/03-aggregator-setup.ts
 * ```
 */

import {
  OracleAggregator,
  MedianStrategy,
  IOracleSource,
  PriceData,
  SourceInfo,
} from '../../../packages/core/oracles/src';

/**
 * Mock oracle source implementation for demonstration
 */
class MockOracleSource implements IOracleSource {
  constructor(
    public readonly name: string,
    private basePrice: number = 100
  ) {}

  async getPrice(symbol: string): Promise<PriceData> {
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Add small random variation
    const variation = (Math.random() - 0.5) * 2; // -1 to +1
    const price = this.basePrice + variation;

    return {
      symbol,
      price,
      timestamp: new Date(),
      source: this.name,
    };
  }

  async getPrices(symbols: string[]): Promise<PriceData[]> {
    return Promise.all(symbols.map((s) => this.getPrice(s)));
  }

  getSourceInfo(): SourceInfo {
    return {
      name: this.name,
      description: `Mock oracle source ${this.name}`,
      version: '1.0.0',
      supportedSymbols: [],
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
  console.log('🚀 Oracle Aggregator Setup Example\n');

  // 1. Create aggregator with configuration
  console.log('1. Creating OracleAggregator...');
  const aggregator = new OracleAggregator({
    minSources: 2,              // Require at least 2 sources
    maxDeviationPercent: 10,    // Max 10% deviation
    maxStalenessMs: 60000,      // 60 seconds max age
    enableOutlierDetection: true,
    outlierThreshold: 2.0,      // Z-score threshold
  });
  console.log('✅ Aggregator created\n');

  // 2. Create and add oracle sources
  console.log('2. Adding oracle sources...');
  const source1 = new MockOracleSource('coingecko', 100);
  const source2 = new MockOracleSource('coinmarketcap', 101);
  const source3 = new MockOracleSource('binance', 102);

  aggregator.addSource(source1, 1.0);
  aggregator.addSource(source2, 1.0);
  aggregator.addSource(source3, 1.0);
  console.log('✅ Added 3 sources\n');

  // 3. Get aggregated price
  console.log('3. Fetching aggregated price for XLM...');
  try {
    const result = await aggregator.getAggregatedPrice('XLM');

    console.log('\n📊 Aggregation Result:');
    console.log(`   Symbol: ${result.symbol}`);
    console.log(`   Price: $${result.price.toFixed(4)}`);
    console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`   Sources Used: ${result.sourcesUsed.join(', ')}`);
    console.log(`   Source Count: ${result.sourceCount}`);
    if (result.outliersFiltered.length > 0) {
      console.log(`   Outliers Filtered: ${result.outliersFiltered.join(', ')}`);
    }
    console.log(`   Timestamp: ${result.timestamp.toISOString()}\n`);
  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
  }

  // 4. Get multiple prices
  console.log('4. Fetching aggregated prices for multiple symbols...');
  try {
    const results = await aggregator.getAggregatedPrices(['XLM', 'USDC']);

    console.log('\n📊 Multiple Prices:');
    for (const result of results) {
      console.log(`   ${result.symbol}: $${result.price.toFixed(4)} (${result.sourceCount} sources)`);
    }
    console.log();
  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
  }

  // 5. Check source health
  console.log('5. Checking source health...');
  const health = await aggregator.getSourceHealth();
  console.log('\n🏥 Source Health:');
  for (const [source, isHealthy] of health) {
    console.log(`   ${source}: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
  }
  console.log();

  // 6. Change aggregation strategy
  console.log('6. Switching to median strategy...');
  aggregator.setStrategy(new MedianStrategy());
  console.log(`   Current strategy: ${aggregator.getStrategy().getName()}\n`);

  // 7. Get sources list
  console.log('7. Registered sources:');
  const sources = aggregator.getSources();
  for (const source of sources) {
    console.log(`   ${source.name}: weight=${source.weight}, healthy=${source.isHealthy}`);
  }
  console.log();

  console.log('✅ Example completed successfully!');
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

export { main };
