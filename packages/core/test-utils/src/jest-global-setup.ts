import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createFundedTestAccounts } from './testnet-helpers';

export default async function globalSetup(): Promise<void> {
  if (process.env.GALAXY_TESTNET_INTEGRATION !== '1') {
    return;
  }

  const workerCount = Number.parseInt(
    process.env.GALAXY_TESTNET_WORKERS ?? process.env.JEST_WORKERS ?? '1',
    10,
  );
  const accounts = await createFundedTestAccounts(Number.isFinite(workerCount) ? workerCount : 1);
  const accountsFile = path.join(
    os.tmpdir(),
    `galaxy-testnet-accounts-${process.pid}-${Date.now()}.json`,
  );

  await fs.writeFile(accountsFile, JSON.stringify(accounts, null, 2));

  process.env.GALAXY_TESTNET_ACCOUNTS_FILE = accountsFile;
  process.env.GALAXY_TESTNET_ACCOUNT_PUBLIC_KEY = accounts[0].publicKey;
  process.env.GALAXY_TESTNET_ACCOUNT_SECRET_KEY = accounts[0].secretKey;
}
