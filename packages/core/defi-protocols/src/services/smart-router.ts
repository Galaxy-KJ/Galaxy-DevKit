/**
 * @fileoverview Smart Routing Engine for DEX Aggregator
 * @description Implements BFS-based optimal path finding across multiple DEXes
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import BigNumber from 'bignumber.js';
import { Asset } from '../types/defi-types.js';
import { AggregatorVenue } from '../aggregator/types.js';
import { ProtocolFactory } from './protocol-factory.js';
import { ProtocolConfig } from '../types/defi-types.js';

/**
 * DEX venue with gas cost information
 */
interface DEXVenue {
  id: AggregatorVenue;
  gasCost: BigNumber;
  enabled: boolean;
}

/**
 * Edge in the token graph representing a tradable pair on a DEX
 */
interface TokenEdge {
  from: string;
  to: string;
  venue: AggregatorVenue;
  poolAddress?: string;
}

/**
 * Node in the BFS search representing a path state
 */
interface PathNode {
  token: string;
  path: TokenEdge[];
  amountOut: BigNumber;
  gasCost: BigNumber;
}

/**
 * Optimal route result from the smart router
 */
export interface SmartRoute {
  path: string[];
  venues: AggregatorVenue[];
  amountIn: string;
  amountOut: string;
  gasCost: string;
  netAmountOut: string;
  priceImpact: number;
  hops: number;
}

/**
 * Smart router configuration
 */
export interface SmartRouterConfig {
  maxHops: number;
  enabledVenues: AggregatorVenue[];
  gasCosts: Partial<Record<AggregatorVenue, string>>;
  minLiquidity: string;
}

/**
 * Token graph for finding trading paths
 */
interface TokenGraph {
  [token: string]: {
    [venue in AggregatorVenue]?: string[];
  };
}

/**
 * Smart Routing Engine
 * @class SmartRouter
 * @description Finds optimal trading paths across multiple DEXes using BFS
 */
export class SmartRouter {
  private readonly protocolFactory: ProtocolFactory;
  private readonly config: ProtocolConfig;
  private readonly routerConfig: SmartRouterConfig;
  private tokenGraph: TokenGraph = {};
  private initialized: boolean = false;

  private static readonly DEFAULT_GAS_COSTS: Record<AggregatorVenue, string> = {
    soroswap: '1000',
    sdex: '500',
  };

  private static readonly DEFAULT_CONFIG: SmartRouterConfig = {
    maxHops: 3,
    enabledVenues: ['soroswap', 'sdex'],
    gasCosts: {},
    minLiquidity: '0',
  };

  /**
   * Constructor
   * @param {ProtocolConfig} config - Protocol configuration
   * @param {Partial<SmartRouterConfig>} routerConfig - Smart router configuration
   */
  constructor(
    config: ProtocolConfig,
    routerConfig: Partial<SmartRouterConfig> = {}
  ) {
    this.config = config;
    this.routerConfig = { ...SmartRouter.DEFAULT_CONFIG, ...routerConfig };
    this.protocolFactory = ProtocolFactory.getInstance();
  }

  /**
   * Initialize the smart router and build token graph
   * @returns {Promise<void>}
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.buildTokenGraph();
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize SmartRouter: ${error}`);
    }
  }

  /**
   * Find the optimal route for a token pair
   * @param {Asset} tokenIn - Input token
   * @param {Asset} tokenOut - Output token
   * @param {string} amountIn - Input amount
   * @returns {Promise<SmartRoute>}
   */
  async findOptimalRoute(
    tokenIn: Asset,
    tokenOut: Asset,
    amountIn: string
  ): Promise<SmartRoute> {
    this.ensureInitialized();

    const routes = await this.findAllRoutes(tokenIn, tokenOut, amountIn);
    if (routes.length === 0) {
      throw new Error(`No route found for ${tokenIn.code} -> ${tokenOut.code}`);
    }

    return routes.reduce((best, current) =>
      new BigNumber(current.netAmountOut).isGreaterThan(best.netAmountOut)
        ? current
        : best
    );
  }

