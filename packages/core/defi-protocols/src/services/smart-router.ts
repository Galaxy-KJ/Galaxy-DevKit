import BigNumber from 'bignumber.js';

import { DexAggregatorService } from '../aggregator/DexAggregatorService.js';
import { assetToKey, LiquidityGraph } from '../aggregator/graph.js';
import type { AggregatorQuote, AggregatorVenue } from '../aggregator/types.js';
import type { Asset } from '../types/defi-types.js';

const DISPLAY_DECIMALS = 7;
const DEFAULT_HOP_FEE_PERCENT = 0.3;
const DEFAULT_MAX_HOPS = 3;
const DEFAULT_MAX_CANDIDATE_PATHS = 50;

export interface RouteHop {
  venue: AggregatorVenue | string;
  assetIn: Asset;
  assetOut: Asset;
  amountIn: string;
  amountOut: string;
  grossAmountOut: string;
  gasCost: string;
  feePercent: number;
  priceImpact: number;
  quote: AggregatorQuote;
}

export interface Route {
  path: Asset[];
  hops: RouteHop[];
  totalFeePercent: number;
  estimatedOutput: string;
  grossOutput: string;
  totalGasCost: string;
  priceImpact: number;
}

export interface GasCostContext {
  hopIndex: number;
  assetIn: Asset;
  assetOut: Asset;
  amountIn: string;
  quote: AggregatorQuote;
}

export interface SmartRouterOptions {
  transitAssets?: Asset[];
  gasCostInOutputAsset?: string;
  gasCostEstimator?: (context: GasCostContext) => string | number | BigNumber;
  maxCandidatePaths?: number;
}

export interface SmartRouterQuoteService {
  getBestQuote(assetIn: Asset, assetOut: Asset, amountIn: string): Promise<AggregatorQuote>;
}

export const DEFAULT_TRANSIT_ASSETS: Asset[] = [
  { code: 'XLM', type: 'native' },
  {
    code: 'USDC',
    issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    type: 'credit_alphanum4',
  },
];

export class SmartRouter {
  private readonly quoteService: SmartRouterQuoteService;
  private readonly transitAssets: Asset[];
  private readonly gasCostInOutputAsset: BigNumber;
  private readonly gasCostEstimator?: SmartRouterOptions['gasCostEstimator'];
  private readonly maxCandidatePaths: number;

  constructor(
    quoteService: SmartRouterQuoteService | DexAggregatorService,
    options: SmartRouterOptions = {},
  ) {
    this.quoteService = quoteService;
    this.transitAssets = options.transitAssets ?? DEFAULT_TRANSIT_ASSETS;
    this.gasCostInOutputAsset = new BigNumber(options.gasCostInOutputAsset ?? 0);
    this.gasCostEstimator = options.gasCostEstimator;
    this.maxCandidatePaths = options.maxCandidatePaths ?? DEFAULT_MAX_CANDIDATE_PATHS;
  }

  async findOptimalRoute(
    source: Asset,
    destination: Asset,
    amount: string,
    maxHops: number = DEFAULT_MAX_HOPS,
  ): Promise<Route> {
    this.validateAmount(amount);

    const candidatePaths = this.buildGraph(source, destination)
      .findAllPaths(source, destination, maxHops)
      .slice(0, this.maxCandidatePaths);

    if (candidatePaths.length === 0) {
      throw new Error(`No paths found from ${source.code} to ${destination.code}`);
    }

    const evaluatedRoutes = await Promise.allSettled(
      candidatePaths.map((path) => this.evaluatePath(path, amount)),
    );

    const validRoutes = evaluatedRoutes
      .filter((result): result is PromiseFulfilledResult<Route | null> => result.status === 'fulfilled')
      .map((result) => result.value)
      .filter((route): route is Route => route !== null);

    if (validRoutes.length === 0) {
      throw new Error('No valid routes could be executed to find quotes');
    }

    return validRoutes.reduce((best, current) =>
      new BigNumber(current.estimatedOutput).gt(best.estimatedOutput) ? current : best,
    );
  }

