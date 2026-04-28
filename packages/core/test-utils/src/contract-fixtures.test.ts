/**
 * @fileoverview Unit tests for contract-fixtures.ts
 * @description Full offline coverage of WasmStore, ContractFixture, and
 *   FixtureRegistry.  All Stellar network calls are mocked.
 *
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2025-04-28
 */

import { WasmStore, ContractFixture, FixtureRegistry, knownContract } from './contract-fixtures';
import type { TestnetConfig } from './testnet-helpers';

// ─── Stellar SDK mock ─────────────────────────────────────────────────────────

const MOCK_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
const MOCK_WASM_HASH = 'deadbeefcafe0000000000000000000000000000000000000000000000000000';
const MOCK_TX_HASH = 'abc123def456';

jest.mock('@stellar/stellar-sdk', () => {
  return {
    Keypair: {
      random: jest.fn(() => ({
        publicKey: jest.fn(() => 'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53'),
        secret: jest.fn(() => 'SBXX'),
      })),
    },
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        getAccount: jest.fn().mockResolvedValue({
          accountId: 'GDQZ43',
          sequenceNumber: jest.fn(() => '1'),
          incrementSequenceNumber: jest.fn(),
        }),
        simulateTransaction: jest.fn().mockResolvedValue({
          result: { retval: undefined },
          error: null,
        }),
        sendTransaction: jest.fn().mockResolvedValue({
          status: 'PENDING',
          hash: MOCK_TX_HASH,
        }),
        getTransaction: jest.fn().mockResolvedValue({
          status: 'SUCCESS',
          ledger: 100,
          returnValue: {
            bytes: jest.fn(() => Buffer.from(MOCK_WASM_HASH, 'hex')),
            address: jest.fn(() => ({})),
          },
        }),
        getLedgerEntries: jest.fn().mockResolvedValue({ entries: [] }),
      })),
      Api: {
        GetTransactionStatus: { NOT_FOUND: 'NOT_FOUND', SUCCESS: 'SUCCESS' },
        isSimulationSuccess: jest.fn(() => true),
        SimulateTransactionErrorResponse: {},
      },
      assembleTransaction: jest.fn((_tx: unknown) => ({
        build: jest.fn(() => ({
          sign: jest.fn(),
          toXDR: jest.fn(() => 'mock-xdr'),
        })),
      })),
    },
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn(() => ({
        sign: jest.fn(),
        toXDR: jest.fn(() => 'mock-xdr'),
      })),
    })),
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn(() => ({ type: 'invokeContract' })),
    })),
    Address: Object.assign(
      jest.fn().mockImplementation(() => ({
        toScAddress: jest.fn(() => ({})),
        toString: jest.fn(() => MOCK_CONTRACT_ID),
      })),
      {
        fromScAddress: jest.fn(() => ({
          toString: jest.fn(() => MOCK_CONTRACT_ID),
        })),
      }
    ),
    xdr: {
      HostFunction: {
        hostFunctionTypeUploadContractWasm: jest.fn(() => ({ type: 'upload' })),
        hostFunctionTypeCreateContract: jest.fn(() => ({ type: 'create' })),
      },
      LedgerKey: {
        contractData: jest.fn(() => ({ type: 'contractData' })),
      },
      LedgerKeyContractData: jest.fn(),
      ContractIdPreimage: {
        contractIdPreimageFromAddress: jest.fn(() => ({})),
      },
      ContractIdPreimageFromAddress: jest.fn(),
      ContractExecutable: {
        contractExecutableWasm: jest.fn(() => ({})),
      },
      ContractDataDurability: {
        persistent: jest.fn(() => ({})),
      },
      CreateContractArgs: jest.fn(),
    },
    Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
      FUTURENET: 'Test SDF Future Network ; October 2022',
    },
    BASE_FEE: '100',
  };
});

// ─── Also mock testnet-helpers to control submitAndVerify ─────────────────────

