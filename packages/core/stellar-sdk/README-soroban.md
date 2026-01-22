# Soroban Contract Invocation Utilities

The Soroban Contract Invocation Utilities provide a comprehensive, developer-friendly interface for interacting with Soroban smart contracts on the Stellar network. This module includes contract deployment, function invocation, state queries, event monitoring, and various helper utilities.

## Features

- **Contract Management**: Deploy, upgrade, and interact with Soroban contracts
- **Type-Safe Operations**: Full type conversion between JavaScript and Soroban ScVal types
- **Event Monitoring**: Real-time event streaming and historical event queries
- **Token Contract Support**: Specialized wrapper for token contracts
- **ABI Parsing**: Parse and work with contract ABIs
- **Error Handling**: Comprehensive error parsing and handling
- **Testing Support**: Full test suite with mocked dependencies

## Quick Start

```typescript
import {
  SorobanContractManager,
  TokenContractWrapper,
  ContractEventMonitor,
} from '@galaxy/core-stellar-sdk';

// Initialize contract manager
const manager = new SorobanContractManager(
  'https://soroban-testnet.stellar.org'
);

// Deploy a contract
const deploymentResult = await manager.deployContract({
  wasm: contractWasm,
  deployer: adminKeypair,
  networkPassphrase: 'Test SDF Network ; September 2015',
});

// Invoke contract methods
const result = await manager.invokeContract({
  contractId: deploymentResult.contractId,
  method: 'initialize',
  args: [initialValue],
  caller: adminKeypair,
  networkPassphrase: 'Test SDF Network ; September 2015',
});

// Work with token contracts
const tokenWrapper = new TokenContractWrapper(
  tokenContractId,
  'Test SDF Network ; September 2015'
);

await tokenWrapper.transfer(fromKeypair, toAddress, '10000000');

// Monitor events
const eventMonitor = new ContractEventMonitor();
await eventMonitor.subscribeToEvents({
  contractId: deploymentResult.contractId,
  onEvent: event => {
    console.log('Contract event:', event);
  },
});
```

## Core Classes

### SorobanContractManager

Main class for Soroban contract operations including deployment, invocation, state queries, and upgrades.

```typescript
const manager = new SorobanContractManager(rpcUrl);

// Deploy contract
const deployment = await manager.deployContract(params);

// Invoke contract
const result = await manager.invokeContract(params);

// Simulate invocation
const simulation = await manager.simulateInvocation(params);

// Read contract state
const state = await manager.readContractState(params);

// Query events
const events = await manager.queryEvents(params);

// Upgrade contract
const upgrade = await manager.upgradeContract(params);
```

### ScValConverter

Utility class for converting between JavaScript types and Soroban ScVal types.

```typescript
// Convert to ScVal
const scVal = ScValConverter.toScVal(value, 'u64');

// Convert from ScVal
const jsValue = ScValConverter.fromScVal(scVal);

// Encode arguments
const args = ScValConverter.encodeArgs(
  [1, 'hello', true],
  ['u32', 'string', 'bool']
);

// Decode result
const result = ScValConverter.decodeResult(resultScVal, 'string');
```

### ContractEventMonitor

Monitor and subscribe to contract events with filtering and analysis capabilities.

```typescript
const monitor = new ContractEventMonitor();

// Subscribe to events
const subscriptionId = await monitor.subscribeToEvents({
  contractId: '...',
  eventTypes: ['transfer', 'approval'],
  onEvent: event => console.log(event),
});

// Query historical events
const events = await monitor.queryEvents({
  contractId: '...',
  startLedger: 1000,
  endLedger: 2000,
});

// Filter events
const transferEvents = monitor.filterEventsByTopic(events, 'transfer');

// Get statistics
const stats = monitor.getEventStats(events);
```

### TokenContractWrapper

Specialized wrapper for token contracts with common token operations.

```typescript
const tokenWrapper = new TokenContractWrapper(
  contractId,
  networkPassphrase,
  rpcUrl
);

// Get token info
const info = await tokenWrapper.getInfo();

// Get balance
const balance = await tokenWrapper.getBalance(accountId);

// Transfer tokens
await tokenWrapper.transfer(fromKeypair, toAddress, amount);

// Approve spender
await tokenWrapper.approve(ownerKeypair, spenderAddress, amount);

// Format amounts
const formatted = tokenWrapper.formatAmount('10000000'); // "1"
const parsed = tokenWrapper.parseAmount('1.5'); // "15000000"
```

