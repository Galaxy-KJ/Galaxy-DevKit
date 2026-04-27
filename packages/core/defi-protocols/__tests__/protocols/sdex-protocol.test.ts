/**
 * @fileoverview Tests for SDEX Protocol implementation
 */

import { SdexProtocol } from '../../src/protocols/sdex/sdex-protocol';
import { ProtocolConfig, ProtocolType, Asset } from '../../src/types/defi-types';
import { InvalidOperationError } from '../../src/errors';
import { Operation } from '@stellar/stellar-sdk';

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({
        toXDR: jest.fn().mockReturnValue('mock-xdr-string'),
      }),
    })),
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        ledgers: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            call: jest.fn().mockResolvedValue({}),
          }),
        }),
        loadAccount: jest.fn().mockResolvedValue({
          accountId: () => 'G-TEST-ADDRESS',
          sequenceNumber: () => '123',
          incrementSequenceNumber: jest.fn(),
        }),
        strictSendPaths: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({
            records: [
              {
                source_asset_type: 'native',
                source_amount: '10',
                destination_asset_type: 'credit_alphanum4',
                destination_asset_code: 'USDC',
                destination_asset_issuer: 'G-ISSUER',
                destination_amount: '9.5',
                path: [
                  { asset_type: 'native' },
                  { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'G-ISSUER' }
                ]
              }
            ]
          })
        })
      })),
    },
    Operation: {
      pathPaymentStrictSend: jest.fn().mockReturnValue({ type: 'pathPaymentStrictSend' }),
    },
    BASE_FEE: '100',
  };
});

describe('SdexProtocol', () => {
  let sdexProtocol: SdexProtocol;
  let mockConfig: ProtocolConfig;

  const testAddress = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  const XLM: Asset = { code: 'XLM', type: 'native' };
  const USDC: Asset = {
    code: 'USDC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    type: 'credit_alphanum4'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = {
      protocolId: 'sdex',
      name: 'Stellar DEX',
      network: {
        network: 'testnet',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
        passphrase: 'Test SDF Network ; September 2015'
      },
      contractAddresses: {},
      metadata: {}
    };
    sdexProtocol = new SdexProtocol(mockConfig);
  });

  describe('Basics', () => {
    it('initializes and returns basic info', async () => {
      await sdexProtocol.initialize();
      expect(sdexProtocol.isInitialized()).toBe(true);
      expect(sdexProtocol.type).toBe(ProtocolType.DEX);
      expect(sdexProtocol.protocolId).toBe('sdex');
    });

    it('returns placeholder stats', async () => {
      await sdexProtocol.initialize();
      const stats = await sdexProtocol.getStats();
      expect(stats.tvl).toBe('0');
    });
  });

  describe('Lending (Unsupported)', () => {
    beforeEach(async () => {
      await sdexProtocol.initialize();
    });

    it('throws InvalidOperationError on lending methods', async () => {
      await expect(sdexProtocol.supply()).rejects.toThrow(InvalidOperationError);
      await expect(sdexProtocol.borrow()).rejects.toThrow(InvalidOperationError);
      await expect(sdexProtocol.getPosition()).rejects.toThrow(InvalidOperationError);
    });
  });

  describe('Swap Operations', () => {
    beforeEach(async () => {
      await sdexProtocol.initialize();
    });

    it('gets a swap quote', async () => {
      const quote = await sdexProtocol.getSwapQuote(XLM, USDC, '10');
      expect(quote.amountOut).toBe('9.5');
      expect(quote.path).toContain('XLM');
    });

    it('executes a swap', async () => {
      const result = await sdexProtocol.swap(testAddress, 'SK...', XLM, USDC, '10', '9');
      expect(result.status).toBe('pending');
      expect(result.hash).toBe('mock-xdr-string');
      expect(Operation.pathPaymentStrictSend).toHaveBeenCalled();
    });

    it('handles no path found', async () => {
      const mockHorizon = (sdexProtocol as any).horizonServer;
      mockHorizon.strictSendPaths().call.mockResolvedValueOnce({ records: [] });
      await expect(sdexProtocol.getSwapQuote(XLM, USDC, '10')).rejects.toThrow(/No path found/);
    });
  });
});
