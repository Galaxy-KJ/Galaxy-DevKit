/**
 * @fileoverview EventMonitor tests
 * @description Test suite for event monitoring functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { ContractEventMonitor } from '../utils/event-monitor';
import { ContractEventDetail } from '../types/contract-types';

// Mock Stellar SDK
jest.mock('@stellar/stellar-sdk', () => ({
  SorobanRpc: {
    Server: jest.fn().mockImplementation(() => ({
      getLatestLedger: jest.fn(),
      getEvents: jest.fn(),
    })),
  },
  xdr: {
    ScVal: {
      scvVoid: jest.fn(),
    },
  },
}));

const mockSorobanRpc = require('@stellar/stellar-sdk').SorobanRpc;

describe('ContractEventMonitor', () => {
  let monitor: ContractEventMonitor;

  beforeEach(() => {
    monitor = new ContractEventMonitor('https://mock-rpc-url');
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    monitor.destroy();
  });

  describe('constructor', () => {
    it('should initialize with default RPC URL', () => {
      const defaultMonitor = new ContractEventMonitor();
      expect(defaultMonitor.getServer()).toBeDefined();
    });

    it('should initialize with custom RPC URL', () => {
      const customMonitor = new ContractEventMonitor('https://custom-rpc-url');
      expect(customMonitor.getServer()).toBeDefined();
    });
  });

  describe('subscribeToEvents', () => {
    it('should subscribe to contract events', async () => {
      const mockLedgerResponse = { sequence: 1000 };
      const mockServer = monitor.getServer();
      (mockServer.getLatestLedger as jest.Mock).mockResolvedValue(
        mockLedgerResponse
      );

      const onEvent = jest.fn();
      const subscriptionId = await monitor.subscribeToEvents({
        contractId: 'mock-contract-id',
        onEvent,
      });

      expect(subscriptionId).toBeDefined();
      expect(typeof subscriptionId).toBe('string');
      expect(monitor.getSubscriptions()).toHaveLength(1);
    });

    it('should call onError when subscription fails', async () => {
      const mockServer = monitor.getServer();
      (mockServer.getLatestLedger as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      const onError = jest.fn();
      const onEvent = jest.fn();

      await expect(
        monitor.subscribeToEvents({
          contractId: 'mock-contract-id',
          onEvent,
          onError,
        })
      ).rejects.toThrow('Network error');

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle subscription with event types', async () => {
      const mockLedgerResponse = { sequence: 1000 };
      const mockServer = monitor.getServer();
      (mockServer.getLatestLedger as jest.Mock).mockResolvedValue(
        mockLedgerResponse
      );

      const onEvent = jest.fn();
      const subscriptionId = await monitor.subscribeToEvents({
        contractId: 'mock-contract-id',
        eventTypes: ['transfer', 'approval'],
        onEvent,
      });

      expect(subscriptionId).toBeDefined();
    });
  });

  describe('queryEvents', () => {
    it('should query events successfully', async () => {
      const mockRpcEvents = [
        {
          contractId: { toString: jest.fn(() => 'mock-contract-id') },
          type: { toString: jest.fn(() => 'contract') },
          topics: [{ toString: jest.fn(() => 'transfer') }],
          data: { switch: jest.fn(() => 'void') },
          timestamp: 1234567890,
          ledger: 12345,
          txHash: 'mock-tx-hash',
        },
      ];

      const mockServer = monitor.getServer();
      (mockServer.getEvents as jest.Mock).mockResolvedValue({
        events: mockRpcEvents,
      });

      const result = await monitor.queryEvents({
        contractId: 'mock-contract-id',
        networkPassphrase: 'Test SDF Network ; September 2015',
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        contractId: 'mock-contract-id',
        type: 'contract',
        timestamp: 1234567890,
        ledger: 12345,
        txHash: 'mock-tx-hash',
      });
    });

    it('should query events with filters', async () => {
      const mockServer = monitor.getServer();
      (mockServer.getEvents as jest.Mock).mockResolvedValue({
        events: [],
      });

      await monitor.queryEvents({
        contractId: 'mock-contract-id',
        startLedger: 1000,
        endLedger: 2000,
        eventTypes: ['transfer'],
        topics: [],
        networkPassphrase: 'Test SDF Network ; September 2015',
      });

      expect(mockServer.getEvents).toHaveBeenCalledWith({
        startLedger: 1000,
        endLedger: 2000,
        filters: [
          {
            type: 'contract',
            contractIds: ['mock-contract-id'],
            topics: [{ type: 'string', value: 'transfer' }],
          },
        ],
        limit: undefined,
      });
    });

    it('should handle query failure', async () => {
      const mockServer = monitor.getServer();
      (mockServer.getEvents as jest.Mock).mockRejectedValue(
        new Error('Query failed')
      );

      await expect(
        monitor.queryEvents({
          contractId: 'mock-contract-id',
          networkPassphrase: 'Test SDF Network ; September 2015',
        })
      ).rejects.toThrow('Event query failed: Query failed');
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from specific subscription', async () => {
      const onEvent = jest.fn();
      const subscriptionId = await monitor.subscribeToEvents({
        contractId: 'mock-contract-id',
        onEvent,
      });

      expect(monitor.getSubscriptions()).toHaveLength(1);

      monitor.unsubscribe(subscriptionId);

      expect(monitor.getSubscriptions()).toHaveLength(0);
    });

    it('should call onClose when unsubscribing', async () => {
      const onClose = jest.fn();
      const subscriptionId = await monitor.subscribeToEvents({
        contractId: 'mock-contract-id',
        onEvent: jest.fn(),
        onClose,
      });

      monitor.unsubscribe(subscriptionId);

      expect(onClose).toHaveBeenCalled();
    });

    it('should handle unsubscribing non-existent subscription', () => {
      expect(() => {
        monitor.unsubscribe('non-existent-id');
      }).not.toThrow();
    });
  });

  describe('unsubscribeAll', () => {
    it('should unsubscribe from all subscriptions', async () => {
      const onEvent1 = jest.fn();
      const onEvent2 = jest.fn();

      await monitor.subscribeToEvents({
        contractId: 'contract-1',
        onEvent: onEvent1,
      });

      await monitor.subscribeToEvents({
        contractId: 'contract-2',
        onEvent: onEvent2,
      });

      expect(monitor.getSubscriptions()).toHaveLength(2);

      monitor.unsubscribeAll();

      expect(monitor.getSubscriptions()).toHaveLength(0);
    });
  });

  describe('event filtering', () => {
    let mockEvents: ContractEventDetail[];

    beforeEach(() => {
      mockEvents = [
        {
          contractId: 'contract-1',
          type: 'contract',
          topics: [],
          data: { switch: jest.fn(() => 'void') },
          timestamp: 1000,
          ledger: 100,
          txHash: 'tx1',
          decodedTopics: ['transfer', 'from', 'to', '100'],
          decodedData: null,
        },
        {
          contractId: 'contract-2',
          type: 'contract',
          topics: [],
          data: { switch: jest.fn(() => 'void') },
          timestamp: 2000,
          ledger: 200,
          txHash: 'tx2',
          decodedTopics: ['approval', 'owner', 'spender', '50'],
          decodedData: null,
        },
        {
          contractId: 'contract-1',
          type: 'contract',
          topics: [],
          data: { switch: jest.fn(() => 'void') },
          timestamp: 3000,
          ledger: 300,
          txHash: 'tx3',
          decodedTopics: ['transfer', 'from2', 'to2', '200'],
          decodedData: null,
        },
      ];
    });

    describe('filterEventsByTopic', () => {
      it('should filter events by topic', () => {
        const filtered = monitor.filterEventsByTopic(mockEvents, 'transfer');
        expect(filtered).toHaveLength(2);
      });

      it('should return empty array for non-existent topic', () => {
        const filtered = monitor.filterEventsByTopic(mockEvents, 'nonexistent');
        expect(filtered).toHaveLength(0);
      });
    });

    describe('filterEventsByContract', () => {
      it('should filter events by contract', () => {
        const filtered = monitor.filterEventsByContract(
          mockEvents,
          'contract-1'
        );
        expect(filtered).toHaveLength(2);
      });

      it('should return empty array for non-existent contract', () => {
        const filtered = monitor.filterEventsByContract(
          mockEvents,
          'nonexistent'
        );
        expect(filtered).toHaveLength(0);
      });
    });

    describe('filterEventsByTimeRange', () => {
      it('should filter events by time range', () => {
        const filtered = monitor.filterEventsByTimeRange(
          mockEvents,
          1500,
          2500
        );
        expect(filtered).toHaveLength(1);
        expect(filtered[0].txHash).toBe('tx2');
      });

      it('should include boundaries', () => {
        const filtered = monitor.filterEventsByTimeRange(
          mockEvents,
          1000,
          3000
        );
        expect(filtered).toHaveLength(3);
      });
    });
  });

  describe('getEventStats', () => {
    it('should calculate event statistics', () => {
      const mockEvents = [
        {
          contractId: 'contract-1',
          type: 'contract',
          topics: [],
          data: { switch: jest.fn(() => 'void') },
          timestamp: 1000,
          ledger: 100,
          txHash: 'tx1',
          decodedTopics: ['transfer'],
          decodedData: null,
        },
        {
          contractId: 'contract-1',
          type: 'contract',
          topics: [],
          data: { switch: jest.fn(() => 'void') },
          timestamp: 2000,
          ledger: 200,
          txHash: 'tx2',
          decodedTopics: ['approval'],
          decodedData: null,
        },
        {
          contractId: 'contract-2',
          type: 'contract',
          topics: [],
          data: { switch: jest.fn(() => 'void') },
          timestamp: 3000,
          ledger: 300,
          txHash: 'tx3',
          decodedTopics: ['transfer'],
          decodedData: null,
        },
      ];

      const stats = monitor.getEventStats(mockEvents);

      expect(stats).toEqual({
        totalEvents: 3,
        uniqueContracts: 2,
        uniqueTypes: 1,
        ledgerRange: { min: 100, max: 300 },
        timeRange: { min: 1000, max: 3000 },
      });
    });

    it('should handle empty events array', () => {
      const stats = monitor.getEventStats([]);

      expect(stats).toEqual({
        totalEvents: 0,
        uniqueContracts: 0,
        uniqueTypes: 0,
        ledgerRange: { min: 0, max: 0 },
        timeRange: { min: 0, max: 0 },
      });
    });
  });

  describe('polling functionality', () => {
    it('should start polling when subscribed', async () => {
      const mockLedgerResponse = { sequence: 1000 };
      const mockServer = monitor.getServer();
      (mockServer.getLatestLedger as jest.Mock).mockResolvedValue(
        mockLedgerResponse
      );
      (mockServer.getEvents as jest.Mock).mockResolvedValue({ events: [] });

      const onEvent = jest.fn();
      await monitor.subscribeToEvents({
        contractId: 'mock-contract-id',
        onEvent,
      });

      // Fast-forward time to trigger polling
      jest.advanceTimersByTime(5000);

      expect(mockServer.getLatestLedger).toHaveBeenCalled();
      expect(mockServer.getEvents).toHaveBeenCalled();
    });

    it('should handle polling errors gracefully', async () => {
      const mockLedgerResponse = { sequence: 1000 };
      const mockServer = monitor.getServer();
      (mockServer.getLatestLedger as jest.Mock).mockResolvedValue(
        mockLedgerResponse
      );
      (mockServer.getEvents as jest.Mock).mockRejectedValue(
        new Error('Polling error')
      );

      const onError = jest.fn();
      const onEvent = jest.fn();

      await monitor.subscribeToEvents({
        contractId: 'mock-contract-id',
        onEvent,
        onError,
      });

      // Fast-forward time to trigger polling
      jest.advanceTimersByTime(5000);

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('destroy', () => {
    it('should cleanup all resources', async () => {
      await monitor.subscribeToEvents({
        contractId: 'contract-1',
        onEvent: jest.fn(),
      });

      await monitor.subscribeToEvents({
        contractId: 'contract-2',
        onEvent: jest.fn(),
      });

      expect(monitor.getSubscriptions()).toHaveLength(2);

      monitor.destroy();

      expect(monitor.getSubscriptions()).toHaveLength(0);
    });
  });
});
