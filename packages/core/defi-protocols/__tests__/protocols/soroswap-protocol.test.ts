/**
 * @fileoverview Tests for Soroswap Protocol implementation
 * @description Unit tests for Soroswap DEX protocol with full mock coverage
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-30
 */

import { SoroswapProtocol } from '../../src/protocols/soroswap/soroswap-protocol';
import { ProtocolConfig, ProtocolType, Asset } from '../../src/types/defi-types';
import { InvalidOperationError } from '../../src/errors';
import { rpc, scValToNative, Address } from '@stellar/stellar-sdk';

// ==========================================
// MOCKS
// ==========================================

// Mock Stellar SDK
jest.mock('@stellar/stellar-sdk', () => {
  const mockContractCall = jest.fn().mockReturnValue({ type: 'invoke_contract' });
  const mockContract = jest.fn().mockImplementation(() => ({
    call: mockContractCall,
  }));

  return {
    Contract: mockContract,
    TransactionBuilder: jest.fn().mockImplementation((account) => {
      if (account && typeof account.accountId === 'function') account.accountId();
      if (account && typeof account.sequenceNumber === 'function') account.sequenceNumber();
      return {
        addOperation: jest.fn().mockReturnThis(),
        setTimeout: jest.fn().mockReturnThis(),
        build: jest.fn().mockReturnValue({
          sign: jest.fn(),
          toXDR: jest.fn().mockReturnValue('mock-xdr'),
        }),
      };
    }),
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({
        publicKey: () => 'test-public-key',
        secret: () => 'test-secret',
        sign: jest.fn(),
      }),
      fromPublicKey: jest.fn().mockReturnValue({ publicKey: () => 'test-public-key' }),
      random: jest.fn(),
    },
    Address: Object.assign(
      jest.fn().mockImplementation((addr: string) => ({
        toScVal: jest.fn().mockReturnValue({ type: 'address', value: addr }),
        toString: jest.fn().mockReturnValue(addr),
      })),
      {
        fromScVal: jest.fn().mockReturnValue({
          toString: jest.fn().mockReturnValue('CPAIRADDRESS123456789'),
        }),
      }
    ),
    nativeToScVal: jest.fn().mockReturnValue({ type: 'scval' }),
    scValToNative: jest.fn().mockReturnValue([1000000n, 2000000n, 500000n]),
    BASE_FEE: '100',
    rpc: {
      Server: jest.fn(),
      Api: {
        isSimulationError: jest.fn().mockReturnValue(false),
      },
      assembleTransaction: jest.fn().mockReturnValue({
        build: jest.fn().mockReturnValue({
          sign: jest.fn(),
          toXDR: jest.fn().mockReturnValue('mock-xdr'),
        }),
      }),
    },
    StrKey: {
      isValidEd25519PublicKey: jest.fn().mockReturnValue(true),
    },
    Horizon: {
      Server: jest.fn(),
    },
    Networks: {
      TESTNET: 'TESTNET',
      PUBLIC: 'PUBLIC',
    },
    Asset: Object.assign(
      jest.fn(),
      {
        native: jest.fn().mockReturnValue({
          contractId: jest.fn().mockReturnValue('CNATIVE_CONTRACT_ADDRESS'),
        }),
      }
    ),
  };
});

// ==========================================
// TESTS
// ==========================================

