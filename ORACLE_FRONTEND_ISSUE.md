---
name: Feature Request
about: Create oracle price feed frontend with Galaxy SDK integration
title: '[FEATURE] Price Oracle Dashboard Using Galaxy SDK v2.0.0'
labels: enhancement, phase-1, oracles, high-priority
assignees: ''
---

## 📋 Feature Description

**Clear and concise description of the feature:**

Create a price oracle dashboard frontend application that uses the newly published `@galaxy-kj/core-oracles` v2.0.0 package from npm. This is a real-time cryptocurrency price tracker that demonstrates oracle aggregation, multiple data sources, and price validation.

## 🎯 Motivation

**Why is this feature needed? What problem does it solve?**

1. **Test Oracle SDK**: Validate that `@galaxy-kj/core-oracles` works correctly in a real frontend application
2. **Demonstrate Aggregation**: Show how the SDK combines prices from multiple oracle sources
3. **SDK Validation**: Ensure the npm package functions as expected with proper TypeScript support
4. **User-Facing Tool**: Provide a working price dashboard for crypto traders and developers

## 💡 Proposed Solution

**How should this feature work? Include technical details:**

Build a Next.js dashboard application with the following features:

### Core Features
1. **Price Display** - Show real-time aggregated prices for multiple assets (XLM, BTC, ETH, USDC)
2. **Multiple Sources** - Display prices from individual oracle sources
3. **Aggregation Strategy** - Show median, weighted average, or TWAP
4. **Confidence Score** - Display aggregation confidence level
5. **Source Health** - Monitor oracle source health status
6. **Price Charts** - Simple price history visualization
7. **Outlier Detection** - Highlight filtered outlier prices

## 🔧 Technical Implementation

**Implementation details for AI/developers:**

### Files to Create/Modify

```
oracle-dashboard/
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.js
├── src/
│   ├── app/
│   │   ├── layout.tsx                  - Root layout
│   │   ├── page.tsx                    - Main dashboard
│   │   └── settings/page.tsx           - Oracle source settings
│   ├── components/
│   │   ├── PriceCard.tsx               - Single asset price card
│   │   ├── PriceGrid.tsx               - Grid of price cards
│   │   ├── SourceList.tsx              - List of oracle sources
│   │   ├── SourceHealth.tsx            - Source health indicators
│   │   ├── AggregationInfo.tsx         - Aggregation details
│   │   ├── StrategySelector.tsx        - Switch aggregation strategy
│   │   └── PriceChart.tsx              - Simple price chart
│   ├── hooks/
│   │   ├── useOracles.ts               - Oracle aggregator logic
│   │   ├── usePrices.ts                - Fetch aggregated prices
│   │   └── useSourceHealth.ts          - Monitor source health
│   ├── lib/
│   │   └── oracle-config.ts            - Oracle SDK setup
│   └── types/
│       └── index.ts                    - TypeScript types
└── README.md
```

### Dependencies

```json
{
  "dependencies": {
    "@galaxy-kj/core-oracles": "^2.0.0",
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "typescript": "^5.9.0",
    "lucide-react": "^0.300.0",
    "recharts": "^2.10.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0"
  }
}
```

### API Changes

**Core oracle hooks implementation:**

