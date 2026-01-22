/**
 * @fileoverview Aggregation Strategies Example
 * @description Using different aggregation strategies
 * @example
 * ```bash
 * npx ts-node docs/examples/oracles/05-strategies.ts
 * ```
 */

import {
  OracleAggregator,
  MedianStrategy,
  WeightedAverageStrategy,
  TWAPStrategy,
  PriceCache,
  IOracleSource,
  PriceData,
  SourceInfo,
} from '../../../packages/core/oracles/src';

/**
 * Mock oracle source for demonstration
 */
class MockSource implements IOracleSource {
  constructor(
    public readonly name: string,
    private basePrice: number
  ) {}

  async getPrice(symbol: string): Promise<PriceData> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const variation = (Math.random() - 0.5) * 2;
    return {
      symbol,
      price: this.basePrice + variation,
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
      description: `Mock source ${this.name}`,
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
  console.log('📊 Aggregation Strategies Example\n');

  // Create sources with different base prices
  const source1 = new MockSource('source1', 100);
  const source2 = new MockSource('source2', 101);
  const source3 = new MockSource('source3', 102);
  const source4 = new MockSource('source4', 103);
  const source5 = new MockSource('source5', 104);

  // Strategy 1: Median Strategy
  console.log('1️⃣  Median Strategy (Default)');
  console.log('   Best for: General use, robust against outliers\n');

  const medianAggregator = new OracleAggregator({
    minSources: 2,
    maxDeviationPercent: 10,
  });
  medianAggregator.setStrategy(new MedianStrategy());

  medianAggregator.addSource(source1, 1.0);
  medianAggregator.addSource(source2, 1.0);
  medianAggregator.addSource(source3, 1.0);
  medianAggregator.addSource(source4, 1.0);
  medianAggregator.addSource(source5, 1.0);

  try {
    const medianResult = await medianAggregator.getAggregatedPrice('XLM');
    console.log(`   Aggregated Price: $${medianResult.price.toFixed(4)}`);
    console.log(`   Sources Used: ${medianResult.sourcesUsed.length}`);
    console.log(`   Strategy: ${medianAggregator.getStrategy().getName()}\n`);
  } catch (error) {
    console.error(`   Error: ${(error as Error).message}\n`);
  }

  // Strategy 2: Weighted Average Strategy
  console.log('2️⃣  Weighted Average Strategy');
  console.log('   Best for: When you want to prioritize certain sources\n');

  const weightedAggregator = new OracleAggregator({
    minSources: 2,
    maxDeviationPercent: 10,
  });
  weightedAggregator.setStrategy(new WeightedAverageStrategy());

  // Add sources with different weights
  // Higher weight = more influence on final price
  weightedAggregator.addSource(source1, 0.5); // Highest weight (most trusted)
  weightedAggregator.addSource(source2, 0.3);
  weightedAggregator.addSource(source3, 0.15);
  weightedAggregator.addSource(source4, 0.05); // Lowest weight

  try {
    const weightedResult = await weightedAggregator.getAggregatedPrice('XLM');
    console.log(`   Aggregated Price: $${weightedResult.price.toFixed(4)}`);
    console.log(`   Sources Used: ${weightedResult.sourcesUsed.length}`);
    console.log(`   Strategy: ${weightedAggregator.getStrategy().getName()}`);
    console.log(`   Note: source1 (weight 0.5) has more influence\n`);
  } catch (error) {
    console.error(`   Error: ${(error as Error).message}\n`);
  }

  // Strategy 3: TWAP Strategy
  console.log('3️⃣  TWAP (Time-Weighted Average Price) Strategy');
  console.log('   Best for: When recency matters, reduces impact of stale prices\n');

  const cache = new PriceCache({ ttlMs: 60000 });
  const twapAggregator = new OracleAggregator({
    minSources: 2,
    maxDeviationPercent: 10,
  });
  twapAggregator.setStrategy(new TWAPStrategy(cache, 60000)); // 60 second window

  twapAggregator.addSource(source1, 1.0);
  twapAggregator.addSource(source2, 1.0);
  twapAggregator.addSource(source3, 1.0);

  try {
    const twapResult = await twapAggregator.getAggregatedPrice('XLM');
    console.log(`   Aggregated Price: $${twapResult.price.toFixed(4)}`);
    console.log(`   Sources Used: ${twapResult.sourcesUsed.length}`);
    console.log(`   Strategy: ${twapAggregator.getStrategy().getName()}`);
    console.log(`   Note: Recent prices have higher weight\n`);
  } catch (error) {
    console.error(`   Error: ${(error as Error).message}\n`);
  }

  // Comparison
  console.log('📈 Strategy Comparison\n');
  console.log('   Strategy          | Use Case                          | Pros');
  console.log('   ----------------- | --------------------------------- | --------------------');
  console.log('   Median            | General use                       | Robust, simple');
  console.log('   Weighted Average  | Prioritize sources                | Flexible, customizable');
  console.log('   TWAP              | Time-sensitive data               | Reduces stale data impact\n');

  // Dynamic strategy switching
  console.log('🔄 Dynamic Strategy Switching\n');
  const dynamicAggregator = new OracleAggregator();
  dynamicAggregator.addSource(source1, 1.0);
  dynamicAggregator.addSource(source2, 1.0);
  dynamicAggregator.addSource(source3, 1.0);

  console.log('   Switching strategies dynamically...\n');

  // Use median
  dynamicAggregator.setStrategy(new MedianStrategy());
  const result1 = await dynamicAggregator.getAggregatedPrice('XLM');
  console.log(`   Median: $${result1.price.toFixed(4)}`);

  // Switch to weighted average
  dynamicAggregator.setStrategy(new WeightedAverageStrategy());
  const result2 = await dynamicAggregator.getAggregatedPrice('XLM');
  console.log(`   Weighted Average: $${result2.price.toFixed(4)}`);

  // Switch to TWAP
  const twapCache = new PriceCache({ ttlMs: 60000 });
  dynamicAggregator.setStrategy(new TWAPStrategy(twapCache, 60000));
  const result3 = await dynamicAggregator.getAggregatedPrice('XLM');
  console.log(`   TWAP: $${result3.price.toFixed(4)}\n`);

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

export { main };
