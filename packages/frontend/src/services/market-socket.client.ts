import { io } from 'socket.io-client';

export interface PriceUpdate {
  pair: string;
  price: number;
  volume?: number;
  change24h?: number;
}

export interface MarketSocketLike {
  on(event: string, handler: (payload: unknown) => void): void;
  emit(event: string, payload?: unknown): void;
  disconnect(): void;
}

export interface MarketSocketOptions {
  url?: string;
  pairs?: string[];
  factory?: (url: string) => MarketSocketLike;
}

export const DEFAULT_MARKET_PAIRS = ['BTC/USDC', 'ETH/USDC', 'XLM/USDC'];

type Listener = (update: PriceUpdate) => void;

function toUpdate(payload: unknown): PriceUpdate | null {
  const data = (payload as { data?: unknown })?.data ?? payload;
  const record = data as Partial<PriceUpdate> | null | undefined;
  if (!record || typeof record.pair !== 'string') return null;
  return {
    pair: record.pair,
    price: Number(record.price),
    volume: record.volume,
    change24h: record.change24h,
  };
}

export class MarketSocketClient {
  private socket: MarketSocketLike | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly url: string;
  private readonly pairs: string[];
  private readonly factory: (url: string) => MarketSocketLike;

  constructor(options: MarketSocketOptions = {}) {
    this.url = options.url ?? '/';
    this.pairs = options.pairs ?? DEFAULT_MARKET_PAIRS;
    this.factory = options.factory ?? ((url) => io(url) as unknown as MarketSocketLike);
  }

  connect(): void {
    if (this.socket) return;
    const socket = this.factory(this.url);
    this.socket = socket;
    socket.on('connect', () => socket.emit('market:subscribe', { pairs: this.pairs }));
    socket.on('market:price_update', (payload) => this.dispatch(payload));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  private dispatch(payload: unknown): void {
    const update = toUpdate(payload);
    if (!update) return;
    this.listeners.forEach((listener) => listener(update));
  }
}
