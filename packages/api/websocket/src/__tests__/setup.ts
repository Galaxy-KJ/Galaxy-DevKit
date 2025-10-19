/**
 * Jest Test Setup
 * 
 * This file configures Jest for testing the WebSocket API.
 */

import { mockEnvironment, setupJestMocks, cleanup } from './utils/test-helpers';

// Setup test environment
beforeAll(() => {
  mockEnvironment({
    NODE_ENV: 'test',
    WEBSOCKET_PORT: '0', // Use random port
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
    LOG_LEVEL: 'error', // Reduce log noise in tests
    LOG_CONSOLE: 'false',
    LOG_FILE: 'false'
  });
});

beforeEach(() => {
  setupJestMocks();
});

afterEach(() => {
  cleanup();
});

// Global test timeout
jest.setTimeout(10000);