describe('SoroswapProtocol', () => {
  let soroswapProtocol: SoroswapProtocol;
  let mockConfig: ProtocolConfig;
  let mockHorizonServer: any;

  const testAddress = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  const testPrivateKey = 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
  const testAsset: Asset = {
    code: 'USDC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    type: 'credit_alphanum4'
  };

  const tokenA: Asset = { code: 'XLM', type: 'native' };
  const tokenB: Asset = {
    code: 'USDC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    type: 'credit_alphanum4'
  };

  const poolAddress = 'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD';

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      protocolId: 'soroswap',
      name: 'Soroswap',
      network: {
        network: 'testnet',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
        passphrase: 'Test SDF Network ; September 2015'
      },
      contractAddresses: {
        router: 'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD',
        factory: 'CDP3HMUH6SMS3S7NPGNDJLULCOXXEPSHY4JKUKMBNQMATHDHWXRRJTBY'
      },
      metadata: {}
    };

    soroswapProtocol = new SoroswapProtocol(mockConfig);

    // Mock Horizon Server
    mockHorizonServer = {
      loadAccount: jest.fn().mockResolvedValue({
        accountId: () => testAddress,
        sequenceNumber: () => '123',
        incrementSequenceNumber: jest.fn(),
      }),
      ledgers: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({})
        })
      })
    };
    (soroswapProtocol as any).horizonServer = mockHorizonServer;

    // Mock Soroban server
    const mockSorobanServer = {
      simulateTransaction: jest.fn().mockResolvedValue({
        result: {
          retval: { address: 'CPAIRADDRESS123456789' },
        },
      }),
      prepareTransaction: jest.fn().mockResolvedValue({
        toXDR: jest.fn().mockReturnValue('mock-xdr'),
      }),
    };
    (soroswapProtocol as any).sorobanServer = mockSorobanServer;
  });

  // ==========================================
  // INITIALIZATION
  // ==========================================

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await soroswapProtocol.initialize();
      expect(soroswapProtocol.isInitialized()).toBe(true);
    });

    it('should set protocol type to DEX', () => {
      expect(soroswapProtocol.type).toBe(ProtocolType.DEX);
    });

    it('should set protocol id to soroswap', () => {
      expect(soroswapProtocol.protocolId).toBe('soroswap');
    });

    it('should set protocol name to Soroswap', () => {
      expect(soroswapProtocol.name).toBe('Soroswap');
    });

    it('should initialize router and factory contracts', async () => {
      await soroswapProtocol.initialize();

      const routerContract = (soroswapProtocol as any).routerContract;
      const factoryContract = (soroswapProtocol as any).factoryContract;

      expect(routerContract).not.toBeNull();
      expect(factoryContract).not.toBeNull();
    });

    it('should not re-initialize if already initialized', async () => {
      await soroswapProtocol.initialize();
      await soroswapProtocol.initialize(); // Should not throw

      expect(soroswapProtocol.isInitialized()).toBe(true);
    });

    it('should throw if contract addresses are missing', async () => {
      const badConfig = { ...mockConfig, contractAddresses: {} };
      const badProtocol = new SoroswapProtocol(badConfig);
      (badProtocol as any).horizonServer = mockHorizonServer;

      await expect(badProtocol.initialize()).rejects.toThrow('Contract addresses are required');
    });

    it('should throw if router address is missing', async () => {
      const badConfig = {
        ...mockConfig,
        contractAddresses: { factory: 'CDP3HMUH6SMS3S7NPGNDJLULCOXXEPSHY4JKUKMBNQMATHDHWXRRJTBY' }
      };
      const badProtocol = new SoroswapProtocol(badConfig);
      (badProtocol as any).horizonServer = mockHorizonServer;

      await expect(badProtocol.initialize()).rejects.toThrow(/Contract address not found for key: router/);
    });
  });

  // ==========================================
  // PROTOCOL INFORMATION
  // ==========================================

  describe('Protocol Information', () => {
    beforeEach(async () => {
      await soroswapProtocol.initialize();
    });

    it('should return placeholder stats', async () => {
      const stats = await soroswapProtocol.getStats();

      expect(stats.tvl).toBe('0');
      expect(stats.totalSupply).toBe('0');
      expect(stats.totalBorrow).toBe('0');
      expect(stats.utilizationRate).toBe(0);
      expect(stats.timestamp).toBeInstanceOf(Date);
    });
  });

  // ==========================================
  // LENDING OPERATIONS (Should throw InvalidOperationError)
  // ==========================================

  describe('Lending Operations (not supported)', () => {
    beforeEach(async () => {
      await soroswapProtocol.initialize();
    });

    it('should throw InvalidOperationError on supply()', async () => {
      await expect(
        soroswapProtocol.supply(testAddress, testPrivateKey, testAsset, '100')
      ).rejects.toThrow(InvalidOperationError);

      await expect(
        soroswapProtocol.supply(testAddress, testPrivateKey, testAsset, '100')
      ).rejects.toThrow(/Supply is not supported by Soroswap/);
    });

    it('should throw InvalidOperationError on borrow()', async () => {
      await expect(
        soroswapProtocol.borrow(testAddress, testPrivateKey, testAsset, '100')
      ).rejects.toThrow(InvalidOperationError);

      await expect(
        soroswapProtocol.borrow(testAddress, testPrivateKey, testAsset, '100')
      ).rejects.toThrow(/Borrow is not supported by Soroswap/);
    });

    it('should throw InvalidOperationError on repay()', async () => {
      await expect(
        soroswapProtocol.repay(testAddress, testPrivateKey, testAsset, '100')
      ).rejects.toThrow(InvalidOperationError);

      await expect(
        soroswapProtocol.repay(testAddress, testPrivateKey, testAsset, '100')
      ).rejects.toThrow(/Repay is not supported by Soroswap/);
    });

    it('should throw InvalidOperationError on withdraw()', async () => {
      await expect(
        soroswapProtocol.withdraw(testAddress, testPrivateKey, testAsset, '100')
      ).rejects.toThrow(InvalidOperationError);

      await expect(
        soroswapProtocol.withdraw(testAddress, testPrivateKey, testAsset, '100')
      ).rejects.toThrow(/Withdraw is not supported by Soroswap/);
    });

    it('should include protocolId in InvalidOperationError', async () => {
      try {
        await soroswapProtocol.supply(testAddress, testPrivateKey, testAsset, '100');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidOperationError);
        expect((error as InvalidOperationError).protocolId).toBe('soroswap');
        expect((error as InvalidOperationError).operationType).toBe('supply');
      }
    });
  });

  // ==========================================
  // POSITION MANAGEMENT (Not applicable to DEX)
  // ==========================================

  describe('Position Management (not applicable)', () => {
    beforeEach(async () => {
      await soroswapProtocol.initialize();
    });

    it('should throw InvalidOperationError on getPosition()', async () => {
      await expect(
        soroswapProtocol.getPosition(testAddress)
      ).rejects.toThrow(InvalidOperationError);

      await expect(
        soroswapProtocol.getPosition(testAddress)
      ).rejects.toThrow(/getPosition is not supported by Soroswap/);
    });

    it('should throw InvalidOperationError on getHealthFactor()', async () => {
      await expect(
        soroswapProtocol.getHealthFactor(testAddress)
      ).rejects.toThrow(InvalidOperationError);

      await expect(
        soroswapProtocol.getHealthFactor(testAddress)
      ).rejects.toThrow(/getHealthFactor is not supported by Soroswap/);
    });
  });

  // ==========================================
  // LENDING-SPECIFIC INFO (Not applicable to DEX)
  // ==========================================

  describe('Lending-specific Info (not applicable)', () => {
    beforeEach(async () => {
      await soroswapProtocol.initialize();
    });

    it('should throw InvalidOperationError on getSupplyAPY()', async () => {
      await expect(
        soroswapProtocol.getSupplyAPY(testAsset)
      ).rejects.toThrow(InvalidOperationError);
    });

    it('should throw InvalidOperationError on getBorrowAPY()', async () => {
      await expect(
        soroswapProtocol.getBorrowAPY(testAsset)
      ).rejects.toThrow(InvalidOperationError);
    });

    it('should throw InvalidOperationError on getTotalSupply()', async () => {
      await expect(
        soroswapProtocol.getTotalSupply(testAsset)
      ).rejects.toThrow(InvalidOperationError);
    });

    it('should throw InvalidOperationError on getTotalBorrow()', async () => {
      await expect(
        soroswapProtocol.getTotalBorrow(testAsset)
      ).rejects.toThrow(InvalidOperationError);
    });
  });

  // ==========================================
  // DEX HELPER METHODS
  // ==========================================

  describe('DEX Helper Methods', () => {
    beforeEach(async () => {
      await soroswapProtocol.initialize();
    });

    it('should return pair info placeholder', async () => {
      const tokenA = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
      const tokenB = 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU';

      const pairInfo = await soroswapProtocol.getPairInfo(tokenA, tokenB);

      expect(pairInfo).toBeDefined();
      expect(pairInfo.fee).toBe('0.003');
      expect(pairInfo.reserve0).toBe('0');
      expect(pairInfo.reserve1).toBe('0');
      expect(pairInfo.totalSupply).toBe('0');
    });

    it('should return empty pairs array', async () => {
      const pairs = await soroswapProtocol.getAllPairs();

      expect(pairs).toEqual([]);
    });

    it('should throw if factory contract is null in getPairInfo', async () => {
      (soroswapProtocol as any).factoryContract = null;

      await expect(
        soroswapProtocol.getPairInfo('tokenA', 'tokenB')
      ).rejects.toThrow('Factory contract not initialized');
    });

    it('should throw if factory contract is null in getAllPairs', async () => {
      (soroswapProtocol as any).factoryContract = null;

      await expect(
        soroswapProtocol.getAllPairs()
      ).rejects.toThrow('Factory contract not initialized');
    });

    it('should throw if not initialized in getPairInfo', () => {
      const uninitProtocol = new SoroswapProtocol(mockConfig);

      expect(
        uninitProtocol.getPairInfo('tokenA', 'tokenB')
      ).rejects.toThrow(/not initialized/);
    });

    it('should throw if not initialized in getAllPairs', () => {
      const uninitProtocol = new SoroswapProtocol(mockConfig);

      expect(
        uninitProtocol.getAllPairs()
      ).rejects.toThrow(/not initialized/);
    });
  });

  // ==========================================
  // GET SWAP QUOTE
  // ==========================================

  describe('getSwapQuote()', () => {
    beforeEach(async () => {
      await soroswapProtocol.initialize();
    });

    it('should return a valid SwapQuote', async () => {
      const quote = await soroswapProtocol.getSwapQuote(tokenA, tokenB, '10');

      expect(quote).toBeDefined();
      expect(quote.amountIn).toBe('10');
      expect(quote.tokenIn).toEqual(tokenA);
      expect(quote.tokenOut).toEqual(tokenB);
      expect(parseFloat(quote.amountOut)).toBeGreaterThan(0);
      expect(quote.path).toHaveLength(2);
      expect(quote.validUntil).toBeInstanceOf(Date);
    });

    it('should apply 5% slippage to minimumReceived', async () => {
      const quote = await soroswapProtocol.getSwapQuote(tokenA, tokenB, '10');

      const expectedMin = (parseFloat(quote.amountOut) * 0.95).toFixed(7);
      expect(quote.minimumReceived).toBe(expectedMin);
    });

    it('should throw if router contract is null', async () => {
      (soroswapProtocol as any).routerContract = null;

      await expect(
        soroswapProtocol.getSwapQuote(tokenA, tokenB, '10')
      ).rejects.toThrow('Router contract not initialized');
    });

    it('should throw if simulation fails', async () => {
      (soroswapProtocol as any).sorobanServer.simulateTransaction.mockResolvedValueOnce({
        error: 'Simulation failed'
      });
      (rpc.Api.isSimulationError as any).mockReturnValueOnce(true);

      await expect(
        soroswapProtocol.getSwapQuote(tokenA, tokenB, '10')
      ).rejects.toThrow(/simulation failed/i);
    });

    it('should handle source account load failure for simulation', async () => {
      mockHorizonServer.loadAccount.mockRejectedValueOnce(new Error('Account not found'));

      const quote = await soroswapProtocol.getSwapQuote(tokenA, tokenB, '10');
      expect(quote).toBeDefined();
    });

    it('should throw if simulation result is invalid', async () => {
      const mockSorobanServer = (soroswapProtocol as any).sorobanServer;
      mockSorobanServer.simulateTransaction.mockResolvedValueOnce({
        result: {} // Missing retval
      });

      await expect(
        soroswapProtocol.getSwapQuote(tokenA, tokenB, '10')
      ).rejects.toThrow();
    });

    it('should throw if return value is not an array', async () => {
      (scValToNative as any).mockReturnValueOnce(123n); // Not an array

      await expect(
        soroswapProtocol.getSwapQuote(tokenA, tokenB, '10')
      ).rejects.toThrow();
    });

    it('should throw if amounts array is too short', async () => {
      (scValToNative as any).mockReturnValueOnce([100n]); // Only 1 element, need 2

      await expect(
        soroswapProtocol.getSwapQuote(tokenA, tokenB, '10')
      ).rejects.toThrow();
    });

    it('should throw on non-numeric amountIn', async () => {
      await expect(
        soroswapProtocol.getSwapQuote(tokenA, tokenB, 'not-a-number')
      ).rejects.toThrow(/Amount must be a positive number/);
    });
  });

  // ==========================================
  // SWAP
  // ==========================================

  describe('swap()', () => {
    beforeEach(async () => {
      await soroswapProtocol.initialize();
    });

    it('should return a TransactionResult with status pending', async () => {
      const result = await soroswapProtocol.swap(
        testAddress, testPrivateKey, tokenA, tokenB, '10', '9'
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.hash).toBe('mock-xdr');
    });

    it('should include swap metadata', async () => {
      const result = await soroswapProtocol.swap(
        testAddress, testPrivateKey, tokenA, tokenB, '10', '9'
      );

      expect(result.metadata.operation).toBe('swap');
      expect(result.metadata.amountIn).toBe('10');
      expect(result.metadata.minAmountOut).toBe('9');
    });

    it('should throw if prepareTransaction fails', async () => {
      const mockSorobanServer = (soroswapProtocol as any).sorobanServer;
      mockSorobanServer.prepareTransaction.mockRejectedValueOnce(new Error('Prepare fail'));

      await expect(
        soroswapProtocol.swap(testAddress, testPrivateKey, tokenA, tokenB, '10', '9')
      ).rejects.toThrow();
    });

    it('should throw if router contract is null', async () => {
      (soroswapProtocol as any).routerContract = null;

      await expect(
        soroswapProtocol.swap(testAddress, testPrivateKey, tokenA, tokenB, '10', '9')
      ).rejects.toThrow('Router contract not initialized');
    });

    it('should throw on invalid wallet address', async () => {
      await expect(
        soroswapProtocol.swap('', testPrivateKey, tokenA, tokenB, '10', '9')
      ).rejects.toThrow(/Invalid wallet address/);
    });
  });

  describe('addLiquidity()', () => {
    beforeEach(async () => {
      await soroswapProtocol.initialize();
    });

    it('should return a TransactionResult with status pending', async () => {
      const result = await soroswapProtocol.addLiquidity(
        testAddress, testPrivateKey, tokenA, tokenB, '100', '200'
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.hash).toBe('mock-xdr');
      expect(result.ledger).toBe(0);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should include addLiquidity metadata', async () => {
      const result = await soroswapProtocol.addLiquidity(
        testAddress, testPrivateKey, tokenA, tokenB, '100', '200'
      );

      expect(result.metadata.operation).toBe('addLiquidity');
      expect(result.metadata.amountA).toBe('100');
      expect(result.metadata.amountB).toBe('200');
    });

    it('should apply 5% slippage tolerance to min amounts', async () => {
      const result = await soroswapProtocol.addLiquidity(
        testAddress, testPrivateKey, tokenA, tokenB, '100', '200'
      );

      expect(parseFloat(result.metadata.amountAMin as string)).toBeCloseTo(95, 4);
      expect(parseFloat(result.metadata.amountBMin as string)).toBeCloseTo(190, 4);
    });

    it('should throw if router contract is null', async () => {
      (soroswapProtocol as any).routerContract = null;

      await expect(
        soroswapProtocol.addLiquidity(testAddress, testPrivateKey, tokenA, tokenB, '100', '200')
      ).rejects.toThrow('Router contract not initialized');
    });

    it('should throw on invalid wallet address', async () => {
      await expect(
        soroswapProtocol.addLiquidity('', testPrivateKey, tokenA, tokenB, '100', '200')
      ).rejects.toThrow(/Invalid wallet address/);
    });

    it('should throw on invalid amount', async () => {
      await expect(
        soroswapProtocol.addLiquidity(testAddress, testPrivateKey, tokenA, tokenB, '-5', '200')
      ).rejects.toThrow(/Amount must be a positive number/);
    });

    it('should throw on invalid asset', async () => {
      const badAsset: Asset = { code: '', type: 'native' };
      await expect(
        soroswapProtocol.addLiquidity(testAddress, testPrivateKey, badAsset, tokenB, '100', '200')
      ).rejects.toThrow(/Invalid asset/);
    });

    it('should throw if not initialized', async () => {
      const uninitProtocol = new SoroswapProtocol(mockConfig);
      await expect(
        uninitProtocol.addLiquidity(testAddress, testPrivateKey, tokenA, tokenB, '100', '200')
      ).rejects.toThrow(/not initialized/);
    });
  });

  // ==========================================
  // REMOVE LIQUIDITY
  // ==========================================

  describe('removeLiquidity()', () => {
    beforeEach(async () => {
      await soroswapProtocol.initialize();
    });

    it('should return a TransactionResult with status pending', async () => {
      const result = await soroswapProtocol.removeLiquidity(
        testAddress, testPrivateKey, tokenA, tokenB, poolAddress, '50'
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.hash).toBe('mock-xdr');
      expect(result.ledger).toBe(0);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should include removeLiquidity metadata', async () => {
      const result = await soroswapProtocol.removeLiquidity(
        testAddress, testPrivateKey, tokenA, tokenB, poolAddress, '50'
      );

      expect(result.metadata.operation).toBe('removeLiquidity');
      expect(result.metadata.poolAddress).toBe(poolAddress);
      expect(result.metadata.liquidity).toBe('50');
    });

    it('should apply 5% slippage to default min amounts', async () => {
      const result = await soroswapProtocol.removeLiquidity(
        testAddress, testPrivateKey, tokenA, tokenB, poolAddress, '100'
      );

      expect(parseFloat(result.metadata.amountAMin as string)).toBeCloseTo(95, 4);
      expect(parseFloat(result.metadata.amountBMin as string)).toBeCloseTo(95, 4);
    });

    it('should accept explicit min amounts', async () => {
      const result = await soroswapProtocol.removeLiquidity(
        testAddress, testPrivateKey, tokenA, tokenB, poolAddress, '100', '80', '90'
      );

      expect(result.metadata.amountAMin).toBe('80');
      expect(result.metadata.amountBMin).toBe('90');
    });

    it('should throw if router contract is null', async () => {
      (soroswapProtocol as any).routerContract = null;

      await expect(
        soroswapProtocol.removeLiquidity(testAddress, testPrivateKey, tokenA, tokenB, poolAddress, '50')
      ).rejects.toThrow('Router contract not initialized');
    });

    it('should throw on invalid wallet address', async () => {
      await expect(
        soroswapProtocol.removeLiquidity('', testPrivateKey, tokenA, tokenB, poolAddress, '50')
      ).rejects.toThrow(/Invalid wallet address/);
    });

    it('should throw on empty pool address', async () => {
      await expect(
        soroswapProtocol.removeLiquidity(testAddress, testPrivateKey, tokenA, tokenB, '', '50')
      ).rejects.toThrow(/Invalid pool address/);
    });

    it('should throw on invalid liquidity amount', async () => {
      await expect(
        soroswapProtocol.removeLiquidity(testAddress, testPrivateKey, tokenA, tokenB, poolAddress, '-1')
      ).rejects.toThrow(/Amount must be a positive number/);
    });

    it('should throw if not initialized', async () => {
      const uninitProtocol = new SoroswapProtocol(mockConfig);
      await expect(
        uninitProtocol.removeLiquidity(testAddress, testPrivateKey, tokenA, tokenB, poolAddress, '50')
      ).rejects.toThrow(/not initialized/);
    });
  });

  describe('getLiquidityPool()', () => {
    beforeEach(async () => {
      await soroswapProtocol.initialize();
    });

    // ==========================================
    // GET LIQUIDITY POOL
    // ==========================================

    it('should throw if not initialized', async () => {
      const uninitProtocol = new SoroswapProtocol(mockConfig);
      await expect(
        uninitProtocol.getLiquidityPool(tokenA, tokenB)
      ).rejects.toThrow(/not initialized/);
    });

    it('should handle case where horizon account load fails for placeholder', async () => {
      mockHorizonServer.loadAccount.mockRejectedValueOnce(new Error('Horizon fail'));
      const pool = await soroswapProtocol.getLiquidityPool(tokenA, tokenB);
      expect(pool).toBeDefined();
    });

    it('should cover resolveTokenAddress native branch', async () => {
      const nativeAsset: Asset = { code: 'XLM', type: 'native' };
      const pool = await soroswapProtocol.getLiquidityPool(nativeAsset, tokenB);
      expect(pool.tokenA).toEqual(nativeAsset);
    });

    it('should handle reserved amounts array too short', async () => {
      (soroswapProtocol as any).sorobanServer.simulateTransaction
        .mockResolvedValueOnce({ result: { retval: { type: 'address' } } }) // get_pair
        .mockResolvedValueOnce({ result: { retval: { type: 'scval' } } }); // get_reserves

      (scValToNative as any).mockReturnValueOnce([100n, 200n]); // Only 2, need 3

      const pool = await soroswapProtocol.getLiquidityPool(tokenA, tokenB);
      expect(pool.reserveA).toBe('0');
    });

    it('should handle simulation error in getLiquidityPool (get_pair)', async () => {
      (soroswapProtocol as any).sorobanServer.simulateTransaction.mockResolvedValueOnce({
        error: 'fail'
      });
      (rpc.Api.isSimulationError as any).mockReturnValueOnce(true);

      const pool = await soroswapProtocol.getLiquidityPool(tokenA, tokenB);
      expect(pool.address).toBe('');
    });
  });

  // ==========================================
  // UNINITIALIZED STATE
  // ==========================================

  describe('Uninitialized State', () => {
    it('should throw on getStats() when not initialized', async () => {
      await expect(
        soroswapProtocol.getStats()
      ).rejects.toThrow(/not initialized/);
    });

    it('should report not initialized', () => {
      expect(soroswapProtocol.isInitialized()).toBe(false);
    });
  });

  describe('Liquidity Operations Defaults', () => {
    const tokenA: Asset = { code: 'XLM', type: 'native' };
    const tokenB: Asset = { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', type: 'credit_alphanum4' };

    beforeEach(async () => {
      await soroswapProtocol.initialize();
    });

    it('should use default min amounts in addLiquidity', async () => {
      const result = await soroswapProtocol.addLiquidity(
        testAddress, testPrivateKey, tokenA, tokenB, '100', '200'
      );
      expect(result.metadata.amountAMin).toBeDefined();
    });

    it('should use default min amounts in removeLiquidity', async () => {
      const result = await soroswapProtocol.removeLiquidity(
        testAddress, testPrivateKey, tokenA, tokenB, 'GCP...PAIR', '100'
      );
      expect(result.metadata.amountAMin).toBeDefined();
    });

    it('should handle null simulation in getLiquidityPool', async () => {
      (soroswapProtocol as any).sorobanServer.simulateTransaction.mockResolvedValueOnce(null);
      const pool = await soroswapProtocol.getLiquidityPool(tokenA, tokenB);
      expect(pool.address).toBe('');
    });

    it('should handle simulation without result in getLiquidityPool', async () => {
      (soroswapProtocol as any).sorobanServer.simulateTransaction.mockResolvedValueOnce({});
      const pool = await soroswapProtocol.getLiquidityPool(tokenA, tokenB);
      expect(pool.address).toBe('');
    });

    it('should handle simulation without retval in getLiquidityPool', async () => {
      (soroswapProtocol as any).sorobanServer.simulateTransaction.mockResolvedValueOnce({ result: {} });
      const pool = await soroswapProtocol.getLiquidityPool(tokenA, tokenB);
      expect(pool.address).toBe('');
    });

    it('should handle faulty reserves ScVal shape', async () => {
      (soroswapProtocol as any).sorobanServer.simulateTransaction
        .mockResolvedValueOnce({ result: { retval: { type: 'address', value: '...' } } }) // get_pair
        .mockResolvedValueOnce({ result: { retval: { type: 'scval', value: '...' } } }); // get_reserves

      (scValToNative as any).mockImplementationOnce(() => { throw new Error('parse fail'); });

      const pool = await soroswapProtocol.getLiquidityPool(tokenA, tokenB);
      expect(pool.reserveA).toBe('0');
    });

    it('should throw if prepareTransaction fails in addLiquidity', async () => {
      (soroswapProtocol as any).sorobanServer.prepareTransaction.mockRejectedValueOnce(new Error('Prepare fail'));
      await expect(
        soroswapProtocol.addLiquidity(testAddress, testPrivateKey, tokenA, tokenB, '100', '200')
      ).rejects.toThrow();
    });

    it('should throw if prepareTransaction fails in removeLiquidity', async () => {
      (soroswapProtocol as any).sorobanServer.prepareTransaction.mockRejectedValueOnce(new Error('Prepare fail'));
      await expect(
        soroswapProtocol.removeLiquidity(testAddress, testPrivateKey, tokenA, tokenB, 'GCP...PAIR', '100')
      ).rejects.toThrow();
    });

    it('should cover resolveTokenAddress native branch in various methods', async () => {
      const nativeAsset: Asset = { code: 'XLM', type: 'native' };
      const result = await soroswapProtocol.swap(testAddress, testPrivateKey, nativeAsset, tokenB, '10', '9');
      expect(result).toBeDefined();
    });
  });

  describe('Utility Coverage', () => {
    beforeEach(async () => {
      await soroswapProtocol.initialize();
    });

    it('should handle non-Error objects in handleError via swap rejection', async () => {
      (soroswapProtocol as any).horizonServer.loadAccount.mockRejectedValueOnce('Horizon Error String');
      await expect(
        soroswapProtocol.swap(testAddress, testPrivateKey, tokenA, tokenB, '10', '9')
      ).rejects.toThrow(/Horizon Error String/);
    });

    it('should handle null in handleError', async () => {
      // Direct call via any to reach the protected method
      expect(() => {
        (soroswapProtocol as any).handleError(null, 'test');
      }).toThrow(/null/);
    });

    it('should throw on negative amount in amountToI128ScVal', async () => {
      await expect(
        soroswapProtocol.getSwapQuote(tokenA, tokenB, '-10')
      ).rejects.toThrow(/Amount must be a positive number/);
    });
  });
});
