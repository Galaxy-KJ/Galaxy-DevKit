/**
 * Jest test setup.
 *
 * Env must be set before any module under test loads `config`,
 * which reads process.env at import time.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.WEBSOCKET_PORT = process.env.WEBSOCKET_PORT || '0';
process.env.WEBSOCKET_HOST = process.env.WEBSOCKET_HOST || 'localhost';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.STELLAR_NETWORK = process.env.STELLAR_NETWORK || 'testnet';
process.env.STELLAR_HORIZON_URL =
  process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
process.env.ALLOWED_ORIGINS =
  process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001';
process.env.CORS_CREDENTIALS = process.env.CORS_CREDENTIALS || 'true';
process.env.MAX_CONNECTIONS_PER_USER = process.env.MAX_CONNECTIONS_PER_USER || '5';
process.env.CONNECTION_TIMEOUT = process.env.CONNECTION_TIMEOUT || '30000';
process.env.HEARTBEAT_INTERVAL = process.env.HEARTBEAT_INTERVAL || '30000';
process.env.ROOM_CLEANUP_INTERVAL = process.env.ROOM_CLEANUP_INTERVAL || '300000';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.LOG_CONSOLE = process.env.LOG_CONSOLE || 'false';
process.env.LOG_FILE = process.env.LOG_FILE || 'false';
process.env.MARKET_STALENESS_MS = process.env.MARKET_STALENESS_MS || '60000';

jest.setTimeout(15000);