```typescript
// src/hooks/useOracles.ts
import {
  OracleAggregator,
  MedianStrategy,
  WeightedAverageStrategy,
  TWAPStrategy,
} from '@galaxy-kj/core-oracles';
import { useState, useMemo, useCallback } from 'react';

type StrategyType = 'median' | 'weighted' | 'twap';

export function useOracles() {
  const [strategy, setStrategy] = useState<StrategyType>('median');
  const [config, setConfig] = useState({
    minSources: 2,
    maxDeviationPercent: 10,
    maxStalenessMs: 60000,
    enableOutlierDetection: true,
    outlierThreshold: 2.0,
  });

  const aggregator = useMemo(() => {
    const agg = new OracleAggregator(config);

    // Set strategy based on selection
    if (strategy === 'median') {
      agg.setStrategy(new MedianStrategy());
    } else if (strategy === 'weighted') {
      agg.setStrategy(new WeightedAverageStrategy());
    } else {
      // TWAP needs cache
      agg.setStrategy(new TWAPStrategy());
    }

    // Add oracle sources here (you'll need to implement these)
    // Example: agg.addSource(new CoinGeckoSource(), 1.0);
    // Example: agg.addSource(new CoinMarketCapSource(), 1.0);

    return agg;
  }, [strategy, config]);

  const updateStrategy = useCallback((newStrategy: StrategyType) => {
    setStrategy(newStrategy);
  }, []);

  const updateConfig = useCallback((newConfig: Partial<typeof config>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  }, []);

  return {
    aggregator,
    strategy,
    config,
    updateStrategy,
    updateConfig,
  };
}

// src/hooks/usePrices.ts
import { OracleAggregator, AggregatedPrice } from '@galaxy-kj/core-oracles';
import { useState, useEffect } from 'react';

const DEFAULT_SYMBOLS = ['XLM', 'BTC', 'ETH', 'USDC'];

export function usePrices(aggregator: OracleAggregator, symbols: string[] = DEFAULT_SYMBOLS) {
  const [prices, setPrices] = useState<Map<string, AggregatedPrice>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrices = async () => {
      setLoading(true);
      setError(null);

      try {
        const results = await aggregator.getAggregatedPrices(symbols);
        const priceMap = new Map(
          results.map(r => [r.symbol, r])
        );
        setPrices(priceMap);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch prices');
        console.error('Price fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPrices();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, [aggregator, symbols]);

  return { prices, loading, error };
}

// src/hooks/useSourceHealth.ts
import { OracleAggregator } from '@galaxy-kj/core-oracles';
import { useState, useEffect } from 'react';

export function useSourceHealth(aggregator: OracleAggregator) {
  const [health, setHealth] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkHealth = async () => {
      setLoading(true);
      try {
        const healthStatus = await aggregator.getSourceHealth();
        setHealth(healthStatus);
      } catch (err) {
        console.error('Health check error:', err);
      } finally {
        setLoading(false);
      }
    };

    checkHealth();

    // Check health every 60 seconds
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, [aggregator]);

  return { health, loading };
}
```

**Main Dashboard Component:**

```typescript
// src/app/page.tsx
'use client';

import { useOracles } from '@/hooks/useOracles';
import { usePrices } from '@/hooks/usePrices';
import { useSourceHealth } from '@/hooks/useSourceHealth';
import { PriceGrid } from '@/components/PriceGrid';
import { SourceHealth } from '@/components/SourceHealth';
import { StrategySelector } from '@/components/StrategySelector';

export default function Dashboard() {
  const { aggregator, strategy, updateStrategy } = useOracles();
  const { prices, loading, error } = usePrices(aggregator);
  const { health } = useSourceHealth(aggregator);

  return (
    <main className="container mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">
          Galaxy Oracle Dashboard
        </h1>
        <p className="text-gray-600">
          Real-time cryptocurrency prices from multiple oracle sources
        </p>
      </div>

      {/* Strategy Selector */}
      <div className="mb-8">
        <StrategySelector
          current={strategy}
          onChange={updateStrategy}
        />
      </div>

      {/* Source Health Status */}
      <div className="mb-8">
        <SourceHealth health={health} />
      </div>

      {/* Price Grid */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <PriceGrid
        prices={prices}
        loading={loading}
      />
    </main>
  );
}
```

## ✅ Acceptance Criteria

### Setup & Installation
- [ ] Create fresh Next.js project with TypeScript and Tailwind
- [ ] Install `@galaxy-kj/core-oracles` from npm (v2.0.0)
- [ ] Application builds without errors (`npm run build`)
- [ ] Application runs in dev mode (`npm run dev`)

### Oracle Integration
- [ ] Can import and instantiate `OracleAggregator`
- [ ] Can add multiple oracle sources
- [ ] Can fetch aggregated prices for at least 4 assets (XLM, BTC, ETH, USDC)
- [ ] Prices update automatically (every 30s)
- [ ] Shows loading state while fetching
- [ ] Displays error messages if fetching fails

