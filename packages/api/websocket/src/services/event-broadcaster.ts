/**
 * Event Broadcaster Service
 * 
 * This service handles broadcasting WebSocket events to specific rooms,
 * users, or all connected clients with proper error handling and queuing.
 */

import { Server, Socket } from 'socket.io';
import { WebSocketEvent, BroadcastOptions, BroadcastError, ExtendedSocket } from '../types/websocket-types';

export type SubscriberCountChangeHandler = (
  roomName: string,
  subscriberCount: number,
  previousCount: number
) => void;

/**
 * Broadcast Queue Item
 */
interface BroadcastQueueItem {
  /** Event to broadcast */
  event: WebSocketEvent;
  /** Target room or user */
  target: string;
  /** Broadcast options */
  options: BroadcastOptions;
  /** Retry count */
  retryCount: number;
  /** Timestamp when queued */
  queuedAt: number;
}

/**
 * Event Broadcaster Class
 */
export class EventBroadcaster {
  private server: Server;
  private broadcastQueue: BroadcastQueueItem[] = [];
  private isProcessingQueue = false;
  private maxQueueSize = 1000;
  private queueProcessingInterval: ReturnType<typeof setInterval> | null = null;
  private readonly roomSubscriberCounts = new Map<string, number>();
  private readonly subscriberCountHandlers = new Set<SubscriberCountChangeHandler>();
  private readonly adapterListeners: Array<[string, (...args: unknown[]) => void]> = [];

  constructor(server: Server) {
    this.server = server;
    this.setupSubscriberTracking();
  }

  public onSubscriberCountChange(handler: SubscriberCountChangeHandler): () => void {
    this.subscriberCountHandlers.add(handler);
    return () => {
      this.subscriberCountHandlers.delete(handler);
    };
  }

  public getRoomsWithSubscribers(prefix?: string): string[] {
    const rooms: string[] = [];
    for (const [name, count] of this.roomSubscriberCounts) {
      if (count > 0 && (!prefix || name.startsWith(prefix))) {
        rooms.push(name);
      }
    }
    return rooms;
  }

  /**
   * Start queue processing
   */
  private startQueueProcessing(): void {
    if (this.queueProcessingInterval) {
      return;
    }
    this.queueProcessingInterval = setInterval(() => {
      void this.processQueue();
    }, 100); // Process queue every 100ms
  }

  /**
   * Stop queue processing
   */
  public stopQueueProcessing(): void {
    if (this.queueProcessingInterval) {
      clearInterval(this.queueProcessingInterval);
      this.queueProcessingInterval = null;
    }
  }

