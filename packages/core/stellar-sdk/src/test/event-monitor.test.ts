/**
 * @fileoverview Unit tests for ContractEventMonitor polling, paging and filters
 */

import { Contract, StrKey, rpc, xdr } from '@stellar/stellar-sdk';
import { ContractEventMonitor } from '../soroban/utils/event-monitor.js';
import {
  ContractEventDetail,
  EventSubscription,
} from '../soroban/types/contract-types.js';

const POLL_INTERVAL_MS = 5000;

const CONTRACT_A = StrKey.encodeContract(Buffer.alloc(32, 1));
const CONTRACT_B = StrKey.encodeContract(Buffer.alloc(32, 2));

const pad = (value: number, width: number) =>
  String(value).padStart(width, '0');
const eventId = (ledger: number, index: number) =>
  `${pad(ledger, 12)}-${pad(index, 10)}`;
const endOfLedgerCursor = (ledger: number) => `${pad(ledger, 12)}-9999999999`;
const b64 = (value: xdr.ScVal) => value.toXDR('base64');

function topicMatches(eventTopics: string[], topicFilter: string[]): boolean {
  for (let i = 0; i < topicFilter.length; i++) {
    const segment = topicFilter[i];
    if (segment === '**') return true;
    if (i >= eventTopics.length) return false;
    if (segment !== '*' && segment !== eventTopics[i]) return false;
  }
  return topicFilter.length === eventTopics.length;
}

/**
 * In-memory stand-in for `rpc.Server` that follows the RPC `getEvents` rules:
 * a request uses either `startLedger`/`endLedger` (exclusive) or `cursor`,
 * topic filters are base64 XDR `string[][]` (max 5 per filter, 5 filters per
 * request), a full page returns the last event id as cursor and a short page
 * returns the end of the scanned range. Events are SDK 14 parsed events.
 */
class FakeRpcServer {
  latestLedger: number;
  getEventsDelayMs = 0;
  getEventsFailures = 0;
  latestLedgerError?: Error;
  getEventsRequests: any[] = [];
  latestLedgerCalls = 0;
  /** Simulate an RPC that leaves `cursor` out of getEvents responses. */
  omitCursor = false;
  /** Resolves getLatestLedger only when release() is called. */
  latestLedgerGate?: Promise<void>;
  inFlight = 0;
  maxInFlight = 0;
  private events: rpc.Api.EventResponse[] = [];
  private eventsPerLedger = new Map<number, number>();

  constructor(latestLedger: number) {
    this.latestLedger = latestLedger;
  }

  addEvent(
    contractId: string,
    ledger: number,
    type = 'transfer'
  ): rpc.Api.EventResponse {
    const index = this.eventsPerLedger.get(ledger) ?? 0;
    this.eventsPerLedger.set(ledger, index + 1);
    const event: rpc.Api.EventResponse = {
      id: eventId(ledger, index),
      type: 'contract',
      ledger,
      ledgerClosedAt: new Date(ledger * 5000).toISOString(),
      transactionIndex: 1,
      operationIndex: 0,
      inSuccessfulContractCall: true,
      txHash: pad(ledger, 32) + pad(index, 32),
      contractId: new Contract(contractId),
      topic: [xdr.ScVal.scvSymbol(type), xdr.ScVal.scvU32(index)],
      value: xdr.ScVal.scvU32(ledger),
    };
    const last = this.events[this.events.length - 1];
    this.events.push(event);
    if (last && last.id > event.id) {
      this.events.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    }
    return event;
  }

  async getLatestLedger() {
    this.latestLedgerCalls++;
    if (this.latestLedgerGate) await this.latestLedgerGate;
    if (this.latestLedgerError) throw this.latestLedgerError;
    return {
      id: 'ledger-hash',
      protocolVersion: 23,
      sequence: this.latestLedger,
    };
  }

