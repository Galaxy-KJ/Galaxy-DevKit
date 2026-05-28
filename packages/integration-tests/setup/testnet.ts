import { Keypair } from "@stellar/stellar-sdk";

/**
 * Describes the fully-provisioned environment available to every integration
 * test suite.  All fields are resolved before any test file runs.
 */
export interface IntegrationTestEnv {
  /** Freshly-generated, Friendbot-funded keypair for signing transactions */
  testAccount: Keypair;
  /** Stellar network passphrase (Testnet) */
  networkPassphrase: string;
  /** Soroban RPC endpoint used by the SDK under test */
  rpcUrl: string;
  /** Horizon REST API base URL */
  horizonUrl: string;
}

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const TESTNET_RPC_URL =
  process.env.TESTNET_RPC_URL ?? "https://soroban-testnet.stellar.org";
const TESTNET_HORIZON_URL =
  process.env.TESTNET_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const FRIENDBOT_URL = "https://friendbot.stellar.org";

/**
 * Funds a Stellar Testnet account through Friendbot.
 *
 * Friendbot is only available on Testnet/Futurenet and will reject already-
 * funded accounts with a 400, which we treat as a non-fatal success (the
 * account already exists and is usable).
 *
 * @param publicKey - The public key of the account to fund.
 * @throws {Error} If the HTTP request itself fails (network error, 5xx, …).
 */
async function fundAccountVieFriendbot(publicKey: string): Promise<void> {
  const url = `${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`;
  const response = await fetch(url);

  if (!response.ok && response.status !== 400) {
    const body = await response.text();
    throw new Error(
      `Friendbot funding failed for ${publicKey} — HTTP ${response.status}: ${body}`
    );
  }
}

/**
 * Bootstraps a clean Stellar Testnet environment for integration tests.
 *
 * Steps performed:
 * 1. Generate a random Ed25519 keypair.
 * 2. Fund the keypair via the public Friendbot service.
 * 3. Return a typed {@link IntegrationTestEnv} consumed by test suites.
 *
 * @returns A fully-provisioned test environment.
 *
 * @example
 * ```ts
 * const env = await setupTestnetEnv();
 * console.log(env.testAccount.publicKey()); // GABC…
 * ```
 */
export async function setupTestnetEnv(): Promise<IntegrationTestEnv> {
  const testAccount = Keypair.random();

  await fundAccountVieFriendbot(testAccount.publicKey());

  return {
    testAccount,
    networkPassphrase: TESTNET_PASSPHRASE,
    rpcUrl: TESTNET_RPC_URL,
    horizonUrl: TESTNET_HORIZON_URL,
  };
}
