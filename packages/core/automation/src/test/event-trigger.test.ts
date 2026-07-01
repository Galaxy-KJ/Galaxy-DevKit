/**
 * @fileoverview Unit tests for EventTrigger
 */

import { EventTrigger } from '../triggers/event-trigger.js';
import type { ContractEventDetail } from '@galaxy-kj/core-stellar-sdk/soroban';

type MockSubscription = {
  contractId: string;
  eventTypes?: string[];
  onEvent: (event: ContractEventDetail) => void;
  onError?: (error: Error) => void;
};

function createMockEvent(
  overrides: Partial<ContractEventDetail> = {}
): ContractEventDetail {
  return {
    contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
    type: 'contract',
    topics: ['deposit'] as unknown as ContractEventDetail['topics'],
    data: [],
    timestamp: 1_700_000_000,
    ledger: 12_345,
    txHash: 'mock-tx-hash',
    ...overrides,
  };
}

describe('EventTrigger', () => {
  let subscribeToEvents: jest.Mock;
  let unsubscribe: jest.Mock;
  let mockMonitor: {
    subscribeToEvents: jest.Mock;
    unsubscribe: jest.Mock;
  };
  let trigger: EventTrigger;

  beforeEach(() => {
    jest.useFakeTimers();

    subscribeToEvents = jest
      .fn()
      .mockImplementation(async (subscription: MockSubscription) => {
        return `sub-${subscription.contractId}`;
      });
    unsubscribe = jest.fn();

    mockMonitor = {
      subscribeToEvents,
      unsubscribe,
    };

    trigger = new EventTrigger(
      'https://mock-rpc-url',
      mockMonitor as unknown as import('@galaxy-kj/core-stellar-sdk/soroban').ContractEventMonitor
    );
  });

  afterEach(() => {
    trigger.stopListening();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('subscribes to contract events with topic filters', async () => {
    const callback = jest.fn();
    const filter = {
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
      topics: ['deposit', 'liquidation'],
    };

    await trigger.startListening(filter, callback);

    expect(subscribeToEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: filter.contractId,
        eventTypes: filter.topics,
        onEvent: expect.any(Function),
        onError: expect.any(Function),
      })
    );
  });

  it('invokes callback for simulated Soroban events matching the filter', async () => {
    const callback = jest.fn();
    const filter = {
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
      topics: ['deposit'],
    };

    await trigger.startListening(filter, callback);
    trigger.emitSimulatedEvent(
      createMockEvent({ topics: ['deposit'] as unknown as ContractEventDetail['topics'] })
    );

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: filter.contractId,
        topics: ['deposit'],
      })
    );
  });

  it('does not invoke callback for simulated events with mismatched topics', async () => {
    const callback = jest.fn();
    const filter = {
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
      topics: ['deposit'],
    };

    await trigger.startListening(filter, callback);
    trigger.emitSimulatedEvent(
      createMockEvent({ topics: ['liquidation'] as unknown as ContractEventDetail['topics'] })
    );

    expect(callback).not.toHaveBeenCalled();
  });

  it('forwards live RPC events through the subscription callback', async () => {
    const callback = jest.fn();
    let capturedSubscription: MockSubscription | undefined;

    subscribeToEvents.mockImplementation(async (subscription: MockSubscription) => {
      capturedSubscription = subscription;
      return 'sub-live';
    });

    await trigger.startListening(
      {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
        topics: ['deposit'],
      },
      callback
    );

    const liveEvent = createMockEvent({
      topics: ['deposit'] as unknown as ContractEventDetail['topics'],
    });
    capturedSubscription?.onEvent(liveEvent);

    expect(callback).toHaveBeenCalledWith(liveEvent);
  });

  it('reconnects gracefully after RPC connection dropouts', async () => {
    const callback = jest.fn();
    let capturedSubscription: MockSubscription | undefined;

    subscribeToEvents.mockImplementation(async (subscription: MockSubscription) => {
      capturedSubscription = subscription;
      return 'sub-reconnect';
    });

    await trigger.startListening(
      {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
        topics: ['deposit'],
      },
      callback
    );

    capturedSubscription?.onError?.(new Error('RPC connection lost'));
    expect(unsubscribe).toHaveBeenCalledWith('sub-reconnect');

    jest.advanceTimersByTime(2_000);
    await Promise.resolve();

    expect(subscribeToEvents).toHaveBeenCalledTimes(2);
  });

  it('stops reconnecting after max attempts and releases the subscription', async () => {
    const callback = jest.fn();
    let capturedSubscription: MockSubscription | undefined;

    subscribeToEvents
      .mockImplementationOnce(async (subscription: MockSubscription) => {
        capturedSubscription = subscription;
        return 'sub-initial';
      })
      .mockRejectedValue(new Error('RPC unavailable'));

    await trigger.startListening(
      {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
        topics: ['deposit'],
      },
      callback
    );

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      capturedSubscription?.onError?.(new Error(`dropout-${attempt}`));
      jest.advanceTimersByTime(2_000 * attempt);
      await Promise.resolve();
    }

    const callsAfterMaxAttempts = subscribeToEvents.mock.calls.length;

    capturedSubscription?.onError?.(new Error('dropout-final'));
    jest.advanceTimersByTime(20_000);
    await Promise.resolve();

    expect(subscribeToEvents.mock.calls.length).toBe(callsAfterMaxAttempts);

    trigger.stopListening();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('throws when startListening is called while already listening', async () => {
    const callback = jest.fn();

    await trigger.startListening(
      {
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
        topics: [],
      },
      callback
    );

    await expect(
      trigger.startListening(
        {
          contractId: 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          topics: [],
        },
        callback
      )
    ).rejects.toThrow('EventTrigger is already listening');
  });
});