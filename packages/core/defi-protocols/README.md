# 💰 Galaxy DeFi Protocols

> **Integration layer for Stellar DeFi protocols**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Stellar](https://img.shields.io/badge/Stellar-Soroban-purple)](https://stellar.org/)

## 📋 Overview

`@galaxy/core-defi-protocols` provides a unified interface for interacting with DeFi protocols on the Stellar blockchain. It abstracts protocol-specific implementations behind a common interface, making it easy to integrate multiple protocols with consistent patterns.

### Supported Protocols

- **Blend Protocol** - Lending and borrowing
- **Soroswap** - Decentralized exchange
- **Aquarius** - Liquidity pools

## 🎯 Features

- ✅ **Unified Interface** - Common interface (`IDefiProtocol`) for all protocols
- ✅ **Type Safety** - Full TypeScript support with comprehensive types
- ✅ **Factory Pattern** - Easy protocol instantiation with factory service
- ✅ **Validation** - Built-in input validation for addresses, amounts, and assets
- ✅ **Error Handling** - Consistent error handling across all protocols
- ✅ **Extensible** - Easy to add new protocol implementations
- ✅ **Security** - Never stores private keys, validates all inputs
- ✅ **Testing** - 90%+ test coverage

## 📦 Installation

```bash
npm install @galaxy/core-defi-protocols
```

## 🚀 Quick Start

### Basic Usage

```typescript
import {
  getProtocolFactory,
  ProtocolConfig,
  TESTNET_CONFIG
} from '@galaxy/core-defi-protocols';

// 1. Create protocol configuration
const config: ProtocolConfig = {
  protocolId: 'blend',
  name: 'Blend Protocol',
  network: TESTNET_CONFIG,
  contractAddresses: {
    pool: 'CBLEND_POOL_CONTRACT_ADDRESS'
  },
  metadata: {}
};

// 2. Get protocol instance from factory
const factory = getProtocolFactory();
const blend = factory.createProtocol(config);

// 3. Initialize protocol
await blend.initialize();

// 4. Supply assets to earn interest
const result = await blend.supply(
  'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
  'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  {
    code: 'USDC',
    issuer: 'GAUSDC_ISSUER_ADDRESS',
    type: 'credit_alphanum4'
  },
  '1000.00'
);

console.log('Transaction hash:', result.hash);

// 5. Check position health
const position = await blend.getPosition(walletAddress);
console.log('Health Factor:', position.healthFactor);
console.log('Collateral Value:', position.collateralValue);
console.log('Debt Value:', position.debtValue);
```

## 📚 Core Concepts

### IDefiProtocol Interface

All protocols implement the `IDefiProtocol` interface, which defines:

- **Lending Operations**: `supply()`, `borrow()`, `repay()`, `withdraw()`
- **Position Management**: `getPosition()`, `getHealthFactor()`
- **Protocol Info**: `getSupplyAPY()`, `getBorrowAPY()`, `getStats()`
- **DEX Operations** (optional): `swap()`, `addLiquidity()`, `removeLiquidity()`

### BaseProtocol Abstract Class

The `BaseProtocol` abstract class provides common functionality:

- Network connection management
- Input validation (addresses, amounts, assets)
- Configuration validation
- Error handling utilities
- Transaction result building

### Protocol Factory

The `ProtocolFactory` uses the singleton pattern to manage protocol registration and instantiation:

```typescript
import { ProtocolFactory } from '@galaxy/core-defi-protocols';

const factory = ProtocolFactory.getInstance();

// Register a custom protocol
factory.register('my-protocol', MyProtocolClass);

// Create protocol instance
const protocol = factory.createProtocol(config);
```

## 🔧 API Reference

### Types

#### Asset

```typescript
interface Asset {
  code: string;                                    // e.g., 'USDC', 'XLM'
  issuer?: string;                                 // Required for non-native assets
  type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
}
```

#### Position

```typescript
interface Position {
  address: string;
  supplied: PositionBalance[];                     // Supplied assets
  borrowed: PositionBalance[];                     // Borrowed assets
  healthFactor: string;                            // >1.0 is healthy
  collateralValue: string;                         // Total collateral in USD
  debtValue: string;                               // Total debt in USD
}
```

#### TransactionResult

```typescript
interface TransactionResult {
  hash: string;                                    // Transaction hash
  status: 'success' | 'failed' | 'pending';
  ledger: number;                                  // Ledger number
  createdAt: Date;
  metadata: Record<string, unknown>;
}
```

#### Operation Types (Discriminated Unions)

```typescript
import {
  OperationType,
  SupplyOperation,
  SwapOperation,
  isSupplyOperation,
  isSwapOperation
} from '@galaxy/core-defi-protocols';

// All operation types: SupplyOperation, WithdrawOperation, BorrowOperation,
// RepayOperation, SwapOperation, AddLiquidityOperation, RemoveLiquidityOperation

const supplyOp: SupplyOperation = {
  type: OperationType.SUPPLY,
  timestamp: new Date(),
  walletAddress: 'GBRPY...OX2H',
  asset: { code: 'USDC', issuer: 'GAUS...', type: 'credit_alphanum4' },
  amount: '1000.0000000'
};

// Use type guards to narrow types
if (isSupplyOperation(op)) {
  console.log(`Supplying ${op.amount} of ${op.asset.code}`);
}
```

#### Error Classes

```typescript
import {
  ProtocolError,
  InsufficientBalanceError,
  SlippageExceededError,
  isProtocolError,
  wrapError
} from '@galaxy/core-defi-protocols';

// Available error classes:
// - ProtocolError (base) - ProtocolInitError - InsufficientBalanceError
// - InvalidOperationError - ContractError - SlippageExceededError - HealthFactorError

try {
  await protocol.supply(wallet, privateKey, asset, amount);
} catch (error) {
  if (isProtocolError(error)) {
    console.error(`[${error.code}] ${error.message}`);
    if (error instanceof InsufficientBalanceError) {
      console.log(`Need ${error.required}, have ${error.available}`);
    }
  } else {
    const wrapped = wrapError(error, 'blend');
    console.error(wrapped.toJSON());
  }
}
```

### Main Methods

#### initialize()

Initialize protocol connection and validate configuration.

```typescript
await protocol.initialize();
```

#### supply(walletAddress, privateKey, asset, amount)

Supply assets to the protocol to earn interest.

```typescript
const result = await protocol.supply(
  'GBRPY...OX2H',
  'SXXXX...XXXX',
  { code: 'USDC', issuer: 'GAUS...', type: 'credit_alphanum4' },
  '1000.00'
);
```

#### borrow(walletAddress, privateKey, asset, amount)

Borrow assets from the protocol against supplied collateral.

```typescript
const result = await protocol.borrow(
  'GBRPY...OX2H',
  'SXXXX...XXXX',
  { code: 'XLM', type: 'native' },
  '500.00'
);
```

#### getPosition(address)

Get user's current position in the protocol.

```typescript
const position = await protocol.getPosition('GBRPY...OX2H');
console.log('Health Factor:', position.healthFactor);
```

#### getHealthFactor(address)

Get detailed health factor information for a position.

```typescript
const health = await protocol.getHealthFactor('GBRPY...OX2H');
console.log('Is Healthy:', health.isHealthy);
console.log('Liquidation Threshold:', health.liquidationThreshold);
```

## 🔄 Soroswap Protocol (DEX)

Soroswap is a Uniswap V2-style decentralized exchange on Stellar. It supports token swaps and liquidity pool management.

### Quick Start

```typescript
import {
  SoroswapProtocol,
  SOROSWAP_TESTNET_CONFIG,
  getSoroswapConfig
} from '@galaxy/core-defi-protocols';

// Initialize Soroswap
const soroswap = new SoroswapProtocol(SOROSWAP_TESTNET_CONFIG);
await soroswap.initialize();

// Get protocol stats
const stats = await soroswap.getStats();
console.log('TVL:', stats.tvl);

// Get pair information
const pairInfo = await soroswap.getPairInfo(tokenAAddress, tokenBAddress);
console.log('Reserves:', pairInfo.reserve0, pairInfo.reserve1);

// Get all registered pairs
const pairs = await soroswap.getAllPairs();
```

### Factory Usage

```typescript
import { getProtocolFactory, SOROSWAP_TESTNET_CONFIG } from '@galaxy/core-defi-protocols';

// Soroswap auto-registers with the factory on import
const factory = getProtocolFactory();
const soroswap = factory.createProtocol(SOROSWAP_TESTNET_CONFIG);
await soroswap.initialize();
```

### DEX Operations (Coming Soon)

The following operations are stubbed and will be implemented in upcoming issues:

- `swap()` — Token swaps via the router contract (#27)
- `getSwapQuote()` — Get swap quotes with price impact (#28)
- `addLiquidity()` — Add liquidity to pools (#29)
- `removeLiquidity()` — Remove liquidity from pools (#30)
- `getLiquidityPool()` — Get pool information (#29)

### Contract Addresses

| Network | Router | Factory |
|---------|--------|---------|
| Testnet | `CCJUD55AG...ZE7BRD` | `CDP3HMUH6...RJTBY` |
| Mainnet | `CAG5LRYQ5...AJDDH` | `CA4HEQTL2...7AW2` |

## 🛠️ Development

### Adding a New Protocol

1. **Create Protocol Class**

```typescript
// src/protocols/my-protocol/my-protocol.ts
import { BaseProtocol } from '../base-protocol';
import { ProtocolType } from '../../types/defi-types';

export class MyProtocol extends BaseProtocol {
  protected getProtocolType(): ProtocolType {
    return ProtocolType.LENDING;
  }

  protected async setupProtocol(): Promise<void> {
    // Initialize protocol-specific connections
  }

  // Implement required abstract methods
  public async supply(...) { /* ... */ }
  public async borrow(...) { /* ... */ }
  // ... other methods
}
```

2. **Register Protocol**

```typescript
import { getProtocolFactory } from '@galaxy/core-defi-protocols';
import { MyProtocol } from './protocols/my-protocol/my-protocol';

const factory = getProtocolFactory();
factory.register('my-protocol', MyProtocol);
```

3. **Write Tests**

```typescript
// __tests__/protocols/my-protocol.test.ts
describe('MyProtocol', () => {
  it('should supply assets', async () => {
    const protocol = new MyProtocol(config);
    await protocol.initialize();
    const result = await protocol.supply(...);
    expect(result.status).toBe('success');
  });
});
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

## 🔒 Security

### Best Practices

1. **Unsigned Transaction Workflow** - Protocol methods can return unsigned XDRs when a `privateKey` is not provided (empty string). This allows for secure client-side signing (e.g., via Freighter or Hawkeye).
2. **Never Store Private Keys** - Private keys are only used to sign transactions and are never stored.
3. **Validate All Inputs** - Use built-in validation utilities for addresses, amounts, and assets.
3. **Check Health Factors** - Always check position health before risky operations
4. **Use Slippage Protection** - Set appropriate slippage tolerance for swaps
5. **Test on Testnet First** - Always test your integration on testnet before mainnet

### Input Validation

```typescript
import {
  validateAddress,
  validateAmount,
  validateAsset,
  validateSlippage
} from '@galaxy/core-defi-protocols';

// Validate Stellar address
validateAddress('GBRPY...OX2H');

// Validate amount
validateAmount('1000.50', 'Deposit Amount');

// Validate asset
validateAsset({
  code: 'USDC',
  issuer: 'GAUS...XXXX',
  type: 'credit_alphanum4'
});

// Validate slippage (0-1, e.g., 0.01 for 1%)
validateSlippage('0.01');
```

## 🧪 Testing

The package includes comprehensive tests with 90%+ coverage:

- **Unit Tests** - All utilities and services
- **Integration Tests** - Protocol implementations
- **Validation Tests** - Input validation

```bash
npm test                 # Run all tests
npm run test:coverage    # Generate coverage report
```

## 📖 Examples

See the `docs/examples/defi-protocols/` directory for complete examples:

- `01-basic-setup.ts` - Basic protocol setup and initialization
- `02-lending-operations.ts` - Supply, borrow, repay, withdraw
- `03-custom-protocol.ts` - Implementing a custom protocol
- `04-operations.ts` - Using different operation types and error handling

## 🤝 Contributing

1. Follow the project's TypeScript style guide
2. Write comprehensive tests (aim for 90%+ coverage)
3. Update documentation for new features
4. Add examples for new protocols

## 📄 License

MIT © Galaxy DevKit Team

## 🔗 Links

- [Galaxy DevKit Documentation](../../docs/)
- [Stellar Documentation](https://developers.stellar.org/)
- [Soroban Documentation](https://soroban.stellar.org/)
- [Blend Protocol](https://blend.capital/)
- [Soroswap](https://soroswap.finance/)

---

**Built with ❤️ for the Stellar ecosystem**
