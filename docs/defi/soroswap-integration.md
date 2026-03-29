# Soroswap Protocol Integration

## Overview
Soroswap is integrated as a primary AMM liquidity source in the `DexAggregatorService`. It leverages the `@galaxy-kj/core-defi-protocols` package to interface with Soroswap smart contracts.

## How it is Integrated
1. **Pricing:** The `fetchSoroswapQuote` method initializes the protocol via `ProtocolFactory` and calls `getSwapQuote(assetIn, assetOut, amountIn)`.
2. **Execution:** The `buildSoroswapSwapTransaction` calls the `swap` method on the protocol, returning the transaction hash (XDR) ready for signing.

Docs for Soroswap: [Soroswap Documentation](https://docs.soroswap.finance/).

## Adding New Protocol Sources
To add a new protocol source (e.g., Aquarius):
1. **Types:** Add the Source ID to the `LiquiditySource` union in `aggregator.types.ts`.
2. **Quoting:** Implement a `fetch<Protocol>Quote(params)` method in `DexAggregatorService` that conforms to `RouteQuote`.
3. **Execution:** Implement a `build<Protocol>SwapTransaction(params)` method to return an unsigned XDR string.
4. **Registration:** Update the switch-cases inside `fetchQuoteFromSource` and `buildSwapTransaction`.

## Testing and Mocking Protocal Responses
To unit test the aggregator without hitting real networks, mock the `ProtocolFactory` in Jest:

```typescript
import { ProtocolFactory } from '@galaxy-kj/core-defi-protocols';

jest.mock('@galaxy-kj/core-defi-protocols', () => ({
  ...jest.requireActual('@galaxy-kj/core-defi-protocols'),
  ProtocolFactory: {
    getInstance: jest.fn().mockReturnValue({
      createProtocol: jest.fn().mockReturnValue({
        initialize: jest.fn().mockResolvedValue(true),
        getSwapQuote: jest.fn().mockResolvedValue({
          amountOut: '99',
          priceImpact: '0.1',
          path: []
        }),
        swap: jest.fn().mockResolvedValue({ hash: 'AAAA...' })
      })
    })
  }
}));
```