  /**
   * Find all possible routes and return them sorted by net amount out
   * @param {Asset} tokenIn - Input token
   * @param {Asset} tokenOut - Output token
   * @param {string} amountIn - Input amount
   * @returns {Promise<SmartRoute[]>}
   */
  async findAllRoutes(
    tokenIn: Asset,
    tokenOut: Asset,
    amountIn: string
  ): Promise<SmartRoute[]> {
    this.ensureInitialized();

    const tokenInKey = this.getTokenKey(tokenIn);
    const tokenOutKey = this.getTokenKey(tokenOut);
    const amountInBN = new BigNumber(amountIn);

    const allRoutes: SmartRoute[] = [];

    for (let hops = 1; hops <= this.routerConfig.maxHops; hops++) {
      const routes = this.bfsSearch(tokenInKey, tokenOutKey, amountInBN, hops);
      allRoutes.push(...routes);
    }

    const evaluatedRoutes = await Promise.all(
      allRoutes.map(route => this.evaluateRoute(route))
    );

    return evaluatedRoutes
      .filter(route => route !== null)
      .sort((a, b) =>
        new BigNumber(b!.netAmountOut).minus(a!.netAmountOut).toNumber()
      ) as SmartRoute[];
  }

  /**
   * BFS search for paths up to maxHops deep
   * @private
   */
  private bfsSearch(
    start: string,
    target: string,
    amountIn: BigNumber,
    maxHops: number
  ): Omit<SmartRoute, 'amountOut' | 'priceImpact' | 'netAmountOut'>[] {
    const results: Omit<
      SmartRoute,
      'amountOut' | 'priceImpact' | 'netAmountOut'
    >[] = [];
    const queue: PathNode[] = [
      {
        token: start,
        path: [],
        amountOut: amountIn,
        gasCost: new BigNumber(0),
      },
    ];

    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.path.length >= maxHops) {
        continue;
      }

      const neighbors = this.getNeighbors(current.token);

