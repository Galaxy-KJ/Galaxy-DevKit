/**
 * Room Manager Service
 * 
 * This service manages WebSocket room subscriptions, tracks active connections,
 * and handles room permissions and cleanup.
 */

import { Server, Socket } from 'socket.io';
import { RoomConfig, RoomStats, RoomType, RoomError, ExtendedSocket } from '../types/websocket-types';
import { canAccessRoom } from '../middleware/auth';

/**
 * Room Manager Class
 */
export class RoomManager {
  private server: Server;
  private rooms = new Map<string, RoomConfig>();
  private roomStats = new Map<string, RoomStats>();
  private userRooms = new Map<string, Set<string>>(); // userId -> Set of room names
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(server: Server) {
    this.server = server;
    this.initializeDefaultRooms();
    this.startCleanupInterval();
  }

  /**
   * Initialize default rooms
   */
  private initializeDefaultRooms(): void {
    // Public market data rooms
    const marketPairs = ['BTC/USDC', 'ETH/USDC', 'XLM/USDC', 'USDC/USD'];
    
    marketPairs.forEach(pair => {
      const roomName = `market:${pair.replace('/', '_')}`;
      this.rooms.set(roomName, {
        name: roomName,
        type: 'public',
        requiresAuth: false,
        maxConnections: 1000,
        description: `Public market data for ${pair}`
      });
    });

    // System room
    this.rooms.set('system:notifications', {
      name: 'system:notifications',
      type: 'system',
      requiresAuth: false,
      maxConnections: 10000,
      description: 'System-wide notifications'
    });
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupEmptyRooms();
    }, 300000); // 5 minutes
  }

  /**
   * Stop cleanup interval
   */
  public stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Join a room
   * 
   * @param socket - Socket instance
   * @param roomName - Room name
   * @returns Promise<void>
   */
  public async joinRoom(socket: ExtendedSocket, roomName: string): Promise<void> {
    try {
      // Validate room name
      if (!this.isValidRoomName(roomName)) {
        throw new RoomError(`Invalid room name: ${roomName}`);
      }

      // Check if room exists or create it
      if (!this.rooms.has(roomName)) {
        await this.createRoom(roomName);
      }

      const roomConfig = this.rooms.get(roomName)!;

      // Check authentication requirement
      if (roomConfig.requiresAuth && (!socket.isAuthenticated || !socket.userId)) {
        throw new RoomError('Authentication required for this room');
      }

      // Check access permissions
      if (!canAccessRoom(socket, roomName)) {
        throw new RoomError('Access denied to this room');
      }

      // Check connection limits
      const currentConnections = await this.getRoomConnectionCount(roomName);
      if (roomConfig.maxConnections && currentConnections >= roomConfig.maxConnections) {
        throw new RoomError('Room is at maximum capacity');
      }

      // Join the room
      await socket.join(roomName);

      // Update tracking
      if (socket.connectionState) {
        socket.connectionState.rooms.add(roomName);
      }

      // Track user rooms
      if (socket.userId) {
        if (!this.userRooms.has(socket.userId)) {
          this.userRooms.set(socket.userId, new Set());
        }
        this.userRooms.get(socket.userId)!.add(roomName);
      }

      // Update room stats
      this.updateRoomStats(roomName);

      console.log(`Socket ${socket.id} joined room ${roomName}`);
    } catch (error) {
      console.error(`Failed to join room ${roomName}:`, error);
      throw error;
    }
  }

  /**
   * Leave a room
   * 
   * @param socket - Socket instance
   * @param roomName - Room name
   * @returns Promise<void>
   */
  public async leaveRoom(socket: ExtendedSocket, roomName: string): Promise<void> {
    try {
      // Leave the room
      await socket.leave(roomName);

      // Update tracking
      if (socket.connectionState) {
        socket.connectionState.rooms.delete(roomName);
      }

      // Update user rooms
      if (socket.userId && this.userRooms.has(socket.userId)) {
        this.userRooms.get(socket.userId)!.delete(roomName);
      }

      // Update room stats
      this.updateRoomStats(roomName);

      console.log(`Socket ${socket.id} left room ${roomName}`);
    } catch (error) {
      console.error(`Failed to leave room ${roomName}:`, error);
      throw error;
    }
  }

  /**
   * Get room members
   * 
   * @param roomName - Room name
   * @returns Set<string> - Set of socket IDs
   */
  public getRoomMembers(roomName: string): Set<string> {
    const room = this.server.sockets.adapter.rooms.get(roomName);
    return room ? new Set(room) : new Set();
  }

  /**
   * Get room connection count
   * 
   * @param roomName - Room name
   * @returns Promise<number> - Connection count
   */
  public async getRoomConnectionCount(roomName: string): Promise<number> {
    const room = this.server.sockets.adapter.rooms.get(roomName);
    return room ? room.size : 0;
  }

  /**
   * Get room statistics
   * 
   * @param roomName - Room name
   * @returns RoomStats | undefined - Room statistics
   */
  public getRoomStats(roomName: string): RoomStats | undefined {
    return this.roomStats.get(roomName);
  }

  /**
   * Get all room statistics
   * 
   * @returns RoomStats[] - All room statistics
   */
  public getAllRoomStats(): RoomStats[] {
    return Array.from(this.roomStats.values());
  }

  /**
   * Create a new room
   * 
   * @param roomName - Room name
   * @param config - Room configuration
   * @returns Promise<void>
   */
  public async createRoom(roomName: string, config?: Partial<RoomConfig>): Promise<void> {
    if (this.rooms.has(roomName)) {
      return; // Room already exists
    }

    const roomConfig: RoomConfig = {
      name: roomName,
      type: this.detectRoomType(roomName),
      requiresAuth: this.detectAuthRequirement(roomName),
      maxConnections: 100,
      description: `Room ${roomName}`,
      ...config
    };

    this.rooms.set(roomName, roomConfig);
    this.updateRoomStats(roomName);

    console.log(`Created room: ${roomName}`);
  }

  /**
   * Delete a room
   * 
   * @param roomName - Room name
   * @returns Promise<void>
   */
  public async deleteRoom(roomName: string): Promise<void> {
    // Disconnect all clients from the room
    const room = this.server.sockets.adapter.rooms.get(roomName);
    if (room) {
      for (const socketId of room) {
        const socket = this.server.sockets.sockets.get(socketId);
        if (socket) {
          await socket.leave(roomName);
        }
      }
    }

    // Remove from tracking
    this.rooms.delete(roomName);
    this.roomStats.delete(roomName);

    console.log(`Deleted room: ${roomName}`);
  }

  /**
   * Cleanup user rooms when user disconnects
   * 
   * @param userId - User ID
   * @returns Promise<void>
   */
  public async cleanupUserRooms(userId: string): Promise<void> {
    const userRooms = this.userRooms.get(userId);
    if (!userRooms) {
      return;
    }

    // Remove user from all their rooms
    for (const roomName of userRooms) {
      const room = this.server.sockets.adapter.rooms.get(roomName);
      if (room) {
        for (const socketId of room) {
          const socket = this.server.sockets.sockets.get(socketId);
          if (socket && (socket as ExtendedSocket).userId === userId) {
            await socket.leave(roomName);
          }
        }
      }
    }

    // Clear user rooms
    this.userRooms.delete(userId);
  }

  /**
   * Cleanup empty rooms
   */
  private async cleanupEmptyRooms(): Promise<void> {
    const emptyRooms: string[] = [];

    for (const [roomName, roomConfig] of this.rooms.entries()) {
      const connectionCount = await this.getRoomConnectionCount(roomName);
      
      // Don't cleanup system or public rooms
      if (roomConfig.type === 'system' || roomConfig.type === 'public') {
        continue;
      }

      // Cleanup empty private rooms
      if (connectionCount === 0) {
        emptyRooms.push(roomName);
      }
    }

    // Delete empty rooms
    for (const roomName of emptyRooms) {
      await this.deleteRoom(roomName);
    }

    if (emptyRooms.length > 0) {
      console.log(`Cleaned up ${emptyRooms.length} empty rooms`);
    }
  }

  /**
   * Update room statistics
   * 
   * @param roomName - Room name
   */
  private updateRoomStats(roomName: string): void {
    const roomConfig = this.rooms.get(roomName);
    if (!roomConfig) {
      return;
    }

    this.roomStats.set(roomName, {
      roomName,
      connectionCount: 0, // Will be updated by getRoomConnectionCount
      type: roomConfig.type,
      createdAt: Date.now(),
      lastActivity: Date.now()
    });
  }

  /**
   * Validate room name
   * 
   * @param roomName - Room name
   * @returns boolean - Whether room name is valid
   */
  private isValidRoomName(roomName: string): boolean {
    // Room names should follow pattern: type:identifier
    const roomNamePattern = /^[a-zA-Z0-9_]+:[a-zA-Z0-9_-]+$/;
    return roomNamePattern.test(roomName) && roomName.length <= 100;
  }

  /**
   * Detect room type from room name
   * 
   * @param roomName - Room name
   * @returns RoomType - Detected room type
   */
  private detectRoomType(roomName: string): RoomType {
    if (roomName.startsWith('market:')) return 'public';
    if (roomName.startsWith('user:')) return 'user';
    if (roomName.startsWith('wallet:')) return 'wallet';
    if (roomName.startsWith('automation:')) return 'automation';
    if (roomName.startsWith('system:')) return 'system';
    return 'user'; // Default
  }

  /**
   * Detect authentication requirement from room name
   * 
   * @param roomName - Room name
   * @returns boolean - Whether authentication is required
   */
  private detectAuthRequirement(roomName: string): boolean {
    if (roomName.startsWith('market:') || roomName.startsWith('system:')) {
      return false; // Public rooms
    }
    return true; // Private rooms require auth
  }

  /**
   * Get rooms for a user
   * 
   * @param userId - User ID
   * @returns string[] - Array of room names
   */
  public getUserRooms(userId: string): string[] {
    const userRooms = this.userRooms.get(userId);
    return userRooms ? Array.from(userRooms) : [];
  }

  /**
   * Check if room exists
   * 
   * @param roomName - Room name
   * @returns boolean - Whether room exists
   */
  public roomExists(roomName: string): boolean {
    return this.rooms.has(roomName);
  }

  /**
   * Get room configuration
   * 
   * @param roomName - Room name
   * @returns RoomConfig | undefined - Room configuration
   */
  public getRoomConfig(roomName: string): RoomConfig | undefined {
    return this.rooms.get(roomName);
  }

  /**
   * Get all rooms
   * 
   * @returns string[] - Array of room names
   */
  public getAllRooms(): string[] {
    return Array.from(this.rooms.keys());
  }

  /**
   * Destroy the room manager
   */
  public destroy(): void {
    this.stopCleanupInterval();
    this.rooms.clear();
    this.roomStats.clear();
    this.userRooms.clear();
  }
}
