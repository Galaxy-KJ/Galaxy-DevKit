/**
 * Test Helpers and Utilities
 * 
 * This module provides utilities for testing the WebSocket API,
 * including mock clients, test data generators, and assertion helpers.
 */

import { Server } from 'socket.io';
import { createServer } from 'http';
import { ExtendedSocket } from '../../types/websocket-types';

/**
 * Mock Supabase Client
 */
export class MockSupabaseClient {
  private data: Map<string, any[]> = new Map();
  private authUser: any = null;

  constructor() {
    this.data.set('users', []);
    this.data.set('wallets', []);
    this.data.set('transactions', []);
    this.data.set('automations', []);
  }

  from(table: string) {
    return {
      select: (columns: string) => ({
        eq: (column: string, value: any) => ({
          eq: (column2: string, value2: any) => ({
            single: () => this.getSingleRecord(table, column, value, column2, value2)
          }),
          single: () => this.getSingleRecord(table, column, value)
        }),
        order: (column: string, options: any) => ({
          limit: (count: number) => this.getRecords(table, count)
        }),
        limit: (count: number) => this.getRecords(table, count)
      }),
      update: (data: any) => ({
        eq: (column: string, value: any) => ({
          eq: (column2: string, value2: any) => this.updateRecord(table, column, value, column2, value2, data)
        })
      }),
      insert: (data: any) => this.insertRecord(table, data)
    };
  }

  get auth() {
    return {
      getUser: (token: string) => Promise.resolve({
        data: { user: this.authUser },
        error: null
      })
    };
  }

  channel(name: string) {
    return {
      on: (event: string, options: any, callback: Function) => ({
        subscribe: () => {
          // Mock subscription
          return { unsubscribe: () => {} };
        }
      })
    };
  }

  removeAllChannels() {
    // Mock cleanup
  }

  private getSingleRecord(table: string, column: string, value: any, column2?: string, value2?: any) {
    const records = this.data.get(table) || [];
    const record = records.find(r => 
      r[column] === value && (!column2 || r[column2] === value2)
    );
    return Promise.resolve({ data: record, error: record ? null : new Error('Not found') });
  }

  private getRecords(table: string, limit?: number) {
    const records = this.data.get(table) || [];
    const limited = limit ? records.slice(0, limit) : records;
    return Promise.resolve({ data: limited, error: null });
  }

  private updateRecord(table: string, column: string, value: any, column2: string, value2: any, data: any) {
    const records = this.data.get(table) || [];
    const index = records.findIndex(r => r[column] === value && r[column2] === value2);
    if (index !== -1) {
      records[index] = { ...records[index], ...data };
      this.data.set(table, records);
    }
    return Promise.resolve({ error: null });
  }

  private insertRecord(table: string, data: any) {
    const records = this.data.get(table) || [];
    const newRecord = { id: `mock-${Date.now()}`, ...data };
    records.push(newRecord);
    this.data.set(table, records);
    return Promise.resolve({ data: newRecord, error: null });
  }

  // Test helper methods
  setAuthUser(user: any) {
    this.authUser = user;
  }

  addRecord(table: string, record: any) {
    const records = this.data.get(table) || [];
    records.push(record);
    this.data.set(table, records);
  }

  clearData() {
    this.data.clear();
    this.authUser = null;
  }
}

/**
 * Test Socket.IO Server Factory
 */
export class TestSocketIOServer {
  private httpServer: any;
  private io: Server;

  constructor() {
    this.httpServer = createServer();
    this.io = new Server(this.httpServer, {
      cors: {
        origin: "*",
        credentials: true
      }
    });
  }

  getServer(): Server {
    return this.io;
  }

  async start(port: number = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(port, (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          const address = this.httpServer.address();
          const actualPort = typeof address === 'object' ? address?.port : port;
          resolve(actualPort || 0);
        }
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.io.close(() => {
        this.httpServer.close(() => {
          resolve();
        });
      });
    });
  }
}

/**
 * Test Client Factory
 */
export class TestClient {
  private io: any;
  private socket: any;

  constructor(serverUrl: string) {
    // Mock socket.io client
    this.io = {
      connect: (url: string) => {
        this.socket = {
          id: `test-${Date.now()}`,
          connected: true,
          emit: jest.fn(),
          on: jest.fn(),
          off: jest.fn(),
          disconnect: jest.fn(),
          join: jest.fn(),
          leave: jest.fn()
        };
        return this.socket;
      }
    };
  }

  connect(url: string) {
    return this.io.connect(url);
  }

  getSocket() {
    return this.socket;
  }
}

/**
 * Test Data Generators
 */
export class TestDataGenerator {
  /**
   * Generate mock user data
   */
  static generateUser(overrides: any = {}): any {
    return {
      id: `user-${Date.now()}`,
      email: `test-${Date.now()}@example.com`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      profile_data: {},
      ...overrides
    };
  }

  /**
   * Generate mock wallet data
   */
  static generateWallet(userId: string, overrides: any = {}): any {
    return {
      id: `wallet-${Date.now()}`,
      user_id: userId,
      public_key: `G${Math.random().toString(36).substr(2, 55)}`,
      private_key_encrypted: `encrypted-${Math.random().toString(36).substr(2, 32)}`,
      network: 'testnet',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {},
      ...overrides
    };
  }

