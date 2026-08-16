/**
 * Market Data Handler
 * 
 * This module handles market data subscriptions, price updates,
 * orderbook updates, and trade events for real-time market data.
 */

import { randomUUID } from 'crypto';
import { Server, Socket } from 'socket.io';
import {
  ExtendedSocket,
  MarketErrorEvent,
  MarketOrderbookUpdateEvent,
  MarketPriceUpdateEvent,
  MarketTradeEvent,
} from '../types/websocket-types';
import { RoomManager } from '../services/room-manager';
import { EventBroadcaster } from '../services/event-broadcaster';
import {
  createDefaultPriceAggregator,
  HORIZON_SOURCE,
  MarketDataSource,
  MarketOrderbookSnapshot,
  MarketPriceSnapshot,
  MarketTradeSnapshot,
  ORACLE_SOURCE,
  OracleHorizonMarketDataSource,
  PriceAggregatorPort,
  StellarNetwork,
  toOrderbookRoom,
  toTickerRoom,
} from '../services/market-data-source';

export interface MarketHandlerOptions {
  marketDataSource?: MarketDataSource;
  priceAggregator?: PriceAggregatorPort;
  horizonUrl?: string;
  network?: StellarNetwork;
  fetchImpl?: typeof fetch;
  maxStalenessMs?: number;
  pricePollIntervalMs?: number;
  orderbookPollIntervalMs?: number;
  tradePollIntervalMs?: number;
}

interface CachedPrice {
  snapshot: MarketPriceSnapshot;
}

type FeedKind = 'price' | 'orderbook' | 'trade';

/**
 * Market Data Handler Class
 */
export class MarketHandler {
  private server: Server;
  private roomManager: RoomManager;
  private eventBroadcaster: EventBroadcaster;
  private readonly maxStalenessMs: number;
  private readonly pricePollIntervalMs: number;
  private readonly orderbookPollIntervalMs: number;
  private readonly tradePollIntervalMs: number;
  private readonly horizonUrl: string;
  private readonly network: StellarNetwork;
  private readonly fetchImpl?: typeof fetch;
  private readonly injectedAggregator?: PriceAggregatorPort;
  private sourcePromise: Promise<MarketDataSource> | null = null;
  private source: MarketDataSource | null;
  private readonly priceCache = new Map<string, CachedPrice>();
  private readonly priceTimers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly orderbookTimers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly tradeTimers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly inFlight = new Set<string>();
  private unsubscribeSubscriberCounts: (() => void) | null = null;
  private shutDown = false;

