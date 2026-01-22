/**
 * Jest setup file for Oracles tests
 * @description Global test setup and configuration
 */

// @ts-nocheck - This file is executed by Jest runtime, types are provided by @types/jest
// Set test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
};
