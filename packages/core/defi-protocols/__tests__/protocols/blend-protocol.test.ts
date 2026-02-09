/**
 * @fileoverview Tests for Blend Protocol implementation
 * @description Unit tests for Blend lending protocol with full mock coverage
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-29
 */

import { BlendProtocol } from '../../src/protocols/blend/blend-protocol.js';
import { ProtocolConfig, ProtocolType, Asset } from '../../src/types/defi-types.js';
import { Keypair, rpc, Contract, TransactionBuilder, Address } from '@stellar/stellar-sdk';
import { PoolContractV2, PoolV2, Positions } from '@blend-capital/blend-sdk';

// ==========================================
// MOCKS
// ==========================================

// Mock Blend SDK
jest.mock('@blend-capital/blend-sdk', () => ({
  PoolContractV2: {
    spec: {
      funcArgsToScVals: jest.fn().mockReturnValue([]),
    },
  },
  PoolV2: {
    load: jest.fn(),
  },
  Positions: {
    load: jest.fn(),
  },
  RequestType: {
    SupplyCollateral: 0,
    WithdrawCollateral: 1,
  },
}));

// Mock Stellar SDK
jest.mock('@stellar/stellar-sdk', () => {
  const mockAddOperation = jest.fn().mockReturnThis();
  const mockSetTimeout = jest.fn().mockReturnThis();
  const mockSign = jest.fn();
  const mockBuild = jest.fn().mockReturnValue({
    sign: mockSign,
    toXDR: jest.fn().mockReturnValue('mock-xdr'),
  });

  const mockTransactionBuilder = jest.fn().mockImplementation(() => ({
    addOperation: mockAddOperation,
    setTimeout: mockSetTimeout,
    build: mockBuild,
  }));

  const mockContractCall = jest.fn().mockReturnValue({ type: 'invoke_contract' });
  const mockContract = jest.fn().mockImplementation(() => ({
    call: mockContractCall,
  }));

  const mockFromSecret = jest.fn().mockReturnValue({
    publicKey: () => 'liquidator-public-key',
    secret: () => 'liquidator-secret',
    sign: jest.fn(),
  });

  return {
    Contract: mockContract,
    TransactionBuilder: mockTransactionBuilder,
    Keypair: {
      fromSecret: mockFromSecret,
      fromPublicKey: jest.fn().mockReturnValue({ publicKey: () => 'test-public-key' }),
      random: jest.fn(),
    },
    Address: jest.fn().mockImplementation((addr) => ({
      toScVal: jest.fn().mockReturnValue({ type: 'address', value: addr }),
    })),
    nativeToScVal: jest.fn().mockReturnValue({ type: 'scval' }),
    BASE_FEE: '100',
    rpc: {
      Server: jest.fn(),
      Api: {
        isSimulationError: jest.fn(),
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
    Asset: jest.fn(),
  };
});

// ==========================================
// TESTS
// ==========================================

describe('BlendProtocol', () => {
  let blendProtocol: BlendProtocol;
  let mockConfig: ProtocolConfig;
  let mockSorobanServer: any;
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
      protocolId: 'blend',
      name: 'Blend Protocol',
      network: {
        network: 'testnet',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
        passphrase: 'Test SDF Network ; September 2015'
      },
      contractAddresses: {
        pool: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
        oracle: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC5'
      },
      metadata: {}
    };

    // Initialize protocol
    blendProtocol = new BlendProtocol(mockConfig);

    // Mock Soroban Server
    mockSorobanServer = {
      simulateTransaction: jest.fn().mockResolvedValue({
        id: 'sim-id',
        events: [],
        results: [
          {
            auth: [],
            xdr: 'mock-result-xdr'
          }
        ] // Simulation success structure
      }),
      sendTransaction: jest.fn().mockResolvedValue({
        hash: 'tx-hash-123',
        status: 'PENDING'
      }),
      getTransaction: jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        chainID: 'testnet',
        bucketListSize: 0,
        ledger: 100,
        createdAt: 1000,
        resultXdr: 'mock-tx-result-xdr',
        resultMetaXdr: 'mock-tx-meta-xdr'
      })
    };
    (blendProtocol as any).sorobanServer = mockSorobanServer;

    // Mock Horizon Server (BaseProtocol property)
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
    (blendProtocol as any).horizonServer = mockHorizonServer;

    // Ensure simulation is successful by default
    (rpc.Api.isSimulationError as unknown as jest.Mock).mockReturnValue(false);

    // Setup successful initialization
    (blendProtocol as any).loadPoolConfig = jest.fn().mockResolvedValue(undefined);
  });

  describe('Operations', () => {
    beforeEach(async () => {
      // Ensure protocol is initialized for these tests
      await blendProtocol.initialize();
    });

    it('should supply assets successfully', async () => {
      const amount = '10000000'; // 1 USDC

      const result = await blendProtocol.supply(testAddress, testPrivateKey, testAsset, amount);

      expect(mockHorizonServer.loadAccount).toHaveBeenCalledWith(testAddress);
      expect(PoolContractV2.spec.funcArgsToScVals).toHaveBeenCalledWith('submit', expect.any(Object));

      // Check Contract usage
      expect(Contract).toHaveBeenCalled();
      // Access the mock instance of Contract
      const contractInstance = (blendProtocol as any).poolContract;
      expect(contractInstance.call).toHaveBeenCalled();

      // Check TransactionBuilder usage
      expect(TransactionBuilder).toHaveBeenCalled();
      const txBuilderInstance = (TransactionBuilder as unknown as jest.Mock).mock.results[0].value;
      expect(txBuilderInstance.addOperation).toHaveBeenCalled();

      expect(mockSorobanServer.simulateTransaction).toHaveBeenCalled();
      expect(mockSorobanServer.sendTransaction).toHaveBeenCalled();
      expect(result.status).toBe('success');
      expect(result.hash).toBe('tx-hash-123');
    });

    it('should withdraw assets successfully', async () => {
      const amount = '5000000';

      const result = await blendProtocol.withdraw(testAddress, testPrivateKey, testAsset, amount);

      const contractInstance = (blendProtocol as any).poolContract;
      expect(contractInstance.call).toHaveBeenCalledWith('withdraw', expect.any(Object), expect.any(Object), expect.any(Object));
      expect(mockSorobanServer.sendTransaction).toHaveBeenCalled();
      expect(result.status).toBe('success');
    });

    it('should borrow assets successfully', async () => {
      const amount = '2000000';

      const result = await blendProtocol.borrow(testAddress, testPrivateKey, testAsset, amount);

      const contractInstance = (blendProtocol as any).poolContract;
      expect(contractInstance.call).toHaveBeenCalledWith('borrow', expect.any(Object), expect.any(Object), expect.any(Object));
      expect(result.status).toBe('success');
    });

    it('should repay assets successfully', async () => {
      const amount = '2000000';

      const result = await blendProtocol.repay(testAddress, testPrivateKey, testAsset, amount);

      const contractInstance = (blendProtocol as any).poolContract;
      expect(contractInstance.call).toHaveBeenCalledWith('repay', expect.any(Object), expect.any(Object), expect.any(Object));
      expect(result.status).toBe('success');
    });

    // Error simulation tests for all operations
    const operations = [
      { name: 'withdraw', method: 'withdraw' },
      { name: 'borrow', method: 'borrow' },
      { name: 'repay', method: 'repay' }
    ];

    operations.forEach(op => {
      it(`should handle simulation errors in ${op.name}`, async () => {
        (rpc.Api.isSimulationError as unknown as jest.Mock).mockReturnValue(true);
        mockSorobanServer.simulateTransaction.mockResolvedValueOnce({
          error: 'Simulation error',
          events: []
        });

        await expect(
          (blendProtocol as any)[op.method](testAddress, testPrivateKey, testAsset, '100')
        ).rejects.toThrow(/Simulation failed/);
      });
    });

    it('should handle simulation errors in liquidate', async () => {
      // Mock unhealthy position so health check passes
      jest.spyOn(blendProtocol, 'getHealthFactor').mockResolvedValue({
        value: '0.5',
        isHealthy: false,
        liquidationThreshold: '0.8',
        maxLTV: '0.7'
      });

      (rpc.Api.isSimulationError as unknown as jest.Mock).mockReturnValue(true);
      mockSorobanServer.simulateTransaction.mockResolvedValueOnce({
        error: 'Liquidation simulation failed',
        events: []
      });

      await expect(
        blendProtocol.liquidate(testAddress, testPrivateKey, testAddress, testAsset, '100', testAsset)
      ).rejects.toThrow(/Liquidation simulation failed/);
    });

    // Coverage for defensive check
    it('should throw if pool contract is missing in supply', async () => {
      (blendProtocol as any).poolContract = null;
      await expect(
        blendProtocol.supply(testAddress, testPrivateKey, testAsset, '100')
      ).rejects.toThrow('Pool contract not initialized');
    });

    it('should handle simulation errors gracefully', async () => {
      mockSorobanServer.simulateTransaction.mockResolvedValueOnce({
        error: 'Simulation error',
        events: []
      });
      (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(true);

      await expect(
        blendProtocol.supply(testAddress, testPrivateKey, testAsset, '100')
      ).rejects.toThrow(/Simulation failed/);
    });

    it('should handle transaction submission errors', async () => {
      mockSorobanServer.sendTransaction.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        blendProtocol.supply(testAddress, testPrivateKey, testAsset, '100')
      ).rejects.toThrow('Network error');
    });
  });

  describe('Position Management', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should get position successfully', async () => {
      // Mock simulation result parsing
      (blendProtocol as any).parsePositionData = jest.fn().mockReturnValue({
        totalSupply: '100',
        totalBorrow: '50',
        collateralValue: '200',
        debtValue: '50',
        positions: []
      });

      const position = await blendProtocol.getPosition(testAddress);

      const contractInstance = (blendProtocol as any).poolContract;
      expect(contractInstance.call).toHaveBeenCalledWith('get_positions', expect.any(Object));
      expect(mockSorobanServer.simulateTransaction).toHaveBeenCalled();
      expect(position.totalSupply).toBe('100');
    });

    it('should calculate health factor correctly (healthy)', async () => {
      // Mock getPosition
      jest.spyOn(blendProtocol, 'getPosition').mockResolvedValue({
        totalSupply: '0',
        totalBorrow: '0',
        collateralValue: '200', // $200 Collateral
        debtValue: '100',       // $100 Debt
        supply: [],
        borrow: []
      });

      const hf = await blendProtocol.getHealthFactor(testAddress);

      expect(hf.value).toBe('2.0000'); // 200 / 100
      expect(hf.isHealthy).toBe(true);
    });

    it('should calculate health factor correctly (unhealthy)', async () => {
      jest.spyOn(blendProtocol, 'getPosition').mockResolvedValue({
        totalSupply: '0',
        totalBorrow: '0',
        collateralValue: '80',  // $80 Collateral
        debtValue: '100',       // $100 Debt
        supply: [],
        borrow: []
      });

      const hf = await blendProtocol.getHealthFactor(testAddress);

      expect(hf.value).toBe('0.8000');
      expect(hf.isHealthy).toBe(false);
    });

    it('should handle infinite health factor (no debt)', async () => {
      jest.spyOn(blendProtocol, 'getPosition').mockResolvedValue({
        totalSupply: '0',
        totalBorrow: '0',
        collateralValue: '100',
        debtValue: '0',
        supply: [],
        borrow: []
      });

      const hf = await blendProtocol.getHealthFactor(testAddress);

      expect(hf.value).toBe('∞');
      expect(hf.isHealthy).toBe(true);
    });
  });

  describe('Liquidation', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should liquidate unhealthy position successfully', async () => {
      // Mock unhealthy position
      jest.spyOn(blendProtocol, 'getHealthFactor').mockResolvedValue({
        value: '0.5',
        isHealthy: false,
        liquidationThreshold: '0.8',
        maxLTV: '0.7'
      });

      // Mock liquidation result parsing
      (blendProtocol as any).parseLiquidationResult = jest.fn().mockReturnValue('100'); // Collateral received

      const debtAmount = '50';
      const result = await blendProtocol.liquidate(
        testAddress,
        testPrivateKey,
        'borrower-address',
        testAsset,
        debtAmount,
        testAsset
      );

      const contractInstance = (blendProtocol as any).poolContract;
      // Verify call args generally or specifically if needed
      expect(contractInstance.call).toHaveBeenCalledWith('liquidate', expect.any(Object), expect.any(Object), expect.any(Object), expect.any(Object), expect.any(Object));
      // expect(result.status).toBe('success'); // LiquidationResult doesn't have status
      expect(result.collateralAmount).toBe('100');
      expect(result.debtAmount).toBe(debtAmount);
    });

    it('should fail to liquidate healthy position', async () => {
      // Mock healthy position
      jest.spyOn(blendProtocol, 'getHealthFactor').mockResolvedValue({
        value: '1.5',
        isHealthy: true,
        liquidationThreshold: '0.8',
        maxLTV: '0.7'
      });

      await expect(blendProtocol.liquidate(
        testAddress,
        testPrivateKey,
        'borrower-address',
        testAsset,
        '50',
        testAsset
      )).rejects.toThrow('Position is healthy');
    });
  });

  describe('Protocol Information', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should return placeholder stats', async () => {
      const stats = await blendProtocol.getStats();
      expect(stats.tvl).toBe('0');
    });

    it('should return placeholder APYs', async () => {
      const supplyAPY = await blendProtocol.getSupplyAPY(testAsset);
      expect(supplyAPY.supplyAPY).toBe('0');

      const borrowAPY = await blendProtocol.getBorrowAPY(testAsset);
      expect(borrowAPY.borrowAPY).toBe('0');
    });

    it('should return placeholder totals', async () => {
      const supply = await blendProtocol.getTotalSupply(testAsset);
      expect(supply).toBe('0');

      const borrow = await blendProtocol.getTotalBorrow(testAsset);
      expect(borrow).toBe('0');
    });

    it('should return placeholder reserve data', async () => {
      const reserve = await blendProtocol.getReserveData(testAsset);
      expect(reserve.availableLiquidity).toBe('0');
    });

    it('should return empty liquidation opportunities', async () => {
      const opps = await blendProtocol.findLiquidationOpportunities();
      expect(opps).toEqual([]);
    });
    it('should handle native asset in supply', async () => {
      const nativeAsset: Asset = { code: 'XLM', type: 'native' };
      const amount = '10000000';

      const result = await blendProtocol.supply(testAddress, testPrivateKey, nativeAsset, amount);

      expect(result.status).toBe('success');
    });

  });

  // poolContract missing tests for all methods
  const methodArgs: Record<string, any[]> = {
    withdraw: [testAddress, testPrivateKey, testAsset, '100'],
    borrow: [testAddress, testPrivateKey, testAsset, '100'],
    repay: [testAddress, testPrivateKey, testAsset, '100'],
    getPosition: [testAddress],
    getStats: [],
    getSupplyAPY: [testAsset],
    getBorrowAPY: [testAsset],
    getTotalSupply: [testAsset],
    getTotalBorrow: [testAsset],
    getReserveData: [testAsset],
    liquidate: [testAddress, testPrivateKey, testAddress, testAsset, '100', testAsset],
    findLiquidationOpportunities: []
  };

  Object.entries(methodArgs).forEach(([method, args]) => {
    it(`should throw if pool contract is missing in ${method}`, async () => {
      await blendProtocol.initialize();
      (blendProtocol as any).poolContract = null;

      await expect(
        (blendProtocol as any)[method](...args)
      ).rejects.toThrow('Pool contract not initialized');
    });
  });

  it('should throw setup error if pool contract address missing', async () => {
    const badConfig = { ...mockConfig, contractAddresses: {} };
    const badProtocol = new BlendProtocol(badConfig);
    await expect(badProtocol.initialize()).rejects.toThrow('Contract addresses are required');
  });

  // ========================================
  // SDK INTEGRATION PATH TESTS (Branch Coverage)
  // ========================================

  describe('Blend SDK Integration Paths', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    // --- getPosition SDK paths ---

    it('should use blendPool.loadUser when blendPool is available', async () => {
      const mockPoolUser = {
        getCollateralFloat: jest.fn().mockReturnValue(100),
        getSupplyFloat: jest.fn().mockReturnValue(50),
        getLiabilitiesFloat: jest.fn().mockReturnValue(25),
      };

      const mockReserve = { id: 'reserve1' };
      const mockReservesMap = new Map([
        ['CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC', mockReserve],
      ]);

      (blendProtocol as any).blendPool = {
        loadUser: jest.fn().mockResolvedValue(mockPoolUser),
        reserves: mockReservesMap,
      };

      const position = await blendProtocol.getPosition(testAddress);

      expect(position.address).toBe(testAddress);
      expect(position.supplied.length).toBe(2); // collateral + supply
      expect(position.borrowed.length).toBe(1); // liability
      expect(mockPoolUser.getCollateralFloat).toHaveBeenCalledWith(mockReserve);
      expect(mockPoolUser.getSupplyFloat).toHaveBeenCalledWith(mockReserve);
      expect(mockPoolUser.getLiabilitiesFloat).toHaveBeenCalledWith(mockReserve);
    });

    it('should fall back to Positions.load when blendPool.loadUser fails', async () => {
      (blendProtocol as any).blendPool = {
        loadUser: jest.fn().mockRejectedValue(new Error('loadUser failed')),
        reserves: new Map(),
      };

      const mockPositions = {
        collateral: new Map([[0, 1000n]]),
        supply: new Map([[1, 500n]]),
        liabilities: new Map([[2, 200n]]),
      };
      (Positions.load as jest.Mock).mockResolvedValue(mockPositions);

      const position = await blendProtocol.getPosition(testAddress);

      expect(position.address).toBe(testAddress);
      expect(position.supplied.length).toBe(2); // collateral + supply
      expect(position.borrowed.length).toBe(1); // liability
      expect(position.healthFactor).toBe('0'); // has debt
    });

    it('should fall back to contract simulation when both SDK methods fail', async () => {
      (blendProtocol as any).blendPool = {
        loadUser: jest.fn().mockRejectedValue(new Error('loadUser failed')),
        reserves: new Map(),
      };
      (Positions.load as jest.Mock).mockRejectedValue(new Error('Positions.load failed'));

      const position = await blendProtocol.getPosition(testAddress);

      expect(position.address).toBe(testAddress);
      expect(mockSorobanServer.simulateTransaction).toHaveBeenCalled();
    });

    it('should handle zero amounts in convertPoolUserToPosition', async () => {
      const mockPoolUser = {
        getCollateralFloat: jest.fn().mockReturnValue(0),
        getSupplyFloat: jest.fn().mockReturnValue(0),
        getLiabilitiesFloat: jest.fn().mockReturnValue(0),
      };

      const mockReservesMap = new Map([
        ['ASSET1', { id: 'reserve1' }],
      ]);

      (blendProtocol as any).blendPool = {
        loadUser: jest.fn().mockResolvedValue(mockPoolUser),
        reserves: mockReservesMap,
      };

      const position = await blendProtocol.getPosition(testAddress);

      expect(position.supplied).toEqual([]);
      expect(position.borrowed).toEqual([]);
      expect(position.healthFactor).toBe('∞');
    });

    it('should handle zero amounts in convertPositionsToPosition', async () => {
      (blendProtocol as any).blendPool = {
        loadUser: jest.fn().mockRejectedValue(new Error('fail')),
        reserves: new Map(),
      };

      const mockPositions = {
        collateral: new Map([[0, 0n]]),
        supply: new Map([[1, 0n]]),
        liabilities: new Map([[2, 0n]]),
      };
      (Positions.load as jest.Mock).mockResolvedValue(mockPositions);

      const position = await blendProtocol.getPosition(testAddress);

      expect(position.supplied).toEqual([]);
      expect(position.borrowed).toEqual([]);
      expect(position.healthFactor).toBe('∞');
    });

    // --- getStats with blendPool ---

    it('should return real stats when blendPool has reserves', async () => {
      const mockReserve = {
        totalSupplyFloat: jest.fn().mockReturnValue(1000),
        totalLiabilitiesFloat: jest.fn().mockReturnValue(400),
        getUtilizationFloat: jest.fn().mockReturnValue(0.4),
      };

      (blendProtocol as any).blendPool = {
        reserves: new Map([
          ['ASSET1', mockReserve],
        ]),
      };

      const stats = await blendProtocol.getStats();

      expect(stats.totalSupply).toBe('1000.00');
      expect(stats.totalBorrow).toBe('400.00');
      expect(stats.tvl).toBe('600.00');
      expect(stats.utilizationRate).toBe(0.4);
    });

    // --- getSupplyAPY with reserve data ---

    it('should return real APY when blendPool has matching reserve', async () => {
      const mockReserve = {
        estSupplyApy: 0.05,
        estBorrowApy: 0.08,
      };

      (blendProtocol as any).blendPool = {
        reserves: new Map([
          ['CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA', mockReserve],
        ]),
      };

      const apy = await blendProtocol.getSupplyAPY(testAsset);

      expect(apy.supplyAPY).toBe('5.00');
      expect(apy.borrowAPY).toBe('8.00');
    });

    // --- getBorrowAPY with reserve data ---

    it('should return real borrow APY when blendPool has matching reserve', async () => {
      const mockReserve = {
        estSupplyApy: 0.03,
        estBorrowApy: 0.12,
      };

      (blendProtocol as any).blendPool = {
        reserves: new Map([
          ['CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA', mockReserve],
        ]),
      };

      const apy = await blendProtocol.getBorrowAPY(testAsset);

      expect(apy.supplyAPY).toBe('3.00');
      expect(apy.borrowAPY).toBe('12.00');
    });

    // --- getTotalSupply with reserve data ---

    it('should return real total supply when blendPool has matching reserve', async () => {
      const mockReserve = {
        totalSupplyFloat: jest.fn().mockReturnValue(5000.1234567),
      };

      (blendProtocol as any).blendPool = {
        reserves: new Map([
          ['CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA', mockReserve],
        ]),
      };

      const supply = await blendProtocol.getTotalSupply(testAsset);

      expect(supply).toBe('5000.1234567');
    });

    // --- getTotalBorrow with reserve data ---

    it('should return real total borrow when blendPool has matching reserve', async () => {
      const mockReserve = {
        totalLiabilitiesFloat: jest.fn().mockReturnValue(2000.7654321),
      };

      (blendProtocol as any).blendPool = {
        reserves: new Map([
          ['CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA', mockReserve],
        ]),
      };

      const borrow = await blendProtocol.getTotalBorrow(testAsset);

      expect(borrow).toBe('2000.7654321');
    });

    // --- getReserveData with reserve data ---

    it('should return real reserve data when blendPool has matching reserve', async () => {
      const mockReserve = {
        totalSupplyFloat: jest.fn().mockReturnValue(10000),
        totalLiabilitiesFloat: jest.fn().mockReturnValue(3000),
        getUtilizationFloat: jest.fn().mockReturnValue(0.3),
        estSupplyApy: 0.04,
        estBorrowApy: 0.09,
        data: { lastTime: 1700000000 },
      };

      (blendProtocol as any).blendPool = {
        reserves: new Map([
          ['CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA', mockReserve],
        ]),
      };

      const reserve = await blendProtocol.getReserveData(testAsset);

      expect(reserve.totalSupply).toBe('10000.0000000');
      expect(reserve.totalBorrows).toBe('3000.0000000');
      expect(reserve.availableLiquidity).toBe('7000.0000000');
      expect(reserve.utilizationRate).toBe('30.00');
      expect(reserve.supplyAPY).toBe('4.00');
      expect(reserve.borrowAPY).toBe('9.00');
    });

    // --- blendPool with no matching reserve falls back ---

    it('should fall back when blendPool has no matching reserve for getSupplyAPY', async () => {
      (blendProtocol as any).blendPool = {
        reserves: new Map([['NOMATCH', {}]]),
      };

      const apy = await blendProtocol.getSupplyAPY(testAsset);
      expect(apy.supplyAPY).toBe('0');
    });

    it('should fall back when blendPool has no matching reserve for getBorrowAPY', async () => {
      (blendProtocol as any).blendPool = {
        reserves: new Map([['NOMATCH', {}]]),
      };

      const apy = await blendProtocol.getBorrowAPY(testAsset);
      expect(apy.borrowAPY).toBe('0');
    });

    it('should fall back when blendPool has no matching reserve for getTotalSupply', async () => {
      (blendProtocol as any).blendPool = {
        reserves: new Map([['NOMATCH', {}]]),
      };

      const supply = await blendProtocol.getTotalSupply(testAsset);
      expect(supply).toBe('0');
    });

    it('should fall back when blendPool has no matching reserve for getTotalBorrow', async () => {
      (blendProtocol as any).blendPool = {
        reserves: new Map([['NOMATCH', {}]]),
      };

      const borrow = await blendProtocol.getTotalBorrow(testAsset);
      expect(borrow).toBe('0');
    });

    it('should fall back when blendPool has no matching reserve for getReserveData', async () => {
      (blendProtocol as any).blendPool = {
        reserves: new Map([['NOMATCH', {}]]),
      };

      const reserve = await blendProtocol.getReserveData(testAsset);
      expect(reserve.availableLiquidity).toBe('0');
    });

    // --- getStats with empty reserves ---

    it('should handle blendPool with empty reserves in getStats', async () => {
      (blendProtocol as any).blendPool = {
        reserves: new Map(),
      };

      const stats = await blendProtocol.getStats();

      expect(stats.totalSupply).toBe('0.00');
      expect(stats.utilizationRate).toBe(0);
    });

    // --- setupProtocol error path ---

    it('should throw setup error when pool loading fails entirely', async () => {
      // Use the already-initialized protocol and re-trigger setup
      // by calling setupProtocol directly with a broken loadPoolConfig
      (blendProtocol as any).loadPoolConfig = jest.fn().mockRejectedValue(new Error('Config load failed'));

      await expect(
        (blendProtocol as any).setupProtocol()
      ).rejects.toThrow('Failed to setup Blend Protocol');
    });
  });
});

