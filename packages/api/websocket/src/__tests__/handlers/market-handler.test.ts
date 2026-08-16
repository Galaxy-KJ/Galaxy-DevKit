import { readFileSync } from 'fs';
import path from 'path';
import { Server } from 'socket.io';
import { EventBroadcaster } from '../../services/event-broadcaster';
import { MarketDataSource } from '../../services/market-data-source';
import { MarketHandler } from '../../handlers/market-handler';

const PAIR = 'XLM/USDC';
const TICKER_ROOM = 'market:XLM_USDC';
const ORDERBOOK_ROOM = 'market:XLM_USDC:orderbook';
const UPSTREAM = Date.parse('2026-08-16T12:00:00.000Z');

interface MockSocket {
  id: string;
  handlers: Record<string, (data: never) => Promise<void> | void>;
  emit: jest.Mock;
  on: jest.Mock;
}

function createMockSocket(id: string): MockSocket {
  const handlers: MockSocket['handlers'] = {};
  return {
    id,
    handlers,
    emit: jest.fn(),
    on: jest.fn((event: string, cb: (data: never) => Promise<void> | void) => {
      handlers[event] = cb;
    }),
  };
}

function createSource(overrides: Partial<jest.Mocked<MarketDataSource>> = {}): jest.Mocked<MarketDataSource> {
  return {
    getPrice: jest.fn().mockResolvedValue({
      pair: PAIR,
      price: 0.12,
      volume: 1500,
      change24h: 2.5,
      marketCap: 9000,
      source: 'oracle-aggregator',
      sourcesUsed: ['coingecko'],
      upstreamTimestamp: UPSTREAM,
    }),
    getOrderbook: jest.fn().mockResolvedValue({
      pair: PAIR,
      bids: [[0.11, 10]],
      asks: [[0.13, 8]],
      depth: 1,
      source: 'horizon',
      upstreamTimestamp: UPSTREAM,
    }),
    getLatestTrade: jest.fn().mockResolvedValue({
      pair: PAIR,
      price: 0.12,
      volume: 5,
      side: 'buy',
      tradeTimestamp: UPSTREAM,
      source: 'horizon',
      upstreamTimestamp: UPSTREAM,
    }),
    ...overrides,
  };
}

interface TestContext {
  handler: MarketHandler;
  broadcaster: EventBroadcaster;
  source: jest.Mocked<MarketDataSource>;
  rooms: Map<string, Set<string>>;
  emitted: Array<{ room: string; event: string; payload: Record<string, unknown> }>;
  connect: (id?: string) => MockSocket;
}

