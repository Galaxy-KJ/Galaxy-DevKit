import { DexAggregatorService } from '../../src/aggregator/DexAggregatorService';
import { Asset, ProtocolConfig } from '../../src/types/defi-types';

const XLM: Asset = { code: 'XLM', type: 'native' };
const USDC: Asset = {
  code: 'USDC',
  issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  type: 'credit_alphanum4',
};

const config: ProtocolConfig = {
  protocolId: 'soroswap',
  name: 'Soroswap',
  network: {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  contractAddresses: {
    router: 'CA_ROUTER_MOCK',
    factory: 'CA_FACTORY_MOCK',
  },
  metadata: {},
};

describe('DexAggregatorService', () => {
  const protocolFactory = {
    createProtocol: jest.fn(),
  };

  const horizonServer = {
    serverURL: 'https://horizon-testnet.stellar.org',
  };

  const fetchImpl = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    protocolFactory.createProtocol.mockImplementation((cfg) => {
      if (cfg.protocolId === 'soroswap') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockImplementation((_assetIn, _assetOut, amountIn: string) => ({
            tokenIn: XLM,
            tokenOut: USDC,
            amountIn,
            amountOut: amountIn === '100' ? '95.0000000' : '8.0000000',
            priceImpact: '0.5',
            minimumReceived: '0',
            path: ['native', 'USDC:GA5Z...'],
            validUntil: new Date(),
          })),
        };
      }
      if (cfg.protocolId === 'sdex') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockImplementation((_assetIn, _assetOut, amountIn: string) => ({
            tokenIn: XLM,
            tokenOut: USDC,
            amountIn,
            amountOut: amountIn === '100' ? '93.5000000' : '84.0000000',
            priceImpact: '0',
            minimumReceived: '0',
            path: [],
            validUntil: new Date(),
          })),
        };
      }
      return null;
    });
  });

  it('returns the better single-venue quote when no split improves execution', async () => {
    const aggregator = new DexAggregatorService(config, {
      fetchImpl,
      horizonServer,
      protocolFactory,
    });

    const quote = await aggregator.getBestQuote(XLM, USDC, '100');

    expect(quote.routes).toHaveLength(1);
    expect(quote.routes[0].venue).toBe('soroswap');
    expect(quote.totalAmountOut).toBe('95.0000000');
    expect(quote.savingsVsBestSingle).toBe(0);
  });

  it('returns a split quote with both route legs and savings against the best single venue', async () => {
    protocolFactory.createProtocol.mockImplementation((cfg) => {
      if (cfg.protocolId === 'soroswap') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockImplementation((_assetIn, _assetOut, amountIn: string) => ({
            tokenIn: XLM,
            tokenOut: USDC,
            amountIn,
            amountOut: amountIn === '60.0000000' ? '61.0000000' : '95.0000000',
            priceImpact: '0.5',
            minimumReceived: '0',
            path: ['native', 'USDC:GA5Z...'],
            validUntil: new Date(),
          })),
        };
      }
      if (cfg.protocolId === 'sdex') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockImplementation((_assetIn, _assetOut, amountIn: string) => ({
            tokenIn: XLM,
            tokenOut: USDC,
            amountIn,
            amountOut: '41.5000000',
            priceImpact: '0',
            minimumReceived: '0',
            path: [],
            validUntil: new Date(),
          })),
        };
      }
      return null;
    });

    const aggregator = new DexAggregatorService(config, {
      fetchImpl,
      horizonServer,
      protocolFactory,
    });

    const quote = await aggregator.getSplitQuote(XLM, USDC, '100', [60, 40]);

    expect(quote.routes).toHaveLength(2);
    expect(quote.routes.map((route) => route.venue)).toEqual(['soroswap', 'sdex']);
    expect(quote.totalAmountOut).toBe('102.5000000');
    expect(quote.savingsVsBestSingle).toBeGreaterThan(0);
  });

  it('allows getBestQuote to recommend a better split automatically', async () => {
    protocolFactory.createProtocol.mockImplementation((cfg) => {
      if (cfg.protocolId === 'soroswap') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockImplementation((_assetIn, _assetOut, amountIn: string) => ({
            tokenIn: XLM,
            tokenOut: USDC,
            amountIn,
            amountOut:
              amountIn === '100'
                ? '95.0000000'
                : amountIn === '40.0000000'
                  ? '45.0000000'
                  : '8.0000000',
            priceImpact: '0.5',
            minimumReceived: '0',
            path: ['native', 'USDC:GA5Z...'],
            validUntil: new Date(),
          })),
        };
      }
      if (cfg.protocolId === 'sdex') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockImplementation((_assetIn, _assetOut, amountIn: string) => ({
            tokenIn: XLM,
            tokenOut: USDC,
            amountIn,
            amountOut: amountIn === '60.0000000' ? '57.0000000' : '93.5000000',
            priceImpact: '0',
            minimumReceived: '0',
            path: [],
            validUntil: new Date(),
          })),
        };
      }
      return null;
    });

    const aggregator = new DexAggregatorService(config, {
      fetchImpl,
      horizonServer,
      protocolFactory,
    });

    const quote = await aggregator.getBestQuote(XLM, USDC, '100');

    expect(quote.routes).toHaveLength(2);
    expect(quote.totalAmountOut).toBe('102.0000000');
    expect(quote.savingsVsBestSingle).toBeGreaterThan(0);
  });

  it('rejects invalid split weights', async () => {
    const aggregator = new DexAggregatorService(config, {
      fetchImpl,
      horizonServer,
      protocolFactory,
    });

    await expect(aggregator.getSplitQuote(XLM, USDC, '100', [100])).rejects.toThrow(
      'Split quotes require exactly two weights'
    );
  });

  it('throws when no venue can produce a quote', async () => {
    protocolFactory.createProtocol.mockImplementation((cfg) => {
      if (cfg.protocolId === 'soroswap') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockRejectedValue(new Error('No Soroswap pool')),
        };
      }
      if (cfg.protocolId === 'sdex') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockRejectedValue(new Error('SDEX did not return a viable path')),
        };
      }
      return null;
    });

    const aggregator = new DexAggregatorService(config, {
      fetchImpl,
      horizonServer,
      protocolFactory,
    });

    await expect(aggregator.getBestQuote(XLM, USDC, '100')).rejects.toThrow(
      'No aggregator routes are available'
    );
  });

  it('returns the surviving venue when the other venue fails during best-quote discovery', async () => {
    protocolFactory.createProtocol.mockImplementation((cfg) => {
      if (cfg.protocolId === 'soroswap') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockImplementation((_assetIn, _assetOut, amountIn: string) => ({
            tokenIn: XLM,
            tokenOut: USDC,
            amountIn,
            amountOut: amountIn === '100' ? '95.0000000' : '8.0000000',
            priceImpact: '0.5',
            minimumReceived: '0',
            path: ['native', 'USDC:GA5Z...'],
            validUntil: new Date(),
          })),
        };
      }
      if (cfg.protocolId === 'sdex') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockRejectedValue(new Error('SDEX unavailable')),
        };
      }
      return null;
    });

    const aggregator = new DexAggregatorService(config, {
      fetchImpl,
      horizonServer,
      protocolFactory,
    });

    const quote = await aggregator.getBestQuote(XLM, USDC, '100');

    expect(quote.routes).toHaveLength(1);
    expect(quote.routes[0].venue).toBe('soroswap');
  });

  it('skips zero-allocation legs in split quotes', async () => {
    const aggregator = new DexAggregatorService(config, {
      fetchImpl,
      horizonServer,
      protocolFactory,
    });

    const quote = await aggregator.getSplitQuote(XLM, USDC, '100', [100, 0]);

    expect(quote.routes).toHaveLength(1);
    expect(quote.routes[0].venue).toBe('soroswap');
  });

  it('rejects negative split weights', async () => {
    const aggregator = new DexAggregatorService(config, {
      fetchImpl,
      horizonServer,
      protocolFactory,
    });

    await expect(aggregator.getSplitQuote(XLM, USDC, '100', [50, -50])).rejects.toThrow(
      'Split weights must be finite positive numbers'
    );
  });

  it('rejects zero-valued split weights', async () => {
    const aggregator = new DexAggregatorService(config, {
      fetchImpl,
      horizonServer,
      protocolFactory,
    });

    await expect(aggregator.getSplitQuote(XLM, USDC, '100', [0, 0])).rejects.toThrow(
      'Split weights must add up to more than zero'
    );
  });

  it('rejects invalid assets and amounts', async () => {
    const aggregator = new DexAggregatorService(config, {
      fetchImpl,
      horizonServer,
      protocolFactory,
    });

    await expect(
      aggregator.getBestQuote({ code: '', type: 'native' }, USDC, '100')
    ).rejects.toThrow('Asset code is required');
    await expect(
      aggregator.getBestQuote({ code: 'USDC', type: 'credit_alphanum4' }, XLM, '100')
    ).rejects.toThrow('Issuer is required for asset USDC');
    await expect(aggregator.getBestQuote(XLM, USDC, '0')).rejects.toThrow(
      'Amount must be a positive number'
    );
  });

  it('throws when the Soroswap protocol does not expose getSwapQuote', async () => {
    protocolFactory.createProtocol.mockReturnValue({
      initialize: jest.fn().mockResolvedValue(undefined),
    });

    const aggregator = new DexAggregatorService(config, {
      fetchImpl,
      horizonServer,
      protocolFactory,
    });

    await expect(aggregator.getSplitQuote(XLM, USDC, '100', [100, 0])).rejects.toThrow(
      'Soroswap protocol does not implement getSwapQuote'
    );
  });

  it('throws when SDEX returns a non-success response', async () => {
    protocolFactory.createProtocol.mockImplementation((cfg) => {
      if (cfg.protocolId === 'soroswap') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockResolvedValue({ amountOut: '0' }),
        };
      }
      if (cfg.protocolId === 'sdex') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockRejectedValue(new Error('SDEX quote failed with 503 Service Unavailable')),
        };
      }
      return null;
    });

    const aggregator = new DexAggregatorService(config, {
      fetchImpl,
      horizonServer,
      protocolFactory,
    });

    await expect(aggregator.getSplitQuote(XLM, USDC, '100', [0, 100])).rejects.toThrow(
      'SDEX quote failed with 503 Service Unavailable'
    );
  });

  it('throws when SDEX returns no viable paths for the requested split', async () => {
    protocolFactory.createProtocol.mockImplementation((cfg) => {
      if (cfg.protocolId === 'sdex') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockRejectedValue(new Error('SDEX did not return a viable path')),
        };
      }
      return null;
    });

    const aggregator = new DexAggregatorService(config, {
      fetchImpl,
      horizonServer,
      protocolFactory,
    });

    await expect(aggregator.getSplitQuote(XLM, USDC, '100', [0, 100])).rejects.toThrow(
      'SDEX did not return a viable path'
    );
  });

  it('maps non-native SDEX hops and normalizes priceImpact fallbacks', async () => {
    protocolFactory.createProtocol.mockImplementation((cfg) => {
      if (cfg.protocolId === 'soroswap') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockResolvedValue({
            tokenIn: XLM,
            tokenOut: USDC,
            amountIn: '100',
            amountOut: '94.0000000',
            priceImpact: 'not-a-number',
            minimumReceived: '0',
            path: [],
            validUntil: new Date(),
          }),
        };
      }
      if (cfg.protocolId === 'sdex') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockResolvedValue({
            tokenIn: XLM,
            tokenOut: USDC,
            amountIn: '100',
            amountOut: '96.0000000',
            priceImpact: '0',
            minimumReceived: '0',
            path: ['AQUA:GAQUA'],
            validUntil: new Date(),
          }),
        };
      }
      return null;
    });

    const aggregator = new DexAggregatorService(config, {
      fetchImpl,
      horizonServer: { serverURL: new URL('https://horizon-testnet.stellar.org') },
      protocolFactory,
    });

    const quote = await aggregator.getSplitQuote(XLM, USDC, '100', [0, 100]);

    expect(quote.routes[0].venue).toBe('sdex');
    expect(quote.routes[0].path).toEqual(['AQUA:GAQUA']);
    expect(quote.savingsVsBestSingle).toBe(0);
  });

  it('picks the best SDEX record when multiple paths are returned', async () => {
    protocolFactory.createProtocol.mockImplementation((cfg) => {
      if (cfg.protocolId === 'sdex') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockResolvedValue({
            tokenIn: XLM,
            tokenOut: USDC,
            amountIn: '100',
            amountOut: '97.0000000',
            priceImpact: '0',
            minimumReceived: '0',
            path: [],
            validUntil: new Date(),
          }),
        };
      }
      return null;
    });

    const aggregator = new DexAggregatorService(config, {
      fetchImpl,
      horizonServer,
      protocolFactory,
    });

    const quote = await aggregator.getSplitQuote(XLM, USDC, '100', [0, 100]);

    expect(quote.routes[0].venue).toBe('sdex');
    expect(quote.totalAmountOut).toBe('97.0000000');
  });

  it('handles numeric and undefined Soroswap price impacts', async () => {
    let callCount = 0;
    protocolFactory.createProtocol.mockImplementation((cfg) => {
      if (cfg.protocolId === 'sdex') {
        return {
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockRejectedValue(new Error('SDEX unavailable')),
        };
      }
      
      callCount++;
      const impact = callCount === 1 ? 1.25 : undefined;
      
      return {
        initialize: jest.fn().mockResolvedValue(undefined),
        getSwapQuote: jest.fn().mockResolvedValue({
          tokenIn: XLM,
          tokenOut: USDC,
          amountIn: '100',
          amountOut: '99.0000000',
          priceImpact: impact,
          minimumReceived: '0',
          path: [],
          validUntil: new Date(),
        }),
      };
    });

    const aggregator = new DexAggregatorService(config, {
      fetchImpl,
      horizonServer,
      protocolFactory,
    });

    const numericImpactQuote = await aggregator.getBestQuote(XLM, USDC, '100');
    const undefinedImpactQuote = await aggregator.getBestQuote(XLM, USDC, '100');

    expect(numericImpactQuote.routes[0].priceImpact).toBe(1.25);
    expect(undefinedImpactQuote.routes[0].priceImpact).toBe(0);
  });
});
