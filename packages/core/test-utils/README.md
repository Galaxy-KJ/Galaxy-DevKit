# @galaxy-kj/core-test-utils

Shared integration testing framework for Galaxy DevKit.

## Features

- **Testnet Helpers**: Easy Friendbot funding and transaction submission.
- **Contract Fixtures**: Helpers to deploy Soroban contracts for testing.
- **Parallel Testing Support**: Automatic worker account funding to avoid SequenceNumber conflicts.
- **Global Setup**: Pre-funds worker accounts before tests run.

## Usage

### Getting a pre-funded account

```typescript
import { getWorkerAccount } from '@galaxy-kj/core-test-utils';

it('should do something', async () => {
  const account = await getWorkerAccount();
  // account is already funded on Testnet
});
```

### Deploying a contract

```typescript
import { deployPriceOracleFixture } from '@galaxy-kj/core-test-utils';

it('should test the oracle', async () => {
  const account = await getWorkerAccount();
  const { contractId } = await deployPriceOracleFixture(account);
});
```

## Configuration

The package is automatically configured via the root `jest.config.js`. It uses a `globalSetup` script to fund accounts for each worker.
