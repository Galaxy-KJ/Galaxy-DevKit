/**
 * @fileoverview Unit tests for PathPaymentManager
 * @description Tests for path finding, price impact, slippage protection, caching, and analytics
 */

import { Account, Asset, Horizon, Keypair } from '@stellar/stellar-sdk';
import { PathPaymentManager } from '../path-payments/path-payment-manager.js';
import { Wallet } from '../types/stellar-types.js';

jest.mock('../utils/encryption.utils', () => ({
  decryptPrivateKeyToString: jest.fn((encrypted: string, pwd: string) =>
    Promise.resolve(encrypted.replace('encrypted_', '').replace(`_with_${pwd}`, ''))
  ),
}));

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

const usdc = new Asset('USDC', 'GDXDUT7K43DEX7QMUL5WCLUDUJXUTHYBMQPJQ7BCJKUHHPSBWOB4EQ3B');
const eurc = new Asset('EURC', 'GCVTTXTJFI7DLOM5Z6XHFE367GVGQNE3SUF7TMUOZMJNORT4ODQKYRME');

function horizonPathRecord(overrides: Record<string, unknown> = {}) {
  return {
    source_asset_type: 'native',
    source_amount: '100',
    destination_asset_type: 'credit_alphanum4',
    destination_asset_code: 'USDC',
    destination_asset_issuer: usdc.getIssuer(),
    destination_amount: '95',
    path: [],
    ...overrides,
  };
}

function mockFetchOnce(records: unknown[]) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ _embedded: { records } }),
  });
}

