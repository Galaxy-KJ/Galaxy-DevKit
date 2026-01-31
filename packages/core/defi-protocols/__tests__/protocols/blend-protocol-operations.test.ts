/**
 * @fileoverview Comprehensive tests for Blend Protocol operations
 * @description Tests that cover all operational scenarios and error cases
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-29
 */

import { BlendProtocol } from '../../src/protocols/blend/blend-protocol';
import {
  ProtocolConfig,
  ProtocolType,
  Asset,
  TransactionResult
} from '../../src/types/defi-types';
import {
  Contract,
  TransactionBuilder,
  Keypair,
  Address,
  nativeToScVal,
  rpc,
  Horizon
} from '@stellar/stellar-sdk';
import { PoolContractV2, Request, RequestType } from '@blend-capital/blend-sdk';

// Mock the Stellar SDK
jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    Keypair: {
      fromSecret: jest.fn(),
      fromPublicKey: jest.fn((key) => {
        // Validate that the key is a valid Stellar address format
        // Valid Stellar addresses start with G and are 56 characters long
        if (typeof key !== 'string' || !key.match(/^G[A-Z2-7]{55}$/)) {
          throw new Error(`Invalid Stellar address: ${key}`);
        }
        return { publicKey: () => key };
      })
    },
    Contract: jest.fn().mockImplementation((address) => ({
      call: jest.fn((...args) => ({
        toXDR: jest.fn(() => 'mocked-xdr')
      }))
    })),
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn(() => ({
        sign: jest.fn(),
        toXDR: jest.fn(() => 'mocked-xdr')
      }))
    })),
    rpc: {
      ...actual.rpc,
      Server: jest.fn().mockImplementation(() => ({
        getTransaction: jest.fn(),
        simulateTransaction: jest.fn(),
        sendTransaction: jest.fn()
      })),
      Api: {
        isSimulationError: jest.fn(),
        isSimulationSuccess: jest.fn(),
        isSimulationRestore: jest.fn()
      },
      assembleTransaction: jest.fn()
    },
    Horizon: {
      ...actual.Horizon,
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: jest.fn(),
        ledgers: jest.fn(() => ({
          limit: jest.fn(() => ({
            call: jest.fn()
          }))
        }))
      }))
    }
  };
});

// Mock the Blend SDK
jest.mock('@blend-capital/blend-sdk', () => ({
  PoolContractV2: {
    spec: {
      funcArgsToScVals: jest.fn()
    }
  },
  RequestType: {
    SupplyCollateral: 0,
    Supply: 1,
    Withdraw: 2,
    Borrow: 3,
    Repay: 4
  }
}));

