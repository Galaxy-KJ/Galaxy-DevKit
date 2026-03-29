# DEX Aggregator Guide

## Overview
`DexAggregatorService` in `@galaxy-kj/core-defi-protocols` queries Soroswap and SDEX simultaneously to find the best execution price for a given asset pair. It also supports explicit split execution, returning a route breakdown plus savings versus the best single venue.

## Routing Strategies and Quote Flow
When `getBestQuote` is called:
1. **Request:** The service takes an `assetIn`, `assetOut`, and `amountIn`.
2. **Route:** It concurrently queries Soroswap and SDEX.
3. **Split evaluation:** It evaluates default split candidates across both venues.
4. **Selection:** It returns the execution plan with the highest `totalAmountOut`.

### Quote Example
```typescript
import { DexAggregatorService } from '@galaxy-kj/core-defi-protocols';

const aggregator = new DexAggregatorService(soroswapConfig);

const quote = await aggregator.getBestQuote(
  { code: 'XLM', type: 'native' },
  { code: 'USDC', issuer: 'GA...', type: 'credit_alphanum4' },
  '100'
);

console.log('Expected out:', quote.totalAmountOut);
console.log('Execution routes:', quote.routes);
```

## Explicit Split Quotes
Use `getSplitQuote` when you want to force an allocation across venues.

```typescript
const quote = await aggregator.getSplitQuote(
  { code: 'XLM', type: 'native' },
  { code: 'USDC', issuer: 'GA...', type: 'credit_alphanum4' },
  '100',
  [60, 40]
);

console.log(quote.routes);
```

## REST API

`GET /api/v1/defi/aggregator/quote?assetIn=XLM&assetOut=USDC:GA...&amountIn=100`

Optionally, force a split:

`GET /api/v1/defi/aggregator/quote?assetIn=XLM&assetOut=USDC:GA...&amountIn=100&splits=60,40`

## Error Handling
The aggregator manages several constraints:
- **Price Impact:** Soroswap price impact is estimated from the constant-product reserve curve.
- **Split validation:** Split weights must contain exactly two non-negative values, in `[soroswap, sdex]` order.
- **Insufficient Liquidity / Network Errors:** Individual source failures are tolerated during best-route discovery when another venue still returns a quote. If no venue succeeds, the service throws an error.