describe('PathPaymentManager', () => {
  let server: jest.Mocked<Pick<Horizon.Server, 'loadAccount' | 'submitTransaction'>>;
  let manager: PathPaymentManager;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    server = {
      loadAccount: jest.fn(),
      submitTransaction: jest.fn(),
    } as unknown as typeof server;
    manager = new PathPaymentManager(
      server as unknown as Horizon.Server,
      NETWORK_PASSPHRASE
    );
  });

  describe('findPaths', () => {
    it('queries the strict-send Horizon endpoint for strict_send swaps', async () => {
      mockFetchOnce([horizonPathRecord()]);

      const paths = await manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_send',
      });

      expect(paths).toHaveLength(1);
      expect(paths[0].price).toBe('0.9500000');
      const [url] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/paths/strict-send');
      expect(url).toContain('source_amount=100');
    });

    it('queries the strict-receive Horizon endpoint for strict_receive swaps', async () => {
      mockFetchOnce([horizonPathRecord({ destination_amount: '100' })]);

      await manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_receive',
      });

      const [url] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/paths/strict-receive');
      expect(url).toContain('destination_amount=100');
    });

    it('returns an empty array when Horizon responds with a non-OK status', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });

      const paths = await manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_send',
      });

      expect(paths).toEqual([]);
    });

    it('caches results and does not re-fetch for an identical request', async () => {
      mockFetchOnce([horizonPathRecord()]);

      const params = {
        sourceAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_send' as const,
      };
      await manager.findPaths(params);
      await manager.findPaths(params);

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('coalesces concurrent identical in-flight requests into a single fetch', async () => {
      mockFetchOnce([horizonPathRecord()]);

      const params = {
        sourceAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_send' as const,
      };
      const [first, second] = await Promise.all([
        manager.findPaths(params),
        manager.findPaths(params),
      ]);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(first).toEqual(second);
    });

    it('re-fetches after clearPathCache', async () => {
      mockFetchOnce([horizonPathRecord()]);
      mockFetchOnce([horizonPathRecord()]);

      const params = {
        sourceAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_send' as const,
      };
      await manager.findPaths(params);
      manager.clearPathCache();
      await manager.findPaths(params);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getBestPath', () => {
    it('returns null for an empty path list', async () => {
      expect(await manager.getBestPath([], 'strict_send')).toBeNull();
    });

    it('picks the path with the highest destination amount for strict_send', async () => {
      mockFetchOnce([
        horizonPathRecord({ destination_amount: '90' }),
        horizonPathRecord({ destination_amount: '95' }),
        horizonPathRecord({ destination_amount: '80' }),
      ]);
      const paths = await manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_send',
      });

      const best = await manager.getBestPath(paths, 'strict_send');
      expect(best?.destination_amount).toBe('95');
    });

    it('picks the path with the lowest source amount for strict_receive', async () => {
      mockFetchOnce([
        horizonPathRecord({ source_amount: '110' }),
        horizonPathRecord({ source_amount: '100' }),
        horizonPathRecord({ source_amount: '120' }),
      ]);
      const paths = await manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdc,
        amount: '95',
        type: 'strict_receive',
      });

      const best = await manager.getBestPath(paths, 'strict_receive');
      expect(best?.source_amount).toBe('100');
    });
  });

  describe('price helpers', () => {
    it('getSwapPrice returns the path price', async () => {
      mockFetchOnce([horizonPathRecord()]);
      const [path] = await manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_send',
      });

      expect(manager.getSwapPrice(path, 'strict_send')).toBe(path.price);
    });

    it('flags high price impact paths', async () => {
      mockFetchOnce([horizonPathRecord()]);
      const [firstPath] = await manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_send',
      });
      // No history yet: baseline price impact is 0.
      expect(manager.isHighPriceImpact(firstPath)).toBe(false);
      expect(manager.calculatePriceImpact(firstPath)).toBe(firstPath.priceImpact);
    });
  });

  describe('estimateSwap', () => {
    it('throws when no path is found', async () => {
      mockFetchOnce([]);

      await expect(
        manager.estimateSwap({
          sendAsset: Asset.native(),
          destAsset: usdc,
          amount: '100',
          type: 'strict_send',
        })
      ).rejects.toThrow('No payment path found for estimate');
    });

    it('applies slippage to compute minimumReceived and maximumCost', async () => {
      mockFetchOnce([horizonPathRecord()]);

      const estimate = await manager.estimateSwap({
        sendAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_send',
        maxSlippage: 1,
      });

      expect(estimate.minimumReceived).toBe('94.0500000');
      expect(estimate.maximumCost).toBe('101.0000000');
      expect(estimate.highImpact).toBe(false);
    });

    it('estimates a swap along an explicit custom path without querying Horizon', async () => {
      const estimate = await manager.estimateSwap({
        sendAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_send',
        customPath: [eurc],
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(estimate.path).toEqual([Asset.native(), eurc, usdc]);
    });
  });

  describe('executeSwap', () => {
    const password = 'password';
    let wallet: Wallet;
    let keypair: Keypair;

    beforeEach(() => {
      keypair = Keypair.random();
      wallet = {
        id: 'wallet_1',
        publicKey: keypair.publicKey(),
        privateKey: `encrypted_${keypair.secret()}_with_${password}`,
        network: {
          network: 'testnet',
          horizonUrl: HORIZON_URL,
          passphrase: NETWORK_PASSPHRASE,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Wallet;

      server.loadAccount.mockResolvedValue(
        new Account(keypair.publicKey(), '100') as unknown as never
      );
      server.submitTransaction.mockResolvedValue({ hash: 'tx-hash-1' } as never);
    });

    it('submits a strict_send path payment and records analytics', async () => {
      mockFetchOnce([horizonPathRecord()]);

      const result = await manager.executeSwap(
        wallet,
        { sendAsset: Asset.native(), destAsset: usdc, amount: '100', type: 'strict_send' },
        password,
        keypair.publicKey()
      );

      expect(result.transactionHash).toBe('tx-hash-1');
      expect(server.submitTransaction).toHaveBeenCalledTimes(1);

      const { history } = manager.getSwapAnalytics();
      expect(history).toHaveLength(1);
      expect(history[0].success).toBe(true);
      expect(history[0].transactionHash).toBe('tx-hash-1');
    });

    it('throws when no payment path is available', async () => {
      mockFetchOnce([]);

      await expect(
        manager.executeSwap(
          wallet,
          { sendAsset: Asset.native(), destAsset: usdc, amount: '100', type: 'strict_send' },
          password,
          keypair.publicKey()
        )
      ).rejects.toThrow('No payment path found');
    });

    it('rejects when the estimated output falls below minDestinationAmount', async () => {
      mockFetchOnce([horizonPathRecord()]);

      await expect(
        manager.executeSwap(
          wallet,
          {
            sendAsset: Asset.native(),
            destAsset: usdc,
            amount: '100',
            type: 'strict_send',
            minDestinationAmount: '99',
          },
          password,
          keypair.publicKey()
        )
      ).rejects.toThrow(/Slippage protection/);

      expect(server.submitTransaction).not.toHaveBeenCalled();
    });

    it('rejects when the price falls below priceLimit', async () => {
      mockFetchOnce([horizonPathRecord()]);

      await expect(
        manager.executeSwap(
          wallet,
          {
            sendAsset: Asset.native(),
            destAsset: usdc,
            amount: '100',
            type: 'strict_send',
            priceLimit: '0.99',
          },
          password,
          keypair.publicKey()
        )
      ).rejects.toThrow(/Price limit not met/);
    });

    it('invalidates cached paths for the pair after a swap above the large-swap threshold', async () => {
      manager = new PathPaymentManager(
        server as unknown as Horizon.Server,
        NETWORK_PASSPHRASE,
        { largeSwapAmountThreshold: '50' }
      );
      mockFetchOnce([horizonPathRecord()]);

      const params = {
        sourceAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_send' as const,
      };
      await manager.findPaths(params);

      // executeSwap resolves the same path from cache: no extra fetch here.
      await manager.executeSwap(
        wallet,
        { sendAsset: Asset.native(), destAsset: usdc, amount: '100', type: 'strict_send' },
        password,
        keypair.publicKey()
      );

      // The swap exceeded the large-swap threshold, so this pair's cache was
      // invalidated and this call must hit Horizon again.
      mockFetchOnce([horizonPathRecord()]);
      await manager.findPaths(params);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSwapAnalytics', () => {
    it('starts empty', () => {
      expect(manager.getSwapAnalytics()).toEqual({ history: [], pathRates: [] });
    });
  });
});
