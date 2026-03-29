/**
 * @fileoverview Soroswap Protocol specific types and interfaces
 * @description Type definitions for Soroswap DEX protocol on Stellar
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-30
 */

import { Asset } from '../../types/defi-types.js';

/**
 * Soroswap pair information
 * @interface SoroswapPairInfo
 */
export interface SoroswapPairInfo {
  /** Pair contract address */
  pairAddress: string;
  /** First token in the pair */
  token0: Asset;
  /** Second token in the pair */
  token1: Asset;
  /** Reserve amount of token0 */
  reserve0: string;
  /** Reserve amount of token1 */
  reserve1: string;
  /** Total LP token supply */
  totalSupply: string;
  /** Swap fee (e.g., '0.003' for 0.3%) */
  fee: string;
}

/**
 * Soroswap route information for multi-hop swaps
 * @interface SoroswapRouteInfo
 */
export interface SoroswapRouteInfo {
  /** Ordered swap path (token addresses) */
  path: string[];
  /** Amounts at each step of the path */
  amounts: string[];
  /** Estimated price impact percentage */
  priceImpact: string;
}

/**
 * Soroswap pool statistics
 * @interface SoroswapPoolStats
 */
export interface SoroswapPoolStats {
  /** Pair contract address */
  pairAddress: string;
  /** First token in the pair */
  token0: Asset;
  /** Second token in the pair */
  token1: Asset;
  /** Reserve amount of token0 */
  reserve0: string;
  /** Reserve amount of token1 */
  reserve1: string;
  /** Total LP token supply */
  totalSupply: string;
  /** 24h trading volume in USD */
  volume24hUSD: string;
  /** Total value locked in USD */
  tvlUSD: string;
  /** 24h fee revenue in USD */
  fees24hUSD: string;
}

/**
 * Soroswap protocol event types
 * @enum {string}
 */
export enum SoroswapEventType {
  SWAP = 'swap',
  ADD_LIQUIDITY = 'add_liquidity',
  REMOVE_LIQUIDITY = 'remove_liquidity',
  SYNC = 'sync',
  PAIR_CREATED = 'pair_created'
}

/**
 * Soroswap protocol event
 * @interface SoroswapEvent
 */
export interface SoroswapEvent {
  /** Event type */
  type: SoroswapEventType;
  /** User address */
  user: string;
  /** Pair contract address */
  pairAddress: string;
  /** Transaction hash */
  txHash: string;
  /** Timestamp */
  timestamp: Date;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}