jest.mock('./testnet-helpers', () => ({
  resolveConfig: jest.fn((cfg: TestnetConfig = {}) => ({
    network: cfg.network ?? 'testnet',
    rpcUrl: cfg.rpcUrl ?? 'https://soroban-testnet.stellar.org',
    friendbotUrl: 'https://friendbot.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    maxPollAttempts: cfg.maxPollAttempts ?? 30,
    pollIntervalMs: cfg.pollIntervalMs ?? 2000,
  })),
  createRpcServer: jest.fn(() => {
    const { rpc } = require('@stellar/stellar-sdk');
    return new rpc.Server('https://soroban-testnet.stellar.org');
  }),
  submitAndVerifyTransaction: jest.fn().mockResolvedValue({
    transactionHash: 'abc123def456',
    ledger: 100,
    status: 'SUCCESS',
    returnValue: {
      bytes: jest.fn(() => Buffer.from('deadbeefcafe0000000000000000000000000000000000000000000000000000', 'hex')),
      address: jest.fn(() => ({})),
    },
  }),
}));

// ─── WasmStore ────────────────────────────────────────────────────────────────

describe('WasmStore', () => {
  let store: WasmStore;
  const wasm = Buffer.from('fake-wasm-bytes');

  beforeEach(() => {
    store = new WasmStore();
  });

  it('has() returns false for unseen WASM', () => {
    expect(store.has(wasm)).toBe(false);
  });

  it('set() and has() round-trip correctly', () => {
    store.set(wasm, MOCK_WASM_HASH);
    expect(store.has(wasm)).toBe(true);
  });

  it('get() returns the stored hash', () => {
    store.set(wasm, MOCK_WASM_HASH);
    expect(store.get(wasm)).toBe(MOCK_WASM_HASH);
  });

  it('get() returns undefined for unknown WASM', () => {
    expect(store.get(wasm)).toBeUndefined();
  });

  it('clear() removes all entries', () => {
    store.set(wasm, MOCK_WASM_HASH);
    store.clear();
    expect(store.has(wasm)).toBe(false);
  });

  it('treats two equal buffers as the same key', () => {
    const wasm2 = Buffer.from('fake-wasm-bytes');
    store.set(wasm, MOCK_WASM_HASH);
    expect(store.has(wasm2)).toBe(true);
  });

  it('treats different buffers as different keys', () => {
    const other = Buffer.from('other-wasm');
    store.set(wasm, MOCK_WASM_HASH);
    expect(store.has(other)).toBe(false);
  });
});

// ─── ContractFixture.fromExisting ─────────────────────────────────────────────

describe('ContractFixture.fromExisting', () => {
  it('creates a fixture with the given contractId and wasmHash', () => {
    const fixture = ContractFixture.fromExisting(MOCK_CONTRACT_ID, MOCK_WASM_HASH);
    expect(fixture.contractId).toBe(MOCK_CONTRACT_ID);
    expect(fixture.wasmHash).toBe(MOCK_WASM_HASH);
    expect(fixture.ledger).toBe(0);
    expect(fixture.deployTxHash).toBe('');
  });

  it('exposes getServer()', () => {
    const fixture = ContractFixture.fromExisting(MOCK_CONTRACT_ID, MOCK_WASM_HASH);
    expect(fixture.getServer()).toBeDefined();
  });

  it('exposes toContract()', () => {
    const fixture = ContractFixture.fromExisting(MOCK_CONTRACT_ID, MOCK_WASM_HASH);
    const contract = fixture.toContract();
    expect(contract).toBeDefined();
  });
});

// ─── ContractFixture.invoke (simulateOnly) ────────────────────────────────────

