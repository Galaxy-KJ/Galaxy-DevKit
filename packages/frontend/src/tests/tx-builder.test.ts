import { TxBuilderClient } from '../services/tx-builder.client';

// Mock @stellar/stellar-sdk/rpc so tests don't hit the network
const mockSimulateTransaction = jest.fn();
const mockSendTransaction = jest.fn();
const mockGetLatestLedger = jest.fn().mockResolvedValue({ sequence: 5000 });

jest.mock('@stellar/stellar-sdk/rpc', () => ({
  Server: jest.fn().mockImplementation(() => ({
    simulateTransaction: mockSimulateTransaction,
    sendTransaction: mockSendTransaction,
    getLatestLedger: mockGetLatestLedger,
  })),
  Api: {
    isSimulationError: jest.fn((r: unknown) => (r as any).error !== undefined),
  },
  assembleTransaction: jest.fn((tx: unknown) => ({
    build: () => ({ toEnvelope: () => ({ toXDR: () => 'assembled-xdr' }) }),
  })),
}));

jest.mock('@stellar/stellar-sdk', () => {
  // Full mock — avoids loading the real stellar-sdk (which needs TextEncoder +
  // valid Stellar addresses) and keeps unit tests focused on service logic.
  const mockTx = { toEnvelope: () => ({ toXDR: () => 'unsigned-xdr' }) };
  class MockTransactionBuilder {
    addOperation() { return this; }
    setTimeout() { return this; }
    build() { return mockTx; }
    static fromXDR() { return mockTx; }
  }
  return {
    Asset: { native: () => ({ code: 'XLM' }) },
    BASE_FEE: '100',
    Networks: { TESTNET: 'Test SDF Network ; September 2015' },
    Operation: { payment: () => ({}) },
    TransactionBuilder: MockTransactionBuilder,
  };
});

describe('TxBuilderClient', () => {
  const RPC = 'https://soroban-testnet.stellar.org';
  let client: TxBuilderClient;

  beforeEach(() => {
    client = new TxBuilderClient(RPC);
    jest.clearAllMocks();
    mockGetLatestLedger.mockResolvedValue({ sequence: 5000 });
  });

  describe('buildAndSimulate', () => {
    it('throws when walletAddress is missing', async () => {
      await expect(
        client.buildAndSimulate({ walletAddress: '', destination: 'GDEST', amount: '10' })
      ).rejects.toThrow('walletAddress is required');
    });

    it('throws when destination is missing', async () => {
      await expect(
        client.buildAndSimulate({ walletAddress: 'CWALLET', destination: '', amount: '10' })
      ).rejects.toThrow('destination is required');
    });

    it('throws when amount is zero or negative', async () => {
      await expect(
        client.buildAndSimulate({ walletAddress: 'CWALLET', destination: 'GDEST', amount: '0' })
      ).rejects.toThrow('amount must be a positive number');

      await expect(
        client.buildAndSimulate({ walletAddress: 'CWALLET', destination: 'GDEST', amount: '-5' })
      ).rejects.toThrow('amount must be a positive number');
    });

    it('throws when amount is not a number', async () => {
      await expect(
        client.buildAndSimulate({ walletAddress: 'CWALLET', destination: 'GDEST', amount: 'abc' })
      ).rejects.toThrow('amount must be a positive number');
    });

    it('throws when simulation returns an error', async () => {
      mockSimulateTransaction.mockResolvedValue({ error: 'contract not found' });
      await expect(
        client.buildAndSimulate({ walletAddress: 'CWALLET', destination: 'GDEST', amount: '5' })
      ).rejects.toThrow('Transaction simulation failed: contract not found');
    });

    it('returns estimated fee and auth entry count on success', async () => {
      mockSimulateTransaction.mockResolvedValue({
        minResourceFee: '200',
        result: { auth: [{}, {}] },
      });
      const result = await client.buildAndSimulate({
        walletAddress: 'CWALLET',
        destination: 'GDEST',
        amount: '10',
      });
      expect(result.estimatedFee).toBe('200');
      expect(result.authEntryCount).toBe(2);
    });

    it('uses MIN_FEE when minResourceFee is missing', async () => {
      mockSimulateTransaction.mockResolvedValue({ result: { auth: [] } });
      const result = await client.buildAndSimulate({
        walletAddress: 'CWALLET',
        destination: 'GDEST',
        amount: '1',
      });
      expect(parseInt(result.estimatedFee, 10)).toBeGreaterThanOrEqual(100);
    });
  });

  describe('submitSignedXdr', () => {
    it('throws when signedXdr is empty', async () => {
      await expect(client.submitSignedXdr('')).rejects.toThrow('signedXdr is required');
    });

    it('throws when sendTransaction returns ERROR status', async () => {
      mockSendTransaction.mockResolvedValue({ status: 'ERROR', errorResult: 'bad tx' });
      await expect(client.submitSignedXdr('AXDR==')).rejects.toThrow(
        'Transaction submission failed: bad tx'
      );
    });

    it('returns transaction hash on success', async () => {
      mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'abc123hash' });
      const hash = await client.submitSignedXdr('AXDR==');
      expect(hash).toBe('abc123hash');
    });
  });
});
