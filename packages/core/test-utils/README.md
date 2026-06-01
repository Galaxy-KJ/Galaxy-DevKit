# Galaxy Test Utilities

Shared helpers for integration tests that need live Stellar testnet accounts,
transaction verification, or reusable contract deployment fixtures.

## Testnet Accounts

Normal unit tests do not call Friendbot. Enable live testnet setup explicitly:

```bash
GALAXY_TESTNET_INTEGRATION=1 GALAXY_TESTNET_WORKERS=2 npm test
```

When enabled, Jest global setup funds one account per worker and writes them to
`GALAXY_TESTNET_ACCOUNTS_FILE`.

```typescript
import {
  createTestnetHelperContext,
  loadFundedAccountsFromEnv,
} from '@galaxy-kj/core-test-utils';

const accounts = await loadFundedAccountsFromEnv();
const testnet = createTestnetHelperContext(accounts);
const account = testnet.getAccountForWorker();
```

## Transaction Verification

```typescript
import { submitAndVerifyTransaction } from '@galaxy-kj/core-test-utils';

const { submission, verified } = await submitAndVerifyTransaction(server, tx);
```

## Contract Fixtures

```typescript
import {
  ContractFixtureRegistry,
  createContractFixture,
} from '@galaxy-kj/core-test-utils';

const registry = new ContractFixtureRegistry();
const fixture = createContractFixture({
  name: 'counter',
  deploy: async (context) => deployCounter(context),
  initialize: async (deployment, context) => initCounter(deployment, context),
});

const deployed = await registry.deploy(fixture, testnet);
await registry.cleanup();
```
