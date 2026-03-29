# DEX Aggregator Guide

## Overview
`DexAggregatorService` queries multiple liquidity sources (SDEX via Horizon, Soroswap AMM) simultaneously to find the best execution price for a given asset pair. It currently supports routing and price comparison, culminating in an unsigned XDR transaction for client-side signing.

## Routing Strategies and Quote Flow
When `getAggregatedQuote` is called:
1. **Request:** The service takes an `assetIn`, `assetOut`, and `amountIn`.
2. **Route:** It concurrently queries all configured `LiquiditySource`s (`sdex`, `soroswap`).
3. **Selection:** Results are filtered and sorted best-first (highest `amountOut`), returning an `AggregatedQuote`.

### Quote Example
```typescript
import { DexAggregatorService } from '@galaxy-kj/core-defi';

const aggregator = new DexAggregatorService(horizonServer, soroswapConfig);

const quote = await aggregator.getAggregatedQuote({
  assetIn: { code: 'XLM', type: 'native' },
  assetOut: { code: 'USDC', issuer: 'GA...', type: 'credit_alphanum4' },
  amountIn: '100',
});

console.log('Best source:', quote.bestRoute.source);
console.log('Expected out:', quote.bestRoute.amountOut);
```

## Executing a Swap
From a quote, you can construct an unsigned transaction using `executeAggregatedSwap`.

```typescript
const swapResult = await aggregator.executeAggregatedSwap({
  signerPublicKey: 'GA...',
  assetIn: { code: 'XLM', type: 'native' },
  assetOut: { code: 'USDC', issuer: 'GA...', type: 'credit_alphanum4' },
  amountIn: '100',
  minAmountOut: '95', // Slippage protection
});

console.log('XDR to sign:', swapResult.xdr);
```

### Smart Wallet Integration
The resulting `xdr` is left unsigned by design. It can be passed to the Smart Wallet integration (via passkey signatures) to authorize the swap transaction safely on behalf of the user.

## Error Handling
The aggregator manages several constraints:
- **Price Impact:** `highImpactWarning` is flagged if the chosen route has a price impact >= 5%.
- **Slippage Exceeded:** Controlled by passing `minAmountOut` during execution. If the actual return is lower, the transaction fails on-chain.
- **Insufficient Liquidity / Network Errors:** Individual source quote failures are swallowed during aggregation, allowing the service to fallback to the remaining functioning sources. If no sources succeed, it throws an error.
