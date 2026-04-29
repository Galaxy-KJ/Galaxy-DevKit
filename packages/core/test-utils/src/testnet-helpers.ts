import {
  Keypair,
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  BASE_FEE,
  Transaction,
} from '@stellar/stellar-sdk';
import BigNumber from 'bignumber.js';

export const TESTNET_HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const TESTNET_PASSPHRASE = Networks.TESTNET;

export const server = new Horizon.Server(TESTNET_HORIZON_URL);

/**
 * Funds a public key using Friendbot
 */
export async function fundWithFriendbot(publicKey: string): Promise<void> {
  const url = `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'No error body');
    throw new Error(`Friendbot funding failed for ${publicKey}: ${response.status} ${errorBody}`);
  }
}

/**
 * Creates and funds a random keypair for testing
 */
export async function createFundedTestAccount(): Promise<Keypair> {
  const keypair = Keypair.random();
  await fundWithFriendbot(keypair.publicKey());
  return keypair;
}

/**
 * Helper to submit a transaction and wait for ledger inclusion
 */
export async function submitTransaction(
  transaction: Transaction | any,
  signer: Keypair
): Promise<any> {
  if (typeof transaction.sign === 'function') {
    transaction.sign(signer);
  }
  return await server.submitTransaction(transaction);
}

/**
 * Verifies that a transaction was successful
 */
export async function verifyTransactionSuccess(hash: string): Promise<boolean> {
  try {
    const tx = await server.transactions().transaction(hash).call();
    return tx.successful;
  } catch (e) {
    return false;
  }
}

/**
 * Get the XLM balance of an account
 */
export async function getXLMBalance(publicKey: string): Promise<string> {
  const account = await server.loadAccount(publicKey);
  const nativeBalance = account.balances.find((b) => b.asset_type === 'native');
  return nativeBalance ? nativeBalance.balance : '0';
}

/**
 * Wait for a specific condition to be met, with timeout
 */
export async function waitFor(
  predicate: () => Promise<boolean>,
  intervalMs = 1000,
  timeoutMs = 30000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timeout waiting for condition');
}

/**
 * Gets the pre-funded account for the current test worker.
 * Falls back to creating a new funded account if not found.
 */
export async function getWorkerAccount(): Promise<Keypair> {
  const workerAccountsStr = process.env.GALAXY_TEST_WORKER_ACCOUNTS;
  if (workerAccountsStr) {
    const workerAccounts = JSON.parse(workerAccountsStr);
    const workerId = parseInt(process.env.JEST_WORKER_ID || '1') - 1;
    const secret = workerAccounts[workerId % workerAccounts.length];
    if (secret) {
      return Keypair.fromSecret(secret);
    }
  }
  return await createFundedTestAccount();
}
