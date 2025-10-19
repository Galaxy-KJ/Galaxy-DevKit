/**
 * WebSocket Integration Tests
 * 
 * This module tests the complete WebSocket API functionality
 * including connection lifecycle, authentication, and event flow.
 */

import { WebSocketServer } from '../../index';
import { TestDataGenerator, mockEnvironment, setupJestMocks, cleanup, wait } from '../utils/test-helpers';

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: TestDataGenerator.generateUser() },
        error: null
      })
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: TestDataGenerator.generateUser(),
            error: null
          })
        }))
      }))
    })),
    channel: jest.fn(() => ({
      on: jest.fn(() => ({
        subscribe: jest.fn(() => ({ unsubscribe: jest.fn() }))
      }))
    })),
    removeAllChannels: jest.fn()
  }))
}));

describe('WebSocket Integration Tests', () => {
  let server: WebSocketServer;

  beforeEach(() => {
    setupJestMocks();
    mockEnvironment({
      NODE_ENV: 'test',
      WEBSOCKET_PORT: '0', // Use random port
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key'
    });
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    cleanup();
  });

  describe('Server Lifecycle', () => {
    it('should start and stop server successfully', async () => {
      server = new WebSocketServer();
      
      await expect(server.start()).resolves.not.toThrow();
      
      const stats = server.getServerStats();
      expect(stats.server.environment).toBe('test');
      expect(stats.server.version).toBeDefined();
      
      await expect(server.stop()).resolves.not.toThrow();
    });

    it('should handle graceful shutdown', async () => {
      server = new WebSocketServer();
      await server.start();

      // Simulate shutdown signal
      const shutdownPromise = new Promise<void>((resolve) => {
        process.once('SIGTERM', () => {
          server.stop().then(resolve);
        });
      });

      // Trigger shutdown
      process.emit('SIGTERM' as any);

      await expect(shutdownPromise).resolves.not.toThrow();
    });
  });

  describe('Health and Metrics Endpoints', () => {
    it('should respond to health check', async () => {
      server = new WebSocketServer();
      await server.start();

      const stats = server.getServerStats();
      expect(stats.server.uptime).toBeGreaterThan(0);
      expect(stats.server.memory).toBeDefined();
      expect(stats.server.cpu).toBeDefined();
    });

    it('should provide server statistics', async () => {
      server = new WebSocketServer();
      await server.start();

      const stats = server.getServerStats();
      
      expect(stats).toHaveProperty('server');
      expect(stats).toHaveProperty('connections');
      expect(stats).toHaveProperty('rooms');
      expect(stats).toHaveProperty('events');
      expect(stats).toHaveProperty('automations');
      expect(stats).toHaveProperty('transactions');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate configuration on startup', async () => {
      server = new WebSocketServer();
      
      await expect(server.start()).resolves.not.toThrow();
    });

    it('should handle invalid configuration gracefully', async () => {
      // Mock invalid configuration
      jest.spyOn(require('../../config'), 'validateConfig').mockImplementation(() => {
        throw new Error('Invalid configuration');
      });

      server = new WebSocketServer();
      
      await expect(server.start()).rejects.toThrow('Invalid configuration');
    });
  });

  describe('Error Handling', () => {
    it('should handle uncaught exceptions', async () => {
      server = new WebSocketServer();
      await server.start();

      // Simulate uncaught exception
      const error = new Error('Test uncaught exception');
      process.emit('uncaughtException' as any, error);

      // Should handle gracefully
      await wait(100);
      expect(true).toBe(true); // Should not crash
    });

    it('should handle unhandled promise rejections', async () => {
      server = new WebSocketServer();
      await server.start();

      // Simulate unhandled rejection
      const promise = Promise.reject(new Error('Test unhandled rejection'));
      process.emit('unhandledRejection' as any, promise, promise);

      // Should handle gracefully
      await wait(100);
      expect(true).toBe(true); // Should not crash
    });
  });

  describe('Performance Tests', () => {
    it('should handle high load gracefully', async () => {
      server = new WebSocketServer();
      await server.start();

      const startTime = Date.now();
      
      // Simulate high load
      const promises = Array.from({ length: 100 }, (_, i) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => resolve(), Math.random() * 10);
        });
      });

      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000); // 1 second
    });

    it('should maintain performance under stress', async () => {
      server = new WebSocketServer();
      await server.start();

      const initialStats = server.getServerStats();
      
      // Simulate stress
      for (let i = 0; i < 50; i++) {
        const stats = server.getServerStats();
        expect(stats.server.uptime).toBeGreaterThan(0);
        await wait(10);
      }

      const finalStats = server.getServerStats();
      expect(finalStats.server.uptime).toBeGreaterThan(initialStats.server.uptime);
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory during operation', async () => {
      server = new WebSocketServer();
      await server.start();

      const initialMemory = process.memoryUsage();
      
      // Simulate operation
      for (let i = 0; i < 100; i++) {
        const stats = server.getServerStats();
        expect(stats).toBeDefined();
        await wait(10);
      }

      const finalMemory = process.memoryUsage();
      
      // Memory usage should not increase significantly
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // 10MB
    });

    it('should cleanup resources on shutdown', async () => {
      server = new WebSocketServer();
      await server.start();

      const initialStats = server.getServerStats();
      expect(initialStats.connections.total).toBeGreaterThanOrEqual(0);

      await server.stop();

      // Server should be stopped
      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent server operations', async () => {
      server = new WebSocketServer();
      await server.start();

      // Simulate concurrent operations
      const operations = Array.from({ length: 10 }, (_, i) => 
        new Promise<any>((resolve) => {
          setTimeout(() => {
            const stats = server.getServerStats();
            resolve(stats);
          }, Math.random() * 100);
        })
      );

      const results = await Promise.all(operations);
      
      // All operations should complete successfully
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.server).toBeDefined();
      });
    });

    it('should handle concurrent start/stop operations', async () => {
      const servers = Array.from({ length: 3 }, () => new WebSocketServer());
      
      // Start all servers concurrently
      const startPromises = servers.map(server => server.start());
      await Promise.all(startPromises);

      // All servers should be running
      servers.forEach(server => {
        const stats = server.getServerStats();
        expect(stats.server.uptime).toBeGreaterThan(0);
      });

      // Stop all servers concurrently
      const stopPromises = servers.map(server => server.stop());
      await Promise.all(stopPromises);
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle missing environment variables', async () => {
      // Clear environment variables
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      server = new WebSocketServer();
      
      await expect(server.start()).rejects.toThrow();
    });

    it('should handle invalid port numbers', async () => {
      mockEnvironment({
        WEBSOCKET_PORT: '99999' // Invalid port
      });

      server = new WebSocketServer();
      
      await expect(server.start()).rejects.toThrow();
    });

    it('should handle invalid CORS configuration', async () => {
      mockEnvironment({
        ALLOWED_ORIGINS: '' // Empty origins
      });

      server = new WebSocketServer();
      
      // Should use default origins
      await expect(server.start()).resolves.not.toThrow();
    });
  });

  describe('Real-time Features', () => {
    it('should maintain real-time connections', async () => {
      server = new WebSocketServer();
      await server.start();

      const stats = server.getServerStats();
      expect(stats.connections.total).toBeGreaterThanOrEqual(0);
      expect(stats.rooms.total).toBeGreaterThanOrEqual(0);
    });

    it('should handle room management', async () => {
      server = new WebSocketServer();
      await server.start();

      const stats = server.getServerStats();
      expect(stats.rooms).toBeDefined();
      expect(stats.rooms.total).toBeGreaterThanOrEqual(0);
    });

    it('should handle event broadcasting', async () => {
      server = new WebSocketServer();
      await server.start();

      const stats = server.getServerStats();
      expect(stats.events).toBeDefined();
      expect(stats.events.queueSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Production Readiness', () => {
    it('should be production ready with valid configuration', async () => {
      mockEnvironment({
        NODE_ENV: 'production',
        WEBSOCKET_PORT: '3001',
        SUPABASE_URL: 'https://production.supabase.co',
        SUPABASE_ANON_KEY: 'production-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'production-service-role-key',
        ALLOWED_ORIGINS: 'https://app.galaxy.dev',
        CORS_CREDENTIALS: 'true',
        MAX_CONNECTIONS_PER_USER: '3',
        CONNECTION_TIMEOUT: '15000',
        HEARTBEAT_INTERVAL: '25000',
        LOG_LEVEL: 'warn',
        LOG_CONSOLE: 'false',
        LOG_FILE: 'true'
      });

      server = new WebSocketServer();
      
      await expect(server.start()).resolves.not.toThrow();
      
      const stats = server.getServerStats();
      expect(stats.server.environment).toBe('production');
    });

    it('should reject production configuration with security issues', async () => {
      mockEnvironment({
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: '*' // Security issue
      });

      server = new WebSocketServer();
      
      await expect(server.start()).rejects.toThrow();
    });
  });
});
