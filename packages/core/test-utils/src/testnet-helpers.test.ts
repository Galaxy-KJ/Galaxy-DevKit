/**
 * @fileoverview Unit tests for testnet-helpers.ts
 * @description Full coverage of Friendbot funding, transaction polling, and
 *   submission helpers.  All network calls are mocked — these run offline.
 *
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2025-04-28
 */

import {
  resolveConfig,
  requestFriendbot,
  fundTestAccount,
  fundExistingAccount,
  sleep,
  pollForTransaction,
  submitAndVerifyTransaction,
  buildAndSubmitPayment,
  globalSetup,
  getSharedKeypair,
  createRpcServer,
  SHARED_ACCOUNT_SECRET_ENV,
  type TestnetConfig,
} from './testnet-helpers';

// ─── Stellar SDK mock ─────────────────────────────────────────────────────────

const MOCK_PUBLIC_KEY =
  'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53';
const MOCK_SECRET_KEY =
  'SBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

jest.mock('@stellar/stellar-sdk', () => {
  const Keypair = {
    random: jest.fn(() => ({
      publicKey: jest.fn(() => MOCK_PUBLIC_KEY),
      secret: jest.fn(() => MOCK_SECRET_KEY),
    })),
    fromSecret: jest.fn((secret: string) => ({
      publicKey: jest.fn(() => MOCK_PUBLIC_KEY),
      secret: jest.fn(() => secret),
    })),
  };

  const rpc = {
    Server: jest.fn().mockImplementation(() => ({
      getAccount: jest.fn(),
      simulateTransaction: jest.fn(),
      sendTransaction: jest.fn(),
      getTransaction: jest.fn(),
      getLedgerEntries: jest.fn(),
      getEvents: jest.fn(),
    })),
    Api: {
      GetTransactionStatus: {
        NOT_FOUND: 'NOT_FOUND',
        SUCCESS: 'SUCCESS',
        FAILED: 'FAILED',
      },
      isSimulationSuccess: jest.fn(() => true),
    },
    assembleTransaction: jest.fn((_tx: unknown) => ({
      build: jest.fn(() => ({
        sign: jest.fn(),
        toXDR: jest.fn(() => 'mock-xdr'),
      })),
    })),
  };

  const TransactionBuilder = jest.fn().mockImplementation(() => ({
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn(() => ({
      sign: jest.fn(),
      toXDR: jest.fn(() => 'mock-xdr'),
    })),
  }));

  return {
    Keypair,
    rpc,
    TransactionBuilder,
    Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
      FUTURENET: 'Test SDF Future Network ; October 2022',
    },
    BASE_FEE: '100',
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn(() => ({ type: 'invokeContract' })),
    })),
    Address: jest.fn().mockImplementation(() => ({
      toScAddress: jest.fn(),
    })),
    Operation: {
      payment: jest.fn(() => ({ type: 'payment' })),
    },
    Asset: {
      native: jest.fn(() => ({ code: 'XLM', issuer: null })),
    },
  };
});

// ─── fetch mock ───────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// ─── resolveConfig ────────────────────────────────────────────────────────────

describe('resolveConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env to avoid leaking between tests
    process.env = { ...originalEnv };
  });

  it('returns testnet defaults when called with empty overrides', () => {
    delete process.env['STELLAR_NETWORK'];
    delete process.env['STELLAR_RPC_URL'];
    delete process.env['STELLAR_FRIENDBOT_URL'];
    delete process.env['STELLAR_NETWORK_PASSPHRASE'];

    const cfg = resolveConfig();
    expect(cfg.network).toBe('testnet');
    expect(cfg.rpcUrl).toBe('https://soroban-testnet.stellar.org');
    expect(cfg.friendbotUrl).toBe('https://friendbot.stellar.org');
    expect(cfg.networkPassphrase).toBe('Test SDF Network ; September 2015');
    expect(cfg.maxPollAttempts).toBe(30);
    expect(cfg.pollIntervalMs).toBe(2000);
  });

  it('uses futurenet defaults when network=futurenet', () => {
    const cfg = resolveConfig({ network: 'futurenet' });
    expect(cfg.rpcUrl).toBe('https://rpc-futurenet.stellar.org');
    expect(cfg.friendbotUrl).toBe('https://friendbot-futurenet.stellar.org');
  });

  it('prefers explicit overrides over env and defaults', () => {
    process.env['STELLAR_RPC_URL'] = 'https://env-rpc.example.com';
    const cfg = resolveConfig({ rpcUrl: 'https://explicit-rpc.example.com' });
    expect(cfg.rpcUrl).toBe('https://explicit-rpc.example.com');
  });

  it('reads STELLAR_RPC_URL from env when no override provided', () => {
    process.env['STELLAR_RPC_URL'] = 'https://env-rpc.example.com';
    delete process.env['STELLAR_NETWORK'];
    const cfg = resolveConfig();
    expect(cfg.rpcUrl).toBe('https://env-rpc.example.com');
  });

  it('allows maxPollAttempts and pollIntervalMs overrides', () => {
    const cfg = resolveConfig({ maxPollAttempts: 5, pollIntervalMs: 500 });
    expect(cfg.maxPollAttempts).toBe(5);
    expect(cfg.pollIntervalMs).toBe(500);
  });
});

