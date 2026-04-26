import { jest } from '@jest/globals';
import { SoroswapClient } from '../src/services/soroswap.client.js';
import { Asset } from '@galaxy-kj/core-defi-protocols';

// Mock the core protocol
jest.mock('@galaxy-kj/core-defi-protocols', () => {
  return {
    SoroswapProtocol: jest.fn().mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      getSwapQuote: jest.fn().mockResolvedValue({
        tokenIn: { code: 'XLM', type: 'native' },
        tokenOut: { code: 'USDC', type: 'credit_alphanum4' },
        amountIn: '10',
        amountOut: '1.5',
        minimumReceived: '1.425'
      }),
      swap: jest.fn().mockResolvedValue({
        hash: 'abc123hash',
        status: 'pending'
      })
    })),
    getSoroswapConfig: jest.fn().mockReturnValue({
      protocolId: 'soroswap',
      name: 'Soroswap',
      network: { network: 'testnet' },
      contractAddresses: {}
    })
  };
});

describe('SoroswapClient', () => {
  let client: SoroswapClient;

  beforeEach(() => {
    client = new SoroswapClient();
  });

  it('should get a quote correctly', async () => {
    const tokenIn: Asset = { code: 'XLM', type: 'native' };
    const tokenOut: Asset = { code: 'USDC', type: 'credit_alphanum4' };
    
    const quote = await client.getQuote(tokenIn, tokenOut, '10');
    
    expect(quote.amountOut).toBe('1.5');
    expect(quote.minimumReceived).toBe('1.425');
  });

  it('should execute a swap correctly', async () => {
    const tokenIn: Asset = { code: 'XLM', type: 'native' };
    const tokenOut: Asset = { code: 'USDC', type: 'credit_alphanum4' };
    
    const result = await client.executeSwap(
      'GADDRESS',
      tokenIn,
      tokenOut,
      '10',
      '1.425'
    );
    
    expect(result.status).toBe('pending');
    expect(result.hash).toBe('abc123hash');
  });
});
