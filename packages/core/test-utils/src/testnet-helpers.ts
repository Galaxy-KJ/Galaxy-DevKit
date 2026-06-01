import { promises as fs } from 'node:fs';

import { Horizon, Keypair, Networks } from '@stellar/stellar-sdk';

const DEFAULT_HORIZON_URL = 'https://horizon-testnet.stellar.org';
const DEFAULT_FRIENDBOT_URL = 'https://friendbot.stellar.org';
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_CONFIRMATION_ATTEMPTS = 15;

export interface TestnetHelperConfig {
  horizonUrl?: string;
  friendbotUrl?: string;
  networkPassphrase?: string;
  fetchImpl?: typeof fetch;
}

export interface FundedTestAccount {
  publicKey: string;
  secretKey: string;
  workerId: number;
  fundedAt: string;
}

export interface SubmitAndVerifyOptions {
  attempts?: number;
  pollIntervalMs?: number;
}

export interface HorizonServerLike {
  submitTransaction(transaction: unknown): Promise<{ hash: string; [key: string]: unknown }>;
  transactions(): {
    transaction(hash: string): {
      call(): Promise<unknown>;
    };
  };
}

export interface TestnetHelperContext {
  server: Horizon.Server;
  networkPassphrase: string;
  accounts: FundedTestAccount[];
  getAccountForWorker(workerId?: number): FundedTestAccount;
}

export function createHorizonServer(horizonUrl = DEFAULT_HORIZON_URL): Horizon.Server {
  return new Horizon.Server(horizonUrl);
}

export async function fundAccountWithFriendbot(
  publicKey: string,
  config: TestnetHelperConfig = {},
): Promise<void> {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('A fetch implementation is required to call Friendbot');
  }

  const friendbotUrl = config.friendbotUrl ?? DEFAULT_FRIENDBOT_URL;
  const response = await fetchImpl(`${friendbotUrl}?addr=${encodeURIComponent(publicKey)}`);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Friendbot funding failed for ${publicKey}: ${response.status} ${body}`.trim());
  }
}

export async function createFundedTestAccount(
  workerId = 1,
  config: TestnetHelperConfig = {},
): Promise<FundedTestAccount> {
  const keypair = Keypair.random();
  await fundAccountWithFriendbot(keypair.publicKey(), config);

  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
    workerId,
    fundedAt: new Date().toISOString(),
  };
}

export async function createFundedTestAccounts(
  workerCount: number,
  config: TestnetHelperConfig = {},
): Promise<FundedTestAccount[]> {
  if (!Number.isInteger(workerCount) || workerCount < 1) {
    throw new Error('workerCount must be a positive integer');
  }

  return Promise.all(
    Array.from({ length: workerCount }, (_, index) =>
      createFundedTestAccount(index + 1, config),
    ),
  );
}

export function createTestnetHelperContext(
  accounts: FundedTestAccount[],
  config: TestnetHelperConfig = {},
): TestnetHelperContext {
  if (accounts.length === 0) {
    throw new Error('At least one funded test account is required');
  }

  return {
    server: createHorizonServer(config.horizonUrl),
    networkPassphrase: config.networkPassphrase ?? Networks.TESTNET,
    accounts,
    getAccountForWorker(workerId = currentJestWorkerId()): FundedTestAccount {
      return accounts[(workerId - 1) % accounts.length];
    },
  };
}

export async function submitAndVerifyTransaction(
  server: HorizonServerLike,
  transaction: unknown,
  options: SubmitAndVerifyOptions = {},
): Promise<{ submission: { hash: string; [key: string]: unknown }; verified: unknown }> {
  const submission = await server.submitTransaction(transaction);
  const verified = await waitForTransaction(server, submission.hash, options);

  return { submission, verified };
}

export async function waitForTransaction(
  server: Pick<HorizonServerLike, 'transactions'>,
  hash: string,
  options: SubmitAndVerifyOptions = {},
): Promise<unknown> {
  const attempts = options.attempts ?? DEFAULT_CONFIRMATION_ATTEMPTS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await server.transactions().transaction(hash).call();
    } catch (error) {
      lastError = error;
      await delay(pollIntervalMs);
    }
  }

  throw new Error(
    `Transaction ${hash} was not confirmed after ${attempts} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

export async function loadFundedAccountsFromFile(path: string): Promise<FundedTestAccount[]> {
  const raw = await fs.readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as FundedTestAccount[];

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`No funded test accounts found in ${path}`);
  }

  return parsed;
}

export async function loadFundedAccountsFromEnv(): Promise<FundedTestAccount[]> {
  const accountsFile = process.env.GALAXY_TESTNET_ACCOUNTS_FILE;
  if (!accountsFile) {
    throw new Error('GALAXY_TESTNET_ACCOUNTS_FILE is not set');
  }

  return loadFundedAccountsFromFile(accountsFile);
}

export function currentJestWorkerId(): number {
  const parsed = Number.parseInt(process.env.JEST_WORKER_ID ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
