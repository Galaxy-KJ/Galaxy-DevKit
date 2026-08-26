import { AquariusProtocol } from '../../src/protocols/aquarius/aquarius-protocol.js';
import { ProtocolConfig, ProtocolType, Asset } from '../../src/types/defi-types.js';
import { SdexProtocol } from '../../src/protocols/sdex/sdex-protocol.js';
import { Operation, TransactionBuilder, BASE_FEE, Keypair } from '@stellar/stellar-sdk';

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
    Operation: {
      ...original.Operation,
      claimClaimableBalance: jest.fn().mockImplementation((opts) => original.Operation.claimClaimableBalance(opts))
    }
  };
});

global.fetch = jest.fn();

describe('AquariusProtocol', () => {
  let protocol: AquariusProtocol;
  const mockConfig: ProtocolConfig = {
    protocolId: 'aquarius',
    name: 'Aquarius',
    network: {
      network: 'testnet',
      passphrase: 'Test SDF Network ; September 2015',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      sorobanRpcUrl: 'https://soroban-testnet.stellar.org'
    },
    contractAddresses: {},
    metadata: {}
  };

  beforeEach(() => {
    protocol = new AquariusProtocol(mockConfig);
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      // Mock horizon server ledgers call
      const mockCall = jest.fn().mockResolvedValue({});
      const mockLimit = jest.fn().mockReturnValue({ call: mockCall });
      (protocol as any).horizonServer.ledgers = jest.fn().mockReturnValue({ limit: mockLimit });
      
      await expect(protocol.initialize()).resolves.not.toThrow();
      expect(protocol.isInitialized()).toBe(true);
    });

    it('should return correct protocol type', () => {
      expect(protocol.type).toBe(ProtocolType.DEX);
    });
  });

  describe('getIncentivizedPools', () => {
    it('should query Aquarius API', async () => {
      (protocol as any).initialized = true;
      const mockPools = [{ pool_id: 'pool1' }];
      (fetch as unknown as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPools
      });

      const pools = await protocol.getIncentivizedPools();
      expect(pools).toEqual(mockPools);
      expect(fetch).toHaveBeenCalledWith('https://amm-api.aquarius.network/pools');
    });

    it('should throw on API error', async () => {
      (protocol as any).initialized = true;
      (fetch as unknown as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found'
      });

      await expect(protocol.getIncentivizedPools()).rejects.toThrow('Failed to fetch Aquarius pools: Not Found');
    });
  });

  describe('claimRewards', () => {
    const mockWallet = 'GDFV6WBXVLJPV3LDOS45SR7MK4ZWTVULJ3P7HQ77CXCVHSA5G2C46PI4';
    const mockPrivateKey = 'SBISGP3Y7V62ZUPUBAEFUNRIL2O5A7HRVNFGFHDSZYTQ6XNCSQYFF3RK';
    
    beforeEach(() => {
      (protocol as any).initialized = true;
      
      // Mock horizon server for submitting tx
      (protocol as any).horizonServer.loadAccount = jest.fn().mockResolvedValue({
        accountId: () => mockWallet,
        sequenceNumber: () => '1',
        incrementSequenceNumber: jest.fn()
      });
      (protocol as any).horizonServer.submitTransaction = jest.fn().mockResolvedValue({
        hash: 'testhash',
        successful: true,
        ledger: 100
      });
    });

    it('should require balanceIds', async () => {
      await expect(protocol.claimRewards(mockWallet, mockPrivateKey, [])).rejects.toThrow('No balance IDs provided');
    });

    it('should build and submit claim transaction', async () => {
      
      const result = await protocol.claimRewards(mockWallet, mockPrivateKey, ['000000000000000000000000000000000000000000000000000000000000000000000001', '000000000000000000000000000000000000000000000000000000000000000000000002']);
      
      expect(result.status).toBe('success');
      expect(result.hash).toBe('testhash');
      expect(result.ledger).toBe(100);
      expect(Operation.claimClaimableBalance).toHaveBeenCalledTimes(2);
      expect(Operation.claimClaimableBalance).toHaveBeenCalledWith({ balanceId: '000000000000000000000000000000000000000000000000000000000000000000000001' });
      expect(Operation.claimClaimableBalance).toHaveBeenCalledWith({ balanceId: '000000000000000000000000000000000000000000000000000000000000000000000002' });
    });

    it('should return unsigned transaction if no private key', async () => {
      const result = await protocol.claimRewards(mockWallet, '', ['000000000000000000000000000000000000000000000000000000000000000000000001']);
      
      expect(result.status).toBe('pending');
      expect(result.hash).toBeDefined();
      expect(result.metadata?.operation).toBe('claimRewards');
    });
  });
});