describe('BlendProtocol - Operations Tests', () => {
  let blendProtocol: BlendProtocol;
  let mockConfig: ProtocolConfig;
  let mockHorizonServer: jest.Mocked<Horizon.Server>;
  let mockSorobanServer: jest.Mocked<rpc.Server>;
  let mockContract: jest.Mocked<Contract>;

  // Generate real valid Stellar keypairs for testing
  const actualKeypair = jest.requireActual('@stellar/stellar-sdk').Keypair;
  const testKeypair = actualKeypair.random();
  const testAddress = testKeypair.publicKey();
  const testPrivateKey = testKeypair.secret();
  const testAsset: Asset = {
    code: 'USDC',
    issuer: testAddress,
    type: 'credit_alphanum4'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();

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

    blendProtocol = new BlendProtocol(mockConfig);

    // Setup mock servers
    mockHorizonServer = (blendProtocol as any).horizonServer;
    mockSorobanServer = (blendProtocol as any).sorobanServer;

    // Mock Horizon server responses
    mockHorizonServer.loadAccount = jest.fn().mockResolvedValue({
      sequenceNumber: jest.fn(() => '1000000000'),
      accountId: jest.fn(() => testAddress),
      incrementSequenceNumber: jest.fn()
    });

    mockHorizonServer.ledgers = jest.fn(() => ({
      limit: jest.fn(() => ({
        call: jest.fn().mockResolvedValue({
          records: [{ sequence: 1 }]
        })
      }))
    })) as any;
  });

  // ========================================
  // INITIALIZATION TESTS
  // ========================================

  describe('initialize()', () => {
    it('should successfully initialize the protocol', async () => {
      await blendProtocol.initialize();

      expect(blendProtocol.isInitialized()).toBe(true);
      expect(mockHorizonServer.ledgers).toHaveBeenCalled();
    });

    it('should not re-initialize if already initialized', async () => {
      await blendProtocol.initialize();

      // Clear the call history from the first initialization
      mockHorizonServer.ledgers.mockClear();

      await blendProtocol.initialize();

      // If properly handling re-initialization, ledgers should not be called again
      expect(mockHorizonServer.ledgers).not.toHaveBeenCalled();
    });

    it('should throw error if setup fails', async () => {
      mockHorizonServer.ledgers = jest.fn(() => ({
        limit: jest.fn(() => ({
          call: jest.fn().mockRejectedValue(new Error('Network error'))
        }))
      })) as any;

      await expect(blendProtocol.initialize()).rejects.toThrow(
        'Failed to initialize Blend Protocol'
      );
    });

    it('should load pool config during initialization', async () => {
      await blendProtocol.initialize();

      const poolConfig = (blendProtocol as any).poolConfig;
      expect(poolConfig).toBeDefined();
      expect(poolConfig.poolAddress).toBe(mockConfig.contractAddresses.pool);
      expect(poolConfig.name).toBe('Blend Lending Pool');
    });
  });

  // ========================================
  // SUPPLY OPERATION TESTS
  // ========================================

  describe('supply()', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should successfully supply assets', async () => {
      // Mock Keypair
      const mockKeypair = {
        publicKey: jest.fn(() => testAddress),
        sign: jest.fn()
      };
      (Keypair.fromSecret as jest.Mock).mockReturnValue(mockKeypair);

      // Mock PoolContractV2 spec
      (PoolContractV2.spec.funcArgsToScVals as jest.Mock).mockReturnValue([
        { mock: 'scval' }
      ]);

      // Mock transaction builder
      const mockTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'mocked-xdr')
      };
      (TransactionBuilder as jest.MockedClass<typeof TransactionBuilder>).mockImplementation(
        () =>
          ({
            addOperation: jest.fn().mockReturnThis(),
            setTimeout: jest.fn().mockReturnThis(),
            build: jest.fn(() => mockTx)
          } as any)
      );

      // Mock simulation success
      const mockSimulation = {
        result: { mock: 'result' }
      };
      mockSorobanServer.simulateTransaction = jest
        .fn()
        .mockResolvedValue(mockSimulation);
      (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(false);

      // Mock assembleTransaction
      const mockPreparedTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'prepared-xdr')
      };
      (rpc.assembleTransaction as jest.Mock).mockReturnValue({
        build: jest.fn(() => mockPreparedTx)
      });

      // Mock send transaction
      mockSorobanServer.sendTransaction = jest.fn().mockResolvedValue({
        hash: 'test-hash-123',
        status: 'PENDING'
      });

      // Mock get transaction (success)
      mockSorobanServer.getTransaction = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'NOT_FOUND'
        })
        .mockResolvedValueOnce({
          status: 'SUCCESS',
          ledger: 12345
        });

      const result = await blendProtocol.supply(
        testAddress,
        testPrivateKey,
        testAsset,
        '1000000'
      );

      expect(result).toBeDefined();
      expect(result.hash).toBe('test-hash-123');
      expect(result.status).toBe('success');
      expect(result.ledger).toBe(12345);
      expect(result.metadata?.operation).toBe('supply');
      expect(result.metadata?.asset).toBe('USDC');
    });

    it('should throw error if pool contract not initialized', async () => {
      (blendProtocol as any).poolContract = null;

      await expect(
        blendProtocol.supply(testAddress, testPrivateKey, testAsset, '1000000')
      ).rejects.toThrow('Pool contract not initialized');
    });

    it('should throw error on simulation failure', async () => {
      // Setup mocks
      (Keypair.fromSecret as jest.Mock).mockReturnValue({
        publicKey: jest.fn(() => testAddress),
        sign: jest.fn()
      });

      (PoolContractV2.spec.funcArgsToScVals as jest.Mock).mockReturnValue([
        { mock: 'scval' }
      ]);

      const mockTx = { sign: jest.fn() };
      (TransactionBuilder as jest.MockedClass<typeof TransactionBuilder>).mockImplementation(
        () =>
          ({
            addOperation: jest.fn().mockReturnThis(),
            setTimeout: jest.fn().mockReturnThis(),
            build: jest.fn(() => mockTx)
          } as any)
      );

      // Mock simulation error
      const mockSimulation = {
        error: 'Simulation failed: insufficient balance'
      };
      mockSorobanServer.simulateTransaction = jest
        .fn()
        .mockResolvedValue(mockSimulation);
      (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(true);

      await expect(
        blendProtocol.supply(testAddress, testPrivateKey, testAsset, '1000000')
      ).rejects.toThrow('Simulation failed');
    });

    it('should validate address before supplying', async () => {
      await expect(
        blendProtocol.supply('invalid', testPrivateKey, testAsset, '1000000')
      ).rejects.toThrow('Invalid Stellar address');
    });

    it('should validate amount before supplying', async () => {
      await expect(
        blendProtocol.supply(testAddress, testPrivateKey, testAsset, '-100')
      ).rejects.toThrow('Amount must be a positive number');
    });

    it('should validate asset before supplying', async () => {
      const invalidAsset: Asset = {
        code: '',
        issuer: '',
        type: 'credit_alphanum4'
      };

      await expect(
        blendProtocol.supply(testAddress, testPrivateKey, invalidAsset, '1000000')
      ).rejects.toThrow('Invalid asset');
    });
  });

  // ========================================
  // WITHDRAW OPERATION TESTS
  // ========================================

  describe('withdraw()', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should successfully withdraw assets', async () => {
      // Mock Keypair
      const mockKeypair = {
        publicKey: jest.fn(() => testAddress),
        sign: jest.fn()
      };
      (Keypair.fromSecret as jest.Mock).mockReturnValue(mockKeypair);

      // Mock transaction builder
      const mockTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'mocked-xdr')
      };
      (TransactionBuilder as jest.MockedClass<typeof TransactionBuilder>).mockImplementation(
        () =>
          ({
            addOperation: jest.fn().mockReturnThis(),
            setTimeout: jest.fn().mockReturnThis(),
            build: jest.fn(() => mockTx)
          } as any)
      );

      // Mock simulation success
      const mockSimulation = {
        result: { mock: 'result' }
      };
      mockSorobanServer.simulateTransaction = jest
        .fn()
        .mockResolvedValue(mockSimulation);
      (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(false);

      // Mock assembleTransaction
      const mockPreparedTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'prepared-xdr')
      };
      (rpc.assembleTransaction as jest.Mock).mockReturnValue({
        build: jest.fn(() => mockPreparedTx)
      });

      // Mock send transaction
      mockSorobanServer.sendTransaction = jest.fn().mockResolvedValue({
        hash: 'test-hash-withdraw',
        status: 'PENDING'
      });

      // Mock get transaction (success)
      mockSorobanServer.getTransaction = jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        ledger: 12346
      });

      const result = await blendProtocol.withdraw(
        testAddress,
        testPrivateKey,
        testAsset,
        '500000'
      );

      expect(result).toBeDefined();
      expect(result.hash).toBe('test-hash-withdraw');
      expect(result.status).toBe('success');
      expect(result.metadata?.operation).toBe('withdraw');
    });

    it('should throw error if pool contract not initialized for withdraw', async () => {
      (blendProtocol as any).poolContract = null;

      await expect(
        blendProtocol.withdraw(testAddress, testPrivateKey, testAsset, '500000')
      ).rejects.toThrow('Pool contract not initialized');
    });

    it('should handle failed transaction status', async () => {
      const mockKeypair = {
        publicKey: jest.fn(() => testAddress),
        sign: jest.fn()
      };
      (Keypair.fromSecret as jest.Mock).mockReturnValue(mockKeypair);

      const mockTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'mocked-xdr')
      };
      (TransactionBuilder as jest.MockedClass<typeof TransactionBuilder>).mockImplementation(
        () =>
          ({
            addOperation: jest.fn().mockReturnThis(),
            setTimeout: jest.fn().mockReturnThis(),
            build: jest.fn(() => mockTx)
          } as any)
      );

      mockSorobanServer.simulateTransaction = jest.fn().mockResolvedValue({
        result: { mock: 'result' }
      });
      (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(false);

      const mockPreparedTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'prepared-xdr')
      };
      (rpc.assembleTransaction as jest.Mock).mockReturnValue({
        build: jest.fn(() => mockPreparedTx)
      });

      mockSorobanServer.sendTransaction = jest.fn().mockResolvedValue({
        hash: 'test-hash-failed',
        status: 'PENDING'
      });

      mockSorobanServer.getTransaction = jest.fn().mockResolvedValue({
        status: 'FAILED',
        ledger: 12347
      });

      const result = await blendProtocol.withdraw(
        testAddress,
        testPrivateKey,
        testAsset,
        '500000'
      );

      expect(result.status).toBe('failed');
      expect(result.ledger).toBe(12347);
    });

    it('should throw error on simulation failure for withdraw', async () => {
      const mockKeypair = {
        publicKey: jest.fn(() => testAddress),
        sign: jest.fn()
      };
      (Keypair.fromSecret as jest.Mock).mockReturnValue(mockKeypair);

      const mockTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'mocked-xdr')
      };
      (TransactionBuilder as jest.MockedClass<typeof TransactionBuilder>).mockImplementation(
        () =>
          ({
            addOperation: jest.fn().mockReturnThis(),
            setTimeout: jest.fn().mockReturnThis(),
            build: jest.fn(() => mockTx)
          } as any)
      );

      // Mock simulation error
      const mockSimulation = {
        error: 'Simulation failed: insufficient funds'
      };
      mockSorobanServer.simulateTransaction = jest
        .fn()
        .mockResolvedValue(mockSimulation);
      (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(true);

      await expect(
        blendProtocol.withdraw(testAddress, testPrivateKey, testAsset, '500000')
      ).rejects.toThrow('Simulation failed');
    });

    it('should validate address before withdrawing', async () => {
      await expect(
        blendProtocol.withdraw('invalid', testPrivateKey, testAsset, '500000')
      ).rejects.toThrow('Invalid Stellar address');
    });

    it('should validate amount before withdrawing', async () => {
      await expect(
        blendProtocol.withdraw(testAddress, testPrivateKey, testAsset, '-100')
      ).rejects.toThrow('Amount must be a positive number');
    });

    it('should validate asset before withdrawing', async () => {
      const invalidAsset: Asset = {
        code: '',
        issuer: '',
        type: 'credit_alphanum4'
      };

      await expect(
        blendProtocol.withdraw(testAddress, testPrivateKey, invalidAsset, '500000')
      ).rejects.toThrow('Invalid asset');
    });
  });

  // ========================================
  // BORROW OPERATION TESTS
  // ========================================

  describe('borrow()', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should successfully borrow assets', async () => {
      const mockKeypair = {
        publicKey: jest.fn(() => testAddress),
        sign: jest.fn()
      };
      (Keypair.fromSecret as jest.Mock).mockReturnValue(mockKeypair);

      const mockTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'mocked-xdr')
      };
      (TransactionBuilder as jest.MockedClass<typeof TransactionBuilder>).mockImplementation(
        () =>
          ({
            addOperation: jest.fn().mockReturnThis(),
            setTimeout: jest.fn().mockReturnThis(),
            build: jest.fn(() => mockTx)
          } as any)
      );

      mockSorobanServer.simulateTransaction = jest.fn().mockResolvedValue({
        result: { mock: 'result' }
      });
      (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(false);

      const mockPreparedTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'prepared-xdr')
      };
      (rpc.assembleTransaction as jest.Mock).mockReturnValue({
        build: jest.fn(() => mockPreparedTx)
      });

      mockSorobanServer.sendTransaction = jest.fn().mockResolvedValue({
        hash: 'test-hash-borrow',
        status: 'PENDING'
      });

      mockSorobanServer.getTransaction = jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        ledger: 12348
      });

      const result = await blendProtocol.borrow(
        testAddress,
        testPrivateKey,
        testAsset,
        '250000'
      );

      expect(result).toBeDefined();
      expect(result.hash).toBe('test-hash-borrow');
      expect(result.status).toBe('success');
      expect(result.metadata?.operation).toBe('borrow');
    });

    it('should throw error if pool contract not initialized for borrow', async () => {
      (blendProtocol as any).poolContract = null;

      await expect(
        blendProtocol.borrow(testAddress, testPrivateKey, testAsset, '250000')
      ).rejects.toThrow('Pool contract not initialized');
    });

    it('should throw error on simulation failure for borrow', async () => {
      const mockKeypair = {
        publicKey: jest.fn(() => testAddress),
        sign: jest.fn()
      };
      (Keypair.fromSecret as jest.Mock).mockReturnValue(mockKeypair);

      const mockTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'mocked-xdr')
      };
      (TransactionBuilder as jest.MockedClass<typeof TransactionBuilder>).mockImplementation(
        () =>
          ({
            addOperation: jest.fn().mockReturnThis(),
            setTimeout: jest.fn().mockReturnThis(),
            build: jest.fn(() => mockTx)
          } as any)
      );

      // Mock simulation error
      const mockSimulation = {
        error: 'Simulation failed: collateral insufficient'
      };
      mockSorobanServer.simulateTransaction = jest
        .fn()
        .mockResolvedValue(mockSimulation);
      (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(true);

      await expect(
        blendProtocol.borrow(testAddress, testPrivateKey, testAsset, '250000')
      ).rejects.toThrow('Simulation failed');
    });

    it('should validate address before borrowing', async () => {
      await expect(
        blendProtocol.borrow('invalid', testPrivateKey, testAsset, '250000')
      ).rejects.toThrow('Invalid Stellar address');
    });

    it('should validate amount before borrowing', async () => {
      await expect(
        blendProtocol.borrow(testAddress, testPrivateKey, testAsset, '0')
      ).rejects.toThrow('Amount must be a positive number');
    });

    it('should validate asset before borrowing', async () => {
      const invalidAsset: Asset = {
        code: '',
        issuer: '',
        type: 'credit_alphanum4'
      };

      await expect(
        blendProtocol.borrow(testAddress, testPrivateKey, invalidAsset, '250000')
      ).rejects.toThrow('Invalid asset');
    });
  });

  // ========================================
  // REPAY OPERATION TESTS
  // ========================================

  describe('repay()', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should successfully repay borrowed assets', async () => {
      const mockKeypair = {
        publicKey: jest.fn(() => testAddress),
        sign: jest.fn()
      };
      (Keypair.fromSecret as jest.Mock).mockReturnValue(mockKeypair);

      const mockTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'mocked-xdr')
      };
      (TransactionBuilder as jest.MockedClass<typeof TransactionBuilder>).mockImplementation(
        () =>
          ({
            addOperation: jest.fn().mockReturnThis(),
            setTimeout: jest.fn().mockReturnThis(),
            build: jest.fn(() => mockTx)
          } as any)
      );

      mockSorobanServer.simulateTransaction = jest.fn().mockResolvedValue({
        result: { mock: 'result' }
      });
      (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(false);

      const mockPreparedTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'prepared-xdr')
      };
      (rpc.assembleTransaction as jest.Mock).mockReturnValue({
        build: jest.fn(() => mockPreparedTx)
      });

      mockSorobanServer.sendTransaction = jest.fn().mockResolvedValue({
        hash: 'test-hash-repay',
        status: 'PENDING'
      });

      mockSorobanServer.getTransaction = jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        ledger: 12349
      });

      const result = await blendProtocol.repay(
        testAddress,
        testPrivateKey,
        testAsset,
        '250000'
      );

      expect(result).toBeDefined();
      expect(result.hash).toBe('test-hash-repay');
      expect(result.status).toBe('success');
      expect(result.metadata?.operation).toBe('repay');
    });

    it('should throw error if pool contract not initialized for repay', async () => {
      (blendProtocol as any).poolContract = null;

      await expect(
        blendProtocol.repay(testAddress, testPrivateKey, testAsset, '250000')
      ).rejects.toThrow('Pool contract not initialized');
    });

    it('should throw error on simulation failure for repay', async () => {
      const mockKeypair = {
        publicKey: jest.fn(() => testAddress),
        sign: jest.fn()
      };
      (Keypair.fromSecret as jest.Mock).mockReturnValue(mockKeypair);

      const mockTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'mocked-xdr')
      };
      (TransactionBuilder as jest.MockedClass<typeof TransactionBuilder>).mockImplementation(
        () =>
          ({
            addOperation: jest.fn().mockReturnThis(),
            setTimeout: jest.fn().mockReturnThis(),
            build: jest.fn(() => mockTx)
          } as any)
      );

      // Mock simulation error
      const mockSimulation = {
        error: 'Simulation failed: repayment error'
      };
      mockSorobanServer.simulateTransaction = jest
        .fn()
        .mockResolvedValue(mockSimulation);
      (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(true);

      await expect(
        blendProtocol.repay(testAddress, testPrivateKey, testAsset, '250000')
      ).rejects.toThrow('Simulation failed');
    });

    it('should validate address before repaying', async () => {
      await expect(
        blendProtocol.repay('invalid', testPrivateKey, testAsset, '250000')
      ).rejects.toThrow('Invalid Stellar address');
    });

    it('should validate amount before repaying', async () => {
      await expect(
        blendProtocol.repay(testAddress, testPrivateKey, testAsset, '-50')
      ).rejects.toThrow('Amount must be a positive number');
    });

    it('should validate asset before repaying', async () => {
      const invalidAsset: Asset = {
        code: '',
        issuer: '',
        type: 'credit_alphanum4'
      };

      await expect(
        blendProtocol.repay(testAddress, testPrivateKey, invalidAsset, '250000')
      ).rejects.toThrow('Invalid asset');
    });
  });

  // ========================================
  // POSITION MANAGEMENT TESTS
  // ========================================

  describe('getPosition()', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should successfully get user position', async () => {
      const mockTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'mocked-xdr')
      };
      (TransactionBuilder as jest.MockedClass<typeof TransactionBuilder>).mockImplementation(
        () =>
          ({
            addOperation: jest.fn().mockReturnThis(),
            setTimeout: jest.fn().mockReturnThis(),
            build: jest.fn(() => mockTx)
          } as any)
      );

      const mockSimulation = {
        result: { mock: 'position-data' }
      };
      mockSorobanServer.simulateTransaction = jest
        .fn()
        .mockResolvedValue(mockSimulation);
      (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(false);

      const position = await blendProtocol.getPosition(testAddress);

      expect(position).toBeDefined();
      expect(position.address).toBe(testAddress);
      expect(position.supplied).toEqual([]);
      expect(position.borrowed).toEqual([]);
    });

    it('should throw error if pool contract not initialized for getPosition', async () => {
      (blendProtocol as any).poolContract = null;

      await expect(blendProtocol.getPosition(testAddress)).rejects.toThrow(
        'Pool contract not initialized'
      );
    });

    it('should throw error on simulation failure for getPosition', async () => {
      const mockTx = { sign: jest.fn() };
      (TransactionBuilder as jest.MockedClass<typeof TransactionBuilder>).mockImplementation(
        () =>
          ({
            addOperation: jest.fn().mockReturnThis(),
            setTimeout: jest.fn().mockReturnThis(),
            build: jest.fn(() => mockTx)
          } as any)
      );

      const mockSimulation = {
        error: 'Failed to get position data'
      };
      mockSorobanServer.simulateTransaction = jest
        .fn()
        .mockResolvedValue(mockSimulation);
      (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(true);

      await expect(blendProtocol.getPosition(testAddress)).rejects.toThrow(
        'Failed to get position'
      );
    });
  });

  describe('getHealthFactor()', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should calculate health factor with collateral and debt', async () => {
      // Mock getPosition to return position data
      const mockPosition = {
        address: testAddress,
        supplied: [],
        borrowed: [],
        healthFactor: '1.5',
        collateralValue: '1500',
        debtValue: '1000'
      };

      jest.spyOn(blendProtocol, 'getPosition').mockResolvedValue(mockPosition);

      const healthFactor = await blendProtocol.getHealthFactor(testAddress);

      expect(healthFactor).toBeDefined();
      expect(healthFactor.value).toBe('1.5000');
      expect(healthFactor.isHealthy).toBe(true);
      expect(healthFactor.liquidationThreshold).toBe('0.85');
      expect(healthFactor.maxLTV).toBe('0.75');
    });

    it('should return infinite health factor with no debt', async () => {
      const mockPosition = {
        address: testAddress,
        supplied: [],
        borrowed: [],
        healthFactor: '∞',
        collateralValue: '1500',
        debtValue: '0'
      };

      jest.spyOn(blendProtocol, 'getPosition').mockResolvedValue(mockPosition);

      const healthFactor = await blendProtocol.getHealthFactor(testAddress);

      expect(healthFactor.value).toBe('∞');
      expect(healthFactor.isHealthy).toBe(true);
    });

    it('should identify unhealthy position', async () => {
      const mockPosition = {
        address: testAddress,
        supplied: [],
        borrowed: [],
        healthFactor: '0.8',
        collateralValue: '800',
        debtValue: '1000'
      };

      jest.spyOn(blendProtocol, 'getPosition').mockResolvedValue(mockPosition);

      const healthFactor = await blendProtocol.getHealthFactor(testAddress);

      expect(healthFactor.value).toBe('0.8000');
      expect(healthFactor.isHealthy).toBe(false);
    });
  });

  // ========================================
  // LIQUIDATION TESTS
  // ========================================

  describe('liquidate()', () => {
    const liquidatorKeypair = actualKeypair.random();
    const liquidatorAddress = liquidatorKeypair.publicKey();
    const borrowerAddress = testAddress;
    const collateralAsset: Asset = {
      code: 'XLM',
      issuer: '',
      type: 'native'
    };

    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should successfully liquidate unhealthy position', async () => {
      // Mock unhealthy health factor
      jest.spyOn(blendProtocol, 'getHealthFactor').mockResolvedValue({
        value: '0.7',
        liquidationThreshold: '0.85',
        maxLTV: '0.75',
        isHealthy: false
      });

      const mockKeypair = {
        publicKey: jest.fn(() => liquidatorAddress),
        sign: jest.fn()
      };
      (Keypair.fromSecret as jest.Mock).mockReturnValue(mockKeypair);

      mockHorizonServer.loadAccount = jest.fn().mockResolvedValue({
        sequenceNumber: jest.fn(() => '1000000000'),
        accountId: jest.fn(() => liquidatorAddress),
        incrementSequenceNumber: jest.fn()
      });

      const mockTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'mocked-xdr')
      };
      (TransactionBuilder as jest.MockedClass<typeof TransactionBuilder>).mockImplementation(
        () =>
          ({
            addOperation: jest.fn().mockReturnThis(),
            setTimeout: jest.fn().mockReturnThis(),
            build: jest.fn(() => mockTx)
          } as any)
      );

      mockSorobanServer.simulateTransaction = jest.fn().mockResolvedValue({
        result: { mock: 'result' }
      });
      (rpc.Api.isSimulationError as jest.Mock).mockReturnValue(false);

      const mockPreparedTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'prepared-xdr')
      };
      (rpc.assembleTransaction as jest.Mock).mockReturnValue({
        build: jest.fn(() => mockPreparedTx)
      });

      mockSorobanServer.sendTransaction = jest.fn().mockResolvedValue({
        hash: 'test-hash-liquidate',
        status: 'PENDING'
      });

      mockSorobanServer.getTransaction = jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        ledger: 12350
      });

      const result = await blendProtocol.liquidate(
        liquidatorAddress,
        testPrivateKey,
        borrowerAddress,
        testAsset,
        '100000',
        collateralAsset
      );

      expect(result).toBeDefined();
      expect(result.txHash).toBe('test-hash-liquidate');
      expect(result.userAddress).toBe(borrowerAddress);
      expect(result.debtAsset).toEqual(testAsset);
      expect(result.collateralAsset).toEqual(collateralAsset);
    });

    it('should throw error when liquidating healthy position', async () => {
      jest.spyOn(blendProtocol, 'getHealthFactor').mockResolvedValue({
        value: '1.5',
        liquidationThreshold: '0.85',
        maxLTV: '0.75',
        isHealthy: true
      });

      await expect(
        blendProtocol.liquidate(
          liquidatorAddress,
          testPrivateKey,
          borrowerAddress,
          testAsset,
          '100000',
          collateralAsset
        )
      ).rejects.toThrow('Position is healthy and cannot be liquidated');
    });

    it('should throw error if pool contract not initialized for liquidate', async () => {
      jest.spyOn(blendProtocol, 'getHealthFactor').mockResolvedValue({
        value: '0.7',
        liquidationThreshold: '0.85',
        maxLTV: '0.75',
        isHealthy: false
      });

      (blendProtocol as any).poolContract = null;

      await expect(
        blendProtocol.liquidate(
          liquidatorAddress,
          testPrivateKey,
          borrowerAddress,
          testAsset,
          '100000',
          collateralAsset
        )
      ).rejects.toThrow('Pool contract not initialized');
    });

    it('should validate liquidator address', async () => {
      await expect(
        blendProtocol.liquidate(
          'invalid',
          testPrivateKey,
          borrowerAddress,
          testAsset,
          '100000',
          collateralAsset
        )
      ).rejects.toThrow('Invalid Stellar address');
    });

    it('should validate borrower address', async () => {
      await expect(
        blendProtocol.liquidate(
          liquidatorAddress,
          testPrivateKey,
          'invalid',
          testAsset,
          '100000',
          collateralAsset
        )
      ).rejects.toThrow('Invalid Stellar address');
    });

    it('should validate debt amount', async () => {
      // Mock healthy position to bypass health check first
      jest.spyOn(blendProtocol, 'getHealthFactor').mockResolvedValue({
        value: '0.5',
        liquidationThreshold: '0.85',
        maxLTV: '0.75',
        isHealthy: false
      });

      await expect(
        blendProtocol.liquidate(
          liquidatorAddress,
          testPrivateKey,
          borrowerAddress,
          testAsset,
          '-100',
          collateralAsset
        )
      ).rejects.toThrow('Amount must be a positive number');
    });

    it('should validate debt asset', async () => {
      const invalidAsset: Asset = {
        code: '',
        issuer: '',
        type: 'credit_alphanum4'
      };

      await expect(
        blendProtocol.liquidate(
          liquidatorAddress,
          testPrivateKey,
          borrowerAddress,
          invalidAsset,
          '100000',
          collateralAsset
        )
      ).rejects.toThrow('Invalid asset');
    });

    it('should validate collateral asset', async () => {
      const invalidAsset: Asset = {
        code: '',
        issuer: '',
        type: 'credit_alphanum4'
      };

      await expect(
        blendProtocol.liquidate(
          liquidatorAddress,
          testPrivateKey,
          borrowerAddress,
          testAsset,
          '100000',
          invalidAsset
        )
      ).rejects.toThrow('Invalid asset');
    });

    it('should throw error on simulation failure for liquidate', async () => {
      // Mock unhealthy position
      jest.spyOn(blendProtocol, 'getHealthFactor').mockResolvedValue({
        value: '0.5',
        liquidationThreshold: '0.85',
        maxLTV: '0.75',
        isHealthy: false
      });

      const mockKeypair = {
        publicKey: jest.fn(() => liquidatorAddress),
        sign: jest.fn()
      };
      (Keypair.fromSecret as jest.Mock).mockReturnValue(mockKeypair);

      mockHorizonServer.loadAccount = jest.fn().mockResolvedValue({
        sequenceNumber: jest.fn(() => '1000000000'),
        accountId: jest.fn(() => liquidatorAddress),
        incrementSequenceNumber: jest.fn()
      });

      const mockTx = {
        sign: jest.fn(),
        toXDR: jest.fn(() => 'mocked-xdr')
      };
      (TransactionBuilder as jest.MockedClass<typeof TransactionBuilder>).mockImplementation(
        () =>
          ({
            addOperation: jest.fn().mockReturnThis(),
            setTimeout: jest.fn().mockReturnThis(),
            build: jest.fn(() => mockTx)
          } as any)
      );

      // Mock simulation error
      mockSorobanServer.simulateTransaction = jest.fn().mockResolvedValue({
        error: 'Liquidation simulation failed: invalid parameters'
      });
      (rpc.Api.isSimulationError as unknown as jest.Mock).mockReturnValue(true);

      await expect(
        blendProtocol.liquidate(
          liquidatorAddress,
          testPrivateKey,
          borrowerAddress,
          testAsset,
          '100000',
          collateralAsset
        )
      ).rejects.toThrow('Liquidation simulation failed');
    });
  });

  describe('findLiquidationOpportunities()', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should return empty array of liquidation opportunities', async () => {
      const opportunities = await blendProtocol.findLiquidationOpportunities(1.0);

      expect(opportunities).toBeDefined();
      expect(Array.isArray(opportunities)).toBe(true);
      expect(opportunities.length).toBe(0);
    });

    it('should accept custom minHealthFactor parameter', async () => {
      const opportunities = await blendProtocol.findLiquidationOpportunities(0.85);

      expect(opportunities).toBeDefined();
      expect(Array.isArray(opportunities)).toBe(true);
    });
  });

  // ========================================
  // PROTOCOL INFORMATION TESTS
  // ========================================

  describe('getStats()', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should return protocol statistics', async () => {
      const stats = await blendProtocol.getStats();

      expect(stats).toBeDefined();
      expect(stats.totalSupply).toBe('0');
      expect(stats.totalBorrow).toBe('0');
      expect(stats.tvl).toBe('0');
      expect(stats.utilizationRate).toBe(0);
      expect(stats.timestamp).toBeInstanceOf(Date);
    });

    it('should throw error if pool contract not initialized for getStats', async () => {
      (blendProtocol as any).poolContract = null;

      await expect(blendProtocol.getStats()).rejects.toThrow(
        'Pool contract not initialized'
      );
    });
  });

  describe('getSupplyAPY()', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should return supply APY information', async () => {
      const apy = await blendProtocol.getSupplyAPY(testAsset);

      expect(apy).toBeDefined();
      expect(apy.supplyAPY).toBe('0');
      expect(apy.borrowAPY).toBe('0');
      expect(apy.timestamp).toBeInstanceOf(Date);
    });

    it('should validate asset before getting supply APY', async () => {
      const invalidAsset: Asset = {
        code: '',
        issuer: '',
        type: 'credit_alphanum4'
      };

      await expect(blendProtocol.getSupplyAPY(invalidAsset)).rejects.toThrow(
        'Invalid asset'
      );
    });
  });

  describe('getBorrowAPY()', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should return borrow APY information', async () => {
      const apy = await blendProtocol.getBorrowAPY(testAsset);

      expect(apy).toBeDefined();
      expect(apy.supplyAPY).toBe('0');
      expect(apy.borrowAPY).toBe('0');
      expect(apy.timestamp).toBeInstanceOf(Date);
    });

    it('should validate asset before getting borrow APY', async () => {
      const invalidAsset: Asset = {
        code: '',
        issuer: '',
        type: 'credit_alphanum4'
      };

      await expect(blendProtocol.getBorrowAPY(invalidAsset)).rejects.toThrow(
        'Invalid asset'
      );
    });
  });

  describe('getTotalSupply()', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should return total supply for asset', async () => {
      const totalSupply = await blendProtocol.getTotalSupply(testAsset);

      expect(totalSupply).toBe('0');
    });

    it('should validate asset before getting total supply', async () => {
      const invalidAsset: Asset = {
        code: '',
        issuer: '',
        type: 'credit_alphanum4'
      };

      await expect(blendProtocol.getTotalSupply(invalidAsset)).rejects.toThrow(
        'Invalid asset'
      );
    });
  });

  describe('getTotalBorrow()', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should return total borrow for asset', async () => {
      const totalBorrow = await blendProtocol.getTotalBorrow(testAsset);

      expect(totalBorrow).toBe('0');
    });

    it('should validate asset before getting total borrow', async () => {
      const invalidAsset: Asset = {
        code: '',
        issuer: '',
        type: 'credit_alphanum4'
      };

      await expect(blendProtocol.getTotalBorrow(invalidAsset)).rejects.toThrow(
        'Invalid asset'
      );
    });
  });

  describe('getReserveData()', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should return reserve data for asset', async () => {
      const reserveData = await blendProtocol.getReserveData(testAsset);

      expect(reserveData).toBeDefined();
      expect(reserveData.asset).toEqual(testAsset);
      expect(reserveData.totalSupply).toBe('0');
      expect(reserveData.totalBorrows).toBe('0');
      expect(reserveData.availableLiquidity).toBe('0');
      expect(reserveData.utilizationRate).toBe('0');
      expect(reserveData.supplyAPY).toBe('0');
      expect(reserveData.borrowAPY).toBe('0');
      expect(reserveData.lastUpdateTime).toBeInstanceOf(Date);
    });

    it('should validate asset before getting reserve data', async () => {
      const invalidAsset: Asset = {
        code: '',
        issuer: '',
        type: 'credit_alphanum4'
      };

      await expect(blendProtocol.getReserveData(invalidAsset)).rejects.toThrow(
        'Invalid asset'
      );
    });
  });

  // ========================================
  // UTILITY METHOD TESTS
  // ========================================

  describe('assetToContractAddress()', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should convert native asset to contract address', () => {
      const nativeAsset: Asset = {
        code: 'XLM',
        issuer: '',
        type: 'native'
      };

      const address = (blendProtocol as any).assetToContractAddress(nativeAsset);

      expect(address).toBe('CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC');
    });

    it('should convert known asset to contract address', () => {
      const knownAsset: Asset = {
        code: 'USDC',
        issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        type: 'credit_alphanum4'
      };

      const address = (blendProtocol as any).assetToContractAddress(knownAsset);

      expect(address).toBe('CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA');
    });

    it('should return default address for unknown asset', () => {
      const unknownAsset: Asset = {
        code: 'UNKNOWN',
        issuer: 'GCZYLNGU4CA5DPKX2LEJW5OZFUCBHPBQFF5JW2BPFAQG4ZRCJSKEKFHT',
        type: 'credit_alphanum4'
      };

      const address = (blendProtocol as any).assetToContractAddress(unknownAsset);

      expect(address).toBe('GCZYLNGU4CA5DPKX2LEJW5OZFUCBHPBQFF5JW2BPFAQG4ZRCJSKEKFHT');
    });

    it('should return default address for asset without issuer', () => {
      const assetWithoutIssuer: Asset = {
        code: 'TEST',
        issuer: '',
        type: 'credit_alphanum4'
      };

      const address = (blendProtocol as any).assetToContractAddress(
        assetWithoutIssuer
      );

      expect(address).toBe('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4');
    });
  });

  describe('waitForTransaction()', () => {
    beforeEach(async () => {
      await blendProtocol.initialize();
    });

    it('should wait for transaction confirmation', async () => {
      mockSorobanServer.getTransaction = jest
        .fn()
        .mockResolvedValueOnce({ status: 'NOT_FOUND' })
        .mockResolvedValueOnce({ status: 'NOT_FOUND' })
        .mockResolvedValueOnce({ status: 'SUCCESS', ledger: 12345 });

      const result = await (blendProtocol as any).waitForTransaction('test-hash');

      expect(result.status).toBe('SUCCESS');
      expect(result.ledger).toBe(12345);
      expect(mockSorobanServer.getTransaction).toHaveBeenCalledTimes(3);
    });

    it('should immediately return if transaction is found', async () => {
      mockSorobanServer.getTransaction = jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        ledger: 12345
      });

      const result = await (blendProtocol as any).waitForTransaction('test-hash');

      expect(result.status).toBe('SUCCESS');
      expect(mockSorobanServer.getTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('parsePositionData()', () => {
    it('should parse position data from simulation', () => {
      const mockSimulation = {
        result: { mock: 'result' }
      };

      const position = (blendProtocol as any).parsePositionData(
        mockSimulation,
        testAddress
      );

      expect(position).toBeDefined();
      expect(position.address).toBe(testAddress);
      expect(position.supplied).toEqual([]);
      expect(position.borrowed).toEqual([]);
      expect(position.healthFactor).toBe('0');
      expect(position.collateralValue).toBe('0');
      expect(position.debtValue).toBe('0');
    });
  });

  describe('parseLiquidationResult()', () => {
    it('should parse liquidation result', () => {
      const mockResult = {
        status: 'SUCCESS',
        ledger: 12345
      };

      const collateralAmount = (blendProtocol as any).parseLiquidationResult(
        mockResult
      );

      expect(collateralAmount).toBe('0');
    });
  });

  describe('parseHealthFactorData()', () => {
    it('should parse health factor data from simulation', () => {
      const mockSimulation = {
        result: { mock: 'result' }
      };

      const healthFactor = (blendProtocol as any).parseHealthFactorData(
        mockSimulation
      );

      expect(healthFactor).toBeDefined();
      expect(healthFactor.value).toBe('0');
      expect(healthFactor.liquidationThreshold).toBe('0.85');
      expect(healthFactor.maxLTV).toBe('0.75');
      expect(healthFactor.isHealthy).toBe(true);
    });
  });
});