  /**
   * Broadcast event to a specific room
   * 
   * @param roomName - Room name
   * @param event - Event to broadcast
   * @param options - Broadcast options
   * @returns Promise<void>
   */
  public async broadcastToRoom(
    roomName: string, 
    event: WebSocketEvent, 
    options: BroadcastOptions = {}
  ): Promise<void> {
    try {
      // Check if room exists and has members
      const room = this.server.sockets.adapter.rooms.get(roomName);
      if (!room || room.size === 0) {
        // Queue event if room is empty and queuing is enabled
        if (options.retry?.maxAttempts && options.retry.maxAttempts > 0) {
          this.queueEvent(roomName, event, options, 'room');
        }
        return;
      }

      // Prepare event data
      const eventData = this.prepareEventData(event, options);

      // Broadcast to room
      this.server.to(roomName).emit(event.type, eventData);

      // Log broadcast
      console.log(`Broadcasted ${event.type} to room ${roomName} (${room.size} clients)`);
    } catch (error) {
      console.error(`Failed to broadcast to room ${roomName}:`, error);
      throw new BroadcastError(`Failed to broadcast to room: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Broadcast event to a specific user
   * 
   * @param userId - User ID
   * @param event - Event to broadcast
   * @param options - Broadcast options
   * @returns Promise<void>
   */
  public async broadcastToUser(
    userId: string, 
    event: WebSocketEvent, 
    options: BroadcastOptions = {}
  ): Promise<void> {
    try {
      // Find user's socket
      const userSocket = this.findUserSocket(userId);
      if (!userSocket) {
        // Queue event if user is not connected
        if (options.retry?.maxAttempts && options.retry.maxAttempts > 0) {
          this.queueEvent(userId, event, options, 'user');
        }
        return;
      }

      // Prepare event data
      const eventData = this.prepareEventData(event, options);

      // Broadcast to user
      userSocket.emit(event.type, eventData);

      // Log broadcast
      console.log(`Broadcasted ${event.type} to user ${userId}`);
    } catch (error) {
      console.error(`Failed to broadcast to user ${userId}:`, error);
      throw new BroadcastError(`Failed to broadcast to user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Broadcast event to all connected clients
   * 
   * @param event - Event to broadcast
   * @param options - Broadcast options
   * @returns Promise<void>
   */
  public async broadcastGlobal(
    event: WebSocketEvent, 
    options: BroadcastOptions = {}
  ): Promise<void> {
    try {
      // Prepare event data
      const eventData = this.prepareEventData(event, options);

      // Broadcast to all clients
      this.server.emit(event.type, eventData);

      // Log broadcast
      console.log(`Broadcasted ${event.type} globally`);
    } catch (error) {
      console.error('Failed to broadcast globally:', error);
      throw new BroadcastError(`Failed to broadcast globally: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Broadcast event to multiple rooms
   * 
   * @param roomNames - Array of room names
   * @param event - Event to broadcast
   * @param options - Broadcast options
   * @returns Promise<void>
   */
  public async broadcastToRooms(
    roomNames: string[], 
    event: WebSocketEvent, 
    options: BroadcastOptions = {}
  ): Promise<void> {
    const promises = roomNames.map(roomName => 
      this.broadcastToRoom(roomName, event, options)
    );

    try {
      await Promise.all(promises);
    } catch (error) {
      console.error('Failed to broadcast to multiple rooms:', error);
      throw new BroadcastError(`Failed to broadcast to multiple rooms: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Broadcast event to multiple users
   * 
   * @param userIds - Array of user IDs
   * @param event - Event to broadcast
   * @param options - Broadcast options
   * @returns Promise<void>
   */
  public async broadcastToUsers(
    userIds: string[], 
    event: WebSocketEvent, 
    options: BroadcastOptions = {}
  ): Promise<void> {
    const promises = userIds.map(userId => 
      this.broadcastToUser(userId, event, options)
    );

    try {
      await Promise.all(promises);
    } catch (error) {
      console.error('Failed to broadcast to multiple users:', error);
      throw new BroadcastError(`Failed to broadcast to multiple users: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find user's socket by user ID
   * 
   * @param userId - User ID
   * @returns Socket | undefined - User's socket
   */
  private findUserSocket(userId: string): Socket | undefined {
    for (const [socketId, socket] of this.server.sockets.sockets) {
      const extendedSocket = socket as ExtendedSocket;
      if (extendedSocket.userId === userId) {
        return socket;
      }
    }
    return undefined;
  }

  /**
   * Prepare event data for broadcasting
   * 
   * @param event - Original event
   * @param options - Broadcast options
   * @returns WebSocketEvent - Prepared event
   */
  private prepareEventData(event: WebSocketEvent, options: BroadcastOptions): WebSocketEvent {
    const preparedEvent = { ...event };

    // Add timestamp if requested
    if (options.includeTimestamp !== false && (preparedEvent.timestamp === undefined || preparedEvent.timestamp === null)) {
      preparedEvent.timestamp = Date.now();
    }

    // Add source if requested
    if (options.includeSource !== false && !preparedEvent.source) {
      preparedEvent.source = 'galaxy-websocket';
    }

    return preparedEvent;
  }

  private setupSubscriberTracking(): void {
    const adapter = this.getAdapter();
    if (!adapter || typeof adapter.on !== 'function') {
      return;
    }

    const onJoin = (...args: unknown[]) => {
      if (typeof args[0] === 'string') {
        this.refreshRoomSubscriberCount(args[0]);
      }
    };
    const onLeave = (...args: unknown[]) => {
      if (typeof args[0] === 'string') {
        this.refreshRoomSubscriberCount(args[0]);
      }
    };
    const onDelete = (...args: unknown[]) => {
      if (typeof args[0] === 'string') {
        this.refreshRoomSubscriberCount(args[0]);
      }
    };

    adapter.on('join-room', onJoin);
    adapter.on('leave-room', onLeave);
    adapter.on('delete-room', onDelete);
    this.adapterListeners.push(['join-room', onJoin], ['leave-room', onLeave], ['delete-room', onDelete]);
  }

  private getAdapter(): {
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
    off?: (event: string, listener: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  } | undefined {
    const server = this.server as Server & { of?: (nsp: string) => { adapter?: unknown } };
    if (typeof server.of === 'function') {
      return server.of('/').adapter as ReturnType<EventBroadcaster['getAdapter']>;
    }
    return this.server.sockets?.adapter as ReturnType<EventBroadcaster['getAdapter']>;
  }

  private isSocketIdRoom(roomName: string): boolean {
    return this.server.sockets?.sockets?.has(roomName) === true;
  }

  public refreshRoomSubscriberCount(roomName: string): void {
    if (this.isSocketIdRoom(roomName)) {
      return;
    }

    const count = this.getRoomConnectionCount(roomName);
    const previous = this.roomSubscriberCounts.get(roomName) ?? 0;
    if (count === previous) {
      return;
    }

    if (count === 0) {
      this.roomSubscriberCounts.delete(roomName);
    } else {
      this.roomSubscriberCounts.set(roomName, count);
    }

    for (const handler of this.subscriberCountHandlers) {
      handler(roomName, count, previous);
    }
  }

  /**
   * Queue event for later broadcasting
   * 
   * @param target - Target room or user
   * @param event - Event to broadcast
   * @param options - Broadcast options
   * @param type - Queue type
   */
  private queueEvent(
    target: string, 
    event: WebSocketEvent, 
    options: BroadcastOptions, 
    type: 'room' | 'user'
  ): void {
    // Check queue size limit
    if (this.broadcastQueue.length >= this.maxQueueSize) {
      console.warn('Broadcast queue is full, dropping event');
      return;
    }

    const queueItem: BroadcastQueueItem = {
      event,
      target,
      options,
      retryCount: 0,
      queuedAt: Date.now()
    };

    this.broadcastQueue.push(queueItem);
    this.startQueueProcessing();
    console.log(`Queued ${event.type} for ${type} ${target}`);
  }

  /**
   * Process broadcast queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.broadcastQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      const itemsToProcess = [...this.broadcastQueue];
      this.broadcastQueue = [];

      for (const item of itemsToProcess) {
        try {
          // Check if target is available
          let isAvailable = false;
          
          if (item.target.startsWith('user:')) {
            const userId = item.target.replace('user:', '');
            isAvailable = this.findUserSocket(userId) !== undefined;
          } else {
            const room = this.server.sockets.adapter.rooms.get(item.target);
            isAvailable = !!(room && room.size > 0);
          }

          if (isAvailable) {
            // Target is available, broadcast immediately
            if (item.target.startsWith('user:')) {
              const userId = item.target.replace('user:', '');
              await this.broadcastToUser(userId, item.event, item.options);
            } else {
              await this.broadcastToRoom(item.target, item.event, item.options);
            }
          } else {
            // Target not available, check retry
            if (item.retryCount < (item.options.retry?.maxAttempts || 0)) {
              item.retryCount++;
              this.broadcastQueue.push(item);
            } else {
              console.log(`Dropped queued event ${item.event.type} for ${item.target} after ${item.retryCount} retries`);
            }
          }
        } catch (error) {
          console.error(`Failed to process queued event:`, error);
        }
      }
    } finally {
      this.isProcessingQueue = false;
      if (this.broadcastQueue.length === 0) {
        this.stopQueueProcessing();
      }
    }
  }

  /**
   * Get queue statistics
   * 
   * @returns Object - Queue statistics
   */
  public getQueueStats(): {
    queueSize: number;
    maxQueueSize: number;
    oldestItem: number | null;
  } {
    const oldestItem = this.broadcastQueue.length > 0 
      ? Math.min(...this.broadcastQueue.map(item => item.queuedAt))
      : null;

    return {
      queueSize: this.broadcastQueue.length,
      maxQueueSize: this.maxQueueSize,
      oldestItem
    };
  }

  /**
   * Clear broadcast queue
   */
  public clearQueue(): void {
    this.broadcastQueue = [];
    console.log('Broadcast queue cleared');
  }

  /**
   * Set maximum queue size
   * 
   * @param size - Maximum queue size
   */
  public setMaxQueueSize(size: number): void {
    this.maxQueueSize = size;
  }

  /**
   * Get connected user count
   * 
   * @returns number - Number of connected users
   */
  public getConnectedUserCount(): number {
    const userIds = new Set<string>();
    
    for (const [socketId, socket] of this.server.sockets.sockets) {
      const extendedSocket = socket as ExtendedSocket;
      if (extendedSocket.userId) {
        userIds.add(extendedSocket.userId);
      }
    }
    
    return userIds.size;
  }

  /**
   * Get total connection count
   * 
   * @returns number - Total number of connections
   */
  public getTotalConnectionCount(): number {
    return this.server.sockets.sockets.size;
  }

  /**
   * Get room connection count
   * 
   * @param roomName - Room name
   * @returns number - Number of connections in room
   */
  public getRoomConnectionCount(roomName: string): number {
    const room = this.server.sockets.adapter.rooms.get(roomName);
    return room ? room.size : 0;
  }

  /**
   * Destroy the event broadcaster
   */
  public destroy(): void {
    this.stopQueueProcessing();
    this.broadcastQueue = [];
    this.subscriberCountHandlers.clear();
    this.roomSubscriberCounts.clear();

    const adapter = this.getAdapter();
    for (const [event, listener] of this.adapterListeners) {
      if (adapter?.off) {
        adapter.off(event, listener);
      } else if (adapter?.removeListener) {
        adapter.removeListener(event, listener);
      }
    }
    this.adapterListeners.length = 0;
  }
}
