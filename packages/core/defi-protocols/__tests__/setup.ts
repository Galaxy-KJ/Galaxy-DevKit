/**
 * Jest setup file for DeFi Protocols tests
 * @description Global test setup and configuration
 */

import { jest } from '@jest/globals';

// Set test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: jest.fn() as any,
  warn: jest.fn() as any,
  log: jest.fn() as any,
};
