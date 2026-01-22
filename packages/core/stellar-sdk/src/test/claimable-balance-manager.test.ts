/**
 * @fileoverview Unit tests for ClaimableBalanceManager
 * @description Tests for claimable balance creation, claiming, and querying
 */

import { ClaimableBalanceManager } from '../claimable-balances/claimable-balance-manager';
import { Asset, Horizon, Operation, BASE_FEE } from '@stellar/stellar-sdk';
import { Wallet } from '../types/stellar-types';

// Mock dependencies
jest.mock('../utils/encryption.utils', () => ({
  decryptPrivateKey: jest.fn((encrypted, pwd) =>
    encrypted.replace('encrypted_', '').replace(`_with_${pwd}`, '')
  ),
}));

jest.mock('../utils/network-utils', () => {
  return {
    NetworkUtils: jest.fn().mockImplementation(() => ({
      isValidPublicKey: jest.fn((key) => key.startsWith('G') && key.length > 40),
    })),
  };
});

// Mock Stellar SDK - Define mocks before jest.mock
const mockServer = {
  loadAccount: jest.fn(),
  submitTransaction: jest.fn(),
  claimableBalances: jest.fn().mockReturnThis(),
  claimant: jest.fn().mockReturnThis(),
  asset: jest.fn().mockReturnThis(),
  sponsor: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  cursor: jest.fn().mockReturnThis(),
  claimableBalance: jest.fn().mockReturnThis(),
  call: jest.fn(),
  operations: jest.fn().mockReturnThis(),
  forTransaction: jest.fn().mockReturnThis(),
  feeStats: jest.fn(),
};