## Utility Classes

### AbiParser

Parse and work with Soroban contract ABIs.

```typescript
// Parse ABI from specification
const abi = AbiParser.parseFromSpec(contractSpec);

// Get function by name
const func = AbiParser.getFunctionByName(abi, 'transfer');

// Validate arguments
const validation = AbiParser.validateArguments(func, args);

// Build function signature
const signature = AbiParser.buildFunctionSignature(func);
```

### ErrorParser

Parse and handle Soroban contract errors.

```typescript
// Parse error from result
const error = ErrorParser.parseError(resultScVal);

// Parse transaction error
const txError = ErrorParser.parseTransactionError(resultXdr, metaXdr);

// Check if error is recoverable
const isRecoverable = ErrorParser.isRecoverableError(error);

// Get retry delay
const delay = ErrorParser.getRetryDelay(error, attemptCount);
```

### FunctionSignatureBuilder

Build and validate function signatures.

```typescript
// Build signature hash
const hash = FunctionSignatureBuilder.buildSignatureHash('transfer', [
  'address',
  'address',
  'u64',
]);

// Create invocation
const invocation = FunctionSignatureBuilder.createInvocation('transfer', [
  from,
  to,
  amount,
]);

// Validate arguments
const validation = FunctionSignatureBuilder.validateArguments(func, args);
```

### EventDecoder

Decode contract events with schema support.

```typescript
// Decode event
const decoded = EventDecoder.decodeEvent(rawEvent, eventDefinition);

// Decode transfer event
const transfer = EventDecoder.decodeTransferEvent(event);

// Create custom decoder
const decoder = EventDecoder.createEventDecoder(eventSchemas);
```

## Type System

The utilities support all Soroban ScVal types:

- **Primitive types**: `void`, `bool`, `u32`, `i32`, `u64`, `i64`, `u128`, `i128`, `u256`, `i256`, `f32`, `f64`
- **String types**: `bytes`, `string`, `symbol`, `address`
- **Container types**: `option`, `result`, `vec`, `map`, `set`, `tuple`

## Error Handling

Comprehensive error handling with detailed error information:

```typescript
try {
  await manager.invokeContract(params);
} catch (error) {
  if (error instanceof SorobanError) {
    console.log('Error type:', error.type);
    console.log('Error code:', error.code);
    console.log('Should retry:', ErrorParser.shouldRetry(error, attemptCount));
  }
}
```

## Testing

Full test suite included with mocked dependencies:

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- soroban-contract-manager.test.ts
```

## Examples

See the `docs/examples/stellar-sdk/` directory for comprehensive examples:

- `22-deploy-contract.ts` - Deploy Soroban contract
- `23-invoke-contract.ts` - Call contract functions
- `24-contract-events.ts` - Monitor events
- `25-token-contract.ts` - Interact with token contract

## Best Practices

1. **Always simulate before invoking**: Use simulation to estimate costs and validate inputs
2. **Handle errors gracefully**: Use the ErrorParser to understand and handle errors
3. **Monitor events**: Use the ContractEventMonitor for real-time updates
4. **Use type conversion**: Let ScValConverter handle type conversions automatically
5. **Test thoroughly**: Use the comprehensive test suite as a reference

## Integration with AI

The utilities are designed to work seamlessly with AI assistants. Common patterns:

```typescript
// AI-generated contract interactions
async function executeContractMethod(
  contractId: string,
  method: string,
  args: any[]
) {
  const simulation = await manager.simulateInvocation({
    contractId,
    method,
    args,
    networkPassphrase: 'Test SDF Network ; September 2015',
  });

  if (!simulation.error) {
    return await manager.invokeContract({
      contractId,
      method,
      args,
      caller: adminKeypair,
      networkPassphrase: 'Test SDF Network ; September 2015',
    });
  }

  throw new Error(`Simulation failed: ${simulation.error}`);
}
```

This provides a complete, production-ready solution for Soroban contract integration with comprehensive error handling, type safety, and developer convenience.
