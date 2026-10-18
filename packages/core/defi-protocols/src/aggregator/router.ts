import { Asset } from '../types/defi-types.js';
import { DexAggregatorService } from './DexAggregatorService.js';
import { AggregatorVenue } from './types.js';
import { LiquidityGraph, assetToKey } from './graph.js';
import BigNumber from 'bignumber.js';

export interface RouteHop {
  venue: AggregatorVenue | string;
  assetIn: Asset;
  assetOut: Asset;
  amountIn: string;
  amountOut: string;
  feePercent: number;
}

export interface Route {
  path: Asset[];
  hops: RouteHop[];
  totalFeePercent: number;
  estimatedOutput: string;
  priceImpact: number;
  highImpactWarning: boolean;
}

const HIGH_PRICE_IMPACT_PERCENT = 5;

const COMMON_TRANSIT_ASSETS: Asset[] = [
  { code: 'XLM', type: 'native' },
  { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', type: 'credit_alphanum4' }
];

export class SmartRouter {
  private aggregator: DexAggregatorService;

  constructor(aggregator: DexAggregatorService) {
    this.aggregator = aggregator;
  }

  private buildGraph(source: Asset, destination: Asset): LiquidityGraph {
    const graph = new LiquidityGraph();
    
    // Add connections between source, destination and transit assets
    const allAssets = [source, destination, ...COMMON_TRANSIT_ASSETS];
    
    // Fully connect the small set of known assets
    // In a real production scenario, we'd only add edges for pairs that actually have pools
    for (let i = 0; i < allAssets.length; i++) {
      for (let j = i + 1; j < allAssets.length; j++) {
        // Avoid self loops
        if (assetToKey(allAssets[i]) !== assetToKey(allAssets[j])) {
            graph.addConnection(allAssets[i], allAssets[j]);
        }
      }
    }

    return graph;
  }

  public async findOptimalRoute(
    source: Asset,
    destination: Asset,
    amount: string,
    maxHops: number = 3
  ): Promise<Route> {
    const graph = this.buildGraph(source, destination);
    const candidatePaths = graph.findAllPaths(source, destination, maxHops);

    if (candidatePaths.length === 0) {
      throw new Error(`No paths found from ${source.code} to ${destination.code}`);
    }

    let bestRoute: Route | null = null;

    // Evaluate paths concurrently up to a reasonable limit, or sequentially
    const pathEvaluations = await Promise.allSettled(
      candidatePaths.map(path => this.evaluatePath(path, amount))
    );

    const failedQuotes = pathEvaluations.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );

    for (const result of pathEvaluations) {
      if (result.status === 'fulfilled') {
        const route = result.value;
        // Venue quotes already include their swap fees in amountOut. Compare the
        // quoted output directly so the reported fee is not deducted twice.
        if (!bestRoute || new BigNumber(route.estimatedOutput).gt(bestRoute.estimatedOutput)) {
          bestRoute = route;
        }
      }
    }

    if (!bestRoute) {
      // candidatePaths is non-empty, so reaching here means every path quote was rejected.
      const details = failedQuotes
        .map(result => result.reason instanceof Error ? result.reason.message : String(result.reason))
        .join('; ');
      throw new Error(`All route quotes failed; check venue connectivity and liquidity: ${details}`);
    }

    return bestRoute;
  }

  private async evaluatePath(path: Asset[], initialAmount: string): Promise<Route> {
    let currentAmount = initialAmount;
    const hops: RouteHop[] = [];
    let cumulativeFeePercent = 0;
    let remainingPriceImpact = 1;

    for (let i = 0; i < path.length - 1; i++) {
      const assetIn = path[i];
      const assetOut = path[i + 1];

      const quote = await this.aggregator.getBestQuote(assetIn, assetOut, currentAmount);
      const venueName = quote.routes.map(r => r.venue).join(',');
      const hopFee = quote.routes.reduce((weightedFee, route) => {
        const routeWeight = new BigNumber(route.amountIn).dividedBy(currentAmount);
        return weightedFee.plus(routeWeight.multipliedBy(route.feePercent ?? 0));
      }, new BigNumber(0)).toNumber();
      const hopPriceImpact = Math.min(Math.max(quote.totalPriceImpact, 0), 100);

      hops.push({
        venue: venueName,
        assetIn,
        assetOut,
        amountIn: currentAmount,
        amountOut: quote.totalAmountOut,
        feePercent: hopFee
      });

      cumulativeFeePercent += hopFee;
      remainingPriceImpact *= 1 - hopPriceImpact / 100;
      currentAmount = quote.totalAmountOut;
    }

    return {
      path,
      hops,
      totalFeePercent: cumulativeFeePercent,
      estimatedOutput: currentAmount,
      priceImpact: (1 - remainingPriceImpact) * 100,
      highImpactWarning: (1 - remainingPriceImpact) * 100 >= HIGH_PRICE_IMPACT_PERCENT,
    };
  }
}

// Helper standalone function as required by issue description
export async function findOptimalRoute(
    aggregator: DexAggregatorService,
    source: Asset,
    destination: Asset,
    amount: string,
    maxHops: number = 3
): Promise<Route> {
    const router = new SmartRouter(aggregator);
    return router.findOptimalRoute(source, destination, amount, maxHops);
}
