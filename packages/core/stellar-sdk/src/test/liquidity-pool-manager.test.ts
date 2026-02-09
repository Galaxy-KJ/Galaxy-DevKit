/**
 * @fileoverview Unit tests for LiquidityPoolManager
 * @description Tests for pool deposits, withdrawals, queries, and analytics
 */

import { LiquidityPoolManager } from '../liquidity-pools/liquidity-pool-manager.js';
import { Asset, Horizon } from '@stellar/stellar-sdk';
import { Wallet } from '../types/stellar-types.js';
import { LiquidityPoolDeposit, LiquidityPoolWithdraw } from '../liquidity-pools/types.js';

// Mock dependencies
jest.mock('../utils/encryption.utils', () => ({
  decryptPrivateKey: jest.fn((encrypted, pwd) =>
    Promise.resolve(Buffer.from(encrypted.replace('encrypted_', '').replace(`_with_${pwd}`, '')))
  ),
  decryptPrivateKeyToString: jest.fn((encrypted, pwd) =>
    Promise.resolve(encrypted.replace('encrypted_', '').replace(`_with_${pwd}`, ''))
  ),
}));

jest.mock('../utils/network-utils', () => {
  return {
    NetworkUtils: jest.fn().mockImplementation(() => ({
      isValidPublicKey: jest.fn((key) => key.startsWith('G') && key.length > 40),
    })),
  };
});

// Mock Stellar SDK
const mockServer = {
  loadAccount: jest.fn(),
  submitTransaction: jest.fn(),
  liquidityPools: jest.fn().mockReturnThis(),
  liquidityPoolId: jest.fn().mockReturnThis(),
  forAssets: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  cursor: jest.fn().mockReturnThis(),
  call: jest.fn(),
  feeStats: jest.fn(),
};

