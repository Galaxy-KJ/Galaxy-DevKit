/**
 * Jest setup file for DeFi Protocols tests
 * @description Global test setup and configuration
 */

// Set test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
};