// ─── requestFriendbot ─────────────────────────────────────────────────────────

describe('requestFriendbot', () => {
  beforeEach(() => mockFetch.mockReset());

  it('calls Friendbot URL with the encoded public key', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await requestFriendbot(MOCK_PUBLIC_KEY, 'https://friendbot.stellar.org');
    expect(mockFetch).toHaveBeenCalledWith(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(MOCK_PUBLIC_KEY)}`
    );
  });

  it('throws when Friendbot returns a non-OK status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });

    await expect(
      requestFriendbot(MOCK_PUBLIC_KEY, 'https://friendbot.stellar.org')
    ).rejects.toThrow('Friendbot request failed [HTTP 429]');
  });
});

// ─── fundTestAccount ──────────────────────────────────────────────────────────

describe('fundTestAccount', () => {
  beforeEach(() => mockFetch.mockReset());

  it('returns a FundedAccount with a fresh Keypair on success', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const funded = await fundTestAccount();
    expect(funded.publicKey).toBe(MOCK_PUBLIC_KEY);
    expect(funded.secretKey).toBe(MOCK_SECRET_KEY);
    expect(funded.network).toBe('testnet');
    expect(funded.keypair).toBeDefined();
  });

  it('propagates Friendbot errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal server error',
    });

    await expect(fundTestAccount()).rejects.toThrow('Friendbot request failed');
  });
});

// ─── fundExistingAccount ──────────────────────────────────────────────────────

describe('fundExistingAccount', () => {
  beforeEach(() => mockFetch.mockReset());

  it('funds the provided keypair without generating a new one', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const { Keypair } = await import('@stellar/stellar-sdk');
    const keypair = Keypair.random();

    const funded = await fundExistingAccount(keypair as any);
    expect(funded.publicKey).toBe(MOCK_PUBLIC_KEY);
    expect(funded.keypair).toBe(keypair);
  });
});

// ─── sleep ────────────────────────────────────────────────────────────────────

describe('sleep', () => {
  it('resolves after approximately the given milliseconds', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    // Allow generous jitter in CI
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});

// ─── pollForTransaction ───────────────────────────────────────────────────────

describe('pollForTransaction', () => {
  it('returns immediately when status is SUCCESS', async () => {
    const mockServer = {
      getTransaction: jest.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 42 }),
    } as any;

    const result = await pollForTransaction(mockServer, 'hash-abc', {
      pollIntervalMs: 0,
    });
    expect(result.status).toBe('SUCCESS');
    expect(mockServer.getTransaction).toHaveBeenCalledTimes(1);
  });

  it('polls multiple times then returns on SUCCESS', async () => {
    const mockServer = {
      getTransaction: jest
        .fn()
        .mockResolvedValueOnce({ status: 'NOT_FOUND' })
        .mockResolvedValueOnce({ status: 'NOT_FOUND' })
        .mockResolvedValue({ status: 'SUCCESS', ledger: 99 }),
    } as any;

    const result = await pollForTransaction(mockServer, 'hash-xyz', {
      pollIntervalMs: 0,
      maxPollAttempts: 10,
    });
    expect(result.status).toBe('SUCCESS');
    expect(mockServer.getTransaction).toHaveBeenCalledTimes(3);
  });

  it('throws after maxPollAttempts with no confirmation', async () => {
    const mockServer = {
      getTransaction: jest.fn().mockResolvedValue({ status: 'NOT_FOUND' }),
    } as any;

    await expect(
      pollForTransaction(mockServer, 'hash-timeout', {
        pollIntervalMs: 0,
        maxPollAttempts: 3,
      })
    ).rejects.toThrow('not confirmed after 3 poll attempts');
  });
});

// ─── submitAndVerifyTransaction ───────────────────────────────────────────────

describe('submitAndVerifyTransaction', () => {
  it('returns SUCCESS result for a happy-path transaction', async () => {
    const mockTx = { toXDR: jest.fn(() => 'mock-xdr') } as any;

    const mockServer = {
      sendTransaction: jest.fn().mockResolvedValue({
        status: 'PENDING',
        hash: 'tx-hash-001',
      }),
      getTransaction: jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        ledger: 7,
        returnValue: undefined,
      }),
    } as any;

    const result = await submitAndVerifyTransaction(mockTx, mockServer, {
      pollIntervalMs: 0,
      maxPollAttempts: 5,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.transactionHash).toBe('tx-hash-001');
  });

  it('throws when sendTransaction returns ERROR', async () => {
    const mockTx = {} as any;

    const mockServer = {
      sendTransaction: jest.fn().mockResolvedValue({
        status: 'ERROR',
        errorResult: { toXDR: jest.fn(() => 'error-xdr') },
      }),
    } as any;

    await expect(
      submitAndVerifyTransaction(mockTx, mockServer, { pollIntervalMs: 0 })
    ).rejects.toThrow('sendTransaction rejected');
  });
});

// ─── globalSetup / getSharedKeypair ──────────────────────────────────────────

describe('globalSetup & getSharedKeypair', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('sets GALAXY_TEST_SHARED_ACCOUNT_SECRET in env', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await globalSetup();

    expect(process.env[SHARED_ACCOUNT_SECRET_ENV]).toBe(MOCK_SECRET_KEY);
  });

  it('getSharedKeypair reads the env secret', async () => {
    process.env[SHARED_ACCOUNT_SECRET_ENV] = MOCK_SECRET_KEY;
    const keypair = getSharedKeypair();
    expect(keypair).toBeDefined();
  });

  it('getSharedKeypair throws when env is not set', () => {
    delete process.env[SHARED_ACCOUNT_SECRET_ENV];
    expect(() => getSharedKeypair()).toThrow(
      'GALAXY_TEST_SHARED_ACCOUNT_SECRET is not set'
    );
  });
});

// ─── createRpcServer ──────────────────────────────────────────────────────────

describe('createRpcServer', () => {
  it('returns a SorobanRpc.Server instance', () => {
    const server = createRpcServer();
    expect(server).toBeDefined();
  });

  it('accepts a custom rpcUrl override', () => {
    const server = createRpcServer({ rpcUrl: 'https://custom-rpc.example.com' });
    expect(server).toBeDefined();
  });
});

// ─── buildAndSubmitPayment ────────────────────────────────────────────────────

describe('buildAndSubmitPayment', () => {
  it('calls getAccount, builds a tx, signs, and submits it', async () => {
    const { Keypair } = await import('@stellar/stellar-sdk');
    const source = Keypair.random() as any;

    const mockServer = {
      getAccount: jest.fn().mockResolvedValue({
        accountId: MOCK_PUBLIC_KEY,
        sequenceNumber: jest.fn(() => '1'),
        incrementSequenceNumber: jest.fn(),
      }),
      sendTransaction: jest.fn().mockResolvedValue({
        status: 'PENDING',
        hash: 'payment-hash',
      }),
      getTransaction: jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        ledger: 12,
        returnValue: undefined,
      }),
    } as any;

    const result = await buildAndSubmitPayment({
      source,
      destination: MOCK_PUBLIC_KEY,
      amount: '10',
      server: mockServer,
      config: { pollIntervalMs: 0, maxPollAttempts: 5 },
    });

    expect(result.status).toBe('SUCCESS');
    expect(mockServer.getAccount).toHaveBeenCalled();
  });
});