  constructor(
    server: Server,
    roomManager: RoomManager,
    eventBroadcaster: EventBroadcaster,
    options: MarketHandlerOptions = {}
  ) {
    this.server = server;
    this.roomManager = roomManager;
    this.eventBroadcaster = eventBroadcaster;
    this.maxStalenessMs = options.maxStalenessMs ?? 60_000;
    this.pricePollIntervalMs = options.pricePollIntervalMs ?? 5_000;
    this.orderbookPollIntervalMs = options.orderbookPollIntervalMs ?? 2_000;
    this.tradePollIntervalMs = options.tradePollIntervalMs ?? 3_000;
    this.horizonUrl =
      options.horizonUrl ??
      process.env.STELLAR_HORIZON_URL ??
      'https://horizon-testnet.stellar.org';
    this.network = options.network ?? (process.env.STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet');
    this.fetchImpl = options.fetchImpl;
    this.injectedAggregator = options.priceAggregator;
    this.source = options.marketDataSource ?? null;
    this.setupMarketHandlers();
    this.unsubscribeSubscriberCounts = this.eventBroadcaster.onSubscriberCountChange(
      (roomName, count, previousCount) => {
        this.handleSubscriberCountChange(roomName, count, previousCount);
      }
    );
  }

  /**
   * Setup market event handlers
   */
  private setupMarketHandlers(): void {
    this.server.on('connection', (socket: Socket) => {
      this.setupSocketMarketHandlers(socket as ExtendedSocket);
    });
  }

  /**
   * Setup socket-specific market handlers
   * 
   * @param socket - Socket instance
   */
  private setupSocketMarketHandlers(socket: ExtendedSocket): void {
    // Handle market subscription
    socket.on('market:subscribe', async (data: { pairs: string[] }) => {
      await this.handleMarketSubscription(socket, data);
    });

    // Handle market unsubscription
    socket.on('market:unsubscribe', async (data: { pairs: string[] }) => {
      await this.handleMarketUnsubscription(socket, data);
    });

    // Handle market snapshot request
    socket.on('market:get_snapshot', async (data: { pair: string }) => {
      await this.handleMarketSnapshot(socket, data);
    });

    // Handle orderbook subscription
    socket.on('market:subscribe_orderbook', async (data: { pair: string }) => {
      await this.handleOrderbookSubscription(socket, data);
    });

    // Handle orderbook unsubscription
    socket.on('market:unsubscribe_orderbook', async (data: { pair: string }) => {
      await this.handleOrderbookUnsubscription(socket, data);
    });
  }

  /**
   * Handle market subscription
   * 
   * @param socket - Socket instance
   * @param data - Subscription data
   */
  private async handleMarketSubscription(
    socket: ExtendedSocket,
    data: { pairs: string[] }
  ): Promise<void> {
    try {
      if (!data.pairs || !Array.isArray(data.pairs)) {
        socket.emit('market:subscription_error', {
          error: 'Invalid pairs array',
          timestamp: Date.now(),
        });
        return;
      }

      const subscribedPairs: string[] = [];

      for (const pair of data.pairs) {
        const roomName = toTickerRoom(pair);
        try {
          await this.roomManager.joinRoom(socket, roomName);
          subscribedPairs.push(pair);
          this.eventBroadcaster.refreshRoomSubscriberCount(roomName);
          await this.syncTickerPolling(pair);
        } catch (error) {
          console.error(`Failed to subscribe to ${pair}:`, error);
        }
      }

      socket.emit('market:subscribed', {
        pairs: subscribedPairs,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`Market subscription failed for ${socket.id}:`, error);
      socket.emit('market:subscription_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle market unsubscription
   * 
   * @param socket - Socket instance
   * @param data - Unsubscription data
   */
  private async handleMarketUnsubscription(
    socket: ExtendedSocket,
    data: { pairs: string[] }
  ): Promise<void> {
    try {
      if (!data.pairs || !Array.isArray(data.pairs)) {
        socket.emit('market:unsubscription_error', {
          error: 'Invalid pairs array',
          timestamp: Date.now(),
        });
        return;
      }

      const unsubscribedPairs: string[] = [];

      for (const pair of data.pairs) {
        const roomName = toTickerRoom(pair);
        try {
          await this.roomManager.leaveRoom(socket, roomName);
          unsubscribedPairs.push(pair);
          this.eventBroadcaster.refreshRoomSubscriberCount(roomName);
          await this.syncTickerPolling(pair);
        } catch (error) {
          console.error(`Failed to unsubscribe from ${pair}:`, error);
        }
      }

      socket.emit('market:unsubscribed', {
        pairs: unsubscribedPairs,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`Market unsubscription failed for ${socket.id}:`, error);
      socket.emit('market:unsubscription_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle market snapshot request
   * 
   * @param socket - Socket instance
   * @param data - Snapshot data
   */
  private async handleMarketSnapshot(
    socket: ExtendedSocket,
    data: { pair: string }
  ): Promise<void> {
    try {
      if (!data.pair) {
        socket.emit('market:snapshot_error', {
          error: 'Pair is required',
          timestamp: Date.now(),
        });
        return;
      }

      const marketData = await this.getFreshPrice(data.pair);
      socket.emit('market:snapshot', {
        pair: data.pair,
        data: marketData,
        timestamp: marketData.upstreamTimestamp,
        source: marketData.source,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      socket.emit('market:snapshot_error', {
        error: message,
        timestamp: Date.now(),
      });
      await this.emitMarketError(data.pair, 'price', message, toTickerRoom(data.pair));
    }
  }

  /**
   * Handle orderbook subscription
   * 
   * @param socket - Socket instance
   * @param data - Subscription data
   */
  private async handleOrderbookSubscription(
    socket: ExtendedSocket,
    data: { pair: string }
  ): Promise<void> {
    try {
      if (!data.pair) {
        socket.emit('market:orderbook_subscription_error', {
          error: 'Pair is required',
          timestamp: Date.now(),
        });
        return;
      }

      const roomName = toOrderbookRoom(data.pair);
      await this.roomManager.joinRoom(socket, roomName);
      this.eventBroadcaster.refreshRoomSubscriberCount(roomName);
      await this.syncOrderbookPolling(data.pair);

      socket.emit('market:orderbook_subscribed', {
        pair: data.pair,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`Orderbook subscription failed for ${socket.id}:`, error);
      socket.emit('market:orderbook_subscription_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle orderbook unsubscription
   * 
   * @param socket - Socket instance
   * @param data - Unsubscription data
   */
  private async handleOrderbookUnsubscription(
    socket: ExtendedSocket,
    data: { pair: string }
  ): Promise<void> {
    try {
      if (!data.pair) {
        socket.emit('market:orderbook_unsubscription_error', {
          error: 'Pair is required',
          timestamp: Date.now(),
        });
        return;
      }

      const roomName = toOrderbookRoom(data.pair);
      await this.roomManager.leaveRoom(socket, roomName);
      this.eventBroadcaster.refreshRoomSubscriberCount(roomName);
      await this.syncOrderbookPolling(data.pair);

      socket.emit('market:orderbook_unsubscribed', {
        pair: data.pair,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`Orderbook unsubscription failed for ${socket.id}:`, error);
      socket.emit('market:orderbook_unsubscription_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  private handleSubscriberCountChange(
    roomName: string,
    count: number,
    _previousCount: number
  ): void {
    if (this.shutDown || !roomName.startsWith('market:') || count > 0) {
      return;
    }

    if (roomName.endsWith(':orderbook')) {
      const pair = this.pairFromOrderbookRoom(roomName);
      if (pair) {
        this.stopOrderbookPolling(pair);
      }
      return;
    }

    const pair = this.pairFromTickerRoom(roomName);
    if (pair) {
      this.stopTickerPolling(pair);
    }
  }

  private pairFromTickerRoom(roomName: string): string | null {
    if (!roomName.startsWith('market:') || roomName.endsWith(':orderbook')) {
      return null;
    }
    const encoded = roomName.slice('market:'.length);
    const separator = encoded.indexOf('_');
    return separator === -1 ? encoded : `${encoded.slice(0, separator)}/${encoded.slice(separator + 1)}`;
  }

  private pairFromOrderbookRoom(roomName: string): string | null {
    if (!roomName.startsWith('market:') || !roomName.endsWith(':orderbook')) {
      return null;
    }
    return this.pairFromTickerRoom(roomName.slice(0, -':orderbook'.length));
  }

  private async syncTickerPolling(pair: string, knownCount?: number): Promise<void> {
    const count = knownCount ?? this.eventBroadcaster.getRoomConnectionCount(toTickerRoom(pair));
    if (count > 0) {
      await this.startTickerPolling(pair);
      return;
    }
    this.stopTickerPolling(pair);
  }

  private async syncOrderbookPolling(pair: string, knownCount?: number): Promise<void> {
    const count = knownCount ?? this.eventBroadcaster.getRoomConnectionCount(toOrderbookRoom(pair));
    if (count > 0) {
      await this.startOrderbookPolling(pair);
      return;
    }
    this.stopOrderbookPolling(pair);
  }

  private async startTickerPolling(pair: string): Promise<void> {
    if (this.shutDown) {
      return;
    }

    const initial: Promise<void>[] = [];

    if (!this.priceTimers.has(pair)) {
      const handle = setInterval(() => {
        void this.pollPrice(pair);
      }, this.pricePollIntervalMs);
      this.priceTimers.set(pair, handle);
      initial.push(this.pollPrice(pair));
    }

    if (!this.tradeTimers.has(pair)) {
      const handle = setInterval(() => {
        void this.pollTrade(pair);
      }, this.tradePollIntervalMs);
      this.tradeTimers.set(pair, handle);
      initial.push(this.pollTrade(pair));
    }

    await Promise.all(initial);
  }

  private stopTickerPolling(pair: string): void {
    const priceHandle = this.priceTimers.get(pair);
    if (priceHandle) {
      clearInterval(priceHandle);
      this.priceTimers.delete(pair);
    }
    const tradeHandle = this.tradeTimers.get(pair);
    if (tradeHandle) {
      clearInterval(tradeHandle);
      this.tradeTimers.delete(pair);
    }
  }

  private async startOrderbookPolling(pair: string): Promise<void> {
    if (this.shutDown || this.orderbookTimers.has(pair)) {
      return;
    }
    const handle = setInterval(() => {
      void this.pollOrderbook(pair);
    }, this.orderbookPollIntervalMs);
    this.orderbookTimers.set(pair, handle);
    await this.pollOrderbook(pair);
  }

  private stopOrderbookPolling(pair: string): void {
    const handle = this.orderbookTimers.get(pair);
    if (handle) {
      clearInterval(handle);
      this.orderbookTimers.delete(pair);
    }
  }

  private async resolveSource(): Promise<MarketDataSource> {
    if (this.source) {
      return this.source;
    }
    if (!this.sourcePromise) {
      this.sourcePromise = this.createDefaultSource();
    }
    this.source = await this.sourcePromise;
    return this.source;
  }

  private async createDefaultSource(): Promise<MarketDataSource> {
    const aggregator = this.injectedAggregator ?? (await createDefaultPriceAggregator());
    return new OracleHorizonMarketDataSource(aggregator, {
      horizonUrl: this.horizonUrl,
      network: this.network,
      fetchImpl: this.fetchImpl,
    });
  }

  private isFresh(upstreamTimestamp: number, now = Date.now()): boolean {
    return now - upstreamTimestamp <= this.maxStalenessMs;
  }

  private async getFreshPrice(pair: string): Promise<MarketPriceSnapshot> {
    const cached = this.priceCache.get(pair);
    if (cached && this.isFresh(cached.snapshot.upstreamTimestamp)) {
      return cached.snapshot;
    }
    if (cached) {
      this.priceCache.delete(pair);
    }

    const source = await this.resolveSource();
    const snapshot = await source.getPrice(pair);
    if (!this.isFresh(snapshot.upstreamTimestamp)) {
      throw new Error(`Stale oracle price for ${pair}`);
    }
    this.priceCache.set(pair, { snapshot });
    return snapshot;
  }

  private async pollPrice(pair: string): Promise<void> {
    await this.runExclusive(`price:${pair}`, async () => {
      try {
        const snapshot = await this.getFreshPrice(pair);
        await this.broadcastPrice(snapshot);
      } catch (error) {
        await this.emitMarketError(
          pair,
          'price',
          error instanceof Error ? error.message : 'Unknown error',
          toTickerRoom(pair)
        );
      }
    });
  }

  private async pollOrderbook(pair: string): Promise<void> {
    await this.runExclusive(`orderbook:${pair}`, async () => {
      try {
        const source = await this.resolveSource();
        const snapshot = await source.getOrderbook(pair);
        await this.broadcastOrderbook(snapshot);
      } catch (error) {
        await this.emitMarketError(
          pair,
          'orderbook',
          error instanceof Error ? error.message : 'Unknown error',
          toOrderbookRoom(pair)
        );
      }
    });
  }

  private async pollTrade(pair: string): Promise<void> {
    await this.runExclusive(`trade:${pair}`, async () => {
      try {
        const source = await this.resolveSource();
        const snapshot = await source.getLatestTrade(pair);
        await this.broadcastTrade(snapshot);
      } catch (error) {
        await this.emitMarketError(
          pair,
          'trade',
          error instanceof Error ? error.message : 'Unknown error',
          toTickerRoom(pair)
        );
      }
    });
  }

  private async runExclusive(key: string, work: () => Promise<void>): Promise<void> {
    if (this.shutDown || this.inFlight.has(key)) {
      return;
    }
    this.inFlight.add(key);
    try {
      await work();
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async broadcastPrice(snapshot: MarketPriceSnapshot): Promise<void> {
    const event: MarketPriceUpdateEvent = {
      id: randomUUID(),
      timestamp: snapshot.upstreamTimestamp,
      source: snapshot.source,
      type: 'market:price_update',
      data: {
        pair: snapshot.pair,
        price: snapshot.price,
        volume: snapshot.volume,
        change24h: snapshot.change24h,
        marketCap: snapshot.marketCap,
        source: snapshot.source,
        sourcesUsed: snapshot.sourcesUsed,
        upstreamTimestamp: snapshot.upstreamTimestamp,
      },
    };
    await this.eventBroadcaster.broadcastToRoom(toTickerRoom(snapshot.pair), event, {
      includeSource: false,
      includeTimestamp: false,
    });
  }

  private async broadcastOrderbook(snapshot: MarketOrderbookSnapshot): Promise<void> {
    const event: MarketOrderbookUpdateEvent = {
      id: randomUUID(),
      timestamp: snapshot.upstreamTimestamp,
      source: snapshot.source,
      type: 'market:orderbook_update',
      data: {
        pair: snapshot.pair,
        bids: snapshot.bids,
        asks: snapshot.asks,
        depth: snapshot.depth,
        source: snapshot.source,
        upstreamTimestamp: snapshot.upstreamTimestamp,
      },
    };
    await this.eventBroadcaster.broadcastToRoom(toOrderbookRoom(snapshot.pair), event, {
      includeSource: false,
      includeTimestamp: false,
    });
  }

  private async broadcastTrade(snapshot: MarketTradeSnapshot): Promise<void> {
    const event: MarketTradeEvent = {
      id: randomUUID(),
      timestamp: snapshot.upstreamTimestamp,
      source: snapshot.source,
      type: 'market:trade',
      data: {
        pair: snapshot.pair,
        price: snapshot.price,
        volume: snapshot.volume,
        side: snapshot.side,
        tradeTimestamp: snapshot.tradeTimestamp,
        source: snapshot.source,
        upstreamTimestamp: snapshot.upstreamTimestamp,
      },
    };
    await this.eventBroadcaster.broadcastToRoom(toTickerRoom(snapshot.pair), event, {
      includeSource: false,
      includeTimestamp: false,
    });
  }

  private async emitMarketError(
    pair: string,
    channel: FeedKind,
    error: string,
    roomName: string
  ): Promise<void> {
    const event: MarketErrorEvent = {
      id: randomUUID(),
      timestamp: Date.now(),
      source: channel === 'price' ? ORACLE_SOURCE : HORIZON_SOURCE,
      type: 'market:error',
      data: {
        pair,
        channel,
        error,
        code: 'UPSTREAM_UNAVAILABLE',
      },
    };
    await this.eventBroadcaster.broadcastToRoom(roomName, event, {
      includeSource: false,
      includeTimestamp: false,
    });
  }

  /**
   * Get subscribed pairs
   * 
   * @returns string[] - Array of subscribed pairs
   */
  public getSubscribedPairs(): string[] {
    return Array.from(this.priceTimers.keys());
  }

  /**
   * Get market data cache
   * 
   * @returns Map<string, any> - Market data cache
   */
  public getMarketDataCache(): Map<string, MarketPriceSnapshot> {
    const fresh = new Map<string, MarketPriceSnapshot>();
    for (const [pair, cached] of this.priceCache) {
      if (this.isFresh(cached.snapshot.upstreamTimestamp)) {
        fresh.set(pair, cached.snapshot);
      }
    }
    return fresh;
  }

  /**
   * Clear market data cache
   */
  public clearMarketDataCache(): void {
    this.priceCache.clear();
  }

  public shutdown(): void {
    this.shutDown = true;
    for (const pair of Array.from(this.priceTimers.keys())) {
      this.stopTickerPolling(pair);
    }
    for (const pair of Array.from(this.orderbookTimers.keys())) {
      this.stopOrderbookPolling(pair);
    }
    this.priceTimers.clear();
    this.orderbookTimers.clear();
    this.tradeTimers.clear();
    this.inFlight.clear();
    this.unsubscribeSubscriberCounts?.();
    this.unsubscribeSubscriberCounts = null;
  }
}
