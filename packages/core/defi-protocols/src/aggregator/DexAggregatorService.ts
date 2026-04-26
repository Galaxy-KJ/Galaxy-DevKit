import BigNumber from 'bignumber.js';
import { Asset as StellarAsset, Horizon } from '@stellar/stellar-sdk';

import { Asset, ProtocolConfig, SwapQuote } from '../types/defi-types.js';
import { ProtocolFactory } from '../services/protocol-factory.js';
import { AggregatorQuote, AggregatorRoute, AggregatorVenue } from './types.js';

const DEFAULT_SPLIT_PERCENTAGES = [10, 20, 30, 40, 50, 60, 70, 80, 90];
const DISPLAY_DECIMALS = 7;

interface SoroswapQuoteProtocol {
  initialize(): Promise<void>;
  getSwapQuote?(tokenIn: Asset, tokenOut: Asset, amountIn: string): Promise<SwapQuote>;
}

interface AggregatorProtocolFactory {
  createProtocol(config: ProtocolConfig): SoroswapQuoteProtocol;
}

interface HorizonServerLike {
  serverURL?: string | URL;
}

interface DexAggregatorDependencies {
  fetchImpl?: typeof fetch;
  horizonServer?: HorizonServerLike;
  protocolFactory?: AggregatorProtocolFactory;
}

export class DexAggregatorService {
  private readonly soroswapConfig: ProtocolConfig;
  private readonly sdexConfig: ProtocolConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly horizonServer: HorizonServerLike;
  private readonly protocolFactory: AggregatorProtocolFactory;

  constructor(config: ProtocolConfig, dependencies: DexAggregatorDependencies = {}) {
    this.soroswapConfig = {
      ...config,
      protocolId: 'soroswap',
    };
    this.sdexConfig = {
      ...config,
      protocolId: 'sdex',
      name: 'Stellar DEX',
    };
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.horizonServer =
      dependencies.horizonServer ??
      ((new Horizon.Server(this.soroswapConfig.network.horizonUrl) as unknown) as HorizonServerLike);
    this.protocolFactory = dependencies.protocolFactory ?? ProtocolFactory.getInstance();
  }

  async getBestQuote(assetIn: Asset, assetOut: Asset, amountIn: string): Promise<AggregatorQuote> {
    this.validateAsset(assetIn);
    this.validateAsset(assetOut);
    this.validateAmount(amountIn);

    const singleRoutes = await this.fetchSingleVenueRoutes(assetIn, assetOut, amountIn);
    const bestSingleQuote = this.buildQuote(assetIn, assetOut, amountIn, [
      this.getBestRoute(singleRoutes),
    ]);

    if (singleRoutes.length < 2) {
      return bestSingleQuote;
    }

    const splitQuotes = await Promise.all(
      DEFAULT_SPLIT_PERCENTAGES.map(async (soroswapPercentage) =>
        this.getSplitQuote(assetIn, assetOut, amountIn, [soroswapPercentage, 100 - soroswapPercentage])
      )
    );

    return splitQuotes.reduce(
      (best, candidate) =>
        this.compareAmount(candidate.totalAmountOut, best.totalAmountOut) > 0 ? candidate : best,
      bestSingleQuote
    );
  }

  async getSplitQuote(
    assetIn: Asset,
    assetOut: Asset,
    amountIn: string,
    splits: number[]
  ): Promise<AggregatorQuote> {
    this.validateAsset(assetIn);
    this.validateAsset(assetOut);
    this.validateAmount(amountIn);

    const normalizedSplits = this.normalizeSplits(splits);
    const allocations = this.allocateAmounts(amountIn, normalizedSplits);

    const routes = (
      await Promise.all(
        (
          [
            ['soroswap', allocations[0]],
            ['sdex', allocations[1]],
          ] as Array<[AggregatorVenue, string]>
        ).map(async ([venue, allocatedAmount]) => {
          if (new BigNumber(allocatedAmount).isZero()) {
            return null;
          }

          return this.fetchRouteFromVenue(venue, assetIn, assetOut, allocatedAmount);
        })
      )
    ).filter((route): route is AggregatorRoute => route !== null);

    if (routes.length === 0) {
      throw new Error('Split quote did not produce any executable routes');
    }

    const bestSingleRoutes = await this.fetchSingleVenueRoutes(assetIn, assetOut, amountIn);
    const bestSingleRoute = this.getBestRoute(bestSingleRoutes);

    return this.buildQuote(assetIn, assetOut, amountIn, routes, bestSingleRoute.amountOut);
  }

  private async fetchSingleVenueRoutes(
    assetIn: Asset,
    assetOut: Asset,
    amountIn: string
  ): Promise<AggregatorRoute[]> {
    const settled = await Promise.allSettled([
      this.fetchRouteFromVenue('soroswap', assetIn, assetOut, amountIn),
      this.fetchRouteFromVenue('sdex', assetIn, assetOut, amountIn),
    ]);

    const routes = settled
      .filter((result): result is PromiseFulfilledResult<AggregatorRoute> => result.status === 'fulfilled')
      .map((result) => result.value);

    if (routes.length === 0) {
      throw new Error('No aggregator routes are available for the requested swap');
    }

    return routes;
  }