  async getEvents(request: any) {
    this.getEventsRequests.push(structuredClone(request));
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      if (this.getEventsDelayMs > 0) {
        await new Promise(resolve =>
          setTimeout(resolve, this.getEventsDelayMs)
        );
      }
      if (this.getEventsFailures > 0) {
        this.getEventsFailures--;
        throw new Error('RPC unavailable');
      }
      return this.query(request);
    } finally {
      this.inFlight--;
    }
  }

  private query(request: any) {
    const hasCursor = request.cursor !== undefined;
    const hasRange =
      request.startLedger !== undefined || request.endLedger !== undefined;
    if (hasCursor === hasRange) {
      throw new Error('use either startLedger/endLedger or cursor');
    }
    const filters = request.filters ?? [];
    if (filters.length > 5) throw new Error('more than 5 filters');
    for (const filter of filters) {
      const topics = filter.topics ?? [];
      if (topics.length > 5) throw new Error('more than 5 topic filters');
      for (const topicFilter of topics) {
        if (!Array.isArray(topicFilter) || topicFilter.length < 1) {
          throw new Error('topic filter must be a list of segments');
        }
        for (const segment of topicFilter) {
          if (typeof segment !== 'string') {
            throw new Error('topic segment must be a string');
          }
          if (segment !== '*' && segment !== '**') {
            xdr.ScVal.fromXDR(segment, 'base64');
          }
        }
      }
    }

    let candidates = this.events.filter(e => e.ledger <= this.latestLedger);
    let scannedTo = this.latestLedger;
    if (hasCursor) {
      candidates = candidates.filter(e => e.id > request.cursor);
    } else {
      if (request.startLedger > this.latestLedger) {
        throw new Error('startLedger is after the latest ledger');
      }
      candidates = candidates.filter(e => e.ledger >= request.startLedger);
      if (request.endLedger !== undefined) {
        candidates = candidates.filter(e => e.ledger < request.endLedger);
        scannedTo = Math.min(scannedTo, request.endLedger - 1);
      }
    }
    candidates = candidates.filter(e => this.matches(e, filters));

    const limit = request.limit ?? 100;
    const page = candidates.slice(0, limit);
    return {
      events: page,
      cursor: this.omitCursor
        ? undefined
        : page.length === limit
          ? page[page.length - 1].id
          : endOfLedgerCursor(scannedTo),
      latestLedger: this.latestLedger,
      oldestLedger: 1,
      latestLedgerCloseTime: '0',
      oldestLedgerCloseTime: '0',
    };
  }

  private matches(event: rpc.Api.EventResponse, filters: any[]): boolean {
    if (filters.length === 0) return true;
    const eventTopics = event.topic.map(b64);
    const contractId = event.contractId?.toString();
    return filters.some(
      filter =>
        (!filter.type || filter.type === event.type) &&
        (!filter.contractIds || filter.contractIds.includes(contractId)) &&
        (!filter.topics ||
          filter.topics.length === 0 ||
          filter.topics.some((t: string[]) => topicMatches(eventTopics, t)))
    );
  }
}

function createMonitor(latestLedger = 100) {
  const monitor = new ContractEventMonitor('https://rpc.invalid');
  const server = new FakeRpcServer(latestLedger);
  (monitor as any).server = server;
  return { monitor, server };
}

function collector(contractId: string, eventTypes?: string[]) {
  const received: ContractEventDetail[] = [];
  const subscription: EventSubscription = {
    id: '',
    contractId,
    eventTypes,
    onEvent: event => received.push(event),
    onError: jest.fn(),
  };
  return { received, subscription };
}

const ledgersOf = (events: ContractEventDetail[]) => events.map(e => e.ledger);
const txHashesOf = (events: { txHash: string }[]) => events.map(e => e.txHash);