### Price Display
- [ ] Shows asset symbol prominently (e.g., "XLM", "BTC")
- [ ] Displays aggregated price with proper formatting
- [ ] Shows confidence score (0-1)
- [ ] Indicates number of sources used
- [ ] Shows timestamp of last update
- [ ] Color coding (green/red) for price changes

### Aggregation Strategy
- [ ] Can switch between Median, Weighted Average, and TWAP
- [ ] Strategy selector is clearly visible
- [ ] Prices update when strategy changes
- [ ] Shows which strategy is currently active

### Source Information
- [ ] Lists all configured oracle sources
- [ ] Shows health status for each source (healthy/unhealthy)
- [ ] Indicates which sources were used in aggregation
- [ ] Shows which sources were filtered as outliers
- [ ] Health status refreshes automatically (every 60s)

### Outlier Detection
- [ ] Displays when outliers are detected
- [ ] Shows which prices were filtered
- [ ] Indicates the reason for filtering
- [ ] Can toggle outlier detection on/off

### Advanced Features (Optional)
- [ ] Simple price chart showing history
- [ ] Percentage change over time
- [ ] Search/filter assets
- [ ] Export price data to CSV
- [ ] Dark mode toggle

### UI/UX
- [ ] Clean, modern design
- [ ] Responsive (mobile-friendly)
- [ ] Loading states for all async operations
- [ ] Error messages are user-friendly
- [ ] Consistent color scheme
- [ ] Price cards are easy to read

### TypeScript
- [ ] All imports work without TypeScript errors
- [ ] Proper type definitions for all components
- [ ] No `any` types in production code
- [ ] IntelliSense works for SDK methods
- [ ] AggregatedPrice type is used correctly

### Testing Report
- [ ] Create `TESTING-REPORT.md` with:
  - Installation experience
  - Oracle SDK functionality testing
  - Aggregation strategies comparison
  - Issues encountered
  - API ergonomics feedback
  - Performance observations
  - Recommendations

## 📚 Additional Context

**Screenshots, mockups, diagrams, or references:**

### SDK Documentation & Resources

Before starting, review these resources to understand how to use the Galaxy Oracle SDK:

