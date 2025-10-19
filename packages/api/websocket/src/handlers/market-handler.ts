/**
 * Market Data Handler
 * 
 * This module handles market data subscriptions, price updates,
 * orderbook updates, and trade events for real-time market data.
 */

import { Server, Socket } from 'socket.io';
import { ExtendedSocket, MarketPriceUpdateEvent, MarketOrderbookUpdateEvent, MarketTradeEvent } from '../types/websocket-types';
import { RoomManager } from '../services/room-manager';
import { EventBroadcaster } from '../services/event-broadcaster';
import { requireAuth } from '../middleware/auth';

/**
 * Market Data Handler Class
 */
export class MarketHandler {
  private server: Server;
  private roomManager: RoomManager;
  private eventBroadcaster: EventBroadcaster;
  private subscribedPairs = new Set<string>();
  private marketDataCache = new Map<string, any>();

  constructor(server: Server, roomManager: RoomManager, eventBroadcaster: EventBroadcaster) {
    this.server = server;
    this.roomManager = roomManager;
    this.eventBroadcaster = eventBroadcaster;
    this.setupMarketHandlers();
    this.startMarketDataSimulation();
  }

  /**
   * Setup market event handlers
   */
  private setupMarketHandlers(): void {
    this.server.on('connection', (socket: Socket) => {
      const extendedSocket = socket as ExtendedSocket;
      this.setupSocketMarketHandlers(extendedSocket);
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
  private async handleMarketSubscription(socket: ExtendedSocket, data: { pairs: string[] }): Promise<void> {
    try {
      if (!data.pairs || !Array.isArray(data.pairs)) {
        socket.emit('market:subscription_error', {
          error: 'Invalid pairs array',
          timestamp: Date.now()
        });
        return;
      }

      const subscribedPairs: string[] = [];

      for (const pair of data.pairs) {
        const roomName = `market:${pair.replace('/', '_')}`;
        
        try {
          await this.roomManager.joinRoom(socket, roomName);
          subscribedPairs.push(pair);
          this.subscribedPairs.add(pair);
        } catch (error) {
          console.error(`Failed to subscribe to ${pair}:`, error);
        }
      }

      socket.emit('market:subscribed', {
        pairs: subscribedPairs,
        timestamp: Date.now()
      });

      console.log(`Socket ${socket.id} subscribed to market pairs: ${subscribedPairs.join(', ')}`);

    } catch (error) {
      console.error(`Market subscription failed for ${socket.id}:`, error);
      socket.emit('market:subscription_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle market unsubscription
   * 
   * @param socket - Socket instance
   * @param data - Unsubscription data
   */
  private async handleMarketUnsubscription(socket: ExtendedSocket, data: { pairs: string[] }): Promise<void> {
    try {
      if (!data.pairs || !Array.isArray(data.pairs)) {
        socket.emit('market:unsubscription_error', {
          error: 'Invalid pairs array',
          timestamp: Date.now()
        });
        return;
      }

      const unsubscribedPairs: string[] = [];

      for (const pair of data.pairs) {
        const roomName = `market:${pair.replace('/', '_')}`;
        
        try {
          await this.roomManager.leaveRoom(socket, roomName);
          unsubscribedPairs.push(pair);
        } catch (error) {
          console.error(`Failed to unsubscribe from ${pair}:`, error);
        }
      }

      socket.emit('market:unsubscribed', {
        pairs: unsubscribedPairs,
        timestamp: Date.now()
      });

      console.log(`Socket ${socket.id} unsubscribed from market pairs: ${unsubscribedPairs.join(', ')}`);

    } catch (error) {
      console.error(`Market unsubscription failed for ${socket.id}:`, error);
      socket.emit('market:unsubscription_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle market snapshot request
   * 
   * @param socket - Socket instance
   * @param data - Snapshot data
   */
  private async handleMarketSnapshot(socket: ExtendedSocket, data: { pair: string }): Promise<void> {
    try {
      if (!data.pair) {
        socket.emit('market:snapshot_error', {
          error: 'Pair is required',
          timestamp: Date.now()
        });
        return;
      }

      // Get cached market data or generate new
      const marketData = this.getMarketData(data.pair);
      
      socket.emit('market:snapshot', {
        pair: data.pair,
        data: marketData,
        timestamp: Date.now()
      });

      console.log(`Sent market snapshot for ${data.pair} to ${socket.id}`);

    } catch (error) {
      console.error(`Market snapshot failed for ${socket.id}:`, error);
      socket.emit('market:snapshot_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle orderbook subscription
   * 
   * @param socket - Socket instance
   * @param data - Subscription data
   */
  private async handleOrderbookSubscription(socket: ExtendedSocket, data: { pair: string }): Promise<void> {
    try {
      if (!data.pair) {
        socket.emit('market:orderbook_subscription_error', {
          error: 'Pair is required',
          timestamp: Date.now()
        });
        return;
      }

      const roomName = `market:${data.pair.replace('/', '_')}:orderbook`;
      await this.roomManager.joinRoom(socket, roomName);

      socket.emit('market:orderbook_subscribed', {
        pair: data.pair,
        timestamp: Date.now()
      });

      console.log(`Socket ${socket.id} subscribed to orderbook for ${data.pair}`);

    } catch (error) {
      console.error(`Orderbook subscription failed for ${socket.id}:`, error);
      socket.emit('market:orderbook_subscription_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle orderbook unsubscription
   * 
   * @param socket - Socket instance
   * @param data - Unsubscription data
   */
  private async handleOrderbookUnsubscription(socket: ExtendedSocket, data: { pair: string }): Promise<void> {
    try {
      if (!data.pair) {
        socket.emit('market:orderbook_unsubscription_error', {
          error: 'Pair is required',
          timestamp: Date.now()
        });
        return;
      }

      const roomName = `market:${data.pair.replace('/', '_')}:orderbook`;
      await this.roomManager.leaveRoom(socket, roomName);

      socket.emit('market:orderbook_unsubscribed', {
        pair: data.pair,
        timestamp: Date.now()
      });

      console.log(`Socket ${socket.id} unsubscribed from orderbook for ${data.pair}`);

    } catch (error) {
      console.error(`Orderbook unsubscription failed for ${socket.id}:`, error);
      socket.emit('market:orderbook_unsubscription_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Start market data simulation
   */
  private startMarketDataSimulation(): void {
    // Simulate market data updates every 5 seconds
    setInterval(() => {
      this.broadcastMarketUpdates();
    }, 5000);

    // Simulate orderbook updates every 2 seconds
    setInterval(() => {
      this.broadcastOrderbookUpdates();
    }, 2000);

    // Simulate trade events every 3 seconds
    setInterval(() => {
      this.broadcastTradeEvents();
    }, 3000);
  }

  /**
   * Broadcast market updates
   */
  private async broadcastMarketUpdates(): Promise<void> {
    const pairs = ['BTC/USDC', 'ETH/USDC', 'XLM/USDC'];
    
    for (const pair of pairs) {
      const marketData = this.getMarketData(pair);
      
      const event: MarketPriceUpdateEvent = {
        id: `market-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        source: 'galaxy-websocket',
        type: 'market:price_update',
        data: {
          pair,
          price: marketData.price,
          volume: marketData.volume,
          change24h: marketData.change24h,
          marketCap: marketData.marketCap
        }
      };

      const roomName = `market:${pair.replace('/', '_')}`;
      await this.eventBroadcaster.broadcastToRoom(roomName, event);
    }
  }

  /**
   * Broadcast orderbook updates
   */
  private async broadcastOrderbookUpdates(): Promise<void> {
    const pairs = ['BTC/USDC', 'ETH/USDC', 'XLM/USDC'];
    
    for (const pair of pairs) {
      const orderbookData = this.getOrderbookData(pair);
      
      const event: MarketOrderbookUpdateEvent = {
        id: `orderbook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        source: 'galaxy-websocket',
        type: 'market:orderbook_update',
        data: {
          pair,
          bids: orderbookData.bids,
          asks: orderbookData.asks,
          depth: orderbookData.depth
        }
      };

      const roomName = `market:${pair.replace('/', '_')}:orderbook`;
      await this.eventBroadcaster.broadcastToRoom(roomName, event);
    }
  }

  /**
   * Broadcast trade events
   */
  private async broadcastTradeEvents(): Promise<void> {
    const pairs = ['BTC/USDC', 'ETH/USDC', 'XLM/USDC'];
    
    for (const pair of pairs) {
      const tradeData = this.getTradeData(pair);
      
      const event: MarketTradeEvent = {
        id: `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        source: 'galaxy-websocket',
        type: 'market:trade',
        data: {
          pair,
          price: tradeData.price,
          volume: tradeData.volume,
          side: tradeData.side,
          tradeTimestamp: Date.now()
        }
      };

      const roomName = `market:${pair.replace('/', '_')}`;
      await this.eventBroadcaster.broadcastToRoom(roomName, event);
    }
  }

  /**
   * Get market data for a pair
   * 
   * @param pair - Trading pair
   * @returns Market data object
   */
  private getMarketData(pair: string): any {
    if (this.marketDataCache.has(pair)) {
      const cached = this.marketDataCache.get(pair);
      // Add some random variation
      return {
        ...cached,
        price: cached.price * (1 + (Math.random() - 0.5) * 0.02),
        volume: cached.volume * (1 + (Math.random() - 0.5) * 0.1)
      };
    }

    // Generate initial market data
    const basePrices: Record<string, number> = {
      'BTC/USDC': 45000,
      'ETH/USDC': 3000,
      'XLM/USDC': 0.1
    };

    const basePrice = basePrices[pair] || 100;
    const price = basePrice * (1 + (Math.random() - 0.5) * 0.1);
    const volume = Math.random() * 1000000;
    const change24h = (Math.random() - 0.5) * 10;

    const marketData = {
      price,
      volume,
      change24h,
      marketCap: price * volume * 0.1
    };

    this.marketDataCache.set(pair, marketData);
    return marketData;
  }

  /**
   * Get orderbook data for a pair
   * 
   * @param pair - Trading pair
   * @returns Orderbook data
   */
  private getOrderbookData(pair: string): any {
    const basePrice = this.getMarketData(pair).price;
    const bids: Array<[number, number]> = [];
    const asks: Array<[number, number]> = [];

    // Generate bids (buy orders)
    for (let i = 0; i < 10; i++) {
      const price = basePrice * (1 - (i + 1) * 0.001);
      const volume = Math.random() * 10;
      bids.push([price, volume]);
    }

    // Generate asks (sell orders)
    for (let i = 0; i < 10; i++) {
      const price = basePrice * (1 + (i + 1) * 0.001);
      const volume = Math.random() * 10;
      asks.push([price, volume]);
    }

    return {
      bids,
      asks,
      depth: 10
    };
  }

  /**
   * Get trade data for a pair
   * 
   * @param pair - Trading pair
   * @returns Trade data
   */
  private getTradeData(pair: string): any {
    const basePrice = this.getMarketData(pair).price;
    const price = basePrice * (1 + (Math.random() - 0.5) * 0.01);
    const volume = Math.random() * 100;
    const side = Math.random() > 0.5 ? 'buy' : 'sell';

    return {
      price,
      volume,
      side
    };
  }

  /**
   * Get subscribed pairs
   * 
   * @returns string[] - Array of subscribed pairs
   */
  public getSubscribedPairs(): string[] {
    return Array.from(this.subscribedPairs);
  }

  /**
   * Get market data cache
   * 
   * @returns Map<string, any> - Market data cache
   */
  public getMarketDataCache(): Map<string, any> {
    return new Map(this.marketDataCache);
  }

  /**
   * Clear market data cache
   */
  public clearMarketDataCache(): void {
    this.marketDataCache.clear();
  }
}
