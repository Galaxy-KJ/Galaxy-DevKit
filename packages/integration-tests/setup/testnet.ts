import {
  Keypair,
  Horizon,
  rpc,
  BASE_FEE,
  TransactionBuilder,
  Networks,
  Account,
} from '@stellar/stellar-sdk';

export interface IntegrationTestEnv {
  testAccount: Keypair;
  networkPassphrase: string;
  rpcUrl: string;
  horizonUrl: string;
  server: rpc.Server;
}

const TESTNET_RPC_URL = 'https://soroban-testnet.stellar.org';
const TESTNET_HORIZON_URL = 'https://horizon-testnet.stellar.org';
const FRIENDBOT_URL = 'https://friendbot-testnet.stellar.org';

export async function setupTestnetEnv(): Promise<IntegrationTestEnv> {
  const testAccount = Keypair.random();
  const networkPassphrase = Networks.TESTNET;
  const server = new rpc.Server(TESTNET_RPC_URL);

  const response = await fetch(
    `${FRIENDBOT_URL}?addr=${testAccount.publicKey()}`
  );
  if (!response.ok) {
    throw new Error(
      `Friendbot funding failed: ${response.status} ${response.statusText}`
    );
  }

  const horizon = new Horizon.Server(TESTNET_HORIZON_URL);
  await horizon.loadAccount(testAccount.publicKey());

  return {
    testAccount,
    networkPassphrase,
    rpcUrl: TESTNET_RPC_URL,
    horizonUrl: TESTNET_HORIZON_URL,
    server,
  };
}

export async function fundAccount(publicKey: string): Promise<void> {
  const response = await fetch(`${FRIENDBOT_URL}?addr=${publicKey}`);
  if (!response.ok) {
    throw new Error(
      `Friendbot funding failed: ${response.status} ${response.statusText}`
    );
  }
}

export function createTestEnv(
  overrides?: Partial<IntegrationTestEnv>
): IntegrationTestEnv {
  return {
    testAccount: overrides?.testAccount ?? Keypair.random(),
    networkPassphrase: overrides?.networkPassphrase ?? Networks.TESTNET,
    rpcUrl: overrides?.rpcUrl ?? TESTNET_RPC_URL,
    horizonUrl: overrides?.horizonUrl ?? TESTNET_HORIZON_URL,
    server: overrides?.server ?? new rpc.Server(TESTNET_RPC_URL),
  };
}
