/**
 * @fileoverview Unit tests for PathPaymentManager
 * @description Path finding, swap estimation, slippage protection, analytics
 */

import { PathPaymentManager } from '../path-payments/path-payment-manager';
import { Asset, Horizon, Keypair } from '@stellar/stellar-sdk';
import type { PaymentPath } from '../path-payments/types';
import { Wallet } from '../types/stellar-types';

/** Valid test issuer (Stellar public key format, from liquidity-pool tests) */
const TEST_ISSUER = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

/** Single keypair for executeSwap tests so signature is consistent */
const TEST_KEYPAIR = Keypair.random();

function usdcAsset() {
  return new Asset('USDC', TEST_ISSUER);
}

function strictSendRecord(destinationAmount: string, sourceAmount = '100.0000000') {
  return {
    source_asset_type: 'native',
    source_amount: sourceAmount,
    destination_asset_type: 'credit_alphanum4',
    destination_asset_code: 'USDC',
    destination_asset_issuer: TEST_ISSUER,
    destination_amount: destinationAmount,
    path: [],
  };
}

function strictReceiveRecord(sourceAmount: string, destinationAmount = '100.0000000') {
  return {
    source_asset_type: 'native',
    source_amount: sourceAmount,
    destination_asset_type: 'credit_alphanum4',
    destination_asset_code: 'USDC',
    destination_asset_issuer: TEST_ISSUER,
    destination_amount: destinationAmount,
    path: [],
  };
}

jest.mock('../utils/encryption.utils', () => ({
  decryptPrivateKey: jest.fn(() => Promise.resolve(Buffer.from(TEST_KEYPAIR.secret()))),
  decryptPrivateKeyToString: jest.fn(() => Promise.resolve(TEST_KEYPAIR.secret())),
}));

function createMockAccount(accountId: string) {
  const mock = {
    accountId: () => accountId,
    sequenceNumber: () => '1',
    incrementSequenceNumber: jest.fn(function (this: any) {
      return this;
    }),
  };
  mock.incrementSequenceNumber.mockReturnValue(mock);
  return mock;
}

const mockServer = {
  loadAccount: jest.fn().mockImplementation((accountId: string) =>
    Promise.resolve(createMockAccount(accountId))
  ),
  submitTransaction: jest.fn().mockResolvedValue({
    hash: 'tx-hash-123',
    successful: true,
  }),
  serverURL: 'https://horizon-testnet.stellar.org/',
} as unknown as Horizon.Server;

