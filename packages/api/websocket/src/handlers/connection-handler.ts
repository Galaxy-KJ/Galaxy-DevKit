/**
 * Connection Handler
 * 
 * This module handles WebSocket connection lifecycle events including
 * connection, authentication, disconnection, and error handling.
 */

import { Server, Socket } from 'socket.io';
import { ExtendedSocket, ConnectionState } from '../types/websocket-types';
import { RoomManager } from '../services/room-manager';
import { EventBroadcaster } from '../services/event-broadcaster';
import { cleanupRateLimit, failAuthentication, validateCredential } from '../middleware/auth';
import { isJwtExpired } from '../middleware/token-expiry';
import { config } from '../config';

const TOKEN_REVALIDATION_EVERY_N_TICKS = 10;

/**
 * Connection Handler Class
 */
export class ConnectionHandler {
  private server: Server;
  private roomManager: RoomManager;
  private eventBroadcaster: EventBroadcaster;
  private connectionTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private heartbeatIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private tokenRevalidationIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private tokenRevalidationTicks = new Map<string, number>();
  private socketTokens = new Map<string, string>();

  constructor(server: Server, roomManager: RoomManager, eventBroadcaster: EventBroadcaster) {
    this.server = server;
    this.roomManager = roomManager;
    this.eventBroadcaster = eventBroadcaster;
    this.setupConnectionHandlers();
  }

  /**
   * Setup connection event handlers
   */
  private setupConnectionHandlers(): void {
    this.server.on('connection', (socket: Socket) => {
      this.handleConnection(socket as ExtendedSocket);
    });
  }