  /**
   * Generate mock transaction data
   */
  static generateTransaction(userId: string, walletId: string, overrides: any = {}): any {
    return {
      id: `tx-${Date.now()}`,
      user_id: userId,
      wallet_id: walletId,
      hash: `hash-${Math.random().toString(36).substr(2, 64)}`,
      from_address: `G${Math.random().toString(36).substr(2, 55)}`,
      to_address: `G${Math.random().toString(36).substr(2, 55)}`,
      amount: Math.random() * 1000,
      asset: 'XLM',
      network: 'testnet',
      status: 'pending',
      created_at: new Date().toISOString(),
      metadata: {},
      ...overrides
    };
  }

  /**
   * Generate mock automation data
   */
  static generateAutomation(userId: string, walletId: string, overrides: any = {}): any {
    return {
      id: `automation-${Date.now()}`,
      user_id: userId,
      wallet_id: walletId,
      contract_id: null,
      name: `Test Automation ${Date.now()}`,
      description: 'Test automation rule',
      status: 'active',
      trigger_conditions: {
        type: 'price_threshold',
        asset: 'XLM',
        threshold: 0.1,
        operator: 'greater_than'
      },
      action_config: {
        type: 'buy',
        asset: 'XLM',
        amount: 100
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_executed_at: null,
      metadata: {},
      ...overrides
    };
  }

  /**
   * Generate mock market data
   */
  static generateMarketData(pair: string, overrides: any = {}): any {
    return {
      id: `market-${Date.now()}`,
      symbol: pair,
      price: Math.random() * 1000,
      volume_24h: Math.random() * 1000000,
      change_24h: (Math.random() - 0.5) * 20,
      market_cap: Math.random() * 1000000000,
      timestamp: new Date().toISOString(),
      source: 'galaxy-oracle',
      ...overrides
    };
  }

  /**
   * Generate mock WebSocket event
   */
  static generateWebSocketEvent(type: string, data: any, overrides: any = {}): any {
    return {
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      source: 'galaxy-websocket',
      type,
      data,
      ...overrides
    };
  }
}

/**
 * Test Assertion Helpers
 */
export class TestAssertions {
  /**
   * Assert that an event was emitted
   */
  static assertEventEmitted(socket: any, eventType: string, expectedData?: any): void {
    const emitCalls = socket.emit.mock.calls;
    const eventCall = emitCalls.find(call => call[0] === eventType);
    
    expect(eventCall).toBeDefined();
    
    if (expectedData) {
      expect(eventCall[1]).toMatchObject(expectedData);
    }
  }

  /**
   * Assert that an event was not emitted
   */
  static assertEventNotEmitted(socket: any, eventType: string): void {
    const emitCalls = socket.emit.mock.calls;
    const eventCall = emitCalls.find(call => call[0] === eventType);
    
    expect(eventCall).toBeUndefined();
  }

  /**
   * Assert that a room was joined
   */
  static assertRoomJoined(socket: any, roomName: string): void {
    const joinCalls = socket.join.mock.calls;
    const roomCall = joinCalls.find(call => call[0] === roomName);
    
    expect(roomCall).toBeDefined();
  }

  /**
   * Assert that a room was left
   */
  static assertRoomLeft(socket: any, roomName: string): void {
    const leaveCalls = socket.leave.mock.calls;
    const roomCall = leaveCalls.find(call => call[0] === roomName);
    
    expect(roomCall).toBeDefined();
  }

  /**
   * Assert connection state
   */
  static assertConnectionState(socket: ExtendedSocket, expectedState: Partial<any>): void {
    if (expectedState.isAuthenticated !== undefined) {
      expect(socket.isAuthenticated).toBe(expectedState.isAuthenticated);
    }
    
    if (expectedState.userId !== undefined) {
      expect(socket.userId).toBe(expectedState.userId);
    }
    
    if (expectedState.rooms !== undefined) {
      expect(socket.connectionState?.rooms).toEqual(expect.arrayContaining(expectedState.rooms));
    }
  }
}

/**
 * Mock Environment Variables
 */
export function mockEnvironment(overrides: Record<string, string> = {}): void {
  const defaults = {
    NODE_ENV: 'test',
    WEBSOCKET_PORT: '3001',
    WEBSOCKET_HOST: 'localhost',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    STELLAR_NETWORK: 'testnet',
    STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
    ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:3001',
    CORS_CREDENTIALS: 'true',
    MAX_CONNECTIONS_PER_USER: '5',
    CONNECTION_TIMEOUT: '30000',
    HEARTBEAT_INTERVAL: '30000',
    ROOM_CLEANUP_INTERVAL: '300000',
    LOG_LEVEL: 'debug',
    LOG_CONSOLE: 'true',
    LOG_FILE: 'false'
  };

  Object.assign(process.env, defaults, overrides);
}

/**
 * Wait for a specified amount of time
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a mock socket with default properties
 */
export function createMockSocket(overrides: any = {}): ExtendedSocket {
  return {
    id: `mock-${Date.now()}`,
    connected: true,
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    handshake: {
      address: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent'
      }
    },
    isAuthenticated: false,
    userId: undefined,
    connectionState: {
      socketId: `mock-${Date.now()}`,
      isAuthenticated: false,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      rooms: new Set(),
      metadata: {}
    },
    ...overrides
  } as ExtendedSocket;
}

/**
 * Jest mock setup
 */
export function setupJestMocks(): void {
  jest.clearAllMocks();
  jest.useFakeTimers();
}

/**
 * Cleanup after tests
 */
export function cleanup(): void {
  jest.clearAllMocks();
  jest.useRealTimers();
}
