# 🔮 Galaxy Oracles

> **Price oracle aggregation system for Stellar DeFi protocols**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Stellar](https://img.shields.io/badge/Stellar-Soroban-purple)](https://stellar.org/)

## 📋 Overview

`@galaxy/core-oracles` provides a robust price aggregation system that fetches and combines price data from multiple oracle sources. It includes outlier detection, validation, caching, and multiple aggregation strategies to ensure accurate and reliable price feeds.

### Key Features

- ✅ **Multiple Aggregation Strategies** - Median, Weighted Average, and TWAP
- ✅ **Outlier Detection** - Statistical methods (IQR, Z-score) to filter anomalies
- ✅ **Source Health Monitoring** - Circuit breaker pattern for failing sources
- ✅ **Caching Layer** - In-memory cache with TTL to reduce API calls
- ✅ **Validation** - Multiple validation layers (staleness, deviation, minimum sources)
- ✅ **Graceful Degradation** - Continues working even when some sources fail
- ✅ **Type Safety** - Full TypeScript support with comprehensive types
- ✅ **Extensible** - Easy to add custom oracle sources
- ✅ **Testing** - 95%+ test coverage

## � Supported Oracle Sources

The package provides implementations for popular price data providers:

### Built-in Sources

- **CoinGecko** - Comprehensive cryptocurrency price data
- **CoinMarketCap** - Professional market data and analytics
- **Custom API Sources** - Implement your own sources via `IOracleSource`

### Mock Sources (for testing)

- **MockOracleSource** - Configurable mock with custom prices
- **FailingMockSource** - Always fails for testing error handling
- **SlowMockSource** - Simulates slow responses
- **UnhealthyMockSource** - Always unhealthy for circuit breaker testing

## �📦 Installation

```bash
npm install @galaxy/core-oracles
```

## 🚀 Quick Start

### Basic Usage

```typescript
import {
  OracleAggregator,
  MedianStrategy,
  IOracleSource,
  PriceData,
  SourceInfo,
} from '@galaxy/core-oracles';

// 1. Create oracle sources (implement IOracleSource)
class CoinGeckoSource implements IOracleSource {
  readonly name = 'coingecko';

  async getPrice(symbol: string): Promise<PriceData> {
    // Fetch from CoinGecko API
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`
    );
    const data = await response.json();

    return {
      symbol,
      price: data[symbol].usd,
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
      description: 'CoinGecko price feed',
      version: '1.0.0',
      supportedSymbols: [],
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

// 2. Create aggregator and add sources
const aggregator = new OracleAggregator({
  minSources: 2,
  maxDeviationPercent: 10,
  maxStalenessMs: 60000,
  enableOutlierDetection: true,
  outlierThreshold: 2.0,
});

const coingecko = new CoinGeckoSource();
const coinmarketcap = new CoinMarketCapSource(); // Similar implementation

aggregator.addSource(coingecko, 1.0);
aggregator.addSource(coinmarketcap, 1.0);

// 3. Get aggregated price
const aggregated = await aggregator.getAggregatedPrice('XLM');
console.log('Aggregated Price:', aggregated.price);
console.log('Confidence:', aggregated.confidence);
console.log('Sources Used:', aggregated.sourcesUsed);
```

## 📚 Core Concepts

### IOracleSource Interface

All oracle sources must implement the `IOracleSource` interface:

```typescript
interface IOracleSource {
  readonly name: string;
  getPrice(symbol: string): Promise<PriceData>;
  getPrices(symbols: string[]): Promise<PriceData[]>;
  getSourceInfo(): SourceInfo;
  isHealthy(): Promise<boolean>;
}
```

### Aggregation Strategies

The aggregator supports three strategies:

1. **MedianStrategy** (default) - Uses median price, robust against outliers
2. **WeightedAverageStrategy** - Weighted average based on source weights
3. **TWAPStrategy** - Time-weighted average price, weights recent prices higher

```typescript
// Use median strategy (default)
const aggregator = new OracleAggregator();
aggregator.setStrategy(new MedianStrategy());

// Use weighted average
aggregator.setStrategy(new WeightedAverageStrategy());

// Use TWAP
import { PriceCache } from '@galaxy/core-oracles';
const cache = new PriceCache({ ttlMs: 60000 });
aggregator.setStrategy(new TWAPStrategy(cache, 60000));
```

### Price Validation

The aggregator validates prices using multiple checks:

- **Staleness Check** - Prices must be within `maxStalenessMs`
- **Minimum Sources** - Requires at least `minSources` valid prices
- **Deviation Check** - Filters prices that deviate too much from median
- **Outlier Detection** - Uses statistical methods to filter anomalies

### Caching

Prices are cached to reduce API calls:

```typescript
// Cache configuration
const aggregator = new OracleAggregator(
  {}, // aggregation config
  {
    ttlMs: 60000, // 60 seconds TTL
    maxSize: 1000, // Max cache entries
    enableFallback: true, // Use cache on failures
  }
);

// Clear cache
aggregator.clearCache();
```

### Circuit Breaker

Sources are automatically monitored with a circuit breaker:

- **CLOSED** - Source is healthy, calls are allowed
- **OPEN** - Source is failing, calls are blocked
- **HALF_OPEN** - Testing if source recovered

```typescript
// Check source health
const health = await aggregator.getSourceHealth();
console.log('Source Health:', health);
```

## 🔧 API Reference

### OracleAggregator

#### Constructor

```typescript
new OracleAggregator(
  config?: Partial<AggregationConfig>,
  cacheConfig?: Partial<CacheConfig>,
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>
)
```

#### Methods

##### `addSource(source: IOracleSource, weight?: number): void`

Add an oracle source with optional weight.

```typescript
aggregator.addSource(coingecko, 1.0);
aggregator.addSource(coinmarketcap, 0.8); // Lower weight
```

##### `removeSource(name: string): void`

Remove an oracle source.

```typescript
aggregator.removeSource('coingecko');
```

##### `getAggregatedPrice(symbol: string): Promise<AggregatedPrice>`

Get aggregated price for a symbol.

```typescript
const result = await aggregator.getAggregatedPrice('XLM');
// Returns: { symbol, price, timestamp, confidence, sourcesUsed, outliersFiltered, sourceCount }
```

##### `getAggregatedPrices(symbols: string[]): Promise<AggregatedPrice[]>`

Get aggregated prices for multiple symbols.

```typescript
const results = await aggregator.getAggregatedPrices(['XLM', 'USDC']);
```

##### `setStrategy(strategy: AggregationStrategy): void`

Set aggregation strategy.

```typescript
aggregator.setStrategy(new WeightedAverageStrategy());
```

##### `getSourceHealth(): Promise<Map<string, boolean>>`

Get health status of all sources.

```typescript
const health = await aggregator.getSourceHealth();
console.log(health.get('coingecko')); // true or false
```

##### `updateConfig(config: Partial<AggregationConfig>): void`

Update aggregation configuration.

```typescript
aggregator.updateConfig({ minSources: 3 });
```

### Types

#### PriceData

```typescript
interface PriceData {
  symbol: string;
  price: number;
  timestamp: Date;
  source: string;
  metadata?: Record<string, unknown>;
}
```

#### AggregatedPrice

```typescript
interface AggregatedPrice {
  symbol: string;
  price: number;
  timestamp: Date;
  confidence: number; // 0-1, based on source count
  sourcesUsed: string[]; // Sources included in aggregation
  outliersFiltered: string[]; // Sources filtered as outliers
  sourceCount: number; // Number of sources used
  metadata?: Record<string, unknown>;
}
```

#### AggregationConfig

```typescript
interface AggregationConfig {
  minSources: number; // Minimum sources required (default: 2)
  maxDeviationPercent: number; // Max deviation % (default: 10)
  maxStalenessMs: number; // Max age in ms (default: 60000)
  enableOutlierDetection: boolean; // Enable outlier filtering (default: true)
  outlierThreshold: number; // Z-score threshold (default: 2.0)
}
```

## 🛠️ Development

### Adding a Custom Source

1. **Implement IOracleSource**

```typescript
class MyCustomSource implements IOracleSource {
  readonly name = 'my-custom-source';

  async getPrice(symbol: string): Promise<PriceData> {
    // Fetch price from your API
    const response = await fetch(`https://api.example.com/price/${symbol}`);
    const data = await response.json();

    return {
      symbol,
      price: data.price,
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
      description: 'My custom price source',
      version: '1.0.0',
      supportedSymbols: [],
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.getPrice('test');
      return true;
    } catch {
      return false;
    }
  }
}
```

2. **Add to Aggregator**

```typescript
const aggregator = new OracleAggregator();
aggregator.addSource(new MyCustomSource(), 1.0);
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Building

```bash
# Build the package
npm run build

# Build in watch mode (for development)
npm run dev
```

## 🔒 Best Practices

### 1. Use Multiple Sources

Always use at least 2-3 sources for redundancy:

```typescript
aggregator.addSource(source1, 1.0);
aggregator.addSource(source2, 1.0);
aggregator.addSource(source3, 1.0);
```

### 2. Set Appropriate Weights

Use weights to prioritize more reliable sources:

```typescript
aggregator.addSource(reliableSource, 2.0); // Higher weight
aggregator.addSource(lessReliableSource, 1.0); // Lower weight
```

### 3. Configure Validation

Adjust validation parameters based on your use case:

```typescript
const aggregator = new OracleAggregator({
  minSources: 3, // Require 3 sources
  maxDeviationPercent: 5, // Stricter deviation (5%)
  maxStalenessMs: 30000, // 30 seconds max age
  enableOutlierDetection: true,
  outlierThreshold: 2.5, // Stricter outlier detection
});
```

### 4. Handle Errors Gracefully

The aggregator handles source failures automatically, but you should handle aggregation errors:

```typescript
try {
  const price = await aggregator.getAggregatedPrice('XLM');
  // Use price
} catch (error) {
  // Fallback logic (e.g., use cached price, use single source, etc.)
  console.error('Aggregation failed:', error);
}
```

### 5. Monitor Source Health

Regularly check source health:

```typescript
const health = await aggregator.getSourceHealth();
for (const [source, isHealthy] of health) {
  if (!isHealthy) {
    console.warn(`Source ${source} is unhealthy`);
  }
}
```

## 🧪 Testing

The package includes comprehensive tests with 95%+ coverage:

- **Unit Tests** - All utilities, strategies, and validators
- **Integration Tests** - Full aggregator with mock sources
- **Error Handling Tests** - Circuit breaker, retry logic, fallbacks

```bash
npm test                 # Run all tests
npm run test:coverage    # Generate coverage report
```

## 📖 Examples

See the `docs/examples/oracles/` directory for complete examples:

- `03-aggregator-setup.ts` - Basic aggregator setup and usage
- `04-custom-source.ts` - Implementing a custom IOracleSource
- `05-strategies.ts` - Using different aggregation strategies

## 🤝 Contributing

1. Follow the project's TypeScript style guide
2. Write comprehensive tests (aim for 95%+ coverage)
3. Update documentation for new features
4. Add examples for new sources or strategies

## 📄 License

MIT © Galaxy DevKit Team

## 🔗 Links

- [Galaxy DevKit Documentation](../../docs/)
- [Stellar Documentation](https://developers.stellar.org/)
- [Soroban Documentation](https://soroban.stellar.org/)

---

**Built with ❤️ for the Stellar ecosystem**
