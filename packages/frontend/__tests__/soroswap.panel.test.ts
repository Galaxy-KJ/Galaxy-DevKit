import { jest } from '@jest/globals';
import { SoroswapPanel } from '../src/panels/soroswap.js';
import blessed from 'blessed';

// Mock blessed and soroswapService
jest.mock('blessed', () => ({
  box: jest.fn().mockReturnValue({ on: jest.fn(), key: jest.fn() }),
  text: jest.fn().mockReturnValue({ setContent: jest.fn() }),
  textbox: jest.fn().mockReturnValue({ on: jest.fn(), key: jest.fn() }),
  button: jest.fn().mockReturnValue({ on: jest.fn(), key: jest.fn() }),
  screen: jest.fn().mockReturnValue({ render: jest.fn() })
}));

jest.mock('../src/services/soroswap.client.js', () => ({
  soroswapService: {
    getQuote: jest.fn(),
    executeSwap: jest.fn()
  }
}));

describe('SoroswapPanel', () => {
  let mockScreen: any;
  let mockGrid: any;

  beforeEach(() => {
    mockScreen = { render: jest.fn() };
    mockGrid = { set: jest.fn().mockReturnValue({ on: jest.fn() }) };
  });

  it('should initialize correctly', () => {
    const panel = new SoroswapPanel({
      screen: mockScreen,
      grid: mockGrid,
      row: 0,
      col: 0,
      rowSpan: 12,
      colSpan: 12
    });

    expect(panel).toBeDefined();
    expect(mockGrid.set).toHaveBeenCalled();
  });
});