describe('ContractEventMonitor', () => {
  let monitor: ContractEventMonitor;
  let server: FakeRpcServer;

  beforeEach(() => {
    jest.useFakeTimers();
    ({ monitor, server } = createMonitor(100));
  });

  afterEach(() => {
    monitor.destroy();
    jest.useRealTimers();
  });

  describe('subscriptions', () => {
    it('delivers every event to two subscriptions on different contracts', async () => {
      const a = collector(CONTRACT_A);
      const b = collector(CONTRACT_B);
      // Start B half an interval later, so the two polls never run together.
      await monitor.subscribeToEvents(a.subscription);
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS / 2);
      await monitor.subscribeToEvents(b.subscription);

      const expectedA = [];
      const expectedB = [];
      // Events land in odd ledgers; each poll sees the next (empty) ledger
      // closed too.
      for (let ledger = 101; ledger <= 107; ledger += 2) {
        expectedA.push(server.addEvent(CONTRACT_A, ledger));
        expectedB.push(server.addEvent(CONTRACT_B, ledger));
        server.latestLedger = ledger + 1;
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      }
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      expect(txHashesOf(a.received)).toEqual(txHashesOf(expectedA));
      expect(txHashesOf(b.received)).toEqual(txHashesOf(expectedB));
      expect(a.received.every(e => e.contractId === CONTRACT_A)).toBe(true);
      expect(b.received.every(e => e.contractId === CONTRACT_B)).toBe(true);
    });

    it('starts streamEvents at the latest ledger, never at ledger 1', async () => {
      ({ monitor, server } = createMonitor(5000));
      const { subscription } = collector(CONTRACT_A);

      await monitor.streamEvents(subscription);
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      expect(server.latestLedgerCalls).toBe(1);
      expect(server.getEventsRequests[0]).toEqual(
        expect.objectContaining({ startLedger: 5000 })
      );
      expect(server.getEventsRequests.some(r => r.startLedger === 1)).toBe(
        false
      );
    });

    it('delivers events from the newest ledger', async () => {
      const { received, subscription } = collector(CONTRACT_A);
      await monitor.subscribeToEvents(subscription);

      server.latestLedger = 101;
      const first = server.addEvent(CONTRACT_A, 101);
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      expect(txHashesOf(received)).toEqual([first.txHash]);

      server.latestLedger = 102;
      const second = server.addEvent(CONTRACT_A, 102);
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      expect(txHashesOf(received)).toEqual([first.txHash, second.txHash]);
      expect(
        server.getEventsRequests.every(r => r.endLedger === undefined)
      ).toBe(true);
    });

    it('pages through full pages with the cursor and delivers every event', async () => {
      const { received, subscription } = collector(CONTRACT_A);
      await monitor.subscribeToEvents(subscription);

      // Learn the page size from the first (empty) poll.
      server.latestLedger = 101;
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      const limit = server.getEventsRequests[0].limit;
      expect(limit).toBeGreaterThan(0);

      server.latestLedger = 102;
      const expected = [];
      for (let i = 0; i < 2 * limit + 3; i++) {
        expected.push(server.addEvent(CONTRACT_A, 102));
      }
      server.getEventsRequests = [];
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      expect(received).toHaveLength(expected.length);
      expect(txHashesOf(received)).toEqual(txHashesOf(expected));
      expect(server.getEventsRequests).toHaveLength(3);
      expect(server.getEventsRequests[1].cursor).toBe(expected[limit - 1].id);
      expect(server.getEventsRequests[2].cursor).toBe(
        expected[2 * limit - 1].id
      );
      for (const request of server.getEventsRequests) {
        expect(request.startLedger).toBeUndefined();
        expect(request.endLedger).toBeUndefined();
        expect(request.limit).toBe(limit);
      }
    });

    it('first request uses startLedger, later ones only the cursor', async () => {
      const { subscription } = collector(CONTRACT_A);
      await monitor.subscribeToEvents(subscription);

      server.latestLedger = 101;
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      server.latestLedger = 102;
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      const [first, second] = server.getEventsRequests;
      expect(second.cursor).toBe(endOfLedgerCursor(101));
      expect(second.startLedger).toBeUndefined();
      expect(second.endLedger).toBeUndefined();
      expect(first.startLedger).toBe(100);
      expect(first.cursor).toBeUndefined();
    });

    it('never runs two polls at once when getEvents is slow', async () => {
      server.getEventsDelayMs = 12000;
      const { subscription } = collector(CONTRACT_A);
      await monitor.subscribeToEvents(subscription);
      server.latestLedger = 101;

      await jest.advanceTimersByTimeAsync(60000);

      expect(server.getEventsRequests.length).toBeGreaterThan(1);
      expect(server.maxInFlight).toBe(1);
    });

    it('keeps the cursor after a poll error and retries on the next poll', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const { received, subscription } = collector(CONTRACT_A);
      await monitor.subscribeToEvents(subscription);

      const first = server.addEvent(CONTRACT_A, 101);
      server.latestLedger = 102;
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      const second = server.addEvent(CONTRACT_A, 103);
      server.latestLedger = 104;
      server.getEventsFailures = 1;
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      expect(errorSpy).toHaveBeenCalledWith(
        'Error polling for events:',
        expect.any(Error)
      );
      expect(subscription.onError).not.toHaveBeenCalled();
      expect(txHashesOf(received)).toEqual([first.txHash]);

      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      const [, failed, retried] = server.getEventsRequests;
      expect(failed.cursor).toBe(endOfLedgerCursor(102));
      expect(retried.cursor).toBe(failed.cursor);
      expect(txHashesOf(received)).toEqual([first.txHash, second.txHash]);
    });

    it('keeps polling when an event handler throws', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const received: number[] = [];
      await monitor.subscribeToEvents({
        id: '',
        contractId: CONTRACT_A,
        onEvent: event => {
          received.push(event.ledger);
          if (event.ledger === 101) throw new Error('handler failed');
        },
      });

      server.addEvent(CONTRACT_A, 101);
      server.addEvent(CONTRACT_A, 101);
      server.latestLedger = 102;
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      server.addEvent(CONTRACT_A, 103);
      server.latestLedger = 104;
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      expect(received).toEqual([101, 101, 103]);
      expect(errorSpy).toHaveBeenCalledWith(
        'Error in event handler:',
        expect.any(Error)
      );
    });

    it('stops polling after unsubscribe', async () => {
      const { subscription } = collector(CONTRACT_A);
      const onClose = jest.fn();
      const id = await monitor.subscribeToEvents({ ...subscription, onClose });

      server.latestLedger = 101;
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      expect(server.getEventsRequests).toHaveLength(1);

      monitor.unsubscribe(id);
      await jest.advanceTimersByTimeAsync(6 * POLL_INTERVAL_MS);

      expect(server.getEventsRequests).toHaveLength(1);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(monitor.getSubscriptions()).toHaveLength(0);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('drops the result of a poll that was in flight during unsubscribe', async () => {
      server.getEventsDelayMs = 3000;
      const { received, subscription } = collector(CONTRACT_A);
      const id = await monitor.subscribeToEvents(subscription);
      server.addEvent(CONTRACT_A, 101);
      server.latestLedger = 102;

      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 1000);
      expect(server.inFlight).toBe(1);
      monitor.unsubscribe(id);
      await jest.advanceTimersByTimeAsync(6 * POLL_INTERVAL_MS);

      expect(received).toHaveLength(0);
      expect(server.getEventsRequests).toHaveLength(1);
      expect(jest.getTimerCount()).toBe(0);
    });

    it.each(['subscribeToEvents', 'streamEvents'] as const)(
      '%s leaves no subscription when getLatestLedger fails',
      async method => {
        const failure = new Error('RPC down');
        server.latestLedgerError = failure;
        const { subscription } = collector(CONTRACT_A);

        await expect(monitor[method](subscription)).rejects.toBe(failure);

        expect(subscription.onError).toHaveBeenCalledWith(failure);
        expect(monitor.getSubscriptions()).toHaveLength(0);
        expect(jest.getTimerCount()).toBe(0);
        await jest.advanceTimersByTimeAsync(2 * POLL_INTERVAL_MS);
        expect(server.getEventsRequests).toHaveLength(0);
      }
    );

    it('converts SDK events into ContractEventDetail', async () => {
      const { received, subscription } = collector(CONTRACT_A);
      await monitor.subscribeToEvents(subscription);
      const event = server.addEvent(CONTRACT_A, 101, 'mint');
      server.latestLedger = 102;

      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({
        contractId: CONTRACT_A,
        type: 'contract',
        topics: event.topic,
        data: event.value,
        timestamp: Date.parse(event.ledgerClosedAt),
        ledger: 101,
        txHash: event.txHash,
      });
      expect(typeof received[0].contractId).toBe('string');
      expect(received[0].topics[0].sym().toString()).toBe('mint');
    });
  });

  describe('topic filters', () => {
    const decodeFirstSegments = (filters: any[]) =>
      filters.map(filter =>
        filter.topics.map((topicFilter: string[]) => {
          expect(topicFilter).toHaveLength(2);
          expect(topicFilter[1]).toBe('**');
          return xdr.ScVal.fromXDR(topicFilter[0], 'base64').sym().toString();
        })
      );

    it('encodes event types as base64 Symbol XDR and chunks them by 5', async () => {
      const eventTypes = ['t0', 't1', 't2', 't3', 't4', 't5', 't6'];
      const { received, subscription } = collector(CONTRACT_A, eventTypes);
      await monitor.subscribeToEvents(subscription);
      server.addEvent(CONTRACT_A, 101, 't6');
      server.addEvent(CONTRACT_A, 101, 'other');
      server.addEvent(CONTRACT_A, 101, 't0');
      server.latestLedger = 102;

      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      const [{ filters }] = server.getEventsRequests;
      expect(filters).toHaveLength(2);
      for (const filter of filters) {
        expect(filter.type).toBe('contract');
        expect(filter.contractIds).toEqual([CONTRACT_A]);
      }
      expect(decodeFirstSegments(filters)).toEqual([
        ['t0', 't1', 't2', 't3', 't4'],
        ['t5', 't6'],
      ]);
      expect(received.map(e => e.topics[0].sym().toString())).toEqual([
        't6',
        't0',
      ]);
    });

    it('rejects more event types than one request can carry', async () => {
      const eventTypes = Array.from({ length: 26 }, (_, i) => `t${i}`);
      const { subscription } = collector(CONTRACT_A, eventTypes);

      await expect(monitor.subscribeToEvents(subscription)).rejects.toThrow(
        'Too many event topic filters'
      );

      expect(subscription.onError).toHaveBeenCalledTimes(1);
      expect(monitor.getSubscriptions()).toHaveLength(0);
      expect(server.latestLedgerCalls).toBe(0);
    });

    it('queryEvents sends event types and ScVal topics as base64 XDR', async () => {
      server.latestLedger = 30;
      const mint = server.addEvent(CONTRACT_A, 12, 'mint');
      server.addEvent(CONTRACT_A, 12, 'burn');
      const transfer = server.addEvent(CONTRACT_A, 15, 'transfer');
      server.addEvent(CONTRACT_A, 20, 'transfer');

      const events = await monitor.queryEvents({
        contractId: CONTRACT_A,
        startLedger: 10,
        endLedger: 20,
        eventTypes: ['transfer'],
        topics: [xdr.ScVal.scvSymbol('mint')],
        networkPassphrase: 'Test SDF Network ; September 2015',
      });

      expect(server.getEventsRequests).toHaveLength(1);
      const [request] = server.getEventsRequests;
      expect(request).toEqual(
        expect.objectContaining({ startLedger: 10, endLedger: 20 })
      );
      expect(request.filters).toEqual([
        {
          type: 'contract',
          contractIds: [CONTRACT_A],
          topics: [
            [b64(xdr.ScVal.scvSymbol('transfer')), '**'],
            [b64(xdr.ScVal.scvSymbol('mint')), '**'],
          ],
        },
      ]);
      expect(txHashesOf(events)).toEqual([mint.txHash, transfer.txHash]);
      expect(ledgersOf(events)).toEqual([12, 15]);
      expect(events.every(e => e.contractId === CONTRACT_A)).toBe(true);
    });

    it('queryEvents without types or topics filters by contract only', async () => {
      await monitor.queryEvents({
        contractId: CONTRACT_A,
        startLedger: 10,
        networkPassphrase: 'Test SDF Network ; September 2015',
      });

      expect(server.getEventsRequests[0].filters).toEqual([
        { type: 'contract', contractIds: [CONTRACT_A] },
      ]);
    });
  });

  describe('subscription lifecycle', () => {
    it('does not deliver events from the ledger that closed before subscribing', async () => {
      const { received, subscription } = collector(CONTRACT_A);
      server.addEvent(CONTRACT_A, 100);

      await monitor.subscribeToEvents(subscription);
      const fresh = server.addEvent(CONTRACT_A, 101);
      server.latestLedger = 101;
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      expect(server.getEventsRequests[0]).toEqual(
        expect.objectContaining({ startLedger: 100 })
      );
      expect(txHashesOf(received)).toEqual(txHashesOf([fresh]));
    });

    it('falls back to the last event id when the response has no cursor', async () => {
      server.omitCursor = true;
      const { received, subscription } = collector(CONTRACT_A);
      await monitor.subscribeToEvents(subscription);

      const first = server.addEvent(CONTRACT_A, 101);
      server.latestLedger = 101;
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      const second = server.addEvent(CONTRACT_A, 102);
      server.latestLedger = 102;
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      expect(txHashesOf(received)).toEqual(txHashesOf([first, second]));
      expect(server.getEventsRequests[1]).toEqual(
        expect.objectContaining({ cursor: first.id })
      );
    });

    it('rejects event types that are not Soroban symbols', async () => {
      const longAddress = 'G'.repeat(56);
      const { subscription } = collector(CONTRACT_A, ['transfer', longAddress]);

      await expect(monitor.subscribeToEvents(subscription)).rejects.toThrow(
        'is not a Soroban symbol'
      );
      expect(subscription.onError).toHaveBeenCalled();
      expect(monitor.getSubscriptions()).toHaveLength(0);
      expect(server.latestLedgerCalls).toBe(0);
    });

    it('does not start polling when destroy() runs while the subscription is starting', async () => {
      let release!: () => void;
      server.latestLedgerGate = new Promise<void>(resolve => {
        release = resolve;
      });
      const { subscription } = collector(CONTRACT_A);

      const started = monitor.subscribeToEvents(subscription);
      monitor.destroy();
      release();

      await expect(started).rejects.toThrow('destroyed');
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
      expect(monitor.getSubscriptions()).toHaveLength(0);
      expect(server.getEventsRequests).toHaveLength(0);
    });
  });
});