jest.mock('@stellar/stellar-sdk', () => ({
  Keypair: {
    fromSecret: jest.fn((secret) => ({
      publicKey: jest.fn(() => 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
      secret: jest.fn(() => secret),
    })),
  },
  Asset: Object.assign(
    jest.fn().mockImplementation((code, issuer) => ({
      code: code || 'XLM',
      issuer,
      type: issuer ? 'credit_alphanum4' : 'native',
    })),
    {
      native: jest.fn(() => ({ code: 'XLM', type: 'native' })),
    }
  ),
  Operation: {
    createClaimableBalance: jest.fn((opts) => ({ type: 'createClaimableBalance', ...opts })),
    claimClaimableBalance: jest.fn((opts) => ({ type: 'claimClaimableBalance', ...opts })),
  },
  ClaimPredicate: {
    predicateUnconditional: jest.fn(() => ({ type: 'unconditional' })),
    predicateBeforeAbsoluteTime: jest.fn((timestamp) => ({
      type: 'abs_before',
      timestamp,
    })),
    predicateBeforeRelativeTime: jest.fn((seconds) => ({
      type: 'rel_before',
      seconds,
    })),
    predicateNot: jest.fn((pred) => ({ type: 'not', predicate: pred })),
    predicateAnd: jest.fn((preds) => ({ type: 'and', predicates: preds })),
    predicateOr: jest.fn((preds) => ({ type: 'or', predicates: preds })),
  },
  TransactionBuilder: jest.fn().mockImplementation((source, opts) => ({
    addOperation: jest.fn().mockReturnThis(),
    addMemo: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn(() => ({
      sign: jest.fn(),
      toXDR: jest.fn(() => 'mock_xdr'),
    })),
  })),
  Memo: {
    text: jest.fn((text) => ({ type: 'text', value: text })),
  },
  Horizon: { Server: jest.fn(() => mockServer) },
  BASE_FEE: '100',
}));

describe('ClaimableBalanceManager', () => {
  const networkPassphrase = 'Test SDF Network ; September 2015';
  const mockNetworkConfig: {
    network: 'testnet' | 'mainnet';
    horizonUrl: string;
    passphrase: string;
  } = {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    passphrase: networkPassphrase,
  };

  let manager: ClaimableBalanceManager;
  let mockWallet: Wallet;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new ClaimableBalanceManager(mockServer as unknown as Horizon.Server, networkPassphrase);

    mockWallet = {
      id: 'wallet_123',
      publicKey: 'GSOURCEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      privateKey: 'encrypted_SSOURCEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX_with_password',
      network: mockNetworkConfig,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    };

    mockServer.loadAccount.mockResolvedValue({
      sequenceNumber: () => '123456',
    });

    mockServer.submitTransaction.mockResolvedValue({
      hash: 'tx_hash_12345',
      successful: true,
      ledger: 1000,
    });

    mockServer.feeStats.mockResolvedValue({
      max_fee: { mode: '200' },
    });
  });

  describe('createClaimableBalance', () => {
    const mockCreateParams = {
      asset: Asset.native(),
      amount: '100.0000000',
      claimants: [
        {
          destination: 'GCLAIMANTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          predicate: { unconditional: true },
        },
      ],
    };

    beforeEach(() => {
      mockServer.operations.mockReturnValue({
        forTransaction: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({
            records: [
              {
                type: 'create_claimable_balance',
                balance_id: '000000001db93b1fa4ecc85c588275b51092557f31eccf81a808794b7e876500',
              },
            ],
          }),
        }),
      });
    });

    it('should create claimable balance successfully', async () => {
      const result = await manager.createClaimableBalance(
        mockWallet,
        mockCreateParams,
        'password'
      );

      expect(result).toHaveProperty('balanceId');
      expect(result).toHaveProperty('hash');
      expect(result.status).toBe('success');
      expect(result.ledger).toBe('1000');
      expect(mockServer.submitTransaction).toHaveBeenCalled();
    });

    it('should validate claimants before creation', async () => {
      const invalidParams = {
        ...mockCreateParams,
        claimants: [
          {
            destination: 'INVALID',
            predicate: { unconditional: true },
          },
        ],
      };

      await expect(
        manager.createClaimableBalance(mockWallet, invalidParams, 'password')
      ).rejects.toThrow('Invalid claimant destination');
    });

    it('should throw error for empty claimants array', async () => {
      const invalidParams = {
        ...mockCreateParams,
        claimants: [],
      };

      await expect(
        manager.createClaimableBalance(mockWallet, invalidParams, 'password')
      ).rejects.toThrow('At least one claimant is required');
    });

    it('should throw error for zero or negative amount', async () => {
      const invalidParams = {
        ...mockCreateParams,
        amount: '0',
      };

      await expect(
        manager.createClaimableBalance(mockWallet, invalidParams, 'password')
      ).rejects.toThrow('Amount must be greater than 0');
    });

    it('should include memo if provided', async () => {
      const paramsWithMemo = {
        ...mockCreateParams,
        memo: 'Test memo',
      };

      await manager.createClaimableBalance(mockWallet, paramsWithMemo, 'password');

      const { Memo } = require('@stellar/stellar-sdk');
      expect(Memo.text).toHaveBeenCalledWith('Test memo');
    });

    it('should use custom fee if provided', async () => {
      const paramsWithFee = {
        ...mockCreateParams,
        fee: 500,
      };

      await manager.createClaimableBalance(mockWallet, paramsWithFee, 'password');

      const { TransactionBuilder } = require('@stellar/stellar-sdk');
      expect(TransactionBuilder).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fee: '500',
        })
      );
    });

    it('should extract balance ID from operation result', async () => {
      const result = await manager.createClaimableBalance(
        mockWallet,
        mockCreateParams,
        'password'
      );

      expect(result.balanceId).toBe(
        '000000001db93b1fa4ecc85c588275b51092557f31eccf81a808794b7e876500'
      );
    });

    it('should handle failed transaction', async () => {
      mockServer.submitTransaction.mockResolvedValue({
        hash: 'failed_hash',
        successful: false,
        ledger: 2000,
      });

      const result = await manager.createClaimableBalance(
        mockWallet,
        mockCreateParams,
        'password'
      );

      expect(result.status).toBe('failed');
    });
  });

  describe('claimBalance', () => {
    const balanceId = '000000001db93b1fa4ecc85c588275b51092557f31eccf81a808794b7e876500';

    it('should claim balance successfully', async () => {
      const result = await manager.claimBalance(
        mockWallet,
        { balanceId },
        'password'
      );

      expect(result.balanceId).toBe(balanceId);
      expect(result.hash).toBe('tx_hash_12345');
      expect(result.status).toBe('success');
      expect(mockServer.submitTransaction).toHaveBeenCalled();
    });

    it('should throw error for invalid balance ID format', async () => {
      const invalidBalanceId = 'invalid_id';

      await expect(
        manager.claimBalance(mockWallet, { balanceId: invalidBalanceId }, 'password')
      ).rejects.toThrow('Invalid balance ID format');
    });

    it('should include memo if provided', async () => {
      await manager.claimBalance(
        mockWallet,
        { balanceId, memo: 'Claim memo' },
        'password'
      );

      const { Memo } = require('@stellar/stellar-sdk');
      expect(Memo.text).toHaveBeenCalledWith('Claim memo');
    });

    it('should handle failed claim transaction', async () => {
      mockServer.submitTransaction.mockResolvedValue({
        hash: 'failed_claim_hash',
        successful: false,
        ledger: 3000,
      });

      const result = await manager.claimBalance(mockWallet, { balanceId }, 'password');

      expect(result.status).toBe('failed');
    });
  });

  describe('getBalanceDetails', () => {
    const balanceId = '000000001db93b1fa4ecc85c588275b51092557f31eccf81a808794b7e876500';

    it('should get balance details successfully', async () => {
      const mockBalance = {
        id: balanceId,
        asset_type: 'native',
        amount: '100.0000000',
        sponsor: 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        claimants: [
          {
            destination: 'GCLAIMANTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            predicate: { unconditional: true },
          },
        ],
        last_modified_time: '2024-01-01T00:00:00Z',
        last_modified_ledger: '1000',
      };

      mockServer.call.mockResolvedValue(mockBalance);

      const balance = await manager.getBalanceDetails(balanceId);

      expect(balance.id).toBe(balanceId);
      expect(balance.amount).toBe('100.0000000');
      expect(balance.claimants.length).toBe(1);
    });

    it('should throw error for invalid balance ID format', async () => {
      await expect(manager.getBalanceDetails('invalid')).rejects.toThrow(
        'Invalid balance ID format'
      );
    });

    it('should throw error for non-existent balance', async () => {
      mockServer.call.mockRejectedValue(new Error('404 Not Found'));

      await expect(manager.getBalanceDetails(balanceId)).rejects.toThrow(
        'Claimable balance not found'
      );
    });

    it('should handle custom asset balances', async () => {
      const mockBalance = {
        id: balanceId,
        asset_type: 'credit_alphanum4',
        asset_code: 'USDC',
        asset_issuer: 'GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        amount: '500.0000000',
        claimants: [],
        last_modified_time: '2024-01-01T00:00:00Z',
        last_modified_ledger: '1000',
      };

      mockServer.call.mockResolvedValue(mockBalance);

      const balance = await manager.getBalanceDetails(balanceId);

      expect(balance.asset).toBeDefined();
    });
  });

  describe('getClaimableBalances', () => {
    it('should query balances without filters', async () => {
      const mockResponse = {
        records: [
          {
            id: 'balance_1',
            asset_type: 'native',
            amount: '100.0000000',
            claimants: [],
            last_modified_time: '2024-01-01T00:00:00Z',
            last_modified_ledger: '1000',
          },
        ],
      };

      mockServer.call.mockResolvedValue(mockResponse);

      const balances = await manager.getClaimableBalances();

      expect(balances.length).toBe(1);
      expect(mockServer.claimableBalances).toHaveBeenCalled();
    });

    it('should filter by claimant', async () => {
      const claimant = 'GCLAIMANTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      const mockResponse = { records: [] };

      mockServer.call.mockResolvedValue(mockResponse);

      await manager.getClaimableBalances({ claimant });

      expect(mockServer.claimant).toHaveBeenCalledWith(claimant);
    });

    it('should filter by asset', async () => {
      const asset = Asset.native();
      const mockResponse = { records: [] };

      mockServer.call.mockResolvedValue(mockResponse);

      await manager.getClaimableBalances({ asset });

      expect(mockServer.asset).toHaveBeenCalledWith(asset);
    });

    it('should filter by sponsor', async () => {
      const sponsor = 'GSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      const mockResponse = { records: [] };

      mockServer.call.mockResolvedValue(mockResponse);

      await manager.getClaimableBalances({ sponsor });

      expect(mockServer.sponsor).toHaveBeenCalledWith(sponsor);
    });

    it('should set limit if provided', async () => {
      const mockResponse = { records: [] };
      mockServer.call.mockResolvedValue(mockResponse);

      await manager.getClaimableBalances({ limit: 20 });

      expect(mockServer.limit).toHaveBeenCalledWith(20);
    });

    it('should set cursor for pagination', async () => {
      const mockResponse = { records: [] };
      mockServer.call.mockResolvedValue(mockResponse);

      await manager.getClaimableBalances({ cursor: 'cursor_123' });

      expect(mockServer.cursor).toHaveBeenCalledWith('cursor_123');
    });

    it('should throw error for invalid claimant public key', async () => {
      await expect(
        manager.getClaimableBalances({ claimant: 'INVALID' })
      ).rejects.toThrow('Invalid claimant public key');
    });

    it('should throw error for invalid sponsor public key', async () => {
      await expect(
        manager.getClaimableBalances({ sponsor: 'INVALID' })
      ).rejects.toThrow('Invalid sponsor public key');
    });
  });

  describe('getClaimableBalancesForAccount', () => {
    it('should get balances for account', async () => {
      const publicKey = 'GACCOUNTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      const mockResponse = { records: [] };

      mockServer.call.mockResolvedValue(mockResponse);

      await manager.getClaimableBalancesForAccount(publicKey, 10);

      expect(mockServer.claimant).toHaveBeenCalledWith(publicKey);
      expect(mockServer.limit).toHaveBeenCalledWith(10);
    });

    it('should throw error for invalid public key', async () => {
      await expect(
        manager.getClaimableBalancesForAccount('INVALID', 10)
      ).rejects.toThrow('Invalid public key format');
    });
  });

  describe('getClaimableBalancesByAsset', () => {
    it('should get balances by asset', async () => {
      const asset = Asset.native();
      const mockResponse = { records: [] };

      mockServer.call.mockResolvedValue(mockResponse);

      await manager.getClaimableBalancesByAsset(asset, 10);

      expect(mockServer.asset).toHaveBeenCalledWith(asset);
      expect(mockServer.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockServer.submitTransaction.mockRejectedValue(new Error('Network timeout'));

      await expect(
        manager.createClaimableBalance(
          mockWallet,
          {
            asset: Asset.native(),
            amount: '100.0000000',
            claimants: [
              {
                destination: 'GCLAIMANTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
                predicate: { unconditional: true },
              },
            ],
          },
          'password'
        )
      ).rejects.toThrow('Failed to create claimable balance');
    });

    it('should handle balance ID extraction errors', async () => {
      mockServer.operations.mockReturnValue({
        forTransaction: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({
            records: [
              {
                type: 'payment', // Wrong operation type
              },
            ],
          }),
        }),
      });

      await expect(
        manager.createClaimableBalance(
          mockWallet,
          {
            asset: Asset.native(),
            amount: '100.0000000',
            claimants: [
              {
                destination: 'GCLAIMANTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
                predicate: { unconditional: true },
              },
            ],
          },
          'password'
        )
      ).rejects.toThrow('Failed to extract balance ID');
    });
  });
});
