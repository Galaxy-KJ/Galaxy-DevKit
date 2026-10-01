/**
 * @fileoverview Unit tests for PathPaymentManager
 * @description Tests for path finding, price impact, slippage protection, caching, and analytics
 */

import { Account, Asset, Horizon, Keypair } from '@stellar/stellar-sdk';
import { PathPaymentError, PathPaymentManager } from '../path-payments/path-payment-manager.js';
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

const queuedRecords: unknown[][] = [];
let pathCall: jest.Mock;
let strictSendPaths: jest.Mock;
let strictReceivePaths: jest.Mock;
let sendLimit: jest.Mock;
let receiveLimit: jest.Mock;

function mockFetchOnce(records: unknown[]) {
  queuedRecords.push(records);
}

describe('PathPaymentManager', () => {
  let server: Horizon.Server;
  let manager: PathPaymentManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('raw horizon url'));
    queuedRecords.length = 0;
    pathCall = jest.fn(async () => ({ records: queuedRecords.shift() ?? [] }));
    sendLimit = jest.fn(() => ({ call: pathCall }));
    receiveLimit = jest.fn(() => ({ call: pathCall }));
    strictSendPaths = jest.fn(() => ({ limit: sendLimit }));
    strictReceivePaths = jest.fn(() => ({ limit: receiveLimit }));
    server = {
      loadAccount: jest.fn(),
      submitTransaction: jest.fn(),
      strictSendPaths,
      strictReceivePaths,
    } as unknown as Horizon.Server;
    manager = new PathPaymentManager(server, NETWORK_PASSPHRASE);
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
      expect(strictSendPaths).toHaveBeenCalledWith(Asset.native(), '100', [usdc]);
      expect(sendLimit).toHaveBeenCalledWith(15);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('queries the strict-receive Horizon endpoint for strict_receive swaps', async () => {
      mockFetchOnce([horizonPathRecord({ destination_amount: '100' })]);

      await manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_receive',
      });

      expect(strictReceivePaths).toHaveBeenCalledWith([Asset.native()], usdc, '100');
      expect(receiveLimit).toHaveBeenCalledWith(15);
    });

    it('throws when Horizon rejects the path query and does not cache the failure', async () => {
      pathCall.mockRejectedValueOnce(new Error('unavailable'));
      const params = {
        sourceAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_send' as const,
      };
      await expect(manager.findPaths(params)).rejects.toMatchObject({ code: 'HORIZON_ERROR' });
      pathCall.mockRejectedValueOnce(new Error('unavailable'));
      await expect(manager.findPaths(params)).rejects.toBeInstanceOf(PathPaymentError);
      expect(pathCall).toHaveBeenCalledTimes(2);
    });

    it('throws no liquidity on an empty book and does not cache that result', async () => {
      mockFetchOnce([]);
      mockFetchOnce([]);
      const params = {
        sourceAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_send' as const,
      };
      await expect(manager.findPaths(params)).rejects.toMatchObject({ code: 'NO_LIQUIDITY' });
      await expect(manager.findPaths(params)).rejects.toMatchObject({ code: 'NO_LIQUIDITY' });
      expect(pathCall).toHaveBeenCalledTimes(2);
    });

    it('passes a 12 character asset to the horizon builder', async () => {
      const longAsset = new Asset('LONGASSETXXX', usdc.getIssuer());
      expect(longAsset.getAssetType()).toBe('credit_alphanum12');
      mockFetchOnce([horizonPathRecord()]);
      await manager.findPaths({
        sourceAsset: longAsset,
        destAsset: usdc,
        amount: '5',
        type: 'strict_send',
      });
      expect(strictSendPaths).toHaveBeenCalledWith(longAsset, '5', [usdc]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('sends the destination account when one is provided', async () => {
      mockFetchOnce([horizonPathRecord()]);
      const destination = Keypair.random().publicKey();
      await manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_send',
        destinationAccount: destination,
      });
      expect(strictSendPaths).toHaveBeenCalledWith(Asset.native(), '100', destination);
    });

    it('sends the source account for strict receive', async () => {
      mockFetchOnce([horizonPathRecord()]);
      const source = Keypair.random().publicKey();
      await manager.findPaths({
        sourceAsset: Asset.native(),
        destAsset: usdc,
        amount: '95',
        type: 'strict_receive',
        sourceAccount: source,
      });
      expect(strictReceivePaths).toHaveBeenCalledWith(source, usdc, '95');
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

      expect(pathCall).toHaveBeenCalledTimes(1);
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

      expect(pathCall).toHaveBeenCalledTimes(1);
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

      expect(pathCall).toHaveBeenCalledTimes(2);
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
      ).rejects.toMatchObject({ code: 'NO_LIQUIDITY' });
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

    it('returns a real quote for a custom path by querying Horizon', async () => {
      mockFetchOnce([
        horizonPathRecord({
          source_amount: '100',
          destination_amount: '93',
          path: [{ asset_type: 'credit_alphanum4', asset_code: 'EURC', asset_issuer: eurc.getIssuer() }],
        }),
      ]);

      const estimate = await manager.estimateSwap({
        sendAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_send',
        customPath: [eurc],
        maxSlippage: 1,
      });

      expect(pathCall).toHaveBeenCalledTimes(1);
      expect(strictSendPaths).toHaveBeenCalled();
      // minimumReceived must be derived from the real destination_amount, not '0'
      expect(estimate.minimumReceived).not.toBe('0.0000000');
      expect(estimate.minimumReceived).toBe('92.0700000'); // 93 * (1 - 0.01)
      expect(estimate.price).not.toBe('0');
      expect(estimate.priceImpact).not.toBe(undefined);
    });

    it('throws when Horizon returns no matching quote for the custom path', async () => {
      // Horizon returns a path through a different intermediate asset
      mockFetchOnce([
        horizonPathRecord({
          source_amount: '100',
          destination_amount: '93',
          path: [], // no intermediate hop, does not match [eurc]
        }),
      ]);

      await expect(
        manager.estimateSwap({
          sendAsset: Asset.native(),
          destAsset: usdc,
          amount: '100',
          type: 'strict_send',
          customPath: [eurc],
        })
      ).rejects.toThrow('Unable to obtain a safe Horizon quote for the custom payment path');
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

      expect(pathCall).toHaveBeenCalledTimes(2);
    });
  });

  describe('custom path regression', () => {
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
      server.submitTransaction.mockResolvedValue({ hash: 'tx-hash-custom' } as never);
    });

    /**
     * Inspect the PathPaymentStrictSend operation built inside executeSwap.
     * We reach it by intercepting submitTransaction and inspecting the XDR.
     */
    function captureBuiltOperation() {
      let capturedTx: any;
      server.submitTransaction.mockImplementation((tx: any) => {
        capturedTx = tx;
        return Promise.resolve({ hash: 'tx-hash-custom' });
      });
      return () => capturedTx;
    }

    it('strict_send custom path: destMin is derived from a real Horizon quote, never zero', async () => {
      mockFetchOnce([
        horizonPathRecord({
          source_amount: '100',
          destination_amount: '93',
          path: [{ asset_type: 'credit_alphanum4', asset_code: 'EURC', asset_issuer: eurc.getIssuer() }],
        }),
      ]);

      const getTx = captureBuiltOperation();

      await manager.executeSwap(
        wallet,
        {
          sendAsset: Asset.native(),
          destAsset: usdc,
          amount: '100',
          type: 'strict_send',
          customPath: [eurc],
          maxSlippage: 1,
        },
        password,
        keypair.publicKey()
      );

      // Verify Horizon was queried
      expect(pathCall).toHaveBeenCalledTimes(1);
      expect(strictSendPaths).toHaveBeenCalled();

      // destMin = 93 * (1 - 0.01) = 92.0700000
      const tx = getTx();
      const op = tx.operations[0];
      expect(op.type).toBe('pathPaymentStrictSend');
      expect(op.destMin).toBe('92.0700000');
      expect(op.destMin).not.toBe('0');
      expect(op.destMin).not.toBe('0.0000000');
    });

    it('strict_receive custom path: sendMax is derived from a real Horizon quote and operation succeeds', async () => {
      mockFetchOnce([
        {
          source_asset_type: 'native',
          source_amount: '106',
          destination_asset_type: 'credit_alphanum4',
          destination_asset_code: 'USDC',
          destination_asset_issuer: usdc.getIssuer(),
          destination_amount: '100',
          path: [{ asset_type: 'credit_alphanum4', asset_code: 'EURC', asset_issuer: eurc.getIssuer() }],
        },
      ]);

      const getTx = captureBuiltOperation();

      await manager.executeSwap(
        wallet,
        {
          sendAsset: Asset.native(),
          destAsset: usdc,
          amount: '100',
          type: 'strict_receive',
          customPath: [eurc],
          maxSlippage: 1,
        },
        password,
        keypair.publicKey()
      );

      expect(pathCall).toHaveBeenCalledTimes(1);
      expect(strictReceivePaths).toHaveBeenCalled();

      // sendMax = 106 × (1 + 0.01) = 107.0600000
      const tx = getTx();
      const op = tx.operations[0];
      expect(op.type).toBe('pathPaymentStrictReceive');
      expect(op.sendMax).not.toBe('0');
      expect(op.sendMax).not.toBe('0.0000000');
      expect(op.sendMax).toBe('107.0600000');
    });

    it('throws before submitTransaction when no usable Horizon quote exists for the custom path', async () => {
      // Horizon returns a path through a different intermediate, no match for [eurc]
      mockFetchOnce([horizonPathRecord({ path: [] })]);

      await expect(
        manager.executeSwap(
          wallet,
          {
            sendAsset: Asset.native(),
            destAsset: usdc,
            amount: '100',
            type: 'strict_send',
            customPath: [eurc],
          },
          password,
          keypair.publicKey()
        )
      ).rejects.toThrow('Unable to obtain a safe Horizon quote for the custom payment path');

      expect(server.submitTransaction).not.toHaveBeenCalled();
    });

    it('throws before submitTransaction when Horizon returns a zero destination_amount for the custom path', async () => {
      mockFetchOnce([
        horizonPathRecord({
          destination_amount: '0',
          path: [{ asset_type: 'credit_alphanum4', asset_code: 'EURC', asset_issuer: eurc.getIssuer() }],
        }),
      ]);

      await expect(
        manager.executeSwap(
          wallet,
          {
            sendAsset: Asset.native(),
            destAsset: usdc,
            amount: '100',
            type: 'strict_send',
            customPath: [eurc],
          },
          password,
          keypair.publicKey()
        )
      ).rejects.toThrow();

      expect(server.submitTransaction).not.toHaveBeenCalled();
    });

    it('highImpactWarning fires correctly for a high-impact custom path', async () => {
      // Seed swap history so a baseline price exists
      // Simulate a previous swap at price 1.0 so current price 0.85 shows ~15% impact
      (manager as any).swapHistory.push({
        timestamp: new Date(),
        pathHash: 'dummy',
        pairKey: `native->${usdc.getCode()}:${usdc.getIssuer()}`,
        pathDepth: 1,
        inputAmount: '100',
        outputAmount: '100',
        executedPrice: '1.0',
        priceImpact: '0',
        success: true,
      });

      mockFetchOnce([
        horizonPathRecord({
          source_amount: '100',
          destination_amount: '85', // ~15% below baseline → high impact
          path: [{ asset_type: 'credit_alphanum4', asset_code: 'EURC', asset_issuer: eurc.getIssuer() }],
        }),
      ]);

      const result = await manager.executeSwap(
        wallet,
        {
          sendAsset: Asset.native(),
          destAsset: usdc,
          amount: '100',
          type: 'strict_send',
          customPath: [eurc],
          maxSlippage: 20, // wide enough to not trip slippage guard
        },
        password,
        keypair.publicKey()
      );

      expect(result.highImpactWarning).toBe(true);
    });
  });

  describe('getSwapAnalytics', () => {
    it('starts empty', () => {
      expect(manager.getSwapAnalytics()).toEqual({ history: [], pathRates: [] });
    });
  });

  describe('slippage and submission guards', () => {
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
      (server.loadAccount as jest.Mock).mockResolvedValue(new Account(keypair.publicKey(), '100'));
      (server.submitTransaction as jest.Mock).mockResolvedValue({ hash: 'tx-hash-1' });
    });

    it.each([-1, 50.01, Number.NaN])('rejects slippage %s before calling horizon', async (maxSlippage) => {
      await expect(manager.estimateSwap({
        sendAsset: Asset.native(),
        destAsset: usdc,
        amount: '100',
        type: 'strict_send',
        maxSlippage,
      })).rejects.toMatchObject({ code: 'INVALID_SLIPPAGE' });
      expect(pathCall).not.toHaveBeenCalled();
    });

    it.each(['0', '-1', 'abc'])('rejects amount %s before calling horizon', async (amount) => {
      await expect(manager.estimateSwap({
        sendAsset: Asset.native(),
        destAsset: usdc,
        amount,
        type: 'strict_send',
        maxSlippage: 1,
      })).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
      expect(pathCall).not.toHaveBeenCalled();
    });

    it('rejects a swap into the same asset', async () => {
      await expect(manager.estimateSwap({
        sendAsset: usdc,
        destAsset: usdc,
        amount: '10',
        type: 'strict_send',
        maxSlippage: 1,
      })).rejects.toMatchObject({ code: 'SAME_ASSET' });
      expect(pathCall).not.toHaveBeenCalled();
    });

    it('prefers the shorter path when destination amounts match', async () => {
      const shared = {
        source_asset: Asset.native(),
        destination_asset: usdc,
        source_amount: '100',
        destination_amount: '10',
        price: '0.1',
        priceImpact: '0',
      };
      const best = await manager.getBestPath([
        { ...shared, path: [eurc, usdc] },
        { ...shared, path: [] },
      ], 'strict_send');
      expect(best?.path).toHaveLength(0);
    });

    it('records a failed submission and a later success', async () => {
      mockFetchOnce([horizonPathRecord()]);
      const horizonError = new Error('tx_failed');
      (server.submitTransaction as jest.Mock).mockRejectedValueOnce(horizonError);
      await expect(manager.executeSwap(
        wallet,
        { sendAsset: Asset.native(), destAsset: usdc, amount: '100', type: 'strict_send', maxSlippage: 1 },
        password,
        keypair.publicKey(),
      )).rejects.toMatchObject({ code: 'SUBMIT_FAILED', cause: horizonError });

      (server.submitTransaction as jest.Mock).mockResolvedValueOnce({ hash: 'tx-ok' });
      await manager.executeSwap(
        wallet,
        { sendAsset: Asset.native(), destAsset: usdc, amount: '100', type: 'strict_send', maxSlippage: 1 },
        password,
        keypair.publicKey(),
      );
      expect(manager.getSwapAnalytics().history.map((row) => row.success)).toEqual([false, true]);
    });
  });

});