describe('ContractFixture.invoke (simulateOnly=true)', () => {
  it('returns a SUCCESS result without calling submitAndVerify', async () => {
    const fixture = ContractFixture.fromExisting(MOCK_CONTRACT_ID, MOCK_WASM_HASH);
    const { Keypair } = await import('@stellar/stellar-sdk');
    const caller = Keypair.random() as any;

    const result = await fixture.invoke({
      method: 'balance',
      args: [],
      caller,
      simulateOnly: true,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.transactionHash).toBe('');

    const { submitAndVerifyTransaction } = await import('./testnet-helpers');
    expect(submitAndVerifyTransaction).not.toHaveBeenCalled();
  });
});

// ─── ContractFixture.invoke (full submit) ─────────────────────────────────────

describe('ContractFixture.invoke (full submit)', () => {
  it('delegates to submitAndVerifyTransaction and returns its result', async () => {
    const fixture = ContractFixture.fromExisting(MOCK_CONTRACT_ID, MOCK_WASM_HASH);
    const { Keypair } = await import('@stellar/stellar-sdk');
    const caller = Keypair.random() as any;

    const result = await fixture.invoke({
      method: 'transfer',
      args: [],
      caller,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.transactionHash).toBe(MOCK_TX_HASH);
    expect(result.ledger).toBe(100);
  });
});

// ─── ContractFixture.readStorage ──────────────────────────────────────────────

describe('ContractFixture.readStorage', () => {
  it('returns null when no ledger entries are found', async () => {
    const fixture = ContractFixture.fromExisting(MOCK_CONTRACT_ID, MOCK_WASM_HASH);
    const mockKey = {} as any;
    const result = await fixture.readStorage(mockKey);
    expect(result).toBeNull();
  });
});

// ─── FixtureRegistry ──────────────────────────────────────────────────────────

describe('FixtureRegistry', () => {
  let registry: FixtureRegistry;
  let fixture: ContractFixture;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    registry = new FixtureRegistry();
    fixture = ContractFixture.fromExisting(MOCK_CONTRACT_ID, MOCK_WASM_HASH);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('set() and get() round-trip a fixture', () => {
    registry.set('token', fixture);
    expect(registry.get('token')).toBe(fixture);
  });

  it('has() returns true for a registered fixture', () => {
    registry.set('oracle', fixture);
    expect(registry.has('oracle')).toBe(true);
  });

  it('has() returns false for an unregistered name', () => {
    expect(registry.has('missing')).toBe(false);
  });

  it('get() throws for an unknown fixture name', () => {
    expect(() => registry.get('unknown')).toThrow('No fixture registered under "unknown"');
  });

  it('clear() removes all entries', () => {
    registry.set('a', fixture).set('b', fixture).clear();
    expect(registry.has('a')).toBe(false);
    expect(registry.has('b')).toBe(false);
  });

  it('toEnv() writes a JSON string to process.env', () => {
    registry.set('token', fixture);
    registry.toEnv();
    const raw = process.env['GALAXY_TEST_FIXTURES'];
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.token.contractId).toBe(MOCK_CONTRACT_ID);
    expect(parsed.token.wasmHash).toBe(MOCK_WASM_HASH);
  });

  it('fromEnv() re-hydrates from the environment variable', () => {
    registry.set('token', fixture);
    registry.toEnv();

    const restored = FixtureRegistry.fromEnv();
    const restoredFixture = restored.get('token');
    expect(restoredFixture.contractId).toBe(MOCK_CONTRACT_ID);
    expect(restoredFixture.wasmHash).toBe(MOCK_WASM_HASH);
  });

  it('fromEnv() throws when GALAXY_TEST_FIXTURES is not set', () => {
    delete process.env['GALAXY_TEST_FIXTURES'];
    expect(() => FixtureRegistry.fromEnv()).toThrow('GALAXY_TEST_FIXTURES is not set');
  });
});

// ─── knownContract ────────────────────────────────────────────────────────────

describe('knownContract', () => {
  it('returns a ContractFixture with an empty wasmHash', () => {
    const fixture = knownContract(MOCK_CONTRACT_ID);
    expect(fixture.contractId).toBe(MOCK_CONTRACT_ID);
    expect(fixture.wasmHash).toBe('');
  });

  it('accepts config overrides', () => {
    const fixture = knownContract(MOCK_CONTRACT_ID, {
      rpcUrl: 'https://custom.rpc',
    });
    expect(fixture).toBeDefined();
  });
});