  private buildGraph(source: Asset, destination: Asset): LiquidityGraph {
    const graph = new LiquidityGraph();
    const assets = this.uniqueAssets([source, destination, ...this.transitAssets]);

    for (let i = 0; i < assets.length; i += 1) {
      for (let j = i + 1; j < assets.length; j += 1) {
        graph.addConnection(assets[i], assets[j]);
      }
    }

    return graph;
  }

  private async evaluatePath(path: Asset[], initialAmount: string): Promise<Route | null> {
    try {
      let currentAmount = new BigNumber(initialAmount);
      let grossOutput = currentAmount;
      let totalFeePercent = 0;
      let totalGasCost = new BigNumber(0);
      let priceImpactTotal = new BigNumber(0);
      const hops: RouteHop[] = [];

      for (let i = 0; i < path.length - 1; i += 1) {
        const assetIn = path[i];
        const assetOut = path[i + 1];
        const amountIn = currentAmount.toFixed(DISPLAY_DECIMALS);
        const quote = await this.quoteService.getBestQuote(assetIn, assetOut, amountIn);
        const gasCost = this.estimateGasCost({
          hopIndex: i,
          assetIn,
          assetOut,
          amountIn,
          quote,
        });
        const netAmountOut = BigNumber.maximum(new BigNumber(quote.totalAmountOut).minus(gasCost), 0);

        if (netAmountOut.lte(0)) {
          return null;
        }

        const routeFeePercent = DEFAULT_HOP_FEE_PERCENT * Math.max(quote.routes.length, 1);
        totalFeePercent += routeFeePercent;
        totalGasCost = totalGasCost.plus(gasCost);
        priceImpactTotal = priceImpactTotal.plus(this.averagePriceImpact(quote));
        grossOutput = new BigNumber(quote.totalAmountOut);
        currentAmount = netAmountOut;

        hops.push({
          venue: this.describeVenues(quote),
          assetIn,
          assetOut,
          amountIn,
          amountOut: netAmountOut.toFixed(DISPLAY_DECIMALS),
          grossAmountOut: grossOutput.toFixed(DISPLAY_DECIMALS),
          gasCost: gasCost.toFixed(DISPLAY_DECIMALS),
          feePercent: routeFeePercent,
          priceImpact: this.averagePriceImpact(quote),
          quote,
        });
      }

      return {
        path,
        hops,
        totalFeePercent,
        estimatedOutput: currentAmount.toFixed(DISPLAY_DECIMALS),
        grossOutput: grossOutput.toFixed(DISPLAY_DECIMALS),
        totalGasCost: totalGasCost.toFixed(DISPLAY_DECIMALS),
        priceImpact: hops.length === 0 ? 0 : priceImpactTotal.dividedBy(hops.length).toNumber(),
      };
    } catch {
      return null;
    }
  }

  private estimateGasCost(context: GasCostContext): BigNumber {
    if (this.gasCostEstimator) {
      const estimated = this.gasCostEstimator(context);
      return BigNumber.maximum(new BigNumber(estimated), 0);
    }

    return this.gasCostInOutputAsset.multipliedBy(Math.max(context.quote.routes.length, 1));
  }

  private averagePriceImpact(quote: AggregatorQuote): number {
    if (quote.routes.length === 0) {
      return 0;
    }

    const total = quote.routes.reduce(
      (sum, route) => sum.plus(route.priceImpact),
      new BigNumber(0),
    );
    return total.dividedBy(quote.routes.length).toNumber();
  }

  private describeVenues(quote: AggregatorQuote): string {
    return [...new Set(quote.routes.map((route) => route.venue))].join('+');
  }

  private uniqueAssets(assets: Asset[]): Asset[] {
    const seen = new Set<string>();
    return assets.filter((asset) => {
      const key = assetToKey(asset);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private validateAmount(amount: string): void {
    const value = new BigNumber(amount);
    if (!value.isFinite() || value.lte(0)) {
      throw new Error('Amount must be a positive number');
    }
  }
}

export async function findOptimalRoute(
  quoteService: SmartRouterQuoteService | DexAggregatorService,
  source: Asset,
  destination: Asset,
  amount: string,
  maxHops: number = DEFAULT_MAX_HOPS,
  options: SmartRouterOptions = {},
): Promise<Route> {
  return new SmartRouter(quoteService, options).findOptimalRoute(
    source,
    destination,
    amount,
    maxHops,
  );
}
