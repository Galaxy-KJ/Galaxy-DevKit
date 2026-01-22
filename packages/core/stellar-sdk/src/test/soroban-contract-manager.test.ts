/**
 * @fileoverview SorobanContractManager tests
 * @description Test suite for Soroban contract management
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { SorobanContractManager } from '../soroban-contract-manager';
import { Keypair } from '@stellar/stellar-sdk';
import {
  ContractDeploymentParams,
  ContractInvocationParams,
} from '../types/contract-types';

// Mock the Stellar SDK
jest.mock('@stellar/stellar-sdk', () => ({
  // Keep actual implementations for the classes we're not mocking
  Keypair: jest.fn().mockImplementation(() => ({
    publicKey: jest.fn(
      () => 'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53'
    ),
    sign: jest.fn(),
  })),
  xdr: {
    ScVal: {
      scvVoid: jest.fn(),
      scvBool: jest.fn(),
      scvI32: jest.fn(),
      scvString: jest.fn(),
      scvVec: jest.fn(),
      scvMap: jest.fn(),
    },
  },
  SorobanRpc: {
    Server: jest.fn().mockImplementation(() => ({
      getAccount: jest.fn(),
      simulateTransaction: jest.fn(),
      sendTransaction: jest.fn(),
      getTransaction: jest.fn(),
      getLedgerEntries: jest.fn(),
      getEvents: jest.fn(),
      getLatestLedger: jest.fn(),
    })),
    Api: {
      isSimulationSuccess: jest.fn(() => true),
      prepareTransaction: jest.fn(tx => tx),
      isGetTransactionSuccess: jest.fn(() => true),
      Account: jest.fn(),
      GetTransactionResponse: {},
      SimulateTransactionResponse: {},
    },
  },
  TransactionBuilder: jest.fn().mockImplementation(() => ({
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn(() => ({ toXDR: jest.fn(() => 'mock-xdr') })),
  })),
  Contract: jest.fn().mockImplementation(() => ({
    call: jest.fn(() => ({ type: 'invokeContract' })),
    getFootprint: jest.fn(() => ({ toLedgerKey: jest.fn() })),
    toLedgerKey: jest.fn(),
  })),
  Address: jest.fn().mockImplementation(() => ({
    toString: jest.fn(
      () => 'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53'
    ),
    toScVal: jest.fn(() => ({ switch: jest.fn(() => 'address') })),
  })),
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015',
  },
  BASE_FEE: '100',
}));

describe('SorobanContractManager', () => {
  let manager: SorobanContractManager;
  let mockKeypair: Keypair;

  beforeEach(() => {
    manager = new SorobanContractManager('https://mock-rpc-url');
    mockKeypair = Keypair.random();
  });

  describe('constructor', () => {
    it('should initialize with default RPC URL', () => {
      const defaultManager = new SorobanContractManager();
      expect(defaultManager.getRpcUrl()).toBe(
        'https://soroban-testnet.stellar.org'
      );
    });

    it('should initialize with custom RPC URL', () => {
      expect(manager.getRpcUrl()).toBe('https://mock-rpc-url');
    });
  });

  describe('deployContract', () => {
    it('should deploy a contract successfully', async () => {
      const wasm = Buffer.from('mock-wasm');
      const params: ContractDeploymentParams = {
        wasm,
        deployer: mockKeypair,
        networkPassphrase: 'Test SDF Network ; September 2015',
      };

      // Mock server responses
      const mockServer = manager.getServer();
      (mockServer.getAccount as jest.Mock).mockResolvedValue({
        accountId: 'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53',
        sequenceNumber: '1',
      });

      (mockServer.simulateTransaction as jest.Mock).mockResolvedValue({
        result: { switch: jest.fn(() => 'success') },
        error: null,
      });

      (mockServer.sendTransaction as jest.Mock).mockResolvedValue({
        status: 'PENDING',
        hash: 'mock-tx-hash',
      });

      (mockServer.getTransaction as jest.Mock).mockResolvedValue({
        status: 'SUCCESS',
        resultXdr: 'mock-result-xdr',
        returnValue: { toString: jest.fn(() => 'mock-contract-id') },
        ledger: 12345,
      });

      const result = await manager.deployContract(params);

      expect(result).toEqual({
        contractId: 'mock-contract-id',
        transactionHash: 'mock-tx-hash',
        ledger: 12345,
      });
    });

    it('should handle deployment failure', async () => {
      const wasm = Buffer.from('mock-wasm');
      const params: ContractDeploymentParams = {
        wasm,
        deployer: mockKeypair,
        networkPassphrase: 'Test SDF Network ; September 2015',
      };

      const mockServer = manager.getServer();
      (mockServer.getAccount as jest.Mock).mockRejectedValue(
        new Error('Account not found')
      );

      await expect(manager.deployContract(params)).rejects.toThrow(
        'Contract deployment failed: Account not found'
      );
    });
  });

  describe('invokeContract', () => {
    it('should invoke a contract method successfully', async () => {
      const params: ContractInvocationParams = {
        contractId: 'mock-contract-id',
        method: 'testMethod',
        args: [42, 'test'],
        caller: mockKeypair,
        networkPassphrase: 'Test SDF Network ; September 2015',
      };

      const mockServer = manager.getServer();
      (mockServer.getAccount as jest.Mock).mockResolvedValue({
        accountId: 'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53',
        sequenceNumber: '1',
      });

      (mockServer.simulateTransaction as jest.Mock).mockResolvedValue({
        result: { switch: jest.fn(() => 'success') },
        error: null,
      });

      (mockServer.sendTransaction as jest.Mock).mockResolvedValue({
        status: 'PENDING',
        hash: 'mock-tx-hash',
      });

      (mockServer.getTransaction as jest.Mock).mockResolvedValue({
        status: 'SUCCESS',
        resultXdr: 'mock-result-xdr',
        returnValue: { switch: jest.fn(() => 'success') },
        ledger: 12345,
      });

      const result = await manager.invokeContract(params);

      expect(result).toEqual({
        result: { switch: expect.any(Function) },
        transactionHash: 'mock-tx-hash',
        ledger: 12345,
        events: [],
        auth: [],
      });
    });

    it('should simulate only when requested', async () => {
      const params: ContractInvocationParams = {
        contractId: 'mock-contract-id',
        method: 'testMethod',
        args: [],
        caller: mockKeypair,
        networkPassphrase: 'Test SDF Network ; September 2015',
        simulateOnly: true,
      };

      const mockServer = manager.getServer();
      (mockServer.getAccount as jest.Mock).mockResolvedValue({
        accountId: 'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53',
        sequenceNumber: '1',
      });

      (mockServer.simulateTransaction as jest.Mock).mockResolvedValue({
        result: { switch: jest.fn(() => 'success') },
        error: null,
        cpuInstructions: 1000,
        memoryBytes: 2000,
        transactionData: {},
        minResourceFee: '100',
        cost: { cpuInsns: 1000, memBytes: 2000 },
      });

      const result = await manager.invokeContract(params);

      expect(result.transactionHash).toBe('');
      expect(result.ledger).toBe(0);
      // Should not call sendTransaction or getTransaction
      expect(mockServer.sendTransaction).not.toHaveBeenCalled();
      expect(mockServer.getTransaction).not.toHaveBeenCalled();
    });
  });

  describe('readContractState', () => {
    it('should read contract state successfully', async () => {
      const mockServer = manager.getServer();
      (mockServer.getLedgerEntries as jest.Mock).mockResolvedValue({
        entries: [
          {
            val: {
              switch: jest.fn(() => 'string'),
              str: { toString: jest.fn(() => 'mock-value') },
            },
          },
        ],
      });

      const result = await manager.readContractState({
        contractId: 'mock-contract-id',
        key: 'test-key',
        networkPassphrase: 'Test SDF Network ; September 2015',
      });

      expect(result).toBe('mock-value');
    });

    it('should return null when no entry found', async () => {
      const mockServer = manager.getServer();
      (mockServer.getLedgerEntries as jest.Mock).mockResolvedValue({
        entries: [],
      });

      const result = await manager.readContractState({
        contractId: 'mock-contract-id',
        key: 'test-key',
        networkPassphrase: 'Test SDF Network ; September 2015',
      });

      expect(result).toBeNull();
    });
  });

  describe('queryEvents', () => {
    it('should query events successfully', async () => {
      const mockEvents = [
        {
          contractId: { toString: jest.fn(() => 'mock-contract-id') },
          type: { toString: jest.fn(() => 'contract') },
          topics: [{ toString: jest.fn(() => 'topic1') }],
          data: { switch: jest.fn(() => 'void') },
          timestamp: 1234567890,
          ledger: 12345,
          txHash: 'mock-tx-hash',
        },
      ];

      const mockServer = manager.getServer();
      (mockServer.getEvents as jest.Mock).mockResolvedValue({
        events: mockEvents,
      });

      const result = await manager.queryEvents({
        contractId: 'mock-contract-id',
        networkPassphrase: 'Test SDF Network ; September 2015',
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        contractId: 'mock-contract-id',
        type: 'contract',
        topics: expect.any(Array),
        data: expect.any(Object),
        timestamp: 1234567890,
        ledger: 12345,
        txHash: 'mock-tx-hash',
      });
    });
  });

  describe('simulateInvocation', () => {
    it('should simulate contract invocation', async () => {
      const mockServer = manager.getServer();
      (mockServer.getEvents as jest.Mock).mockResolvedValue({
        events: [],
      });

      (mockServer.simulateTransaction as jest.Mock).mockResolvedValue({
        result: { switch: jest.fn(() => 'success') },
        error: null,
        cpuInstructions: 1000,
        memoryBytes: 2000,
        transactionData: {},
        minResourceFee: '100',
        cost: { cpuInsns: 1000, memBytes: 2000 },
      });

      const result = await manager.simulateInvocation({
        contractId: 'mock-contract-id',
        method: 'testMethod',
        args: [],
        networkPassphrase: 'Test SDF Network ; September 2015',
      });

      expect(result).toEqual({
        result: { switch: expect.any(Function) },
        events: [],
        auth: [],
        cpuInstructions: 1000,
        memoryBytes: 2000,
        transactionData: {},
        minResourceFee: '100',
        cost: { cpuInsns: 1000, memBytes: 2000 },
      });
    });
  });

  describe('getServer and getRpcUrl', () => {
    it('should return server instance', () => {
      const server = manager.getServer();
      expect(server).toBeDefined();
    });

    it('should return RPC URL', () => {
      const url = manager.getRpcUrl();
      expect(url).toBe('https://mock-rpc-url');
    });
  });
});
