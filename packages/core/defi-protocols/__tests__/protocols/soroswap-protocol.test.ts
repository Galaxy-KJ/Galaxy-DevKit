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
import { rpc } from '@stellar/stellar-sdk';

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
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({
        sign: jest.fn(),
        toXDR: jest.fn().mockReturnValue('mock-xdr'),
      }),
    })),
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
  // DEX OPERATION STUBS (swap, getSwapQuote)
  // ==========================================

  describe('DEX Operation Stubs', () => {
    const tokenIn: Asset = { code: 'XLM', type: 'native' };
    const tokenOut: Asset = {
      code: 'USDC',
      issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      type: 'credit_alphanum4'
    };

    beforeEach(async () => {
      await soroswapProtocol.initialize();
    });

    it('should throw "not yet implemented" on swap()', async () => {
      await expect(
        soroswapProtocol.swap(testAddress, testPrivateKey, tokenIn, tokenOut, '100', '95')
      ).rejects.toThrow(/not yet implemented/);
    });

    it('should throw "not yet implemented" on getSwapQuote()', async () => {
      await expect(
        soroswapProtocol.getSwapQuote(tokenIn, tokenOut, '100')
      ).rejects.toThrow(/not yet implemented/);
    });

    it('should reference issue numbers in swap/getSwapQuote stub error messages', async () => {
      await expect(
        soroswapProtocol.swap(testAddress, testPrivateKey, tokenIn, tokenOut, '100', '95')
      ).rejects.toThrow(/#27/);

      await expect(
        soroswapProtocol.getSwapQuote(tokenIn, tokenOut, '100')
      ).rejects.toThrow(/#28/);
    });

    it('should validate inputs before throwing stub errors', async () => {
      // Invalid address should fail validation before reaching stub
      await expect(
        soroswapProtocol.swap('', testPrivateKey, tokenIn, tokenOut, '100', '95')
      ).rejects.toThrow(/Invalid wallet address/);

      // Invalid amount should fail validation
      await expect(
        soroswapProtocol.swap(testAddress, testPrivateKey, tokenIn, tokenOut, '-1', '95')
      ).rejects.toThrow(/Amount must be a positive number/);

      // Invalid asset should fail validation
      const badAsset: Asset = { code: '', type: 'native' };
      await expect(
        soroswapProtocol.getSwapQuote(badAsset, tokenOut, '100')
      ).rejects.toThrow(/Invalid asset/);
    });

    it('should require initialization for stub methods', async () => {
      const uninitProtocol = new SoroswapProtocol(mockConfig);

      await expect(
        uninitProtocol.swap(testAddress, testPrivateKey, tokenIn, tokenOut, '100', '95')
      ).rejects.toThrow(/not initialized/);
    });
  });

  // ==========================================
  // ADD LIQUIDITY
  // ==========================================

  describe('addLiquidity()', () => {
    const tokenA: Asset = { code: 'XLM', type: 'native' };
    const tokenB: Asset = {
      code: 'USDC',
      issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      type: 'credit_alphanum4'
    };

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
    const tokenA: Asset = { code: 'XLM', type: 'native' };
    const tokenB: Asset = {
      code: 'USDC',
      issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      type: 'credit_alphanum4'
    };
    const poolAddress = 'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD';

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

  // ==========================================
  // GET LIQUIDITY POOL
  // ==========================================

  describe('getLiquidityPool()', () => {
    const tokenA: Asset = { code: 'XLM', type: 'native' };
    const tokenB: Asset = {
      code: 'USDC',
      issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      type: 'credit_alphanum4'
    };

    beforeEach(async () => {
      await soroswapProtocol.initialize();
    });

    it('should return a LiquidityPool with correct shape', async () => {
      const pool = await soroswapProtocol.getLiquidityPool(tokenA, tokenB);

      expect(pool).toBeDefined();
      expect(pool).toHaveProperty('address');
      expect(pool).toHaveProperty('tokenA');
      expect(pool).toHaveProperty('tokenB');
      expect(pool).toHaveProperty('reserveA');
      expect(pool).toHaveProperty('reserveB');
      expect(pool).toHaveProperty('totalLiquidity');
      expect(pool).toHaveProperty('fee');
    });

    it('should return the correct tokens', async () => {
      const pool = await soroswapProtocol.getLiquidityPool(tokenA, tokenB);

      expect(pool.tokenA).toEqual(tokenA);
      expect(pool.tokenB).toEqual(tokenB);
    });

    it('should return the default fee', async () => {
      const pool = await soroswapProtocol.getLiquidityPool(tokenA, tokenB);

      expect(pool.fee).toBe('0.003');
    });

    it('should throw if factory contract is null', async () => {
      (soroswapProtocol as any).factoryContract = null;

      await expect(
        soroswapProtocol.getLiquidityPool(tokenA, tokenB)
      ).rejects.toThrow('Factory contract not initialized');
    });

    it('should throw on invalid asset (empty code)', async () => {
      const badAsset: Asset = { code: '', type: 'native' };
      await expect(
        soroswapProtocol.getLiquidityPool(badAsset, tokenB)
      ).rejects.toThrow(/Invalid asset/);
    });

    it('should throw on non-native asset missing issuer', async () => {
      const badAsset: Asset = { code: 'USDC', type: 'credit_alphanum4' };
      await expect(
        soroswapProtocol.getLiquidityPool(badAsset, tokenB)
      ).rejects.toThrow(/Non-native assets must have an issuer/);
    });

    it('should throw if not initialized', async () => {
      const uninitProtocol = new SoroswapProtocol(mockConfig);
      await expect(
        uninitProtocol.getLiquidityPool(tokenA, tokenB)
      ).rejects.toThrow(/not initialized/);
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
});
