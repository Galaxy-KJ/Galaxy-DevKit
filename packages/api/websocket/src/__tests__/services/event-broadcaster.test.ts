import { EventEmitter } from 'events';
import { Server } from 'socket.io';
import { EventBroadcaster } from '../../services/event-broadcaster';
import { MarketPriceUpdateEvent } from '../../types/websocket-types';

function createServerStub(roomMembers: Set<string> = new Set()) {
  const adapter = new EventEmitter() as EventEmitter & { rooms: Map<string, Set<string>> };
  adapter.rooms = new Map();
  if (roomMembers.size > 0) {
    adapter.rooms.set('market:XLM_USDC', roomMembers);
  }

  const sockets = new Map<string, { userId?: string }>();
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];

  const server = {
    sockets: {
      adapter,
      sockets,
    },
    of: jest.fn(() => ({ adapter })),
    to: jest.fn((room: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ room, event, payload });
      },
    })),
    emit: jest.fn(),
  };

  return { server: server as unknown as Server, adapter, emitted, sockets };
}

const UPSTREAM = Date.parse('2026-08-16T12:00:00.000Z');

function priceEvent(): MarketPriceUpdateEvent {
  return {
    id: 'evt-1',
    timestamp: UPSTREAM,
    source: 'oracle-aggregator',
    type: 'market:price_update',
    data: {
      pair: 'XLM/USDC',
      price: 0.12,
      volume: 10,
      change24h: 1,
      source: 'oracle-aggregator',
      upstreamTimestamp: UPSTREAM,
    },
  };
}

describe('EventBroadcaster', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not start a queue timer until work is queued', () => {
    const { server } = createServerStub();
    const broadcaster = new EventBroadcaster(server);
    expect((broadcaster as unknown as { queueProcessingInterval: unknown }).queueProcessingInterval).toBeNull();
    broadcaster.destroy();
  });

  it('notifies listeners when a room gains and then loses subscribers', () => {
    const { server, adapter } = createServerStub();
    const broadcaster = new EventBroadcaster(server);
    const changes: Array<[string, number, number]> = [];
    const unsubscribe = broadcaster.onSubscriberCountChange((room, count, previous) => {
      changes.push([room, count, previous]);
    });

    adapter.rooms.set('market:XLM_USDC', new Set(['sock-1']));
    adapter.emit('join-room', 'market:XLM_USDC');
    expect(changes).toEqual([['market:XLM_USDC', 1, 0]]);
    expect(broadcaster.getRoomsWithSubscribers('market:')).toEqual(['market:XLM_USDC']);
    expect(broadcaster.getRoomConnectionCount('market:XLM_USDC')).toBe(1);

    adapter.rooms.set('market:XLM_USDC', new Set());
    adapter.emit('leave-room', 'market:XLM_USDC');
    expect(changes[1]).toEqual(['market:XLM_USDC', 0, 1]);
    expect(broadcaster.getRoomsWithSubscribers('market:')).toEqual([]);

    unsubscribe();
    adapter.rooms.set('market:XLM_USDC', new Set(['sock-2']));
    adapter.emit('join-room', 'market:XLM_USDC');
    expect(changes).toHaveLength(2);
    broadcaster.destroy();
  });

  it('preserves upstream source and timestamp on broadcast', async () => {
    const { server, emitted } = createServerStub(new Set(['sock-1']));
    const broadcaster = new EventBroadcaster(server);
    const event = priceEvent();

    await broadcaster.broadcastToRoom('market:XLM_USDC', event);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({
      room: 'market:XLM_USDC',
      event: 'market:price_update',
      payload: event,
    });
    broadcaster.destroy();
  });

  it('clears the queue interval on destroy so the process can exit', async () => {
    jest.useFakeTimers();
    const { server } = createServerStub();
    const broadcaster = new EventBroadcaster(server);
    await broadcaster.broadcastToRoom('market:XLM_USDC', priceEvent(), {
      retry: { maxAttempts: 1, delay: 0 },
    });
    expect((broadcaster as unknown as { queueProcessingInterval: unknown }).queueProcessingInterval).not.toBeNull();
    broadcaster.destroy();
    expect((broadcaster as unknown as { queueProcessingInterval: unknown }).queueProcessingInterval).toBeNull();
  });
});