**Package Documentation:**
- [@galaxy-kj/core-oracles README](https://github.com/Galaxy-KJ/Galaxy-DevKit/tree/main/packages/core/oracles#readme) - Oracle aggregation API and usage
- [Galaxy DevKit Main README](https://github.com/Galaxy-KJ/Galaxy-DevKit#readme) - Overall SDK documentation

**NPM Package:**
- [@galaxy-kj/core-oracles on npm](https://www.npmjs.com/package/@galaxy-kj/core-oracles)

**Example Implementation:**
- [Basic Template](https://github.com/Galaxy-KJ/Galaxy-DevKit/tree/main/packages/templates/basic) - Reference implementation showing SDK usage patterns
- [Oracle Examples](https://github.com/Galaxy-KJ/Galaxy-DevKit/tree/main/docs/examples/oracles) - Specific oracle usage examples

**Oracle API Documentation:**
- [CoinGecko API](https://www.coingecko.com/en/api/documentation) - Free crypto price API
- [CoinMarketCap API](https://coinmarketcap.com/api/) - Professional market data

### Main Dashboard Layout

```
┌─────────────────────────────────────────────────────┐
│  Galaxy Oracle Dashboard                            │
│                                                     │
│  Strategy: [Median ▼]  [Weighted Avg] [TWAP]      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  SOURCE HEALTH                              │   │
│  │  🟢 CoinGecko: Healthy                     │   │
│  │  🟢 CoinMarketCap: Healthy                 │   │
│  │  🔴 CustomAPI: Unhealthy                   │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐      │
│  │    XLM    │  │    BTC    │  │    ETH    │      │
│  │  $0.1234  │  │ $45,678   │  │ $3,456    │      │
│  │  ⬆ +2.5%  │  │  ⬇ -1.2%  │  │  ⬆ +0.8%  │      │
│  │           │  │           │  │           │      │
│  │ Sources:3 │  │ Sources:3 │  │ Sources:2 │      │
│  │ Conf:0.95 │  │ Conf:0.98 │  │ Conf:0.87 │      │
│  │ Updated:  │  │ Updated:  │  │ Updated:  │      │
│  │ 10s ago   │  │ 10s ago   │  │ 10s ago   │      │
│  └───────────┘  └───────────┘  └───────────┘      │
│                                                     │
│  ┌───────────┐  ┌───────────┐                      │
│  │   USDC    │  │   AQUA    │                      │
│  │  $1.0001  │  │  $0.0234  │                      │
│  │  ⬆ +0.01% │  │  ⬇ -3.4%  │                      │
│  │           │  │           │                      │
│  │ Sources:3 │  │ Sources:2 │                      │
│  │ Conf:0.99 │  │ Conf:0.76 │                      │
│  │ Updated:  │  │ Updated:  │                      │
│  │ 10s ago   │  │ 10s ago   │                      │
│  └───────────┘  └───────────┘                      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Price Card Details

Each price card should show:
```
┌─────────────────────┐
│  XLM                │
│  $0.1234            │  ← Large, bold price
│  ⬆ +2.5% (24h)      │  ← Green arrow for up, red for down
│                     │
│  Aggregation:       │
│  • Strategy: Median │
│  • Sources: 3/4     │  ← Used / Total
│  • Confidence: 0.95 │
│  • Outliers: 1      │  ← If any filtered
│                     │
│  Last updated:      │
│  10 seconds ago     │
└─────────────────────┘
```

### Aggregation Strategy Comparison

Show users what each strategy does:

**Median Strategy:**
- Uses middle value from all sources
- Robust against outliers
- Best for general use

**Weighted Average Strategy:**
- Averages prices based on source weights
- Prioritizes trusted sources
- Good when sources have different reliability

**TWAP (Time-Weighted Average Price):**
- Weights recent prices higher
- Smooths out volatility
- Good for trending analysis

### Oracle Source Implementation

You'll need to implement oracle sources (or use mock sources for testing):

```typescript
// Example: CoinGecko source implementation
import { IOracleSource, PriceData } from '@galaxy-kj/core-oracles';

class CoinGeckoSource implements IOracleSource {
  readonly name = 'coingecko';

  async getPrice(symbol: string): Promise<PriceData> {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`
    );
    const data = await response.json();

    return {
      symbol,
      price: data[symbol.toLowerCase()].usd,
      timestamp: new Date(),
      source: this.name,
    };
  }

  async getPrices(symbols: string[]): Promise<PriceData[]> {
    return Promise.all(symbols.map(s => this.getPrice(s)));
  }

  getSourceInfo() {
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
```

### Testing Scenarios

Test the following:

1. **Normal Operation:**
   - All sources return valid prices
   - Aggregation works correctly
   - Confidence is high (>0.9)

2. **One Source Fails:**
   - Only 2/3 sources return prices
   - Aggregation still works
   - Confidence is medium (0.7-0.9)

3. **Outlier Detection:**
   - One source returns significantly different price
   - Outlier is filtered
   - Shows which source was filtered

4. **All Sources Fail:**
   - No prices available
   - Error message displayed
   - Uses cached prices (if available)

## 🔗 Related Issues

- Tests Galaxy SDK v2.0.0 oracle functionality
- Validates npm package installation
- Demonstrates oracle aggregation strategies
- Provides production price dashboard

## 🏷️ Labels

**Phase**: phase-1
**Component**: oracles, sdk, frontend
**Priority**: high

---

**AI Development Notes:**
<!--
Add specific guidance for AI assistants:
- Key files to understand before implementation
- Patterns to follow
- Edge cases to consider
-->

### Before You Start

1. **Read the SDK documentation first:**
   - Review [@galaxy-kj/core-oracles README](https://github.com/Galaxy-KJ/Galaxy-DevKit/tree/main/packages/core/oracles#readme) for oracle API
   - Check [oracle examples](https://github.com/Galaxy-KJ/Galaxy-DevKit/tree/main/docs/examples/oracles) for usage patterns
   - Review the [basic template](https://github.com/Galaxy-KJ/Galaxy-DevKit/tree/main/packages/templates/basic) for integration examples

2. **Create new Next.js project:**
   ```bash
   npx create-next-app@latest oracle-dashboard --typescript --tailwind --app
   cd oracle-dashboard
   ```

3. **Install Oracle SDK from npm:**
   ```bash
   npm install @galaxy-kj/core-oracles@^2.0.0
   ```

4. **You will primarily use:**
   - `OracleAggregator` - Main aggregation class
   - `MedianStrategy`, `WeightedAverageStrategy`, `TWAPStrategy` - Aggregation strategies
   - `IOracleSource` - Interface for implementing oracle sources

### Implementation Priorities

**Phase 1 (Core - 2 hours):**
1. OracleAggregator setup
2. Mock oracle sources (use MockOracleSource from package)
3. Basic price display for 2-3 assets

**Phase 2 (Features - 2 hours):**
4. Add real oracle sources (CoinGecko, etc.)
5. Source health monitoring
6. Strategy selector

**Phase 3 (Polish - 1-2 hours):**
7. UI improvements
8. Auto-refresh
9. Error handling
10. Mobile responsive

### Key Patterns

1. **Format Prices:**
   ```tsx
   const formatPrice = (price: number) =>
     new Intl.NumberFormat('en-US', {
       style: 'currency',
       currency: 'USD',
       minimumFractionDigits: 2,
       maximumFractionDigits: price < 1 ? 6 : 2,
     }).format(price);
   ```

2. **Format Confidence:**
   ```tsx
   const formatConfidence = (conf: number) =>
     `${(conf * 100).toFixed(1)}%`;
   ```

3. **Color for Price Change:**
   ```tsx
   const priceColor = (change: number) =>
     change > 0 ? 'text-green-600' : 'text-red-600';
   ```

4. **Relative Time:**
   ```tsx
   const timeAgo = (timestamp: Date) => {
     const seconds = Math.floor((Date.now() - timestamp.getTime()) / 1000);
     if (seconds < 60) return `${seconds}s ago`;
     const minutes = Math.floor(seconds / 60);
     if (minutes < 60) return `${minutes}m ago`;
     return `${Math.floor(minutes / 60)}h ago`;
   };
   ```

### Testing Checklist

- [ ] Install from npm works
- [ ] TypeScript compiles without errors
- [ ] Can create OracleAggregator
- [ ] Can add oracle sources
- [ ] Prices fetch and display
- [ ] Auto-refresh works (30s)
- [ ] Strategy switching works
- [ ] Source health monitoring works
- [ ] Outlier detection works
- [ ] Error handling displays properly
- [ ] Mobile responsive
- [ ] Loading states show correctly

### Expected Behavior

**On First Load:**
- Shows loading spinner
- Fetches prices from all sources
- Displays aggregated prices
- Shows source health

**Every 30 Seconds:**
- Automatically refetches prices
- Updates display without full page reload
- Maintains selected strategy

**When Switching Strategy:**
- Re-aggregates prices with new strategy
- Updates confidence scores
- Shows updated results immediately

### Common Issues to Handle

1. **API Rate Limits:**
   - Use caching to reduce API calls
   - Show cached prices when rate limited
   - Display warning message

2. **Source Failures:**
   - Handle gracefully (don't crash)
   - Show which sources failed
   - Use remaining sources for aggregation

3. **Invalid Symbols:**
   - Validate symbol names
   - Show error for unsupported assets
   - Provide list of supported symbols

4. **Network Issues:**
   - Retry failed requests
   - Use exponential backoff
   - Show clear error messages

### Deliverables

1. **Working Application:**
   - Deployed to Vercel/Netlify
   - Public URL for testing

2. **README.md:**
   - Setup instructions
   - How to add oracle sources
   - Environment variables (if any)

3. **TESTING-REPORT.md:**
   - Installation experience
   - Each aggregation strategy tested
   - Source health monitoring
   - What worked well
   - Issues found
   - SDK API feedback
   - Performance observations
   - Recommendations

### Time Estimate

**5-7 hours:**
- Setup: 30 min
- Oracle integration: 2 hours
- Price display: 1.5 hours
- Strategy switching: 1 hour
- Source health: 1 hour
- UI polish: 1 hour
- Testing & docs: 1 hour

---

**Priority:** High - SDK validation needed ASAP

**Questions?** Comment on this issue.

**Good luck!** 🚀