      for (const [nextToken, venues] of Object.entries(neighbors)) {
        if (this.isCyclic(current.path, nextToken)) {
          continue;
        }

        const edge: TokenEdge = {
          from: current.token,
          to: nextToken,
          venue: venues[0],
        };

        const newPath = [...current.path, edge];
        const gasCost = this.calculateGasCost(newPath);

        if (nextToken === target) {
          results.push({
            path: this.pathToTokenList(newPath),
            venues: newPath.map(e => e.venue),
            amountIn: amountIn.toFixed(),
            gasCost: gasCost.toFixed(),
            hops: newPath.length,
          });
        } else {
          queue.push({
            token: nextToken,
            path: newPath,
            amountOut: current.amountOut,
            gasCost,
          });
        }
      }
    }

    return results;
  }

  /**
   * Check if adding a token would create a cycle
   * @private
   */
  private isCyclic(path: TokenEdge[], nextToken: string): boolean {
    return path.some(edge => edge.from === nextToken || edge.to === nextToken);
  }

  /**
   * Get neighbors for a token from the graph
   * @private
   */
  private getNeighbors(token: string): Record<string, AggregatorVenue[]> {
    const neighbors: Record<string, AggregatorVenue[]> = {};
    const tokenData = this.tokenGraph[token];

    if (!tokenData) {
      return neighbors;
    }

    for (const venue of this.routerConfig.enabledVenues) {
      const connectedTokens = tokenData[venue] || [];
      for (const connectedToken of connectedTokens) {
        if (!neighbors[connectedToken]) {
          neighbors[connectedToken] = [];
        }
        if (!neighbors[connectedToken].includes(venue)) {
          neighbors[connectedToken].push(venue);
        }
      }
    }

    return neighbors;
  }

  /**
   * Calculate total gas cost for a path
   * @private
   */
  private calculateGasCost(path: TokenEdge[]): BigNumber {
    const venueCounts: Partial<Record<AggregatorVenue, number>> = {};

    for (const edge of path) {
      venueCounts[edge.venue] = (venueCounts[edge.venue] || 0) + 1;
    }

    let totalGas = new BigNumber(0);
    for (const [venue, count] of Object.entries(venueCounts)) {
      const gasPerSwap = new BigNumber(
        this.routerConfig.gasCosts[venue as AggregatorVenue] ||
          SmartRouter.DEFAULT_GAS_COSTS[venue as AggregatorVenue] ||
          '0'
      );
      totalGas = totalGas.plus(gasPerSwap.times(count));
    }

    return totalGas;
  }

  /**
   * Convert path edges to token list
   * @private
   */
  private pathToTokenList(path: TokenEdge[]): string[] {
    if (path.length === 0) {
      return [];
    }

    const tokens = [path[0].from];
    for (const edge of path) {
      tokens.push(edge.to);
    }
    return tokens;
  }

  /**
   * Evaluate a route by fetching quotes from each DEX in the path
   * @private
   */
  private async evaluateRoute(
    route: Omit<SmartRoute, 'amountOut' | 'priceImpact' | 'netAmountOut'>
  ): Promise<SmartRoute | null> {
    try {
      let currentAmount = new BigNumber(route.amountIn);
      let totalPriceImpact = 0;

      for (let i = 0; i < route.path.length - 1; i++) {
        const tokenIn: Asset = this.parseTokenKey(route.path[i]);
        const tokenOut: Asset = this.parseTokenKey(route.path[i + 1]);
        const venue = route.venues[i];

        const quote = await this.getQuoteFromVenue(
          venue,
          tokenIn,
          tokenOut,
          currentAmount.toFixed()
        );

        currentAmount = new BigNumber(quote.amountOut);
        totalPriceImpact += this.parsePriceImpact(quote.priceImpact);
      }

      const gasCostBN = new BigNumber(route.gasCost);
      const netAmountOut = currentAmount.minus(gasCostBN).toFixed();

      if (new BigNumber(netAmountOut).isLessThanOrEqualTo(0)) {
        return null;
      }

      return {
        ...route,
        amountOut: currentAmount.toFixed(),
        netAmountOut,
        priceImpact: totalPriceImpact,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get swap quote from a specific venue
   * @private
   */
  private async getQuoteFromVenue(
    venue: AggregatorVenue,
    tokenIn: Asset,
    tokenOut: Asset,
    amountIn: string
  ): Promise<{ amountOut: string; priceImpact: string }> {
    const protocolConfig: ProtocolConfig = {
      ...this.config,
      protocolId: venue,
      name: venue === 'soroswap' ? 'Soroswap' : 'Stellar DEX',
    };

    const protocol = this.protocolFactory.createProtocol(protocolConfig);
    await protocol.initialize();

    if (typeof protocol.getSwapQuote !== 'function') {
      throw new Error(`${venue} does not implement getSwapQuote`);
    }

    const quote = await protocol.getSwapQuote(tokenIn, tokenOut, amountIn);

    return {
      amountOut: quote.amountOut,
      priceImpact: quote.priceImpact,
    };
  }

  /**
   * Build the token graph from all enabled DEXes
   * @private
   */
  private async buildTokenGraph(): Promise<void> {
    for (const venue of this.routerConfig.enabledVenues) {
      try {
        await this.addVenueToGraph(venue);
      } catch (error) {
        console.warn(`Failed to load token graph for ${venue}: ${error}`);
      }
    }
  }

  /**
   * Add token pairs from a venue to the graph
   * @private
   */
  private async addVenueToGraph(venue: AggregatorVenue): Promise<void> {
    const protocolConfig: ProtocolConfig = {
      ...this.config,
      protocolId: venue,
      name: venue === 'soroswap' ? 'Soroswap' : 'Stellar DEX',
    };

    const protocol = this.protocolFactory.createProtocol(protocolConfig);
    await protocol.initialize();

    if (typeof protocol.getAllPoolsAnalytics !== 'function') {
      return;
    }

    const pools = await protocol.getAllPoolsAnalytics();

    for (const pool of pools) {
      const token0 = this.getTokenKey(pool.token0);
      const token1 = this.getTokenKey(pool.token1);

      if (!this.tokenGraph[token0]) {
        this.tokenGraph[token0] = {};
      }
      if (!this.tokenGraph[token1]) {
        this.tokenGraph[token1] = {};
      }

      if (!this.tokenGraph[token0][venue]) {
        this.tokenGraph[token0][venue] = [];
      }
      if (!this.tokenGraph[token1][venue]) {
        this.tokenGraph[token1][venue] = [];
      }

      if (!this.tokenGraph[token0][venue]!.includes(token1)) {
        this.tokenGraph[token0][venue]!.push(token1);
      }
      if (!this.tokenGraph[token1][venue]!.includes(token0)) {
        this.tokenGraph[token1][venue]!.push(token0);
      }
    }
  }

  /**
   * Get a unique key for a token
   * @private
   */
  private getTokenKey(asset: Asset): string {
    if (asset.type === 'native') {
      return 'XLM';
    }
    return `${asset.code}:${asset.issuer}`;
  }

  /**
   * Parse a token key back into an Asset
   * @private
   */
  private parseTokenKey(key: string): Asset {
    if (key === 'XLM') {
      return { code: 'XLM', type: 'native' };
    }

    const [code, issuer] = key.split(':');
    return { code, issuer, type: 'credit_alphanum12' as const };
  }

  /**
   * Parse price impact to number
   * @private
   */
  private parsePriceImpact(priceImpact: string | number | undefined): number {
    if (typeof priceImpact === 'number') {
      return priceImpact;
    }
    if (!priceImpact) {
      return 0;
    }
    const parsed = Number(priceImpact);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * Ensure the router is initialized
   * @private
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'SmartRouter is not initialized. Call initialize() first.'
      );
    }
  }
}
