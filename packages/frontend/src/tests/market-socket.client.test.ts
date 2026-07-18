import { MarketSocketClient, DEFAULT_MARKET_PAIRS } from '../services/market-socket.client';

class FakeSocket {
  handlers = new Map<string, (payload: unknown) => void>();
  emitted: { event: string; payload: unknown }[] = [];
  disconnected = false;

  on(event: string, handler: (payload: unknown) => void): void {
    this.handlers.set(event, handler);
  }

  emit(event: string, payload?: unknown): void {
    this.emitted.push({ event, payload });
  }

  disconnect(): void {
    this.disconnected = true;
  }

  fire(event: string, payload?: unknown): void {
    this.handlers.get(event)?.(payload);
  }
}

function priceEvent(pair: string, price: number) {
  return { type: 'market:price_update', data: { pair, price, volume: 1000, change24h: 2 } };
}

describe('MarketSocketClient', () => {
  it('subscribes to the configured pairs once connected', () => {
    const socket = new FakeSocket();
    const client = new MarketSocketClient({ pairs: ['BTC/USDC'], factory: () => socket });
    client.connect();
    socket.fire('connect');

    expect(socket.emitted).toContainEqual({ event: 'market:subscribe', payload: { pairs: ['BTC/USDC'] } });
  });

  it('normalizes price updates and forwards them to subscribers', () => {
    const socket = new FakeSocket();
    const client = new MarketSocketClient({ factory: () => socket });
    const received: unknown[] = [];
    client.subscribe((update) => received.push(update));
    client.connect();

    socket.fire('market:price_update', priceEvent('XLM/USDC', 0.12));

    expect(received).toEqual([{ pair: 'XLM/USDC', price: 0.12, volume: 1000, change24h: 2 }]);
  });

  it('defaults to the three known market pairs', () => {
    const socket = new FakeSocket();
    const client = new MarketSocketClient({ factory: () => socket });
    client.connect();
    socket.fire('connect');

    expect(socket.emitted[0]).toEqual({ event: 'market:subscribe', payload: { pairs: DEFAULT_MARKET_PAIRS } });
  });

  it('ignores malformed payloads', () => {
    const socket = new FakeSocket();
    const client = new MarketSocketClient({ factory: () => socket });
    const received: unknown[] = [];
    client.subscribe((update) => received.push(update));
    client.connect();

    socket.fire('market:price_update', { data: { price: 1 } });
    socket.fire('market:price_update', null);

    expect(received).toHaveLength(0);
  });

  it('stops forwarding after unsubscribe', () => {
    const socket = new FakeSocket();
    const client = new MarketSocketClient({ factory: () => socket });
    const received: unknown[] = [];
    const unsubscribe = client.subscribe((update) => received.push(update));
    client.connect();
    unsubscribe();

    socket.fire('market:price_update', priceEvent('XLM/USDC', 0.12));
    expect(received).toHaveLength(0);
  });

  it('connects only once even if called repeatedly', () => {
    let created = 0;
    const socket = new FakeSocket();
    const client = new MarketSocketClient({
      factory: () => {
        created += 1;
        return socket;
      },
    });
    client.connect();
    client.connect();
    expect(created).toBe(1);
  });

  it('disconnects the underlying socket and allows reconnecting', () => {
    const sockets: FakeSocket[] = [];
    const client = new MarketSocketClient({
      factory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    client.connect();
    client.disconnect();
    client.connect();

    expect(sockets).toHaveLength(2);
    expect(sockets[0].disconnected).toBe(true);
  });
});
