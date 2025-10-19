/**
 * Room Manager Tests
 * 
 * This module tests the room management functionality including
 * room creation, joining, leaving, and cleanup operations.
 */

import { RoomManager } from '../../services/room-manager';
import { TestSocketIOServer, createMockSocket, TestAssertions, setupJestMocks, cleanup } from '../utils/test-helpers';

describe('Room Manager', () => {
  let testServer: TestSocketIOServer;
  let roomManager: RoomManager;
  let mockSocket: any;

  beforeEach(async () => {
    setupJestMocks();
    testServer = new TestSocketIOServer();
    const io = testServer.getServer();
    roomManager = new RoomManager(io);
    mockSocket = createMockSocket();
  });

  afterEach(async () => {
    roomManager.destroy();
    await testServer.stop();
    cleanup();
  });

  describe('Room Creation', () => {
    it('should create a new room', async () => {
      const roomName = 'test:room';
      
      await roomManager.createRoom(roomName);

      expect(roomManager.roomExists(roomName)).toBe(true);
      const roomConfig = roomManager.getRoomConfig(roomName);
      expect(roomConfig).toBeDefined();
      expect(roomConfig?.name).toBe(roomName);
    });

    it('should not create duplicate rooms', async () => {
      const roomName = 'test:duplicate';
      
      await roomManager.createRoom(roomName);
      await roomManager.createRoom(roomName);

      expect(roomManager.roomExists(roomName)).toBe(true);
    });

    it('should create room with custom configuration', async () => {
      const roomName = 'test:custom';
      const customConfig = {
        maxConnections: 50,
        description: 'Custom test room'
      };

      await roomManager.createRoom(roomName, customConfig);

      const roomConfig = roomManager.getRoomConfig(roomName);
      expect(roomConfig?.maxConnections).toBe(50);
      expect(roomConfig?.description).toBe('Custom test room');
    });
  });

  describe('Room Joining', () => {
    it('should allow socket to join a room', async () => {
      const roomName = 'test:join';
      await roomManager.createRoom(roomName);

      await roomManager.joinRoom(mockSocket, roomName);

      TestAssertions.assertRoomJoined(mockSocket, roomName);
      expect(mockSocket.connectionState?.rooms.has(roomName)).toBe(true);
    });

    it('should handle joining non-existent room', async () => {
      const roomName = 'test:nonexistent';

      await expect(roomManager.joinRoom(mockSocket, roomName)).rejects.toThrow();
    });

    it('should enforce authentication for private rooms', async () => {
      const roomName = 'user:private';
      await roomManager.createRoom(roomName);

      // Socket without authentication
      const unauthenticatedSocket = createMockSocket({ isAuthenticated: false });

      await expect(roomManager.joinRoom(unauthenticatedSocket, roomName)).rejects.toThrow();
    });

    it('should allow public rooms without authentication', async () => {
      const roomName = 'market:BTC_USDC';
      await roomManager.createRoom(roomName);

      const unauthenticatedSocket = createMockSocket({ isAuthenticated: false });

      await roomManager.joinRoom(unauthenticatedSocket, roomName);

      TestAssertions.assertRoomJoined(unauthenticatedSocket, roomName);
    });

    it('should enforce connection limits', async () => {
      const roomName = 'test:limited';
      await roomManager.createRoom(roomName, { maxConnections: 1 });

      // First socket should join successfully
      await roomManager.joinRoom(mockSocket, roomName);

      // Second socket should be rejected
      const secondSocket = createMockSocket();
      await expect(roomManager.joinRoom(secondSocket, roomName)).rejects.toThrow();
    });
  });

  describe('Room Leaving', () => {
    it('should allow socket to leave a room', async () => {
      const roomName = 'test:leave';
      await roomManager.createRoom(roomName);
      await roomManager.joinRoom(mockSocket, roomName);

      await roomManager.leaveRoom(mockSocket, roomName);

      TestAssertions.assertRoomLeft(mockSocket, roomName);
      expect(mockSocket.connectionState?.rooms.has(roomName)).toBe(false);
    });

    it('should handle leaving non-joined room gracefully', async () => {
      const roomName = 'test:notjoined';

      await expect(roomManager.leaveRoom(mockSocket, roomName)).rejects.toThrow();
    });
  });

  describe('Room Statistics', () => {
    it('should track room connection count', async () => {
      const roomName = 'test:stats';
      await roomManager.createRoom(roomName);

      const initialCount = await roomManager.getRoomConnectionCount(roomName);
      expect(initialCount).toBe(0);

      await roomManager.joinRoom(mockSocket, roomName);
      const afterJoinCount = await roomManager.getRoomConnectionCount(roomName);
      expect(afterJoinCount).toBe(1);

      await roomManager.leaveRoom(mockSocket, roomName);
      const afterLeaveCount = await roomManager.getRoomConnectionCount(roomName);
      expect(afterLeaveCount).toBe(0);
    });

    it('should provide room statistics', async () => {
      const roomName = 'test:statistics';
      await roomManager.createRoom(roomName);

      const stats = roomManager.getRoomStats(roomName);
      expect(stats).toBeDefined();
      expect(stats?.roomName).toBe(roomName);
      expect(stats?.type).toBeDefined();
    });

    it('should provide all room statistics', async () => {
      await roomManager.createRoom('test:room1');
      await roomManager.createRoom('test:room2');

      const allStats = roomManager.getAllRoomStats();
      expect(allStats.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('User Room Management', () => {
    it('should track user rooms', async () => {
      const userId = 'user-123';
      const roomName = 'user:123';
      
      const authenticatedSocket = createMockSocket({ 
        isAuthenticated: true, 
        userId 
      });

      await roomManager.createRoom(roomName);
      await roomManager.joinRoom(authenticatedSocket, roomName);

      const userRooms = roomManager.getUserRooms(userId);
      expect(userRooms).toContain(roomName);
    });

    it('should cleanup user rooms on disconnect', async () => {
      const userId = 'user-cleanup';
      const roomName = 'user:cleanup';
      
      const authenticatedSocket = createMockSocket({ 
        isAuthenticated: true, 
        userId 
      });

      await roomManager.createRoom(roomName);
      await roomManager.joinRoom(authenticatedSocket, roomName);

      await roomManager.cleanupUserRooms(userId);

      const userRooms = roomManager.getUserRooms(userId);
      expect(userRooms).toHaveLength(0);
    });
  });

  describe('Room Cleanup', () => {
    it('should cleanup empty rooms', async () => {
      const roomName = 'test:empty';
      await roomManager.createRoom(roomName);

      // Room should exist
      expect(roomManager.roomExists(roomName)).toBe(true);

      // Trigger cleanup
      await roomManager['cleanupEmptyRooms']();

      // Room should still exist (system rooms are not cleaned up)
      expect(roomManager.roomExists(roomName)).toBe(true);
    });

    it('should not cleanup system rooms', async () => {
      const systemRoom = 'system:notifications';
      
      // System room should exist by default
      expect(roomManager.roomExists(systemRoom)).toBe(true);

      // Trigger cleanup
      await roomManager['cleanupEmptyRooms']();

      // System room should still exist
      expect(roomManager.roomExists(systemRoom)).toBe(true);
    });
  });

  describe('Room Validation', () => {
    it('should validate room names', () => {
      const validNames = [
        'market:BTC_USDC',
        'user:123',
        'wallet:abc-123',
        'automation:def-456'
      ];

      validNames.forEach(name => {
        expect(roomManager['isValidRoomName'](name)).toBe(true);
      });
    });

    it('should reject invalid room names', () => {
      const invalidNames = [
        'invalid',
        'room:',
        ':room',
        'room with spaces',
        'room:with:too:many:colons',
        'a'.repeat(101) // Too long
      ];

      invalidNames.forEach(name => {
        expect(roomManager['isValidRoomName'](name)).toBe(false);
      });
    });

    it('should detect room types correctly', () => {
      const testCases = [
        { name: 'market:BTC_USDC', expectedType: 'public' },
        { name: 'user:123', expectedType: 'user' },
        { name: 'wallet:abc', expectedType: 'wallet' },
        { name: 'automation:def', expectedType: 'automation' },
        { name: 'system:notifications', expectedType: 'system' },
        { name: 'unknown:type', expectedType: 'user' }
      ];

      testCases.forEach(({ name, expectedType }) => {
        const detectedType = roomManager['detectRoomType'](name);
        expect(detectedType).toBe(expectedType);
      });
    });

    it('should detect authentication requirements correctly', () => {
      const testCases = [
        { name: 'market:BTC_USDC', requiresAuth: false },
        { name: 'system:notifications', requiresAuth: false },
        { name: 'user:123', requiresAuth: true },
        { name: 'wallet:abc', requiresAuth: true },
        { name: 'automation:def', requiresAuth: true }
      ];

      testCases.forEach(({ name, requiresAuth }) => {
        const detectedAuth = roomManager['detectAuthRequirement'](name);
        expect(detectedAuth).toBe(requiresAuth);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle room creation errors gracefully', async () => {
      // Test with invalid room name
      await expect(roomManager.createRoom('')).rejects.toThrow();
    });

    it('should handle room joining errors gracefully', async () => {
      const invalidRoom = 'invalid:room:name';
      
      await expect(roomManager.joinRoom(mockSocket, invalidRoom)).rejects.toThrow();
    });

    it('should handle room leaving errors gracefully', async () => {
      const nonExistentRoom = 'test:nonexistent';
      
      await expect(roomManager.leaveRoom(mockSocket, nonExistentRoom)).rejects.toThrow();
    });
  });

  describe('Performance Tests', () => {
    it('should handle many rooms efficiently', async () => {
      const roomCount = 100;
      const startTime = Date.now();

      // Create many rooms
      for (let i = 0; i < roomCount; i++) {
        await roomManager.createRoom(`test:room${i}`);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete quickly
      expect(duration).toBeLessThan(1000); // 1 second
      expect(roomManager.getAllRooms().length).toBeGreaterThanOrEqual(roomCount);
    });

    it('should handle many room operations efficiently', async () => {
      const operationCount = 100;
      const startTime = Date.now();

      // Perform many operations
      for (let i = 0; i < operationCount; i++) {
        const roomName = `test:perf${i}`;
        await roomManager.createRoom(roomName);
        await roomManager.joinRoom(mockSocket, roomName);
        await roomManager.leaveRoom(mockSocket, roomName);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete quickly
      expect(duration).toBeLessThan(2000); // 2 seconds
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete room lifecycle', async () => {
      const roomName = 'test:lifecycle';
      const userId = 'user-lifecycle';
      const authenticatedSocket = createMockSocket({ 
        isAuthenticated: true, 
        userId 
      });

      // Create room
      await roomManager.createRoom(roomName);
      expect(roomManager.roomExists(roomName)).toBe(true);

      // Join room
      await roomManager.joinRoom(authenticatedSocket, roomName);
      expect(roomManager.getUserRooms(userId)).toContain(roomName);

      // Get statistics
      const stats = roomManager.getRoomStats(roomName);
      expect(stats).toBeDefined();

      // Leave room
      await roomManager.leaveRoom(authenticatedSocket, roomName);
      expect(roomManager.getUserRooms(userId)).not.toContain(roomName);

      // Cleanup
      await roomManager.cleanupUserRooms(userId);
      expect(roomManager.getUserRooms(userId)).toHaveLength(0);
    });

    it('should handle multiple users in same room', async () => {
      const roomName = 'test:multi-user';
      const user1 = 'user-1';
      const user2 = 'user-2';
      
      const socket1 = createMockSocket({ isAuthenticated: true, userId: user1 });
      const socket2 = createMockSocket({ isAuthenticated: true, userId: user2 });

      await roomManager.createRoom(roomName);
      
      await roomManager.joinRoom(socket1, roomName);
      await roomManager.joinRoom(socket2, roomName);

      const connectionCount = await roomManager.getRoomConnectionCount(roomName);
      expect(connectionCount).toBe(2);

      expect(roomManager.getUserRooms(user1)).toContain(roomName);
      expect(roomManager.getUserRooms(user2)).toContain(roomName);
    });
  });
});