  private async fetchRouteFromVenue(
    venue: AggregatorVenue,
    assetIn: Asset,
    assetOut: Asset,
    amountIn: string
  ): Promise<AggregatorRoute> {
    if (venue === 'soroswap') {
      return this.fetchSoroswapRoute(assetIn, assetOut, amountIn);
    }

    return this.fetchSdexRoute(assetIn, assetOut, amountIn);
  }

  private async fetchSoroswapRoute(
    assetIn: Asset,
    assetOut: Asset,
    amountIn: string
  ): Promise<AggregatorRoute> {
    const protocol = this.protocolFactory.createProtocol(this.soroswapConfig);
    await protocol.initialize();

    if (typeof protocol.getSwapQuote !== 'function') {
      throw new Error('Soroswap protocol does not implement getSwapQuote');
    }

    const quote = await protocol.getSwapQuote(assetIn, assetOut, amountIn);

    return {
      venue: 'soroswap',
      amountIn,
      amountOut: quote.amountOut,
      priceImpact: this.toNumber(quote.priceImpact),
      path: quote.path ?? [],
    };
  }

  private async fetchSdexRoute(
    assetIn: Asset,
    assetOut: Asset,
    amountIn: string
  ): Promise<AggregatorRoute> {
    const protocol = this.protocolFactory.createProtocol(this.sdexConfig);
    await protocol.initialize();

    if (typeof protocol.getSwapQuote !== 'function') {
      throw new Error('SDEX protocol does not implement getSwapQuote');
    }

    const quote = await protocol.getSwapQuote(assetIn, assetOut, amountIn);

    return {
      venue: 'sdex',
      amountIn,
      amountOut: quote.amountOut,
      priceImpact: this.toNumber(quote.priceImpact),
      path: quote.path ?? [],
    };
  }

  private buildQuote(
    assetIn: Asset,
    assetOut: Asset,
    amountIn: string,
    routes: AggregatorRoute[],
    bestSingleAmountOut?: string
  ): AggregatorQuote {
    const totalAmountOut = routes
      .reduce((total, route) => total.plus(route.amountOut), new BigNumber(0))
      .toFixed(DISPLAY_DECIMALS);

    const bestSingle = bestSingleAmountOut ?? this.getBestRoute(routes).amountOut;
    const effectivePrice = new BigNumber(totalAmountOut)
      .dividedBy(amountIn)
      .decimalPlaces(DISPLAY_DECIMALS)
      .toNumber();
    const savingsVsBestSingle = new BigNumber(bestSingle).isZero()
      ? 0
      : new BigNumber(totalAmountOut)
          .minus(bestSingle)
          .dividedBy(bestSingle)
          .multipliedBy(100)
          .decimalPlaces(4)
          .toNumber();

    return {
      assetIn,
      assetOut,
      amountIn,
      routes,
      totalAmountOut,
      effectivePrice,
      savingsVsBestSingle,
    };
  }

  private getBestRoute(routes: AggregatorRoute[]): AggregatorRoute {
    return routes.reduce((best, current) =>
      this.compareAmount(current.amountOut, best.amountOut) > 0 ? current : best
    );
  }

  private allocateAmounts(amountIn: string, normalizedSplits: number[]): [string, string] {
    const total = new BigNumber(amountIn);
    const soroswapAmount = total
      .multipliedBy(normalizedSplits[0])
      .dividedBy(100)
      .decimalPlaces(DISPLAY_DECIMALS, BigNumber.ROUND_DOWN);
    const sdexAmount = total.minus(soroswapAmount);

    return [soroswapAmount.toFixed(DISPLAY_DECIMALS), sdexAmount.toFixed(DISPLAY_DECIMALS)];
  }

  private normalizeSplits(splits: number[]): [number, number] {
    if (splits.length !== 2) {
      throw new Error('Split quotes require exactly two weights: [soroswap, sdex]');
    }

    if (splits.some((split) => !Number.isFinite(split) || split < 0)) {
      throw new Error('Split weights must be finite positive numbers');
    }

    const totalWeight = splits[0] + splits[1];
    if (totalWeight <= 0) {
      throw new Error('Split weights must add up to more than zero');
    }

    return [
      (splits[0] / totalWeight) * 100,
      (splits[1] / totalWeight) * 100,
    ];
  }

  private validateAsset(asset: Asset): void {
    if (!asset.code) {
      throw new Error('Asset code is required');
    }

    if (asset.type !== 'native' && !asset.issuer) {
      throw new Error(`Issuer is required for asset ${asset.code}`);
    }
  }

  private validateAmount(amount: string): void {
    if (!new BigNumber(amount).isFinite() || new BigNumber(amount).lte(0)) {
      throw new Error('Amount must be a positive number');
    }
  }

  private compareAmount(left: string, right: string): number {
    return new BigNumber(left).comparedTo(right) ?? 0;
  }

  private toNumber(value: string | number | undefined): number {
    if (typeof value === 'number') {
      return value;
    }

    if (value === undefined) {
      return 0;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
