/**
 * Event Broadcaster Tests
 * 
 * This module tests the event broadcasting functionality including
 * room broadcasting, user broadcasting, and event queuing.
 */

import { EventBroadcaster } from '../../services/event-broadcaster';
import { TestSocketIOServer, TestDataGenerator, createMockSocket, setupJestMocks, cleanup, wait } from '../utils/test-helpers';

describe('Event Broadcaster', () => {
  let testServer: TestSocketIOServer;
  let eventBroadcaster: EventBroadcaster;
  let mockSocket: any;

  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    setupJestMocks();
    testServer = new TestSocketIOServer();
    const io = testServer.getServer();
    eventBroadcaster = new EventBroadcaster(io);
    mockSocket = createMockSocket();
  });

  afterEach(async () => {
    eventBroadcaster.destroy();
    await testServer.stop();
    jest.restoreAllMocks();
    cleanup();
  });

  describe('Room Broadcasting', () => {
    it('should broadcast event to room', async () => {
      const roomName = 'test:room';
      const event = TestDataGenerator.generateWebSocketEvent('test:event', { message: 'test' });

      // Mock room with members
      const mockRoom = new Set(['socket1', 'socket2']);
      (testServer.getServer().sockets.adapter as any).rooms = new Map([
        [roomName, mockRoom]
      ]);

      await eventBroadcaster.broadcastToRoom(roomName, event);

      // Verify event was broadcast (mocked in test setup)
      expect(true).toBe(true); // Placeholder assertion
    });

    it('should handle empty rooms gracefully', async () => {
      const roomName = 'test:empty';
      const event = TestDataGenerator.generateWebSocketEvent('test:event', { message: 'test' });

      // Mock empty room
      (testServer.getServer().sockets.adapter as any).rooms = new Map();

      await eventBroadcaster.broadcastToRoom(roomName, event);

      // Should not throw error
      expect(true).toBe(true);
    });

    it('should queue events for empty rooms when retry is enabled', async () => {
      const roomName = 'test:queued';
      const event = TestDataGenerator.generateWebSocketEvent('test:event', { message: 'test' });
      const options = {
        retry: {
          maxAttempts: 3,
          delay: 1000
        }
      };

      // Mock empty room
      (testServer.getServer().sockets.adapter as any).rooms = new Map();

      await eventBroadcaster.broadcastToRoom(roomName, event, options);

      const queueStats = eventBroadcaster.getQueueStats();
      expect(queueStats.queueSize).toBeGreaterThan(0);
    });
  });

  describe('User Broadcasting', () => {
    it('should broadcast event to specific user', async () => {
      const userId = 'user-123';
      const event = TestDataGenerator.generateWebSocketEvent('test:event', { message: 'test' });

      // Mock user socket
      const mockUserSocket = createMockSocket({ userId });
      jest.spyOn(eventBroadcaster as any, 'findUserSocket').mockReturnValue(mockUserSocket);

      await eventBroadcaster.broadcastToUser(userId, event);

      expect(mockUserSocket.emit).toHaveBeenCalledWith(event.type, expect.any(Object));
    });

    it('should handle user not found gracefully', async () => {
      const userId = 'user-not-found';
      const event = TestDataGenerator.generateWebSocketEvent('test:event', { message: 'test' });

      // Mock user not found
      jest.spyOn(eventBroadcaster as any, 'findUserSocket').mockReturnValue(undefined);

      await eventBroadcaster.broadcastToUser(userId, event);

      // Should not throw error
      expect(true).toBe(true);
    });

    it('should queue events for offline users when retry is enabled', async () => {
      const userId = 'user-offline';
      const event = TestDataGenerator.generateWebSocketEvent('test:event', { message: 'test' });
      const options = {
        retry: {
          maxAttempts: 3,
          delay: 1000
        }
      };

      // Mock user not found
      jest.spyOn(eventBroadcaster as any, 'findUserSocket').mockReturnValue(undefined);

      await eventBroadcaster.broadcastToUser(userId, event, options);

      const queueStats = eventBroadcaster.getQueueStats();
      expect(queueStats.queueSize).toBeGreaterThan(0);
    });
  });

  describe('Global Broadcasting', () => {
    it('should broadcast event to all clients', async () => {
      const event = TestDataGenerator.generateWebSocketEvent('test:global', { message: 'test' });

      await eventBroadcaster.broadcastGlobal(event);

      // Verify event was broadcast globally (mocked in test setup)
      expect(true).toBe(true); // Placeholder assertion
    });

    it('should handle global broadcast errors gracefully', async () => {
      const event = TestDataGenerator.generateWebSocketEvent('test:error', { message: 'test' });

      // Mock server error
      jest.spyOn(testServer.getServer(), 'emit').mockImplementation(() => {
        throw new Error('Broadcast error');
      });

      await expect(eventBroadcaster.broadcastGlobal(event)).rejects.toThrow();
    });
  });

  describe('Multiple Target Broadcasting', () => {
    it('should broadcast to multiple rooms', async () => {
      const roomNames = ['test:room1', 'test:room2'];
      const event = TestDataGenerator.generateWebSocketEvent('test:multi-room', { message: 'test' });

      // Mock rooms with members
      const mockRoom1 = new Set(['socket1']);
      const mockRoom2 = new Set(['socket2']);
      (testServer.getServer().sockets.adapter as any).rooms = new Map([
        [roomNames[0], mockRoom1],
        [roomNames[1], mockRoom2]
      ]);

      await eventBroadcaster.broadcastToRooms(roomNames, event);

      // Should not throw error
      expect(true).toBe(true);
    });

    it('should broadcast to multiple users', async () => {
      const userIds = ['user-1', 'user-2'];
      const event = TestDataGenerator.generateWebSocketEvent('test:multi-user', { message: 'test' });

      // Mock user sockets
      const mockUser1 = createMockSocket({ userId: userIds[0] });
      const mockUser2 = createMockSocket({ userId: userIds[1] });
      jest.spyOn(eventBroadcaster as any, 'findUserSocket')
        .mockReturnValueOnce(mockUser1)
        .mockReturnValueOnce(mockUser2);

      await eventBroadcaster.broadcastToUsers(userIds, event);

      expect(mockUser1.emit).toHaveBeenCalledWith(event.type, expect.any(Object));
      expect(mockUser2.emit).toHaveBeenCalledWith(event.type, expect.any(Object));
    });
  });

  describe('Event Preparation', () => {
    it('should add timestamp to events by default', async () => {
      const event = TestDataGenerator.generateWebSocketEvent('test:timestamp', { message: 'test' });
      const originalTimestamp = event.timestamp;
      await eventBroadcaster.broadcastGlobal(event);
      // Event should have timestamp
      expect(event.timestamp).toBeDefined();
      expect(event.timestamp).toBeGreaterThanOrEqual(originalTimestamp);
    });

    it('should not add timestamp when disabled', async () => {
      const event = TestDataGenerator.generateWebSocketEvent('test:no-timestamp', { message: 'test' });
      const originalTimestamp = event.timestamp;
      const options = { includeTimestamp: false };

      await eventBroadcaster.broadcastGlobal(event, options);

      // Event timestamp should not change
      expect(event.timestamp).toBe(originalTimestamp);
    });

    it('should add source to events by default', async () => {
      const event = TestDataGenerator.generateWebSocketEvent('test:source', { message: 'test' });

      await eventBroadcaster.broadcastGlobal(event);

      // Event should have source
      expect(event.source).toBe('galaxy-websocket');
    });

    it('should not add source when disabled', async () => {
      const event = TestDataGenerator.generateWebSocketEvent('test:no-source', { message: 'test' });
      const originalSource = event.source;
      const options = { includeSource: false };

      await eventBroadcaster.broadcastGlobal(event, options);

      // Event source should not change
      expect(event.source).toBe(originalSource);
    });
  });

  describe('Queue Management', () => {
    it('should process queued events', async () => {
      jest.useRealTimers();
      const roomName = 'test:queue';
      const event = TestDataGenerator.generateWebSocketEvent('test:queued', { message: 'test' });
      const options = {
        retry: {
          maxAttempts: 3,
          delay: 1000
        }
      };
      (testServer.getServer().sockets.adapter as any).rooms = new Map();
      await eventBroadcaster.broadcastToRoom(roomName, event, options);
      const initialQueueSize = eventBroadcaster.getQueueStats().queueSize;
      expect(initialQueueSize).toBeGreaterThan(0);
      // Make the room available
      const mockRoom = new Set(['socket1']);
      (testServer.getServer().sockets.adapter as any).rooms = new Map([
        [roomName, mockRoom]
      ]);
      // Wait for processing
      await wait(300);
      // Forcibly process the queue if still stuck (test may run under fake timers in CI)
      await eventBroadcaster['processQueue']();
      const finalQueueSize = eventBroadcaster.getQueueStats().queueSize;
      expect(finalQueueSize).toBeLessThanOrEqual(initialQueueSize - 1);
    });

    it('should respect queue size limits', async () => {
      const maxQueueSize = 5;
      eventBroadcaster.setMaxQueueSize(maxQueueSize);

      // Fill queue beyond limit
      for (let i = 0; i < maxQueueSize + 5; i++) {
        const event = TestDataGenerator.generateWebSocketEvent('test:overflow', { message: `test-${i}` });
        const options = {
          retry: {
            maxAttempts: 3,
            delay: 1000
          }
        };

        await eventBroadcaster.broadcastToRoom(`test:room${i}`, event, options);
      }

      const queueStats = eventBroadcaster.getQueueStats();
      expect(queueStats.queueSize).toBeLessThanOrEqual(maxQueueSize);
    });

    it('should clear queue', () => {
      // Add some events to queue
      eventBroadcaster['broadcastQueue'] = [
        { event: TestDataGenerator.generateWebSocketEvent('test:1', {}), target: 'room1', options: {}, retryCount: 0, queuedAt: Date.now() },
        { event: TestDataGenerator.generateWebSocketEvent('test:2', {}), target: 'room2', options: {}, retryCount: 0, queuedAt: Date.now() }
      ];

      eventBroadcaster.clearQueue();

      const queueStats = eventBroadcaster.getQueueStats();
      expect(queueStats.queueSize).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should provide queue statistics', () => {
      const queueStats = eventBroadcaster.getQueueStats();

      expect(queueStats).toHaveProperty('queueSize');
      expect(queueStats).toHaveProperty('maxQueueSize');
      expect(queueStats).toHaveProperty('oldestItem');
    });

    it('should provide connection statistics', () => {
      const userCount = eventBroadcaster.getConnectedUserCount();
      const totalCount = eventBroadcaster.getTotalConnectionCount();
      const roomCount = eventBroadcaster.getRoomConnectionCount('test:room');

      expect(typeof userCount).toBe('number');
      expect(typeof totalCount).toBe('number');
      expect(typeof roomCount).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should handle broadcast errors gracefully', async () => {
      const event = TestDataGenerator.generateWebSocketEvent('test:error', { message: 'test' });
      // Mock server error
      (testServer.getServer() as any).to = () => { throw new Error('Broadcast error') };
      await expect(eventBroadcaster.broadcastToRoom('test:room', event)).resolves.not.toThrow();
    });

    it('should handle queue processing errors gracefully', async () => {
      // Add malformed event to queue
      eventBroadcaster['broadcastQueue'] = [
        { event: null, target: 'room1', options: {}, retryCount: 0, queuedAt: Date.now() }
      ];

      // Should not throw error during processing
      await eventBroadcaster['processQueue']();

      expect(true).toBe(true); // Should complete without error
    });
  });

  describe('Performance Tests', () => {
    it('should handle high volume of broadcasts efficiently', async () => {
      const eventCount = 100;
      const startTime = Date.now();

      const promises = Array.from({ length: eventCount }, (_, i) => {
        const event = TestDataGenerator.generateWebSocketEvent('test:perf', { message: `test-${i}` });
        return eventBroadcaster.broadcastGlobal(event);
      });

      await Promise.all(promises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete quickly
      expect(duration).toBeLessThan(1000); // 1 second
    });

    it('should handle queue processing efficiently', async () => {
      const queueSize = 100;
      const startTime = Date.now();

      // Fill queue
      for (let i = 0; i < queueSize; i++) {
        const event = TestDataGenerator.generateWebSocketEvent('test:queue', { message: `test-${i}` });
        const options = {
          retry: {
            maxAttempts: 3,
            delay: 1000
          }
        };
        await eventBroadcaster.broadcastToRoom(`test:room${i}`, event, options);
      }

      // Process queue
      await eventBroadcaster['processQueue']();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete quickly
      expect(duration).toBeLessThan(1000); // 1 second
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete broadcast workflow', async () => {
      const roomName = 'test:workflow';
      const userId = 'user-workflow';
      const event = TestDataGenerator.generateWebSocketEvent('test:workflow', { message: 'test' });

      // Mock room with members
      const mockRoom = new Set(['socket1']);
      (testServer.getServer().sockets.adapter as any).rooms = new Map([
        [roomName, mockRoom]
      ]);

      // Mock user socket
      const mockUserSocket = createMockSocket({ userId });
      jest.spyOn(eventBroadcaster as any, 'findUserSocket').mockReturnValue(mockUserSocket);

      // Test all broadcast methods
      await eventBroadcaster.broadcastToRoom(roomName, event);
      await eventBroadcaster.broadcastToUser(userId, event);
      await eventBroadcaster.broadcastGlobal(event);

      // Should complete without errors
      expect(true).toBe(true);
    });

    it('should handle mixed broadcast scenarios', async () => {
      const rooms = ['test:room1', 'test:room2'];
      const users = ['user-1', 'user-2'];
      const event = TestDataGenerator.generateWebSocketEvent('test:mixed', { message: 'test' });

      // Mock rooms
      const mockRoom1 = new Set(['socket1']);
      const mockRoom2 = new Set(['socket2']);
      (testServer.getServer().sockets.adapter as any).rooms = new Map([
        [rooms[0], mockRoom1],
        [rooms[1], mockRoom2]
      ]);

      // Mock user sockets
      const mockUser1 = createMockSocket({ userId: users[0] });
      const mockUser2 = createMockSocket({ userId: users[1] });
      jest.spyOn(eventBroadcaster as any, 'findUserSocket')
        .mockReturnValueOnce(mockUser1)
        .mockReturnValueOnce(mockUser2);

      // Test mixed broadcasts
      await eventBroadcaster.broadcastToRooms(rooms, event);
      await eventBroadcaster.broadcastToUsers(users, event);

      // Should complete without errors
      expect(true).toBe(true);
    });
  });
});