describe('PathPaymentManager', () => {
  let manager: PathPaymentManager;
  const networkPassphrase = 'Test SDF Network ; September 2015';

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    manager = new PathPaymentManager(mockServer, networkPassphrase, {
      pathCacheTtlMs: 0,
    });
    (global as any).fetch = jest.fn();
  });

  describe('findPaths', () => {
    it('should return paths from strict send API', async () => {
      (global as any).fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _embedded: {
            records: [
              {
                source_asset_type: 'native',
                source_asset_code: undefined,
                source_asset_issuer: undefined,
                source_amount: '100.0000000',
                destination_asset_type: 'credit_alphanum4',
                destination_asset_code: 'USDC',
                destination_asset_issuer: TEST_ISSUER,
                destination_amount: '95.0000000',
                path: [],
              },
            ],
          },
        }),
      });

      const paths = await manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdcAsset(),
        amount: '100.0000000',
        type: 'strict_send',
        limit: 5,
      });

      expect(paths).toHaveLength(1);
      expect(paths[0].source_amount).toBe('100.0000000');
      expect(paths[0].destination_amount).toBe('95.0000000');
      expect(paths[0].path).toEqual([]);
      expect(paths[0].pathDepth).toBe(0);
    });

    it('should return paths from strict receive API', async () => {
      (global as any).fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _embedded: {
            records: [
              {
                source_asset_type: 'native',
                source_amount: '105.0000000',
                destination_asset_type: 'credit_alphanum4',
                destination_asset_code: 'USDC',
                destination_asset_issuer: TEST_ISSUER,
                destination_amount: '100.0000000',
                path: [],
              },
            ],
          },
        }),
      });

      const paths = await manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdcAsset(),
        amount: '100.0000000',
        type: 'strict_receive',
      });

      expect(paths).toHaveLength(1);
      expect(paths[0].destination_amount).toBe('100.0000000');
      expect(paths[0].source_amount).toBe('105.0000000');
    });

    it('should return empty array when API fails', async () => {
      (global as any).fetch.mockResolvedValueOnce({ ok: false });

      const paths = await manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdcAsset(),
        amount: '100',
        type: 'strict_send',
      });

      expect(paths).toEqual([]);
    });

    it('reuses cached paths within TTL', async () => {
      manager = new PathPaymentManager(mockServer, networkPassphrase, {
        pathCacheTtlMs: 60_000,
      });

      (global as any).fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _embedded: {
            records: [strictSendRecord('95.0000000')],
          },
        }),
      });

      const first = await manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdcAsset(),
        amount: '100.0000000',
        type: 'strict_send',
      });
      const second = await manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdcAsset(),
        amount: '100.0000000',
        type: 'strict_send',
      });

      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect((global as any).fetch).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent path requests for the same cache key', async () => {
      let resolveFetch: ((value: any) => void) | undefined;
      (global as any).fetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      );

      const requestA = manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdcAsset(),
        amount: '100.0000000',
        type: 'strict_send',
      });
      const requestB = manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdcAsset(),
        amount: '100.0000000',
        type: 'strict_send',
      });

      expect((global as any).fetch).toHaveBeenCalledTimes(1);

      resolveFetch?.({
        ok: true,
        json: async () => ({
          _embedded: {
            records: [strictSendRecord('95.0000000')],
          },
        }),
      });

      const [pathsA, pathsB] = await Promise.all([requestA, requestB]);
      expect(pathsA[0].destination_amount).toBe('95.0000000');
      expect(pathsB[0].destination_amount).toBe('95.0000000');
    });
  });

  describe('getBestPath', () => {
    it('should return best path for strict send (max destination amount)', async () => {
      const paths: PaymentPath[] = [
        {
          source_asset: Asset.native(),
          destination_asset: usdcAsset(),
          path: [],
          source_amount: '100',
          destination_amount: '90',
          price: '0.9',
          priceImpact: '1',
        },
        {
          source_asset: Asset.native(),
          destination_asset: usdcAsset(),
          path: [],
          source_amount: '100',
          destination_amount: '95',
          price: '0.95',
          priceImpact: '0.5',
        },
      ];

      const best = await manager.getBestPath(paths, 'strict_send');
      expect(best).not.toBeNull();
      expect(best!.destination_amount).toBe('95');
    });

    it('should return best path for strict receive (min source amount)', async () => {
      const paths: PaymentPath[] = [
        {
          source_asset: Asset.native(),
          destination_asset: usdcAsset(),
          path: [],
          source_amount: '110',
          destination_amount: '100',
          price: '0.909',
          priceImpact: '0',
        },
        {
          source_asset: Asset.native(),
          destination_asset: usdcAsset(),
          path: [],
          source_amount: '105',
          destination_amount: '100',
          price: '0.952',
          priceImpact: '0',
        },
      ];

      const best = await manager.getBestPath(paths, 'strict_receive');
      expect(best).not.toBeNull();
      expect(best!.source_amount).toBe('105');
    });

    it('should return null for empty paths', async () => {
      const best = await manager.getBestPath([], 'strict_send');
      expect(best).toBeNull();
    });
  });

  describe('estimateSwap', () => {
    it('should return estimate for strict send', async () => {
      (global as any).fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _embedded: {
            records: [
              {
                source_asset_type: 'native',
                source_amount: '100.0000000',
                destination_asset_type: 'credit_alphanum4',
                destination_asset_code: 'USDC',
                destination_asset_issuer: TEST_ISSUER,
                destination_amount: '95.0000000',
                path: [],
              },
            ],
          },
        }),
      });

      const estimate = await manager.estimateSwap({
        sendAsset: Asset.native(),
        destAsset: usdcAsset(),
        amount: '100.0000000',
        type: 'strict_send',
        maxSlippage: 1,
      });

      expect(estimate.inputAmount).toBe('100.0000000');
      expect(estimate.outputAmount).toBe('95.0000000');
      expect(estimate.minimumReceived).toBeDefined();
      expect(estimate.highImpact).toBe(false);
    });

    it('should throw when no path found for estimate', async () => {
      (global as any).fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ _embedded: { records: [] } }) });

      await expect(
        manager.estimateSwap({
          sendAsset: Asset.native(),
          destAsset: usdcAsset(),
          amount: '100',
          type: 'strict_send',
        })
      ).rejects.toThrow('No payment path found');
    });

    it('adjusts slippage guidance using historical volatility', async () => {
      const wallet: Wallet = {
        id: 'w1',
        publicKey: TEST_KEYPAIR.publicKey(),
        privateKey: 'encrypted_' + TEST_KEYPAIR.secret(),
        network: { network: 'testnet', horizonUrl: 'https://horizon-testnet.stellar.org', passphrase: networkPassphrase },
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
      };

      (global as any).fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            _embedded: {
              records: [strictSendRecord('98.0000000')],
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            _embedded: {
              records: [strictSendRecord('90.0000000')],
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            _embedded: {
              records: [strictSendRecord('92.0000000')],
            },
          }),
        });

      await manager.executeSwap(
        wallet,
        {
          sendAsset: Asset.native(),
          destAsset: usdcAsset(),
          amount: '100.0000000',
          type: 'strict_send',
        },
        'pass',
        wallet.publicKey
      );

      await manager.executeSwap(
        wallet,
        {
          sendAsset: Asset.native(),
          destAsset: usdcAsset(),
          amount: '100.0000000',
          type: 'strict_send',
        },
        'pass',
        wallet.publicKey
      );

      const estimate = await manager.estimateSwap({
        sendAsset: Asset.native(),
        destAsset: usdcAsset(),
        amount: '100.0000000',
        type: 'strict_send',
      });

      expect(estimate.historicalVolatility).not.toBe('0.00');
      expect(estimate.volatilityAdjustedSlippage).toBeGreaterThan(1);
      expect(estimate.suggestedMaxSlippage).toBeGreaterThan(1);
    });
  });

  describe('getSwapPrice and price impact', () => {
    it('getSwapPrice returns path price', () => {
      const path: PaymentPath = {
        source_asset: Asset.native(),
        destination_asset: usdcAsset(),
        path: [],
        source_amount: '100',
        destination_amount: '95',
        price: '0.95',
        priceImpact: '2.5',
      };
      expect(manager.getSwapPrice(path, 'strict_send')).toBe('0.95');
    });

    it('calculatePriceImpact returns path priceImpact', () => {
      const path: PaymentPath = {
        source_asset: Asset.native(),
        destination_asset: usdcAsset(),
        path: [],
        source_amount: '100',
        destination_amount: '95',
        price: '0.95',
        priceImpact: '5.0',
      };
      expect(manager.calculatePriceImpact(path)).toBe('5.0');
    });

    it('isHighPriceImpact returns true when >= 5%', () => {
      const high: PaymentPath = {
        source_asset: Asset.native(),
        destination_asset: usdcAsset(),
        path: [],
        source_amount: '100',
        destination_amount: '90',
        price: '0.9',
        priceImpact: '6',
      };
      const low: PaymentPath = {
        ...high,
        priceImpact: '2',
      };
      expect(manager.isHighPriceImpact(high)).toBe(true);
      expect(manager.isHighPriceImpact(low)).toBe(false);
    });
  });

  describe('executeSwap', () => {
    const wallet: Wallet = {
      id: 'w1',
      publicKey: TEST_KEYPAIR.publicKey(),
      privateKey: 'encrypted_' + TEST_KEYPAIR.secret(),
      network: { network: 'testnet', horizonUrl: 'https://horizon-testnet.stellar.org', passphrase: networkPassphrase },
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    };

    it('should execute strict send swap and return result', async () => {
      (global as any).fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _embedded: {
            records: [
              {
                source_asset_type: 'native',
                source_amount: '100.0000000',
                destination_asset_type: 'credit_alphanum4',
                destination_asset_code: 'USDC',
                destination_asset_issuer: TEST_ISSUER,
                destination_amount: '95.0000000',
                path: [],
              },
            ],
          },
        }),
      });

      const result = await manager.executeSwap(
        wallet,
        {
          sendAsset: Asset.native(),
          destAsset: usdcAsset(),
          amount: '100.0000000',
          type: 'strict_send',
          maxSlippage: 1,
        },
        'pass',
        wallet.publicKey
      );

      expect(result.transactionHash).toBe('tx-hash-123');
      expect(result.inputAmount).toBe('100.0000000');
      expect(result.outputAmount).toBe('95.0000000');
      expect(result.path).toHaveLength(2);
      expect(mockServer.loadAccount).toHaveBeenCalledWith(wallet.publicKey);
      expect(mockServer.submitTransaction).toHaveBeenCalled();
    });

    it('should throw when no path found for executeSwap', async () => {
      (global as any).fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ _embedded: { records: [] } }) });

      await expect(
        manager.executeSwap(
          wallet,
          {
            sendAsset: Asset.native(),
            destAsset: usdcAsset(),
            amount: '100',
            type: 'strict_send',
          },
          'pass',
          wallet.publicKey
        )
      ).rejects.toThrow('No payment path found');
    });

    it('should execute strict receive swap and return source cost', async () => {
      (global as any).fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _embedded: {
            records: [
              strictReceiveRecord('105.0000000'),
            ],
          },
        }),
      });

      const result = await manager.executeSwap(
        wallet,
        {
          sendAsset: Asset.native(),
          destAsset: usdcAsset(),
          amount: '100.0000000',
          type: 'strict_receive',
          maxSlippage: 1,
        },
        'pass',
        wallet.publicKey
      );

      expect(result.inputAmount).toBe('105.0000000');
      expect(result.outputAmount).toBe('100.0000000');
      expect(result.slippageApplied).toBe('1.00');
      expect(mockServer.submitTransaction).toHaveBeenCalled();
    });
  });

  describe('getSwapAnalytics and clearPathCache', () => {
    it('getSwapAnalytics returns history and path rates', () => {
      const { history, pathRates } = manager.getSwapAnalytics();
      expect(Array.isArray(history)).toBe(true);
      expect(Array.isArray(pathRates)).toBe(true);
    });

    it('clearPathCache clears cache', () => {
      manager.clearPathCache();
      const { history } = manager.getSwapAnalytics();
      expect(history).toEqual([]);
    });
  });
});
