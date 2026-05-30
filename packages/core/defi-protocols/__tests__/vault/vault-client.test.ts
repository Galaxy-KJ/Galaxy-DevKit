/**
 * @fileoverview Tests for YieldVaultClient
 * @description Unit tests for the YieldVault TypeScript client with full mock coverage
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-05-30
 */

import { YieldVaultClient, WithdrawResult, VaultInfo, StrategyAllocation } from '../../src/vault/vault-client.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRetval = { toXDR: jest.fn() };

const mockGetTransaction = jest.fn();
const mockSendTransaction = jest.fn();
const mockSimulateTransaction = jest.fn();
const mockGetAccount = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
  const mockAddOperation = jest.fn().mockReturnThis();
  const mockSetTimeout = jest.fn().mockReturnThis();
  const mockBuild = jest.fn().mockReturnValue({ sign: jest.fn(), toXDR: jest.fn() });
  const mockTxBuilder = jest.fn().mockImplementation(() => ({
    addOperation: mockAddOperation,
    setTimeout: mockSetTimeout,
    build: mockBuild,
  }));

  const mockContractCall = jest.fn().mockReturnValue({ type: 'invoke_contract' });
  const MockContract = jest.fn().mockImplementation(() => ({ call: mockContractCall }));

  const MockServer = jest.fn().mockImplementation(() => ({
    getAccount: mockGetAccount,
    simulateTransaction: mockSimulateTransaction,
    sendTransaction: mockSendTransaction,
    getTransaction: mockGetTransaction,
  }));

  return {
    Contract: MockContract,
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({
        publicKey: () => 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
        sign: jest.fn(),
      }),
      random: jest.fn().mockReturnValue({
        publicKey: () => 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
        sign: jest.fn(),
      }),
    },
    TransactionBuilder: mockTxBuilder,
    BASE_FEE: '100',
    nativeToScVal: jest.fn().mockReturnValue({}),
    scValToNative: jest.fn(),
    Address: jest.fn(),
    rpc: {
      Server: MockServer,
      Api: {
        isSimulationError: jest.fn().mockReturnValue(false),
        GetTransactionStatus: { NOT_FOUND: 'NOT_FOUND', SUCCESS: 'SUCCESS' },
      },
      assembleTransaction: jest.fn().mockReturnValue({ build: jest.fn().mockReturnValue({ sign: jest.fn() }) }),
    },
    xdr: { ScVal: {} },
    Networks: { TESTNET: 'Test SDF Network ; September 2015' },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { rpc, scValToNative, Keypair } from '@stellar/stellar-sdk';

const CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const RPC_URL = 'https://soroban-testnet.stellar.org';
const PASSPHRASE = 'Test SDF Network ; September 2015';

function makeClient() {
  return new YieldVaultClient({ contractId: CONTRACT_ID, rpcUrl: RPC_URL, networkPassphrase: PASSPHRASE });
}

