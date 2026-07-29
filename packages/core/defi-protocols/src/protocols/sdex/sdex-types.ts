/**
 * @fileoverview SDEX-specific types and interfaces
 * @description Type definitions for Stellar DEX (SDEX) order book, sell offers,
 *   and liquidity pool mapping operations.
 */

import { Asset as StellarAsset } from '@stellar/stellar-sdk';
import type { Asset, LiquidityPool } from '../../types/defi-types.js';

// ─── Horizon path-finding ────────────────────────────────────────────────────

/**
 * Shape of a single record returned by the Horizon strict-send / strict-receive
 * path-finding endpoints.
 */
export interface HorizonPathRecord {
  source_asset_type: string;
  source_asset_code?: string;
  source_asset_issuer?: string;
  source_amount: string;
  destination_asset_type: string;
  destination_asset_code?: string;
  destination_asset_issuer?: string;
  destination_amount: string;
  path: Array<{
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
  }>;
}

// ─── Order book ──────────────────────────────────────────────────────────────

/**
 * A single price level (bid or ask) in an SDEX order book.
 */
export interface OrderBookLevel {
  /** Price of the quote asset in terms of the base asset (selling / buying price). */
  price: string;
  /** Number of units of the base asset available at this price level. */
  amount: string;
}

/**
 * Full SDEX order book snapshot for a given asset pair.
 */
export interface SdexOrderBook {
  /** The base (selling) asset. */
  base: Asset;
  /** The counter (buying) asset. */
  counter: Asset;
  /** Asks sorted ascending by price (cheapest first). */
  asks: OrderBookLevel[];
  /** Bids sorted descending by price (highest first). */
  bids: OrderBookLevel[];
  /** Unix timestamp (ms) when the snapshot was taken. */
  timestamp: number;
}

/**
 * Raw shape of a Horizon order-book response record.
 * Horizon represents prices and amounts as decimal strings.
 */
export interface HorizonOrderBookRecord {
  bids: Array<{ price: string; amount: string }>;
  asks: Array<{ price: string; amount: string }>;
}

// ─── Manage-sell-offer ───────────────────────────────────────────────────────

/**
 * Parameters for creating or modifying an SDEX sell offer.
 */
export interface ManageSellOfferParams {
  /** Asset being sold. */
  selling: Asset;
  /** Asset being bought. */
  buying: Asset;
  /**
   * Amount of `selling` asset offered.
   * Pass `'0'` (or set `offerId` to an existing offer) to delete an offer.
   */
  amount: string;
  /**
   * Price: how many units of `buying` to receive per unit of `selling`.
   * Must be a positive decimal string, e.g. `'0.95'`.
   */
  price: string;
  /**
   * ID of an existing offer to modify or delete.
   * Omit (or pass `0`) to create a new offer.
   */
  offerId?: number;
}

/**
 * Result of a manage-sell-offer operation.
 */
export interface ManageSellOfferResult {
  /** Unsigned XDR string of the built transaction. */
  xdr: string;
  /** `'create'` for new offers, `'modify'` for updates, `'delete'` for amount=0. */
  action: 'create' | 'modify' | 'delete';
  offerId: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a Galaxy `Asset` object to a Stellar SDK `Asset` instance.
 *
 * @param asset - The asset to convert.
 * @returns A Stellar SDK `Asset` (native XLM or alphanum4/12).
 */
export function toStellarAsset(asset: {
  code?: string;
  issuer?: string;
  type: string;
}): StellarAsset {
  if (asset.type === 'native') {
    return StellarAsset.native();
  }
  return new StellarAsset(asset.code!, asset.issuer!);
}

/**
 * Determine whether two Galaxy `Asset` values refer to the same Stellar asset.
 * Comparison is case-insensitive for asset codes and exact for issuers.
 *
 * @param a - First asset.
 * @param b - Second asset.
 * @returns `true` when the assets are the same.
 */
export function assetsMatch(a: Asset, b: Asset): boolean {
  if (a.type === 'native' && b.type === 'native') {
    return true;
  }
  if (a.type === 'native' || b.type === 'native') {
    return false;
  }
  return (
    a.code.toUpperCase() === b.code.toUpperCase() &&
    a.issuer === b.issuer
  );
}

/**
 * Build a canonical string key for an asset, suitable for use as a map key.
 *
 * @param asset - The asset to key.
 * @returns `'native'` for XLM, otherwise `'CODE:ISSUER'`.
 */
export function assetKey(asset: Asset): string {
  if (asset.type === 'native') return 'native';
  return `${asset.code.toUpperCase()}:${asset.issuer}`;
}

/**
 * Map an SDEX order book snapshot to the standard `LiquidityPool` interface
 * so the aggregator and smart-router can treat SDEX depth the same way they
 * treat Soroswap / Aquarius AMM pools.
 *
 * Mapping rules
 * ─────────────
 * • `address`       – synthetic key derived from the asset pair.
 * • `tokenA`        – the base (selling) asset.
 * • `tokenB`        – the counter (buying) asset.
 * • `reserveA`      – total depth available on the ask side (base units).
 * • `reserveB`      – total depth available on the bid side (counter units,
 *                     approximated as bid_amount × bid_price).
 * • `totalLiquidity`– geometric mean of reserveA and reserveB.
 * • `fee`           – Stellar's fixed protocol fee (0.0001 XLM per operation,
 *                     represented here as '0.002' ≈ 0.2 % to be comparable
 *                     with typical AMM fee tiers).
 *
 * @param orderBook - SDEX order book snapshot.
 * @returns A `LiquidityPool` compatible with the standard DeFi interface.
 */
export function orderBookToLiquidityPool(orderBook: SdexOrderBook): LiquidityPool {
  // Sum total depth across all ask levels (base asset available to buy).
  const reserveA = orderBook.asks
    .reduce((sum, level) => sum + parseFloat(level.amount), 0)
    .toFixed(7);

  // Approximate counter-asset depth from bids (amount * price).
  const reserveB = orderBook.bids
    .reduce((sum, level) => {
      const amount = parseFloat(level.amount);
      const price = parseFloat(level.price);
      return sum + amount * price;
    }, 0)
    .toFixed(7);

  // Geometric mean as a synthetic "total liquidity" figure.
  const rA = parseFloat(reserveA);
  const rB = parseFloat(reserveB);
  const totalLiquidity = (Math.sqrt(rA * rB)).toFixed(7);

  const pairKey = `${assetKey(orderBook.base)}_${assetKey(orderBook.counter)}`;

  return {
    address: `sdex:${pairKey}`,
    tokenA: orderBook.base,
    tokenB: orderBook.counter,
    reserveA,
    reserveB,
    totalLiquidity,
    // SDEX charges 0.00001 XLM per offer (the base fee) which is negligible.
    // We expose it as 0.002 (0.2%) to be comparable with AMM fee tiers.
    fee: '0.002',
  };
}
