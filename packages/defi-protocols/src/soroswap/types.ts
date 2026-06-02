/**
 * @fileoverview Soroswap analytics types (#272)
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

// ─── Pool analytics ───────────────────────────────────────────────────────────

export interface PoolAnalytics {
  /** Unique pool identifier (contract address or pair ID). */
  poolId: string;
  /** Total value locked in USD across both reserves. */
  tvlUSD: number;
  /** 24-hour trading volume in USD. */
  volume24hUSD: number;
  /** Fees earned by LPs in the last 24 hours in USD. */
  feesEarned24hUSD: number;
  /** Annualised percentage yield based on 7-day rolling fee volume. */
  apy7d: number;
  /**
   * Impermanent loss percentage vs simply holding the two assets.
   * Expressed as a positive number (e.g. 2.5 = 2.5% loss).
   * Zero when the price ratio is unchanged from entry.
   */
  impermanentLossPercent: number;
  /** Timestamp (ms) when this snapshot was fetched. */
  fetchedAt: number;
}

// ─── Pool reserve snapshot ────────────────────────────────────────────────────

export interface PoolReserve {
  poolId: string;
  /** Asset A contract address. */
  assetA: string;
  /** Asset B contract address. */
  assetB: string;
  /** Reserve balance of asset A (in stroops / raw units). */
  reserveA: bigint;
  /** Reserve balance of asset B (in stroops / raw units). */
  reserveB: bigint;
  /** Fee tier in basis points (e.g. 30 = 0.3%). */
  feeBps: number;
}

// ─── Volume snapshot (used for 7d rolling APY) ───────────────────────────────

export interface VolumeSnapshot {
  poolId: string;
  /** UTC day string e.g. "2025-01-15". */
  date: string;
  volumeUSD: number;
  feesUSD: number;
}

// ─── Price oracle entry ───────────────────────────────────────────────────────

export interface AssetPrice {
  /** Asset contract address or "XLM". */
  asset: string;
  priceUSD: number;
}

// ─── Cache configuration ──────────────────────────────────────────────────────

export interface CacheConfig {
  /** TTL in milliseconds. Default: 60_000 (1 minute). */
  ttlMs: number;
}

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// ─── Soroswap API response shapes ────────────────────────────────────────────

export interface SoroswapPoolResponse {
  id: string;
  token0: { id: string };
  token1: { id: string };
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  /** Fee tier in bps returned by Soroswap API. */
  feeTier?: number;
  volumeUSD?: string;
  volumeToken0?: string;
  volumeToken1?: string;
}

export interface SoroswapDayDataResponse {
  date: number;
  dailyVolumeUSD: string;
  dailyFeesUSD?: string;
}