function mockAccount() {
  mockGetAccount.mockResolvedValue({ accountId: () => 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN', sequenceNumber: () => '1', incrementSequenceNumber: jest.fn() });
}

function mockSimSuccess(retval: unknown) {
  (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(false);
  mockSimulateTransaction.mockResolvedValue({ result: { retval } });
}

function mockInvokeSuccess(retval: unknown) {
  mockSimSuccess(retval);
  mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'abc123' });
  mockGetTransaction.mockResolvedValue({ status: 'SUCCESS', returnValue: retval });
}

// ---------------------------------------------------------------------------
// deposit
// ---------------------------------------------------------------------------

describe('YieldVaultClient.deposit', () => {
  it('returns shares minted as string', async () => {
    const client = makeClient();
    mockAccount();
    const retval = {};
    mockInvokeSuccess(retval);
    (scValToNative as jest.Mock).mockReturnValue(BigInt(1000));

    const shares = await client.deposit(Keypair.random(), '1000');
    expect(shares).toBe('1000');
  });

  it('throws when simulation fails', async () => {
    const client = makeClient();
    mockAccount();
    (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(true);
    mockSimulateTransaction.mockResolvedValue({ error: 'bad input' });

    await expect(client.deposit(Keypair.random(), '0')).rejects.toThrow('Simulation failed');
  });

  it('throws when transaction status is ERROR', async () => {
    const client = makeClient();
    mockAccount();
    mockSimSuccess({});
    mockSendTransaction.mockResolvedValue({ status: 'ERROR', errorResult: { toXDR: () => 'err' } });

    await expect(client.deposit(Keypair.random(), '100')).rejects.toThrow('Transaction failed');
  });
});

// ---------------------------------------------------------------------------
// withdraw
// ---------------------------------------------------------------------------

describe('YieldVaultClient.withdraw', () => {
  it('returns WithdrawResult with correct fields', async () => {
    const client = makeClient();
    mockAccount();
    const retval = {};
    mockInvokeSuccess(retval);
    (scValToNative as jest.Mock).mockReturnValue({ shares_burned: BigInt(500), assets_returned: BigInt(600) });

    const result: WithdrawResult = await client.withdraw(Keypair.random(), '500');
    expect(result.sharesBurned).toBe('500');
    expect(result.assetsReturned).toBe('600');
  });

  it('throws when simulation fails', async () => {
    const client = makeClient();
    mockAccount();
    (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(true);
    mockSimulateTransaction.mockResolvedValue({ error: 'sim error' });

    await expect(client.withdraw(Keypair.random(), '100')).rejects.toThrow('Simulation failed');
  });
});

// ---------------------------------------------------------------------------
// getShareValue
// ---------------------------------------------------------------------------

describe('YieldVaultClient.getShareValue', () => {
  it('returns numeric share value', async () => {
    const client = makeClient();
    mockAccount();
    mockSimSuccess({});
    (scValToNative as jest.Mock).mockReturnValue(BigInt(10_000_000));

    const value = await client.getShareValue();
    expect(value).toBe(10_000_000);
  });

  it('returns 0 for empty vault', async () => {
    const client = makeClient();
    mockAccount();
    mockSimSuccess({});
    (scValToNative as jest.Mock).mockReturnValue(BigInt(0));

    expect(await client.getShareValue()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getTotalValueLocked
// ---------------------------------------------------------------------------

describe('YieldVaultClient.getTotalValueLocked', () => {
  it('returns TVL as number', async () => {
    const client = makeClient();
    mockAccount();
    mockSimSuccess({});
    (scValToNative as jest.Mock).mockReturnValue(BigInt(5_000_000));

    expect(await client.getTotalValueLocked()).toBe(5_000_000);
  });
});

// ---------------------------------------------------------------------------
// getBalance
// ---------------------------------------------------------------------------

describe('YieldVaultClient.getBalance', () => {
  it('returns balance as string', async () => {
    const client = makeClient();
    mockAccount();
    mockSimSuccess({});
    (scValToNative as jest.Mock).mockReturnValue(BigInt(250));

    const bal = await client.getBalance('GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN');
    expect(bal).toBe('250');
  });
});

// ---------------------------------------------------------------------------
// getVaultInfo
// ---------------------------------------------------------------------------

describe('YieldVaultClient.getVaultInfo', () => {
  it('maps contract struct to VaultInfo', async () => {
    const client = makeClient();
    mockAccount();
    mockSimSuccess({});
    (scValToNative as jest.Mock).mockReturnValue({
      admin: 'GADMIN',
      asset: 'GASSET',
      total_shares: BigInt(1000),
      total_assets: BigInt(2000),
      last_harvest: BigInt(1717000000),
    });

    const info: VaultInfo = await client.getVaultInfo();
    expect(info.admin).toBe('GADMIN');
    expect(info.totalShares).toBe('1000');
    expect(info.totalAssets).toBe('2000');
    expect(info.lastHarvest).toBe(1717000000);
  });
});

// ---------------------------------------------------------------------------
// getStrategies
// ---------------------------------------------------------------------------

describe('YieldVaultClient.getStrategies', () => {
  it('maps contract array to StrategyAllocation[]', async () => {
    const client = makeClient();
    mockAccount();
    mockSimSuccess({});
    (scValToNative as jest.Mock).mockReturnValue([
      { name: 'blend_usdc', strategy_type: { tag: 'Blend' }, contract_address: 'CBLEND', weight_bps: 6000, active: true },
      { name: 'soroswap_xlm', strategy_type: { tag: 'Soroswap' }, contract_address: 'CSWAP', weight_bps: 4000, active: true },
    ]);

    const strategies: StrategyAllocation[] = await client.getStrategies();
    expect(strategies).toHaveLength(2);
    expect(strategies[0].strategyType).toBe('Blend');
    expect(strategies[0].weightBps).toBe(6000);
    expect(strategies[1].strategyType).toBe('Soroswap');
  });
});

// ---------------------------------------------------------------------------
// polling – NOT_FOUND then SUCCESS
// ---------------------------------------------------------------------------

describe('YieldVaultClient transaction polling', () => {
  beforeEach(() => {
    mockGetTransaction.mockReset();
  });

  it('polls until transaction is found', async () => {
    const client = makeClient();
    mockAccount();
    mockSimSuccess({});
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'poll123' });

    const retval = {};
    mockGetTransaction
      .mockResolvedValueOnce({ status: 'NOT_FOUND' })
      .mockResolvedValueOnce({ status: 'SUCCESS', returnValue: retval });

    (scValToNative as jest.Mock).mockReturnValue(BigInt(100));

    const shares = await client.deposit(Keypair.random(), '100');
    expect(shares).toBe('100');
    expect(mockGetTransaction).toHaveBeenCalledTimes(2);
  });

  it('throws when transaction ends in non-SUCCESS status', async () => {
    const client = makeClient();
    mockAccount();
    mockSimSuccess({});
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'fail123' });
    mockGetTransaction.mockResolvedValue({ status: 'FAILED' });

    await expect(client.deposit(Keypair.random(), '100')).rejects.toThrow('Transaction not successful');
  });
});