jest.mock('@stellar/stellar-sdk', () => ({
  Keypair: {
    fromSecret: jest.fn((secret) => ({
      publicKey: () => 'GPUBLICXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      secret: () => secret,
    })),
    fromPublicKey: jest.fn((publicKey: string) => {
      if (!publicKey.startsWith('G') || publicKey.length !== 56) {
        throw new Error('Invalid public key');
      }
      return {
        publicKey: () => publicKey,
      };
    }),
  },
  Asset: Object.assign(
    jest.fn().mockImplementation((code, issuer) => ({
      code: code || 'XLM',
      issuer,
      isNative: () => !issuer,
      getCode: () => code || 'XLM',
      getIssuer: () => issuer,
    })),
    {
      native: jest.fn(() => ({
        code: 'XLM',
        isNative: () => true,
        getCode: () => 'XLM',
      })),
    }
  ),
  Operation: {
    liquidityPoolDeposit: jest.fn((opts) => ({ type: 'liquidityPoolDeposit', ...opts })),
    liquidityPoolWithdraw: jest.fn((opts) => ({ type: 'liquidityPoolWithdraw', ...opts })),
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

describe('LiquidityPoolManager', () => {
  const networkPassphrase = 'Test SDF Network ; September 2015';
  const poolId = '0000000000000000000000000000000000000000000000000000000000000000';

  // Valid Stellar testnet public keys
  const VALID_PUBLIC_KEY = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
  const VALID_ISSUER = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

  let manager: LiquidityPoolManager;
  let mockWallet: Wallet;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new LiquidityPoolManager(
      mockServer as unknown as Horizon.Server,
      networkPassphrase
    );

    mockWallet = {
      id: 'wallet_123',
      publicKey: VALID_PUBLIC_KEY,
      privateKey: `encrypted_SSECRETKEY_with_password`,
      network: {
        network: 'testnet',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        passphrase: networkPassphrase,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    };

    mockServer.loadAccount.mockResolvedValue({
      sequenceNumber: () => '123456',
      balances: [],
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

  describe('depositLiquidity', () => {
    const mockPool = {
      id: poolId,
      reserves: [
        { asset: 'native', amount: '10000.0000000' },
        { asset: 'USDC:GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', amount: '50000.0000000' },
      ],
      total_shares: '22360.6797750',
      total_trustlines: '100',
      fee_bp: 30,
    };

    beforeEach(() => {
      mockServer.call.mockResolvedValue(mockPool);
    });

    it('should deposit liquidity successfully', async () => {
      const params: LiquidityPoolDeposit = {
        poolId,
        maxAmountA: '1000.0000000',
        maxAmountB: '5000.0000000',
      };

      const result = await manager.depositLiquidity(mockWallet, params, 'password');

      expect(result.poolId).toBe(poolId);
      expect(result.hash).toBe('tx_hash_12345');
      expect(result.status).toBe('success');
      expect(result.ledger).toBe('1000');
      expect(mockServer.submitTransaction).toHaveBeenCalled();
    });

    it('should validate pool ID format', async () => {
      const params: LiquidityPoolDeposit = {
        poolId: 'invalid_pool_id',
        maxAmountA: '1000',
        maxAmountB: '5000',
      };

      await expect(manager.depositLiquidity(mockWallet, params, 'password')).rejects.toThrow(
        'Invalid pool ID format'
      );
    });

    it('should validate deposit amounts', async () => {
      const params: LiquidityPoolDeposit = {
        poolId,
        maxAmountA: '0',
        maxAmountB: '5000',
      };

      await expect(manager.depositLiquidity(mockWallet, params, 'password')).rejects.toThrow(
        'maxAmountA must be greater than 0'
      );
    });

    it('should calculate optimal deposit amounts', async () => {
      const params: LiquidityPoolDeposit = {
        poolId,
        maxAmountA: '2000.0000000',
        maxAmountB: '5000.0000000', // Unbalanced deposit
      };

      await manager.depositLiquidity(mockWallet, params, 'password');

      const { Operation } = require('@stellar/stellar-sdk');
      expect(Operation.liquidityPoolDeposit).toHaveBeenCalled();

      const depositCall = Operation.liquidityPoolDeposit.mock.calls[0][0];
      expect(depositCall.liquidityPoolId).toBe(poolId);
      // Should use min ratio (1000 XLM, 5000 USDC)
      expect(parseFloat(depositCall.maxAmountA)).toBeLessThanOrEqual(2000);
    });

    it('should include price bounds if provided', async () => {
      const params: LiquidityPoolDeposit = {
        poolId,
        maxAmountA: '1000',
        maxAmountB: '5000',
        minPrice: '4.95',
        maxPrice: '5.05',
      };

      await manager.depositLiquidity(mockWallet, params, 'password');

      const { Operation } = require('@stellar/stellar-sdk');
      const depositCall = Operation.liquidityPoolDeposit.mock.calls[0][0];

      expect(depositCall.minPrice).toBe('4.95');
      expect(depositCall.maxPrice).toBe('5.05');
    });

    it('should not include price bounds if not provided', async () => {
      const params: LiquidityPoolDeposit = {
        poolId,
        maxAmountA: '1000',
        maxAmountB: '5000',
      };

      await manager.depositLiquidity(mockWallet, params, 'password');

      const { Operation } = require('@stellar/stellar-sdk');
      const depositCall = Operation.liquidityPoolDeposit.mock.calls[0][0];

      expect(depositCall.minPrice).toBeUndefined();
      expect(depositCall.maxPrice).toBeUndefined();
    });

    it('should include memo if provided', async () => {
      const params: LiquidityPoolDeposit = {
        poolId,
        maxAmountA: '1000',
        maxAmountB: '5000',
        memo: 'Test deposit',
      };

      await manager.depositLiquidity(mockWallet, params, 'password');

      const { Memo } = require('@stellar/stellar-sdk');
      expect(Memo.text).toHaveBeenCalledWith('Test deposit');
    });

    it('should use custom fee if provided', async () => {
      const params: LiquidityPoolDeposit = {
        poolId,
        maxAmountA: '1000',
        maxAmountB: '5000',
        fee: 500,
      };

      await manager.depositLiquidity(mockWallet, params, 'password');

      const { TransactionBuilder } = require('@stellar/stellar-sdk');
      expect(TransactionBuilder).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fee: '500',
        })
      );
    });

    it('should estimate fee if not provided', async () => {
      const params: LiquidityPoolDeposit = {
        poolId,
        maxAmountA: '1000',
        maxAmountB: '5000',
      };

      await manager.depositLiquidity(mockWallet, params, 'password');

      expect(mockServer.feeStats).toHaveBeenCalled();
    });

    it('should handle failed transaction', async () => {
      mockServer.submitTransaction.mockResolvedValue({
        hash: 'failed_hash',
        successful: false,
        ledger: 2000,
      });

      const params: LiquidityPoolDeposit = {
        poolId,
        maxAmountA: '1000',
        maxAmountB: '5000',
      };

      const result = await manager.depositLiquidity(mockWallet, params, 'password');

      expect(result.status).toBe('failed');
    });

    it('should throw error for non-existent pool', async () => {
      mockServer.call.mockRejectedValue({
        response: { status: 404 },
      });

      const params: LiquidityPoolDeposit = {
        poolId,
        maxAmountA: '1000',
        maxAmountB: '5000',
      };

      await expect(manager.depositLiquidity(mockWallet, params, 'password')).rejects.toThrow(
        'Liquidity pool not found'
      );
    });
  });

  describe('withdrawLiquidity', () => {
    const mockPool = {
      id: poolId,
      reserves: [
        { asset: 'native', amount: '10000.0000000' },
        { asset: 'USDC:GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', amount: '50000.0000000' },
      ],
      total_shares: '22360.6797750',
      total_trustlines: '100',
      fee_bp: 30,
    };

    beforeEach(() => {
      mockServer.call.mockResolvedValue(mockPool);
      mockServer.loadAccount.mockResolvedValue({
        sequenceNumber: () => '123456',
        balances: [
          {
            asset_type: 'liquidity_pool_shares',
            liquidity_pool_id: poolId,
            balance: '2236.0679775',
          },
        ],
      });
    });

    it('should withdraw liquidity successfully', async () => {
      const params: LiquidityPoolWithdraw = {
        poolId,
        shares: '1000.0000000',
      };

      const result = await manager.withdrawLiquidity(mockWallet, params, 'password');

      expect(result.poolId).toBe(poolId);
      expect(result.hash).toBe('tx_hash_12345');
      expect(result.status).toBe('success');
      expect(mockServer.submitTransaction).toHaveBeenCalled();
    });

    it('should validate pool ID format', async () => {
      const params: LiquidityPoolWithdraw = {
        poolId: 'invalid',
        shares: '1000',
      };

      await expect(manager.withdrawLiquidity(mockWallet, params, 'password')).rejects.toThrow(
        'Invalid pool ID format'
      );
    });

    it('should validate share amount', async () => {
      const params: LiquidityPoolWithdraw = {
        poolId,
        shares: '0',
      };

      await expect(manager.withdrawLiquidity(mockWallet, params, 'password')).rejects.toThrow(
        'shares must be greater than 0'
      );
    });

    it('should throw error for insufficient shares', async () => {
      const params: LiquidityPoolWithdraw = {
        poolId,
        shares: '5000.0000000', // More than available (2236.0679775)
      };

      await expect(manager.withdrawLiquidity(mockWallet, params, 'password')).rejects.toThrow(
        'Insufficient shares'
      );
    });

    it('should calculate withdrawal amounts correctly', async () => {
      const params: LiquidityPoolWithdraw = {
        poolId,
        shares: '2236.0679775', // 10% of pool
      };

      await manager.withdrawLiquidity(mockWallet, params, 'password');

      const { Operation } = require('@stellar/stellar-sdk');
      expect(Operation.liquidityPoolWithdraw).toHaveBeenCalled();

      const withdrawCall = Operation.liquidityPoolWithdraw.mock.calls[0][0];
      expect(withdrawCall.liquidityPoolId).toBe(poolId);
      expect(withdrawCall.amount).toBe('2236.0679775');
    });

    it('should use minimum amounts if provided', async () => {
      const params: LiquidityPoolWithdraw = {
        poolId,
        shares: '1000',
        minAmountA: '400',
        minAmountB: '2000',
      };

      await manager.withdrawLiquidity(mockWallet, params, 'password');

      const { Operation } = require('@stellar/stellar-sdk');
      const withdrawCall = Operation.liquidityPoolWithdraw.mock.calls[0][0];

      expect(withdrawCall.minAmountA).toBe('400');
      expect(withdrawCall.minAmountB).toBe('2000');
    });

    it('should include memo if provided', async () => {
      const params: LiquidityPoolWithdraw = {
        poolId,
        shares: '1000',
        memo: 'Test withdrawal',
      };

      await manager.withdrawLiquidity(mockWallet, params, 'password');

      const { Memo } = require('@stellar/stellar-sdk');
      expect(Memo.text).toHaveBeenCalledWith('Test withdrawal');
    });

    it('should handle failed withdrawal transaction', async () => {
      mockServer.submitTransaction.mockResolvedValue({
        hash: 'failed_hash',
        successful: false,
        ledger: 3000,
      });

      const params: LiquidityPoolWithdraw = {
        poolId,
        shares: '1000',
      };

      const result = await manager.withdrawLiquidity(mockWallet, params, 'password');

      expect(result.status).toBe('failed');
    });
  });

  describe('getPoolDetails', () => {
    const mockPool = {
      id: poolId,
      reserves: [
        { asset: 'native', amount: '10000.0000000' },
        { asset: 'USDC:GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', amount: '50000.0000000' },
      ],
      total_shares: '22360.6797750',
      total_trustlines: '100',
      fee_bp: 30,
    };

    it('should get pool details successfully', async () => {
      mockServer.call.mockResolvedValue(mockPool);

      const pool = await manager.getPoolDetails(poolId);

      expect(pool.id).toBe(poolId);
      expect(pool.reserveA).toBe('10000.0000000');
      expect(pool.reserveB).toBe('50000.0000000');
      expect(pool.totalShares).toBe('22360.6797750');
      expect(pool.fee).toBe(30);
    });

    it('should validate pool ID format', async () => {
      await expect(manager.getPoolDetails('invalid')).rejects.toThrow(
        'Invalid pool ID format'
      );
    });

    it('should throw error for non-existent pool', async () => {
      mockServer.call.mockRejectedValue({
        response: { status: 404 },
      });

      await expect(manager.getPoolDetails(poolId)).rejects.toThrow(
        'Liquidity pool not found'
      );
    });

    it('should parse native asset correctly', async () => {
      mockServer.call.mockResolvedValue(mockPool);

      const pool = await manager.getPoolDetails(poolId);

      expect(pool.assetA.isNative()).toBe(true);
    });

    it('should parse custom asset correctly', async () => {
      mockServer.call.mockResolvedValue(mockPool);

      const pool = await manager.getPoolDetails(poolId);

      expect(pool.assetB.isNative()).toBe(false);
      expect(pool.assetB.getCode()).toBe('USDC');
    });

    it('should throw error for invalid pool structure', async () => {
      mockServer.call.mockResolvedValue({
        ...mockPool,
        reserves: [{ asset: 'native', amount: '10000' }], // Only 1 reserve
      });

      await expect(manager.getPoolDetails(poolId)).rejects.toThrow(
        'Invalid pool structure'
      );
    });
  });

  describe('queryPools', () => {
    const mockResponse = {
      records: [
        {
          id: poolId,
          reserves: [
            { asset: 'native', amount: '10000.0000000' },
            {
              asset: 'USDC:GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
              amount: '50000.0000000',
            },
          ],
          total_shares: '22360.6797750',
          total_trustlines: '100',
          fee_bp: 30,
        },
      ],
    };

    it('should query pools without filters', async () => {
      mockServer.call.mockResolvedValue(mockResponse);

      const pools = await manager.queryPools();

      expect(pools.length).toBe(1);
      expect(pools[0].id).toBe(poolId);
      expect(mockServer.liquidityPools).toHaveBeenCalled();
    });

    it('should filter by assets', async () => {
      mockServer.call.mockResolvedValue(mockResponse);

      const assetA = Asset.native();
      const assetB = new Asset('USDC', 'GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

      await manager.queryPools({ assets: [assetA, assetB] });

      expect(mockServer.forAssets).toHaveBeenCalledWith(assetA, assetB);
    });

    it('should set limit if provided', async () => {
      mockServer.call.mockResolvedValue(mockResponse);

      await manager.queryPools({ limit: 20 });

      expect(mockServer.limit).toHaveBeenCalledWith(20);
    });

    it('should set cursor for pagination', async () => {
      mockServer.call.mockResolvedValue(mockResponse);

      await manager.queryPools({ cursor: 'cursor_123' });

      expect(mockServer.cursor).toHaveBeenCalledWith('cursor_123');
    });

    it('should not filter if only one asset provided', async () => {
      mockServer.call.mockResolvedValue(mockResponse);

      const assetA = Asset.native();

      await manager.queryPools({ assets: [assetA] });

      expect(mockServer.forAssets).not.toHaveBeenCalled();
    });
  });

  describe('getUserShares', () => {
    it('should get user shares for pool', async () => {
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          {
            asset_type: 'liquidity_pool_shares',
            liquidity_pool_id: poolId,
            balance: '2236.0679775',
          },
        ],
      });

      const shares = await manager.getUserShares(mockWallet.publicKey, poolId);

      expect(shares).toBe('2236.0679775');
    });

    it('should return 0 for no shares', async () => {
      mockServer.loadAccount.mockResolvedValue({
        balances: [],
      });

      const shares = await manager.getUserShares(mockWallet.publicKey, poolId);

      expect(shares).toBe('0');
    });

    it('should return 0 for non-existent account', async () => {
      mockServer.loadAccount.mockRejectedValue({
        response: { status: 404 },
      });

      const shares = await manager.getUserShares(mockWallet.publicKey, poolId);

      expect(shares).toBe('0');
    });

    it('should validate public key format', async () => {
      await expect(manager.getUserShares('INVALID', poolId)).rejects.toThrow(
        'Failed to get user shares'
      );
    });

    it('should validate pool ID format', async () => {
      await expect(
        manager.getUserShares(mockWallet.publicKey, 'invalid')
      ).rejects.toThrow('Invalid pool ID format');
    });
  });

  describe('getUserPoolShares', () => {
    const mockPool = {
      id: poolId,
      reserves: [
        { asset: 'native', amount: '10000.0000000' },
        { asset: 'USDC:GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', amount: '50000.0000000' },
      ],
      total_shares: '22360.6797750',
      total_trustlines: '100',
      fee_bp: 30,
    };

    it('should get all pool shares for user', async () => {
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          {
            asset_type: 'liquidity_pool_shares',
            liquidity_pool_id: poolId,
            balance: '2236.0679775',
          },
        ],
      });

      mockServer.call.mockResolvedValue(mockPool);

      const poolShares = await manager.getUserPoolShares(mockWallet.publicKey);

      expect(poolShares.length).toBe(1);
      expect(poolShares[0].poolId).toBe(poolId);
      expect(poolShares[0].balance).toBe('2236.0679775');
      expect(poolShares[0].percentage).toBe('10.0000'); // 10% of pool
    });

    it('should return empty array for account with no shares', async () => {
      mockServer.loadAccount.mockResolvedValue({
        balances: [],
      });

      const poolShares = await manager.getUserPoolShares(mockWallet.publicKey);

      expect(poolShares).toEqual([]);
    });

    it('should return empty array for non-existent account', async () => {
      mockServer.loadAccount.mockRejectedValue({
        response: { status: 404 },
      });

      const poolShares = await manager.getUserPoolShares(mockWallet.publicKey);

      expect(poolShares).toEqual([]);
    });

    it('should skip pools that no longer exist', async () => {
      mockServer.loadAccount.mockResolvedValue({
        balances: [
          {
            asset_type: 'liquidity_pool_shares',
            liquidity_pool_id: poolId,
            balance: '2236.0679775',
          },
        ],
      });

      mockServer.call.mockRejectedValue({
        response: { status: 404 },
      });

      const poolShares = await manager.getUserPoolShares(mockWallet.publicKey);

      expect(poolShares).toEqual([]);
    });
  });

  describe('getPoolAnalytics', () => {
    const mockPool = {
      id: poolId,
      reserves: [
        { asset: 'native', amount: '10000.0000000' },
        { asset: 'USDC:GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', amount: '50000.0000000' },
      ],
      total_shares: '22360.6797750',
      total_trustlines: '100',
      fee_bp: 30,
    };

    it('should get pool analytics', async () => {
      mockServer.call.mockResolvedValue(mockPool);

      const analytics = await manager.getPoolAnalytics(poolId);

      expect(analytics.tvl).toBeDefined();
      expect(analytics.sharePrice).toBeDefined();
      // volume24h, fees24h, and apy are optional and require historical data
      expect(analytics.volume24h).toBeUndefined();
      expect(analytics.fees24h).toBeUndefined();
      expect(analytics.apy).toBeUndefined();
    });

    it('should calculate share price correctly', async () => {
      mockServer.call.mockResolvedValue(mockPool);

      const analytics = await manager.getPoolAnalytics(poolId);

      // Share price = reserveA / totalShares = 10000 / 22360.6797750 ≈ 0.447
      expect(parseFloat(analytics.sharePrice)).toBeCloseTo(0.447, 2);
    });

    it('should handle pool with zero shares', async () => {
      mockServer.call.mockResolvedValue({
        ...mockPool,
        total_shares: '0',
      });

      const analytics = await manager.getPoolAnalytics(poolId);

      expect(analytics.sharePrice).toBe('0');
    });
  });

  describe('estimatePoolDeposit', () => {
    const mockPool = {
      id: poolId,
      reserves: [
        { asset: 'native', amount: '10000.0000000' },
        { asset: `USDC:${VALID_ISSUER}`, amount: '50000.0000000' },
      ],
      total_shares: '22360.6797750',
      total_trustlines: '100',
      fee_bp: 30,
    };

    it('should estimate deposit correctly', async () => {
      mockServer.call.mockResolvedValue(mockPool);

      const estimate = await manager.estimatePoolDeposit(poolId, '1000', '5000');

      expect(estimate.shares).toBeDefined();
      expect(estimate.actualAmountA).toBeDefined();
      expect(estimate.actualAmountB).toBeDefined();
      expect(estimate.poolShare).toBeDefined();
      expect(estimate.sharePrice).toBeDefined();
      expect(estimate.priceImpact).toBeDefined();
    });

    it('should validate pool ID', async () => {
      await expect(manager.estimatePoolDeposit('invalid', '1000', '5000')).rejects.toThrow(
        'Invalid pool ID format'
      );
    });
  });

  describe('estimatePoolWithdraw', () => {
    const mockPool = {
      id: poolId,
      reserves: [
        { asset: 'native', amount: '10000.0000000' },
        { asset: `USDC:${VALID_ISSUER}`, amount: '50000.0000000' },
      ],
      total_shares: '22360.6797750',
      total_trustlines: '100',
      fee_bp: 30,
    };

    it('should estimate withdrawal correctly', async () => {
      mockServer.call.mockResolvedValue(mockPool);

      const estimate = await manager.estimatePoolWithdraw(poolId, '2236.0679775');

      expect(estimate.amountA).toBeDefined();
      expect(estimate.amountB).toBeDefined();
      expect(estimate.sharePrice).toBeDefined();
      expect(estimate.priceImpact).toBeDefined();
    });

    it('should validate pool ID', async () => {
      await expect(manager.estimatePoolWithdraw('invalid', '1000')).rejects.toThrow(
        'Invalid pool ID format'
      );
    });
  });

  describe('getPoolsForAssets', () => {
    const mockResponse = {
      records: [
        {
          id: poolId,
          reserves: [
            { asset: 'native', amount: '10000.0000000' },
            {
              asset: 'USDC:GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
              amount: '50000.0000000',
            },
          ],
          total_shares: '22360.6797750',
          total_trustlines: '100',
          fee_bp: 30,
        },
      ],
    };

    it('should get pools for specific assets', async () => {
      mockServer.call.mockResolvedValue(mockResponse);

      const assetA = Asset.native();
      const assetB = new Asset('USDC', 'GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

      const pools = await manager.getPoolsForAssets(assetA, assetB);

      expect(pools.length).toBe(1);
      expect(mockServer.forAssets).toHaveBeenCalledWith(assetA, assetB);
    });

    it('should use custom limit', async () => {
      mockServer.call.mockResolvedValue(mockResponse);

      const assetA = Asset.native();
      const assetB = new Asset('USDC', 'GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

      await manager.getPoolsForAssets(assetA, assetB, 5);

      expect(mockServer.limit).toHaveBeenCalledWith(5);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockServer.submitTransaction.mockRejectedValue(new Error('Network timeout'));

      const params: LiquidityPoolDeposit = {
        poolId,
        maxAmountA: '1000',
        maxAmountB: '5000',
      };

      mockServer.call.mockResolvedValue({
        id: poolId,
        reserves: [
          { asset: 'native', amount: '10000.0000000' },
          {
            asset: 'USDC:GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            amount: '50000.0000000',
          },
        ],
        total_shares: '22360.6797750',
        total_trustlines: '100',
        fee_bp: 30,
      });

      await expect(manager.depositLiquidity(mockWallet, params, 'password')).rejects.toThrow(
        'Failed to deposit liquidity'
      );
    });

    it('should handle fee estimation errors', async () => {
      mockServer.feeStats.mockRejectedValue(new Error('Fee stats unavailable'));

      mockServer.call.mockResolvedValue({
        id: poolId,
        reserves: [
          { asset: 'native', amount: '10000.0000000' },
          {
            asset: 'USDC:GISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            amount: '50000.0000000',
          },
        ],
        total_shares: '22360.6797750',
        total_trustlines: '100',
        fee_bp: 30,
      });

      const params: LiquidityPoolDeposit = {
        poolId,
        maxAmountA: '1000',
        maxAmountB: '5000',
      };

      // Should still work with BASE_FEE fallback
      await manager.depositLiquidity(mockWallet, params, 'password');

      expect(mockServer.submitTransaction).toHaveBeenCalled();
    });
  });
});
