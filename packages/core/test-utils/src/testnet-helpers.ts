/**
 * @fileoverview Testnet integration-test helpers
 * @description Friendbot funding, transaction submission/verification, and
 *   polling utilities used across all Galaxy DevKit integration test suites.
 *
 * Design notes
 * ─────────────
 * • Each Jest worker receives its OWN Friendbot allocation via
 *   `fundTestAccount` to avoid sequence-number conflicts when tests run in
 *   parallel (see GitHub issue #227 — AI dev notes).
 * • The global setup entry-point (`globalSetup`) funds a SHARED account once
 *   and writes its secret into an environment variable so sequential test
 *   suites can reuse it without extra Friendbot calls.
 * • All network constants default to testnet but can be overridden through
 *   environment variables or `TestnetConfig`.
 *
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2025-04-28
 */

import {
  Keypair,
  Networks,
  rpc,
  TransactionBuilder,
  BASE_FEE,
  Transaction,
  xdr,
} from '@stellar/stellar-sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Network topology understood by the helper suite. */
export type StellarNetwork = 'testnet' | 'futurenet';

/** Runtime config that callers may override per suite. */
export interface TestnetConfig {
  /** Stellar network to target (default: `'testnet'`). */
  network?: StellarNetwork;
  /** Soroban/Horizon RPC URL (overrides `STELLAR_RPC_URL`). */
  rpcUrl?: string;
  /** Friendbot URL (overrides `STELLAR_FRIENDBOT_URL`). */
  friendbotUrl?: string;
  /** Network passphrase (overrides `STELLAR_NETWORK_PASSPHRASE`). */
  networkPassphrase?: string;
  /** Maximum ledger polling attempts before timing out (default: 30). */
  maxPollAttempts?: number;
  /** Milliseconds between polling attempts (default: 2000). */
  pollIntervalMs?: number;
}

/** Resolved funding result returned by `fundTestAccount`. */
export interface FundedAccount {
  keypair: Keypair;
  publicKey: string;
  secretKey: string;
  network: StellarNetwork;
}

/** Result returned by `submitAndVerifyTransaction`. */
export interface SubmitResult {
  transactionHash: string;
  ledger: number;
  status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND';
  returnValue?: xdr.ScVal;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULTS = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  friendbotUrl: 'https://friendbot.stellar.org',
  networkPassphrase: Networks.TESTNET,
  maxPollAttempts: 30,
  pollIntervalMs: 2000,
} as const;

const FUTURENET_DEFAULTS = {
  rpcUrl: 'https://rpc-futurenet.stellar.org',
  friendbotUrl: 'https://friendbot-futurenet.stellar.org',
  networkPassphrase: Networks.FUTURENET,
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve effective config by merging constructor overrides → env vars →
 * network-specific defaults.
 */
export function resolveConfig(overrides: TestnetConfig = {}): Required<TestnetConfig> {
  const network: StellarNetwork =
    overrides.network ??
    (process.env['STELLAR_NETWORK'] as StellarNetwork | undefined) ??
    'testnet';

  const networkDefaults =
    network === 'futurenet' ? FUTURENET_DEFAULTS : DEFAULTS;

  return {
    network,
    rpcUrl:
      overrides.rpcUrl ??
      process.env['STELLAR_RPC_URL'] ??
      networkDefaults.rpcUrl,
    friendbotUrl:
      overrides.friendbotUrl ??
      process.env['STELLAR_FRIENDBOT_URL'] ??
      networkDefaults.friendbotUrl,
    networkPassphrase:
      overrides.networkPassphrase ??
      process.env['STELLAR_NETWORK_PASSPHRASE'] ??
      networkDefaults.networkPassphrase,
    maxPollAttempts: overrides.maxPollAttempts ?? DEFAULTS.maxPollAttempts,
    pollIntervalMs: overrides.pollIntervalMs ?? DEFAULTS.pollIntervalMs,
  };
}

// ─── Friendbot ────────────────────────────────────────────────────────────────

/**
 * Request a Friendbot XLM grant for `publicKey`.
 *
 * @throws {Error} When the Friendbot HTTP call fails or returns a non-OK status.
 */
export async function requestFriendbot(
  publicKey: string,
  friendbotUrl: string
): Promise<void> {
  const url = `${friendbotUrl}?addr=${encodeURIComponent(publicKey)}`;
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text().catch(() => '(no body)');
    throw new Error(
      `Friendbot request failed [HTTP ${response.status}] for ${publicKey}: ${body}`
    );
  }
}

/**
 * Generate a fresh Keypair **and** fund it via Friendbot.
 *
 * Each call generates a **unique** account, making this safe to call per-worker
 * to sidestep sequence-number conflicts in parallel test runs.
 *
 * @example
 * ```ts
 * const { keypair } = await fundTestAccount();
 * ```
 */
export async function fundTestAccount(
  config: TestnetConfig = {}
): Promise<FundedAccount> {
  const resolved = resolveConfig(config);
  const keypair = Keypair.random();

  await requestFriendbot(keypair.publicKey(), resolved.friendbotUrl);

  return {
    keypair,
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
    network: resolved.network,
  };
}

/**
 * Fund an **existing** Keypair via Friendbot (useful for deterministic keys in
 * sequential globalSetup scenarios).
 */
