import { SmartRouter, findOptimalRoute } from '../../src/aggregator/router.js';
import { DexAggregatorService } from '../../src/aggregator/DexAggregatorService.js';
import { Asset, ProtocolConfig } from '../../src/types/defi-types.js';
import { LiquidityGraph } from '../../src/aggregator/graph.js';

const XLM: Asset = { code: 'XLM', type: 'native' };
const USDC: Asset = { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', type: 'credit_alphanum4' };
const TEST_TOKEN: Asset = { code: 'TEST', issuer: 'GATEST', type: 'credit_alphanum4' };

const config: ProtocolConfig = {
  protocolId: 'soroswap',
  name: 'Soroswap',
  network: {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  contractAddresses: {},
  metadata: {},
};

describe('SmartRouter', () => {
  let mockAggregator: jest.Mocked<DexAggregatorService>;

  beforeEach(() => {
    // We only need to mock getBestQuote for our SmartRouter tests
    mockAggregator = {
      getBestQuote: jest.fn(),
    } as unknown as jest.Mocked<DexAggregatorService>;
  });

  it('finds direct route when it is the best', async () => {
    mockAggregator.getBestQuote.mockImplementation(async (assetIn: Asset, assetOut: Asset, amountIn: string) => {
      // Direct route XLM -> TEST gives 90
      if (assetIn.code === 'XLM' && assetOut.code === 'TEST') {
        return {
          assetIn, assetOut, amountIn, totalAmountOut: '90', routes: [{ venue: 'soroswap', amountIn, amountOut: '90', priceImpact: 0, path: [] }], effectivePrice: 0.9, savingsVsBestSingle: 0
        };
      }
      // XLM -> USDC gives 100
      if (assetIn.code === 'XLM' && assetOut.code === 'USDC') {
        return {
          assetIn, assetOut, amountIn, totalAmountOut: '100', routes: [{ venue: 'sdex', amountIn, amountOut: '100', priceImpact: 0, path: [] }], effectivePrice: 1, savingsVsBestSingle: 0
        };
      }
      // USDC -> TEST gives 80
      if (assetIn.code === 'USDC' && assetOut.code === 'TEST') {
        return {
          assetIn, assetOut, amountIn, totalAmountOut: '80', routes: [{ venue: 'soroswap', amountIn, amountOut: '80', priceImpact: 0, path: [] }], effectivePrice: 0.8, savingsVsBestSingle: 0
        };
      }
      throw new Error(`No mock route for ${assetIn.code} -> ${assetOut.code}`);
    });

    const route = await findOptimalRoute(mockAggregator, XLM, TEST_TOKEN, '100');

    expect(route.path.map(a => a.code)).toEqual(['XLM', 'TEST']);
    expect(route.hops).toHaveLength(1);
    expect(route.estimatedOutput).toBe('90');
  });

  it('finds multi-hop route when it is the best', async () => {
    mockAggregator.getBestQuote.mockImplementation(async (assetIn: Asset, assetOut: Asset, amountIn: string) => {
      // Direct route XLM -> TEST gives 80
      if (assetIn.code === 'XLM' && assetOut.code === 'TEST') {
        return {
          assetIn, assetOut, amountIn, totalAmountOut: '80', routes: [{ venue: 'soroswap', amountIn, amountOut: '80', priceImpact: 0, path: [] }], effectivePrice: 0.8, savingsVsBestSingle: 0
        };
      }
      // XLM -> USDC gives 100
      if (assetIn.code === 'XLM' && assetOut.code === 'USDC') {
        return {
          assetIn, assetOut, amountIn, totalAmountOut: '100', routes: [{ venue: 'sdex', amountIn, amountOut: '100', priceImpact: 0, path: [] }], effectivePrice: 1, savingsVsBestSingle: 0
        };
      }
      // USDC -> TEST (with input 100) gives 95
      if (assetIn.code === 'USDC' && assetOut.code === 'TEST') {
        return {
          assetIn, assetOut, amountIn, totalAmountOut: '95', routes: [{ venue: 'soroswap', amountIn, amountOut: '95', priceImpact: 0, path: [] }], effectivePrice: 0.95, savingsVsBestSingle: 0
        };
      }
      throw new Error(`No mock route for ${assetIn.code} -> ${assetOut.code}`);
    });

    const route = await findOptimalRoute(mockAggregator, XLM, TEST_TOKEN, '100');

    // The multi-hop gives 95, direct gives 80. So it should pick multi-hop.
    expect(route.path.map(a => a.code)).toEqual(['XLM', 'USDC', 'TEST']);
    expect(route.hops).toHaveLength(2);
    expect(route.estimatedOutput).toBe('95');
    expect(route.hops[0].venue).toBe('sdex');
    expect(route.hops[1].venue).toBe('soroswap');
  });

  it('respects maxHops limit', async () => {
      // Create a graph where a 3-hop route is better, but we restrict maxHops to 1
      mockAggregator.getBestQuote.mockImplementation(async (assetIn: Asset, assetOut: Asset, amountIn: string) => {
        if (assetIn.code === 'XLM' && assetOut.code === 'TEST') {
            return {
              assetIn, assetOut, amountIn, totalAmountOut: '80', routes: [{ venue: 'soroswap', amountIn, amountOut: '80', priceImpact: 0, path: [] }], effectivePrice: 0.8, savingsVsBestSingle: 0
            };
        }
        if (assetIn.code === 'XLM' && assetOut.code === 'USDC') {
            return {
              assetIn, assetOut, amountIn, totalAmountOut: '100', routes: [{ venue: 'sdex', amountIn, amountOut: '100', priceImpact: 0, path: [] }], effectivePrice: 1, savingsVsBestSingle: 0
            };
        }
        if (assetIn.code === 'USDC' && assetOut.code === 'TEST') {
            return {
              assetIn, assetOut, amountIn, totalAmountOut: '95', routes: [{ venue: 'soroswap', amountIn, amountOut: '95', priceImpact: 0, path: [] }], effectivePrice: 0.95, savingsVsBestSingle: 0
            };
        }
        throw new Error(`No mock route for ${assetIn.code} -> ${assetOut.code}`);
      });
  
      // Constrain to 1 hop. Only direct route is considered.
      const route = await findOptimalRoute(mockAggregator, XLM, TEST_TOKEN, '100', 1);
  
      expect(route.path.map(a => a.code)).toEqual(['XLM', 'TEST']);
      expect(route.hops).toHaveLength(1);
      expect(route.estimatedOutput).toBe('80');
  });

  it('throws an error if no paths are found (maxHops = 0)', async () => {
    const router = new SmartRouter(mockAggregator);
    await expect(router.findOptimalRoute(XLM, TEST_TOKEN, '100', 0))
      .rejects
      .toThrow('No paths found from XLM to TEST');
  });

  it('throws an error if all route evaluations fail with errors', async () => {
    mockAggregator.getBestQuote.mockRejectedValue(new Error('Liquidity error'));

    const router = new SmartRouter(mockAggregator);
    await expect(router.findOptimalRoute(XLM, TEST_TOKEN, '100'))
      .rejects
      .toThrow('No valid routes could be executed to find quotes');
  });
});

describe('LiquidityGraph', () => {
  it('registers source and destination assets in findAllPaths if they were not registered', () => {
    const graph = new LiquidityGraph();
    const assetA: Asset = { code: 'AAA', type: 'native' };
    const assetB: Asset = { code: 'BBB', issuer: 'GABBB', type: 'credit_alphanum4' };
    
    const paths = graph.findAllPaths(assetA, assetB);
    expect(paths).toEqual([]);
  });
});

