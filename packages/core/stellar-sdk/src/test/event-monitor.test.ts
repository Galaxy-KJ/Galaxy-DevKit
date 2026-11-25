/**
 * @fileoverview Unit tests for ContractEventMonitor polling cursors
 */

import { nativeToScVal } from '@stellar/stellar-sdk';
import { ContractEventMonitor } from '../soroban/utils/event-monitor.js';

interface FakeEvent {
  id: string;
  ledger: number;
  contractId: string;
  type: string;
}

/** In-memory RPC that honours startLedger, cursor and limit. */
function createFakeRpc(latestLedger = 100) {
  const log: FakeEvent[] = [];
  const rpc = {
    latestLedger,
    calls: [] as any[],
    emit(contractId: string, count = 1) {
      for (let i = 0; i < count; i++) {
        rpc.latestLedger += 1;
        log.push({
          id: String(log.length + 1).padStart(10, '0'),
          ledger: rpc.latestLedger,
          contractId,
          type: 'contract',
        });
      }
    },
    getLatestLedger: jest.fn(async () => ({ sequence: rpc.latestLedger })),
    getEvents: jest.fn(async (req: any) => {
      rpc.calls.push(req);
      if (req.startLedger !== undefined && req.startLedger < 50) {
        throw new Error('startLedger must be within the ledger range');
      }
      const contracts: string[] = req.filters[0].contractIds;
      const after = req.cursor
        ? log.filter(e => e.id > req.cursor)
        : log.filter(e => e.ledger >= req.startLedger);
      const page: FakeEvent[] = [];
      let scanned: FakeEvent | undefined;
      for (const e of after) {
        if (page.length >= req.limit) break;
        scanned = e;
        if (contracts.includes(e.contractId)) page.push(e);
      }
      const last = log[log.length - 1];
      const cursor = scanned?.id ?? req.cursor ?? last?.id ?? '0000000000';
      return {
        events: page.map(e => ({ ...e, topics: [] })),
        latestLedger: rpc.latestLedger,
        cursor,
      };
    }),
  };
  return rpc;
}

function createMonitor(rpc: ReturnType<typeof createFakeRpc>) {
  const monitor = new ContractEventMonitor('https://rpc.example.invalid');
  (monitor as any).server = rpc;
  return monitor;
}

