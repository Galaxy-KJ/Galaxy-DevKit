# @galaxy-kj/core-defi

## Overview
The `defi` package provides decentralized finance capabilities for the Galaxy DevKit. Its core feature is the `DexAggregatorService`, which coordinates price discovery across SDEX (Horizon path payments) and AMM protocols to find the best swap route for any asset pair.

## Structure
- `src/services/DexAggregatorService.ts`: Core aggregator service for routing and quotes.
- `src/types/aggregator.types.ts`: Typings for liquidity sources, quotes, and swaps.

For detailed integration guides, see:
- [DEX Aggregator Guide](../../../docs/defi/aggregator-guide.md)
- [Soroswap Integration Guide](../../../docs/defi/soroswap-integration.md)