  /**
   * Handle new connection
   * 
   * @param socket - Socket instance
   */
  private handleConnection(socket: ExtendedSocket): void {
    try {
      // Initialize connection state
      socket.connectionState = {
        socketId: socket.id,
        isAuthenticated: false,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
        rooms: new Set(),
        metadata: {
          clientIP: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent'] || 'unknown',
          connectedAt: Date.now()
        }
      };

      // Set up connection timeout
      this.setupConnectionTimeout(socket);

      // Set up heartbeat
      this.setupHeartbeat(socket);

      // Set up event handlers
      this.setupSocketEventHandlers(socket);

      // Log connection
      console.log(`New connection: ${socket.id} from ${socket.handshake.address}`);

      // Emit connection event
      socket.emit('connected', {
        socketId: socket.id,
        timestamp: Date.now(),
        serverTime: Date.now()
      });

    } catch (error) {
      console.error(`Connection setup failed for ${socket.id}:`, error);
      socket.emit('error', {
        type: 'connection_error',
        message: 'Connection setup failed',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Setup connection timeout
   * 
   * @param socket - Socket instance
   */
  private setupConnectionTimeout(socket: ExtendedSocket): void {
    const timeout = setTimeout(() => {
      if (!socket.isAuthenticated) {
        console.log(`Connection timeout for ${socket.id}`);
        socket.emit('timeout', {
          message: 'Connection timeout - authentication required',
          timestamp: Date.now()
        });
        socket.disconnect(true);
      }
    }, config.connection.timeout);

    this.connectionTimeouts.set(socket.id, timeout);
  }

  /**
   * Setup heartbeat mechanism
   * 
   * @param socket - Socket instance
   */
  private setupHeartbeat(socket: ExtendedSocket): void {
    const heartbeat = setInterval(() => {
      if (socket.connected) {
        socket.emit('ping', { timestamp: Date.now() });
      } else {
        this.cleanupHeartbeat(socket.id);
      }
    }, config.connection.heartbeatInterval);

    this.heartbeatIntervals.set(socket.id, heartbeat);

    // Handle pong response
    socket.on('pong', () => {
      if (socket.connectionState) {
        socket.connectionState.lastActivity = Date.now();
      }
    });
  }

  /**
   * Setup socket event handlers
   * 
   * @param socket - Socket instance
   */
  private setupSocketEventHandlers(socket: ExtendedSocket): void {
    // Handle authentication
    socket.on('authenticate', async (data: { token: string }) => {
      await this.handleAuthentication(socket, data);
    });

    // Handle room subscription
    socket.on('subscribe', async (data: { room: string }) => {
      await this.handleRoomSubscription(socket, data);
    });

    // Handle room unsubscription
    socket.on('unsubscribe', async (data: { room: string }) => {
      await this.handleRoomUnsubscription(socket, data);
    });

    // Handle ping
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle disconnect
    socket.on('disconnect', (reason: string) => {
      this.handleDisconnection(socket, reason);
    });

    // Handle errors
    socket.on('error', (error: Error) => {
      this.handleSocketError(socket, error);
    });

    // Handle activity
    socket.onAny(() => {
      if (socket.connectionState) {
        socket.connectionState.lastActivity = Date.now();
      }
    });
  }

  /**
   * Handle authentication
   *
   * @param socket - Socket instance
   * @param data - Authentication data
   */
  private async handleAuthentication(
    socket: ExtendedSocket,
    data?: { token?: string }
  ): Promise<void> {
    try {
      if (socket.isAuthenticated) {
        socket.emit('auth_error', {
          error: 'already authenticated',
          timestamp: Date.now()
        });
        return;
      }

      const token = typeof data?.token === 'string' ? data.token.trim() : '';
      if (!token) {
        await this.rejectAuthentication(socket, 'missing token');
        return;
      }

      const authResult = await validateCredential(token);
      if (!authResult.success || !authResult.userId) {
        await this.rejectAuthentication(socket, authResult.error ?? 'invalid token');
        return;
      }

      if (isJwtExpired(token)) {
        await this.rejectAuthentication(socket, 'token expired');
        return;
      }

      this.clearConnectionTimeout(socket.id);

      socket.isAuthenticated = true;
      socket.userId = authResult.userId;

      if (socket.connectionState) {
        socket.connectionState.isAuthenticated = true;
        socket.connectionState.userId = authResult.userId;
        socket.connectionState.lastActivity = Date.now();
      }

      await this.roomManager.joinRoom(socket, `user:${authResult.userId}`);
      this.startTokenRevalidation(socket, token);

      socket.emit('authenticated', {
        userId: authResult.userId,
        timestamp: Date.now()
      });

      console.log(`User ${authResult.userId} authenticated successfully`);
    } catch (error) {
      console.error(`Authentication failed for ${socket.id}:`, error);
      await this.rejectAuthentication(socket, 'Authentication failed');
    }
  }

  /**
   * Reject authentication: emit auth_error, leave every room, disconnect.
   */
  private async rejectAuthentication(socket: ExtendedSocket, reason: string): Promise<void> {
    const rooms = Array.from(socket.connectionState?.rooms ?? []);
    for (const room of rooms) {
      try {
        await this.roomManager.leaveRoom(socket, room);
      } catch (error) {
        console.error(`Failed to leave room ${room} during auth rejection:`, error);
      }
    }

    this.clearTokenRevalidation(socket.id);
    await failAuthentication(socket, reason);
  }

  /**
   * Re-check token expiry on long-lived sockets.
   * Local JWT exp on every tick; full verifier every N ticks.
   */
  private startTokenRevalidation(socket: ExtendedSocket, token: string): void {
    this.clearTokenRevalidation(socket.id);
    this.socketTokens.set(socket.id, token);
    this.tokenRevalidationTicks.set(socket.id, 0);

    const interval = setInterval(() => {
      void this.revalidateSocketToken(socket);
    }, config.connection.heartbeatInterval);

    this.tokenRevalidationIntervals.set(socket.id, interval);
  }

  private async revalidateSocketToken(socket: ExtendedSocket): Promise<void> {
    if (!socket.connected) {
      this.clearTokenRevalidation(socket.id);
      return;
    }

    const token = this.socketTokens.get(socket.id);
    if (!token) {
      await this.rejectAuthentication(socket, 'token expired');
      return;
    }

    if (isJwtExpired(token)) {
      await this.rejectAuthentication(socket, 'token expired');
      return;
    }

    const ticks = (this.tokenRevalidationTicks.get(socket.id) ?? 0) + 1;
    this.tokenRevalidationTicks.set(socket.id, ticks);

    if (ticks % TOKEN_REVALIDATION_EVERY_N_TICKS !== 0) {
      return;
    }

    const result = await validateCredential(token);
    if (!result.success || result.userId !== socket.userId) {
      await this.rejectAuthentication(socket, result.error ?? 'token revalidation failed');
    }
  }

  private clearTokenRevalidation(socketId: string): void {
    const interval = this.tokenRevalidationIntervals.get(socketId);
    if (interval) {
      clearInterval(interval);
      this.tokenRevalidationIntervals.delete(socketId);
    }
    this.tokenRevalidationTicks.delete(socketId);
    this.socketTokens.delete(socketId);
  }

  /**
   * Handle room subscription
   * 
   * @param socket - Socket instance
   * @param data - Subscription data
   */
  private async handleRoomSubscription(socket: ExtendedSocket, data: { room: string }): Promise<void> {
    try {
      if (!socket.isAuthenticated && !data.room.startsWith('market:') && !data.room.startsWith('system:')) {
        socket.emit('error', {
          type: 'auth_required',
          message: 'Authentication required for this room',
          timestamp: Date.now()
        });
        return;
      }

      await this.roomManager.joinRoom(socket, data.room);

      socket.emit('subscribed', {
        room: data.room,
        timestamp: Date.now()
      });

      console.log(`Socket ${socket.id} subscribed to room ${data.room}`);

    } catch (error) {
      console.error(`Room subscription failed for ${socket.id}:`, error);
      socket.emit('subscription_error', {
        room: data.room,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle room unsubscription
   * 
   * @param socket - Socket instance
   * @param data - Unsubscription data
   */
  private async handleRoomUnsubscription(socket: ExtendedSocket, data: { room: string }): Promise<void> {
    try {
      await this.roomManager.leaveRoom(socket, data.room);

      socket.emit('unsubscribed', {
        room: data.room,
        timestamp: Date.now()
      });

      console.log(`Socket ${socket.id} unsubscribed from room ${data.room}`);

    } catch (error) {
      console.error(`Room unsubscription failed for ${socket.id}:`, error);
      socket.emit('unsubscription_error', {
        room: data.room,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle disconnection
   * 
   * @param socket - Socket instance
   * @param reason - Disconnection reason
   */
  private handleDisconnection(socket: ExtendedSocket, reason: string): void {
    try {
      console.log(`Socket ${socket.id} disconnected: ${reason}`);

      // Cleanup connection timeout
      this.clearConnectionTimeout(socket.id);

      // Cleanup heartbeat
      this.cleanupHeartbeat(socket.id);

      // Cleanup token revalidation
      this.clearTokenRevalidation(socket.id);

      // Cleanup user rooms if authenticated
      if (socket.isAuthenticated && socket.userId) {
        this.roomManager.cleanupUserRooms(socket.userId);
      }

      // Cleanup rate limiting
      cleanupRateLimit();

      console.log(`Cleaned up connection for ${socket.id}`);

    } catch (error) {
      console.error(`Disconnection cleanup failed for ${socket.id}:`, error);
    }
  }

  /**
   * Handle socket errors
   * 
   * @param socket - Socket instance
   * @param error - Error object
   */
  private handleSocketError(socket: ExtendedSocket, error: Error): void {
    console.error(`Socket error for ${socket.id}:`, error);

    socket.emit('error', {
      type: 'socket_error',
      message: error.message,
      timestamp: Date.now()
    });
  }

  /**
   * Clear connection timeout
   * 
   * @param socketId - Socket ID
   */
  private clearConnectionTimeout(socketId: string): void {
    const timeout = this.connectionTimeouts.get(socketId);
    if (timeout) {
      clearTimeout(timeout);
      this.connectionTimeouts.delete(socketId);
    }
  }

  /**
   * Cleanup heartbeat
   * 
   * @param socketId - Socket ID
   */
  private cleanupHeartbeat(socketId: string): void {
    const heartbeat = this.heartbeatIntervals.get(socketId);
    if (heartbeat) {
      clearInterval(heartbeat);
      this.heartbeatIntervals.delete(socketId);
    }
  }

  /**
   * Get connection statistics
   * 
   * @returns Object - Connection statistics
   */
  public getConnectionStats(): {
    totalConnections: number;
    authenticatedConnections: number;
    connectionTimeouts: number;
    heartbeats: number;
  } {
    let authenticatedConnections = 0;

    for (const [socketId, socket] of this.server.sockets.sockets) {
      const extendedSocket = socket as ExtendedSocket;
      if (extendedSocket.isAuthenticated) {
        authenticatedConnections++;
      }
    }

    return {
      totalConnections: this.server.sockets.sockets.size,
      authenticatedConnections,
      connectionTimeouts: this.connectionTimeouts.size,
      heartbeats: this.heartbeatIntervals.size
    };
  }

  /**
   * Get connection info for a socket
   * 
   * @param socketId - Socket ID
   * @returns ConnectionState | undefined - Connection state
   */
  public getConnectionInfo(socketId: string): ConnectionState | undefined {
    const socket = this.server.sockets.sockets.get(socketId) as ExtendedSocket;
    return socket?.connectionState;
  }

  /**
   * Force disconnect a socket
   * 
   * @param socketId - Socket ID
   * @param reason - Disconnect reason
   */
  public forceDisconnect(socketId: string, reason: string = 'Forced disconnect'): void {
    const socket = this.server.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('force_disconnect', { reason, timestamp: Date.now() });
      socket.disconnect(true);
    }
  }

  /**
   * Cleanup all timeouts and intervals
   */
  public cleanup(): void {
    // Clear all connection timeouts
    for (const timeout of this.connectionTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.connectionTimeouts.clear();

    // Clear all heartbeats
    for (const heartbeat of this.heartbeatIntervals.values()) {
      clearInterval(heartbeat);
    }
    this.heartbeatIntervals.clear();

    for (const interval of this.tokenRevalidationIntervals.values()) {
      clearInterval(interval);
    }
    this.tokenRevalidationIntervals.clear();
    this.tokenRevalidationTicks.clear();
    this.socketTokens.clear();
  }
}
