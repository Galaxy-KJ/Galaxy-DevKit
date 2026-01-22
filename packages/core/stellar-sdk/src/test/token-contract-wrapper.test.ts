/**
 * @fileoverview TokenContractWrapper tests
 * @description Test suite for token contract wrapper
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { TokenContractWrapper } from '../helpers/token-contract-wrapper';
import { Keypair } from '@stellar/stellar-sdk';

// Mock dependencies
jest.mock('../soroban-contract-manager');
jest.mock('../utils/scval-converter');

const mockSorobanContractManager =
  require('../soroban-contract-manager').SorobanContractManager;
const mockScValConverter = require('../utils/scval-converter').ScValConverter;

describe('TokenContractWrapper', () => {
  let wrapper: TokenContractWrapper;
  let mockKeypair: Keypair;
  const contractId = 'mock-contract-id';
  const networkPassphrase = 'Test SDF Network ; September 2015';

  beforeEach(() => {
    mockKeypair = Keypair.random();
    wrapper = new TokenContractWrapper(
      contractId,
      networkPassphrase,
      'https://mock-rpc-url'
    );

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock responses
    mockSorobanContractManager.mockImplementation(() => ({
      invokeContract: jest.fn(),
    }));

    mockScValConverter.fromScVal = jest.fn();
    mockScValConverter.toScVal = jest.fn();
  });

  describe('constructor', () => {
    it('should initialize with given parameters', () => {
      expect(wrapper.getContractId()).toBe(contractId);
    });
  });

  describe('getInfo', () => {
    it('should get token information', async () => {
      const mockInfo = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 7,
        total_supply: '1000000000',
        admin: mockKeypair.publicKey(),
      };

      mockScValConverter.fromScVal.mockReturnValue(mockInfo);

      const result = await wrapper.getInfo();

      expect(result).toEqual({
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 7,
        totalSupply: '1000000000',
        admin: mockKeypair.publicKey(),
      });

      expect(
        mockSorobanContractManager.prototype.invokeContract
      ).toHaveBeenCalledWith({
        contractId,
        method: 'info',
        args: [],
        caller: expect.any(Object), // Random keypair
        networkPassphrase,
        simulateOnly: true,
      });
    });
  });

  describe('getBalance', () => {
    it('should get account balance', async () => {
      const mockBalance = '1000000000';
      mockScValConverter.fromScVal.mockReturnValue(BigInt(mockBalance));

      const result = await wrapper.getBalance(mockKeypair.publicKey());

      expect(result).toBe(mockBalance);
    });

    it('should return 0 when no balance', async () => {
      mockScValConverter.fromScVal.mockReturnValue(null);

      const result = await wrapper.getBalance(mockKeypair.publicKey());

      expect(result).toBe('0');
    });
  });

  describe('transfer', () => {
    it('should transfer tokens successfully', async () => {
      const mockResult = {
        transactionHash: 'mock-tx-hash',
        ledger: 12345,
      };

      const mockManager = new mockSorobanContractManager();
      mockManager.invokeContract.mockResolvedValue(mockResult);

      const result = await wrapper.transfer(
        mockKeypair,
        'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53',
        '1000000000'
      );

      expect(result).toEqual(mockResult);
      expect(mockManager.invokeContract).toHaveBeenCalledWith({
        contractId,
        method: 'transfer',
        args: [
          mockKeypair.publicKey(),
          'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53',
          '1000000000',
        ],
        caller: mockKeypair,
        networkPassphrase,
      });
    });

    it('should handle number amount', async () => {
      const mockResult = {
        transactionHash: 'mock-tx-hash',
        ledger: 12345,
      };

      const mockManager = new mockSorobanContractManager();
      mockManager.invokeContract.mockResolvedValue(mockResult);

      await wrapper.transfer(
        mockKeypair,
        'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53',
        1000000000
      );

      expect(mockManager.invokeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining(['1000000000']),
        })
      );
    });
  });

  describe('approve', () => {
    it('should approve spender', async () => {
      const mockResult = {
        transactionHash: 'mock-tx-hash',
        ledger: 12345,
      };

      const mockManager = new mockSorobanContractManager();
      mockManager.invokeContract.mockResolvedValue(mockResult);

      const spender =
        'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53';
      const amount = '500000000';

      const result = await wrapper.approve(mockKeypair, spender, amount);

      expect(result).toEqual(mockResult);
      expect(mockManager.invokeContract).toHaveBeenCalledWith({
        contractId,
        method: 'approve',
        args: [mockKeypair.publicKey(), spender, amount],
        caller: mockKeypair,
        networkPassphrase,
      });
    });

    it('should approve with expiration', async () => {
      const mockResult = {
        transactionHash: 'mock-tx-hash',
        ledger: 12345,
      };

      const mockManager = new mockSorobanContractManager();
      mockManager.invokeContract.mockResolvedValue(mockResult);

      const spender =
        'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53';
      const amount = '500000000';
      const expirationLedger = 99999;

      await wrapper.approve(mockKeypair, spender, amount, expirationLedger);

      expect(mockManager.invokeContract).toHaveBeenCalledWith({
        contractId,
        method: 'approve',
        args: [mockKeypair.publicKey(), spender, amount, expirationLedger],
        caller: mockKeypair,
        networkPassphrase,
      });
    });
  });

  describe('transferFrom', () => {
    it('should transfer from approved spender', async () => {
      const mockResult = {
        transactionHash: 'mock-tx-hash',
        ledger: 12345,
      };

      const mockManager = new mockSorobanContractManager();
      mockManager.invokeContract.mockResolvedValue(mockResult);

      const from = 'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53';
      const to = 'GBBQ7O3YHQ6WBMKY5R6BTR3L3BAK336GUWHN7JDIQRFVA2KE7A2WD3QY';
      const amount = '250000000';

      const result = await wrapper.transferFrom(mockKeypair, from, to, amount);

      expect(result).toEqual(mockResult);
      expect(mockManager.invokeContract).toHaveBeenCalledWith({
        contractId,
        method: 'transfer_from',
        args: [from, to, amount],
        caller: mockKeypair,
        networkPassphrase,
      });
    });
  });

  describe('mint', () => {
    it('should mint tokens', async () => {
      const mockResult = {
        transactionHash: 'mock-tx-hash',
        ledger: 12345,
      };

      const mockManager = new mockSorobanContractManager();
      mockManager.invokeContract.mockResolvedValue(mockResult);

      const to = 'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53';
      const amount = '10000000000';

      const result = await wrapper.mint(mockKeypair, to, amount);

      expect(result).toEqual(mockResult);
      expect(mockManager.invokeContract).toHaveBeenCalledWith({
        contractId,
        method: 'mint',
        args: [to, amount],
        caller: mockKeypair,
        networkPassphrase,
      });
    });
  });

  describe('burn', () => {
    it('should burn tokens', async () => {
      const mockResult = {
        transactionHash: 'mock-tx-hash',
        ledger: 12345,
      };

      const mockManager = new mockSorobanContractManager();
      mockManager.invokeContract.mockResolvedValue(mockResult);

      const amount = '500000000';

      const result = await wrapper.burn(mockKeypair, amount);

      expect(result).toEqual(mockResult);
      expect(mockManager.invokeContract).toHaveBeenCalledWith({
        contractId,
        method: 'burn',
        args: [mockKeypair.publicKey(), amount],
        caller: mockKeypair,
        networkPassphrase,
      });
    });
  });

  describe('utility methods', () => {
    describe('formatAmount', () => {
      it('should format amount with default decimals', () => {
        const result = wrapper.formatAmount('10000000');
        expect(result).toBe('1');
      });

      it('should format amount with custom decimals', () => {
        const result = wrapper.formatAmount('1000000', 6);
        expect(result).toBe('1');
      });

      it('should format zero amount', () => {
        const result = wrapper.formatAmount('0');
        expect(result).toBe('0');
      });

      it('should handle fractional amounts', () => {
        const result = wrapper.formatAmount('12345678');
        expect(result).toBe('1.2345678');
      });

      it('should trim trailing zeros', () => {
        const result = wrapper.formatAmount('12345000');
        expect(result).toBe('1.2345');
      });
    });

    describe('parseAmount', () => {
      it('should parse amount with default decimals', () => {
        const result = wrapper.parseAmount('1');
        expect(result).toBe('10000000');
      });

      it('should parse amount with custom decimals', () => {
        const result = wrapper.parseAmount('1', 6);
        expect(result).toBe('1000000');
      });

      it('should parse fractional amount', () => {
        const result = wrapper.parseAmount('1.2345678');
        expect(result).toBe('12345678');
      });

      it('should parse zero amount', () => {
        const result = wrapper.parseAmount('0');
        expect(result).toBe('0');
      });

      it('should handle missing fraction', () => {
        const result = wrapper.parseAmount('1.');
        expect(result).toBe('10000000');
      });

      it('should pad fraction to correct length', () => {
        const result = wrapper.parseAmount('1.23', 5);
        expect(result).toBe('123000');
      });
    });
  });

  describe('getter methods', () => {
    it('should return manager instance', () => {
      const manager = wrapper.getManager();
      expect(manager).toBeInstanceOf(mockSorobanContractManager);
    });

    it('should return contract ID', () => {
      const id = wrapper.getContractId();
      expect(id).toBe(contractId);
    });
  });
});