describe('ContractEventMonitor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('delivers all events to two subscriptions on different contracts', async () => {
    const rpc = createFakeRpc();
    const monitor = createMonitor(rpc);
    const seenA: string[] = [];
    const seenB: string[] = [];

    await monitor.subscribeToEvents({
      id: '',
      contractId: 'CONTRACT_A',
      onEvent: e => seenA.push(e.id as string),
    });
    await monitor.subscribeToEvents({
      id: '',
      contractId: 'CONTRACT_B',
      onEvent: e => seenB.push(e.id as string),
    });

    for (let round = 0; round < 3; round++) {
      rpc.emit('CONTRACT_A', 2);
      rpc.emit('CONTRACT_B', 3);
      await jest.advanceTimersByTimeAsync(5000);
    }

    expect(seenA).toHaveLength(6);
    expect(seenB).toHaveLength(9);
    expect(new Set(seenA).size).toBe(6);
    expect(new Set(seenB).size).toBe(9);
    monitor.destroy();
  });

  it('starts streamEvents at the latest ledger, not ledger 1', async () => {
    const rpc = createFakeRpc(500);
    const monitor = createMonitor(rpc);
    const onError = jest.fn();

    await monitor.streamEvents({
      id: '',
      contractId: 'CONTRACT_A',
      onEvent: () => undefined,
      onError,
    });
    await jest.advanceTimersByTimeAsync(5000);

    const firstCall = rpc.calls[0];
    expect(firstCall.startLedger).toBe(500);
    expect(rpc.calls.some(c => c.startLedger === 1)).toBe(false);
    expect(onError).not.toHaveBeenCalled();
    monitor.destroy();
  });

  it('uses a caller-supplied startLedger', async () => {
    const rpc = createFakeRpc(500);
    const monitor = createMonitor(rpc);

    await monitor.streamEvents({
      id: '',
      contractId: 'CONTRACT_A',
      startLedger: 420,
      onEvent: () => undefined,
    });
    await jest.advanceTimersByTimeAsync(5000);

    expect(rpc.calls[0].startLedger).toBe(420);
    expect(rpc.getLatestLedger).not.toHaveBeenCalled();
    monitor.destroy();
  });

  it('pages through more events than one response holds', async () => {
    const rpc = createFakeRpc();
    const monitor = createMonitor(rpc);
    const seen: string[] = [];

    await monitor.subscribeToEvents({
      id: '',
      contractId: 'CONTRACT_A',
      onEvent: e => seen.push(e.id as string),
    });
    rpc.emit('CONTRACT_A', 2500);
    await jest.advanceTimersByTimeAsync(5000);

    expect(seen).toHaveLength(2500);
    expect(new Set(seen).size).toBe(2500);
    expect(rpc.calls.filter(c => c.cursor).length).toBeGreaterThanOrEqual(2);
    monitor.destroy();
  });

  it('does not start a new poll while the previous one is running', async () => {
    const rpc = createFakeRpc();
    const monitor = createMonitor(rpc);
    let inFlight = 0;
    let maxInFlight = 0;
    const original = rpc.getEvents.getMockImplementation()!;
    rpc.getEvents.mockImplementation(async (req: any) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 12000));
      inFlight -= 1;
      return original(req);
    });

    await monitor.subscribeToEvents({
      id: '',
      contractId: 'CONTRACT_A',
      onEvent: () => undefined,
    });
    await jest.advanceTimersByTimeAsync(60000);

    expect(rpc.getEvents).toHaveBeenCalled();
    expect(maxInFlight).toBe(1);
    monitor.destroy();
  });

  it('keeps polling when onError throws', async () => {
    const rpc = createFakeRpc();
    const monitor = createMonitor(rpc);
    const original = rpc.getEvents.getMockImplementation()!;
    rpc.getEvents.mockImplementationOnce(async () => {
      throw new Error('rpc down');
    });
    rpc.getEvents.mockImplementation(original);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen: string[] = [];

    await monitor.subscribeToEvents({
      id: '',
      contractId: 'CONTRACT_A',
      onEvent: e => seen.push(e.id as string),
      onError: () => {
        throw new Error('callback failed');
      },
    });
    await jest.advanceTimersByTimeAsync(5000);
    rpc.emit('CONTRACT_A', 2);
    await jest.advanceTimersByTimeAsync(5000);

    expect(seen).toHaveLength(2);
    monitor.destroy();
  });

  it('does not register a subscription that was pending during destroy()', async () => {
    const rpc = createFakeRpc();
    const monitor = createMonitor(rpc);
    let releaseLedger: () => void = () => undefined;
    rpc.getLatestLedger.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releaseLedger = () => resolve({ sequence: rpc.latestLedger });
        })
    );
    const onEvent = jest.fn();
    const onError = jest.fn();

    const pending = monitor.subscribeToEvents({
      id: '',
      contractId: 'CONTRACT_A',
      onEvent,
      onError,
    });
    monitor.destroy();
    releaseLedger();

    await expect(pending).rejects.toThrow('destroyed');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(monitor.getSubscriptions()).toHaveLength(0);
    rpc.emit('CONTRACT_A', 2);
    await jest.advanceTimersByTimeAsync(15000);
    expect(rpc.getEvents).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('encodes event type filters as base64 XDR topic segments', async () => {
    const rpc = createFakeRpc();
    const monitor = createMonitor(rpc);

    await monitor.subscribeToEvents({
      id: '',
      contractId: 'CONTRACT_A',
      eventTypes: ['transfer'],
      onEvent: () => undefined,
    });
    await jest.advanceTimersByTimeAsync(5000);

    const expected = nativeToScVal('transfer', { type: 'symbol' }).toXDR('base64');
    expect(rpc.calls[0].filters[0].topics).toEqual([[expected, '**']]);
    monitor.destroy();
  });
});