function createContext(source: jest.Mocked<MarketDataSource> = createSource()): TestContext {
  const rooms = new Map<string, Set<string>>();
  const sockets = new Map<string, MockSocket>();
  const emitted: TestContext['emitted'] = [];
  let onConnection: ((socket: MockSocket) => void) | undefined;

  const adapter = {
    rooms,
    on: jest.fn(),
    off: jest.fn(),
  };

  const server = {
    on: jest.fn((event: string, cb: (socket: MockSocket) => void) => {
      if (event === 'connection') {
        onConnection = cb;
      }
    }),
    sockets: { adapter, sockets },
    of: jest.fn(() => ({ adapter })),
    to: jest.fn((room: string) => ({
      emit: (event: string, payload: Record<string, unknown>) => {
        emitted.push({ room, event, payload });
      },
    })),
  };

  const roomManager = {
    joinRoom: jest.fn(async (socket: MockSocket, room: string) => {
      if (!rooms.has(room)) {
        rooms.set(room, new Set());
      }
      rooms.get(room)!.add(socket.id);
      sockets.set(socket.id, socket);
    }),
    leaveRoom: jest.fn(async (socket: MockSocket, room: string) => {
      rooms.get(room)?.delete(socket.id);
    }),
  };

  const broadcaster = new EventBroadcaster(server as unknown as Server);
  const handler = new MarketHandler(
    server as unknown as Server,
    roomManager as never,
    broadcaster,
    {
      marketDataSource: source,
      maxStalenessMs: 60_000,
      pricePollIntervalMs: 5_000,
      orderbookPollIntervalMs: 2_000,
      tradePollIntervalMs: 3_000,
    }
  );

  return {
    handler,
    broadcaster,
    source,
    rooms,
    emitted,
    connect: (id = 'sock-1') => {
      const socket = createMockSocket(id);
      onConnection?.(socket);
      return socket;
    },
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('MarketHandler', () => {
  let ctx: TestContext;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(UPSTREAM);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    ctx?.handler.shutdown();
    ctx?.broadcaster.destroy();
    jest.useRealTimers();
  });

  it('contains no Math.random in the market data path', () => {
    const source = readFileSync(
      path.join(__dirname, '../../handlers/market-handler.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/Math\.random/);
  });

  it('does not poll until a subscriber joins', async () => {
    ctx = createContext();
    jest.advanceTimersByTime(30_000);
    await flush();
    expect(ctx.source.getPrice).not.toHaveBeenCalled();
    expect(ctx.source.getOrderbook).not.toHaveBeenCalled();
    expect(ctx.source.getLatestTrade).not.toHaveBeenCalled();
    expect(ctx.handler.getSubscribedPairs()).toEqual([]);
  });

  it('broadcasts the oracle aggregator price and timestamp for a subscribed pair', async () => {
    ctx = createContext();
    const socket = ctx.connect();
    await socket.handlers['market:subscribe']({ pairs: [PAIR] } as never);
    await flush();

    const priceUpdate = ctx.emitted.find((item) => item.event === 'market:price_update');
    expect(priceUpdate).toBeDefined();
    expect(priceUpdate!.room).toBe(TICKER_ROOM);
    expect(priceUpdate!.payload).toMatchObject({
      timestamp: UPSTREAM,
      source: 'oracle-aggregator',
      type: 'market:price_update',
      data: {
        pair: PAIR,
        price: 0.12,
        volume: 1500,
        change24h: 2.5,
        marketCap: 9000,
        source: 'oracle-aggregator',
        sourcesUsed: ['coingecko'],
        upstreamTimestamp: UPSTREAM,
      },
    });
    expect(ctx.source.getPrice).toHaveBeenCalledWith(PAIR);
    expect(socket.emit).toHaveBeenCalledWith(
      'market:subscribed',
      expect.objectContaining({ pairs: [PAIR] })
    );
  });

  it('broadcasts Horizon orderbook tuples from the mocked upstream', async () => {
    ctx = createContext();
    const socket = ctx.connect();
    await socket.handlers['market:subscribe_orderbook']({ pair: PAIR } as never);
    await flush();

    const update = ctx.emitted.find((item) => item.event === 'market:orderbook_update');
    expect(update).toEqual(
      expect.objectContaining({
        room: ORDERBOOK_ROOM,
        event: 'market:orderbook_update',
        payload: expect.objectContaining({
          source: 'horizon',
          timestamp: UPSTREAM,
          data: {
            pair: PAIR,
            bids: [[0.11, 10]],
            asks: [[0.13, 8]],
            depth: 1,
            source: 'horizon',
            upstreamTimestamp: UPSTREAM,
          },
        }),
      })
    );
  });

  it('broadcasts Horizon trade fields from the mocked upstream', async () => {
    ctx = createContext();
    const socket = ctx.connect();
    await socket.handlers['market:subscribe']({ pairs: [PAIR] } as never);
    await flush();

    const trade = ctx.emitted.find((item) => item.event === 'market:trade');
    expect(trade?.payload).toMatchObject({
      source: 'horizon',
      timestamp: UPSTREAM,
      data: {
        pair: PAIR,
        price: 0.12,
        volume: 5,
        side: 'buy',
        tradeTimestamp: UPSTREAM,
        source: 'horizon',
        upstreamTimestamp: UPSTREAM,
      },
    });
  });

  it('emits market:error when the oracle has no data instead of fabricating a price', async () => {
    ctx = createContext(
      createSource({
        getPrice: jest.fn().mockRejectedValue(new Error('Insufficient sources for DOGE/USDC')),
      })
    );
    const socket = ctx.connect();
    await socket.handlers['market:subscribe']({ pairs: ['DOGE/USDC'] } as never);
    await flush();

    expect(ctx.emitted.some((item) => item.event === 'market:price_update')).toBe(false);
    const errorEvent = ctx.emitted.find((item) => item.event === 'market:error');
    expect(errorEvent?.payload).toMatchObject({
      type: 'market:error',
      data: {
        pair: 'DOGE/USDC',
        channel: 'price',
        error: 'Insufficient sources for DOGE/USDC',
        code: 'UPSTREAM_UNAVAILABLE',
      },
    });
  });

  it('does not serve a cached price past the staleness threshold', async () => {
    ctx = createContext();
    const socket = ctx.connect();
    await socket.handlers['market:get_snapshot']({ pair: PAIR } as never);
    await flush();
    expect(ctx.source.getPrice).toHaveBeenCalledTimes(1);

    jest.setSystemTime(UPSTREAM + 61_000);
    ctx.emitted.length = 0;
    await socket.handlers['market:get_snapshot']({ pair: PAIR } as never);
    await flush();

    expect(ctx.source.getPrice).toHaveBeenCalledTimes(2);
    expect(socket.emit).toHaveBeenCalledWith(
      'market:snapshot_error',
      expect.objectContaining({ error: `Stale oracle price for ${PAIR}` })
    );
    expect(ctx.handler.getMarketDataCache().has(PAIR)).toBe(false);
  });

  it('stops polling when the last subscriber leaves and clears timers on shutdown', async () => {
    ctx = createContext();
    const socket = ctx.connect();
    await socket.handlers['market:subscribe']({ pairs: [PAIR] } as never);
    await flush();
    expect(ctx.handler.getSubscribedPairs()).toEqual([PAIR]);
    expect(ctx.source.getPrice).toHaveBeenCalled();

    ctx.source.getPrice.mockClear();
    await socket.handlers['market:unsubscribe']({ pairs: [PAIR] } as never);
    await flush();
    expect(ctx.handler.getSubscribedPairs()).toEqual([]);

    jest.advanceTimersByTime(30_000);
    await flush();
    expect(ctx.source.getPrice).not.toHaveBeenCalled();

    await socket.handlers['market:subscribe']({ pairs: [PAIR] } as never);
    await flush();
    ctx.source.getPrice.mockClear();
    ctx.handler.shutdown();
    jest.advanceTimersByTime(30_000);
    await flush();
    expect(ctx.source.getPrice).not.toHaveBeenCalled();
    expect(ctx.handler.getSubscribedPairs()).toEqual([]);
  });
});