export async function fundExistingAccount(
  keypair: Keypair,
  config: TestnetConfig = {}
): Promise<FundedAccount> {
  const resolved = resolveConfig(config);
  await requestFriendbot(keypair.publicKey(), resolved.friendbotUrl);
  return {
    keypair,
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
    network: resolved.network,
  };
}

// ─── Transaction helpers ──────────────────────────────────────────────────────

/**
 * Sleep for `ms` milliseconds.  Used between poll attempts.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Poll the RPC for a transaction result until it is confirmed or the attempt
 * limit is reached.
 *
 * @returns The resolved `GetTransactionResponse` on success.
 * @throws  {Error} if the transaction is not found within `maxPollAttempts`.
 */
export async function pollForTransaction(
  server: rpc.Server,
  txHash: string,
  config: TestnetConfig = {}
): Promise<rpc.Api.GetTransactionResponse> {
  const { maxPollAttempts, pollIntervalMs } = resolveConfig(config);

  for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
    const result = await server.getTransaction(txHash);

    if (result.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) {
      return result;
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Transaction ${txHash} not confirmed after ${maxPollAttempts} poll attempts`
  );
}

/**
 * Submit a **signed** transaction and wait for on-chain confirmation.
 *
 * @param tx       A fully-signed `Transaction` object.
 * @param server   An initialised `SorobanRpc.Server` instance.
 * @param config   Optional config overrides (polling).
 *
 * @returns        Structured `SubmitResult` on success or failure.
 * @throws         When `sendTransaction` itself rejects or times out.
 */
export async function submitAndVerifyTransaction(
  tx: Transaction,
  server: rpc.Server,
  config: TestnetConfig = {}
): Promise<SubmitResult> {
  const sendResponse = await server.sendTransaction(tx);

  if (sendResponse.status === 'ERROR') {
    throw new Error(
      `sendTransaction rejected: ${(sendResponse as any).errorResult?.toXDR('base64') ?? 'unknown error'}`
    );
  }

  const result = await pollForTransaction(server, sendResponse.hash, config);

  const isSuccess =
    result.status === rpc.Api.GetTransactionStatus.SUCCESS;

  return {
    transactionHash: sendResponse.hash,
    ledger: (result as rpc.Api.GetSuccessfulTransactionResponse).ledger ?? 0,
    status: isSuccess ? 'SUCCESS' : 'FAILED',
    returnValue: isSuccess
      ? (result as rpc.Api.GetSuccessfulTransactionResponse).returnValue
      : undefined,
  };
}

/**
 * Build, sign, and submit a **simple payment** transaction — convenience
 * wrapper for tests that just need to move XLM.
 */
export async function buildAndSubmitPayment(params: {
  source: Keypair;
  destination: string;
  amount: string;
  server: rpc.Server;
  config?: TestnetConfig;
}): Promise<SubmitResult> {
  const { source, destination, amount, server, config = {} } = params;
  const resolved = resolveConfig(config);

  const account = await server.getAccount(source.publicKey());

  const { Operation, Asset } = await import('@stellar/stellar-sdk');

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: resolved.networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount,
      })
    )
    .setTimeout(30)
    .build();

  tx.sign(source);
  return submitAndVerifyTransaction(tx, server, config);
}

// ─── Jest globalSetup / globalTeardown helpers ────────────────────────────────

/** Key written to `process.env` by `globalSetup` for all workers to read. */
export const SHARED_ACCOUNT_SECRET_ENV = 'GALAXY_TEST_SHARED_ACCOUNT_SECRET';

/**
 * **globalSetup** entry-point.
 *
 * Funds a single shared account and writes its secret key into
 * `process.env[SHARED_ACCOUNT_SECRET_ENV]` so that sequential test suites
 * can reuse the same funded account without additional Friendbot calls.
 *
 * Usage in `jest.config.js`:
 * ```js
 * globalSetup: '<rootDir>/packages/core/test-utils/src/testnet-helpers.ts'
 * // or via the re-export in index.ts
 * ```
 *
 * @param config Optional config overrides.
 */
export async function globalSetup(config: TestnetConfig = {}): Promise<void> {
  const { keypair } = await fundTestAccount(config);
  process.env[SHARED_ACCOUNT_SECRET_ENV] = keypair.secret();
  console.log(
    `[galaxy-test-utils] globalSetup: shared account funded — ${keypair.publicKey()}`
  );
}

/**
 * Retrieve the shared Keypair written by `globalSetup`.
 *
 * Call this inside individual test files to obtain the pre-funded account.
 *
 * @throws {Error} if `globalSetup` was not called before the suite.
 */
export function getSharedKeypair(): Keypair {
  const secret = process.env[SHARED_ACCOUNT_SECRET_ENV];
  if (!secret) {
    throw new Error(
      `${SHARED_ACCOUNT_SECRET_ENV} is not set. ` +
        `Did you configure globalSetup in jest.config.js?`
    );
  }
  return Keypair.fromSecret(secret);
}

/**
 * Create and return a configured `SorobanRpc.Server` instance.
 */
export function createRpcServer(config: TestnetConfig = {}): rpc.Server {
  const { rpcUrl } = resolveConfig(config);
  return new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http:') });
}
