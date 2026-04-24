/**
 * @fileoverview Oracle Pusher Service Types
 * @description Data structures for the off-chain price-pusher service that
 *   feeds prices from external APIs into the on-chain Soroban Price Oracle.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * External price provider identifiers supported by the pusher.
 */
export type PriceProvider = 'coingecko' | 'coinbase' | 'binance';

/**
 * A single asset pair the pusher monitors and submits prices for.
 */
export interface AssetPair {
  /** Base asset symbol as stored on-chain, e.g. "XLM" */
  base: string;
  /** Quote asset symbol as stored on-chain, e.g. "USDC" */
  quote: string;
  /**
   * Identifier used by the external price provider to look up this pair.
   * Example for CoinGecko: "stellar" (base id) / "usd-coin" (quote id).
   */
  providerBaseId: string;
  providerQuoteId: string;
}

/**
 * Configuration for a single push cycle.
 */
export interface OraclePusherConfig {
  /** Soroban RPC endpoint */
  sorobanRpcUrl: string;
  /** Stellar network passphrase */
  networkPassphrase: string;
  /** Deployed price-oracle contract address */
  oracleContractId: string;
  /** Pusher's Stellar secret key (used to sign price submissions) */
  pusherSecretKey: string;
  /** Asset pairs to monitor */
  pairs: AssetPair[];
  /** External price provider to use */
  provider: PriceProvider;
  /** How often (ms) to push a new price. Default: 60_000 (1 min) */
  intervalMs?: number;
  /** Max number of automatic retry attempts per push. Default: 3 */
  maxRetries?: number;
  /** Base delay (ms) between retries (exponential back-off). Default: 1_000 */
  retryDelayMs?: number;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * Raw price fetched from the external provider.
 */
export interface FetchedPrice {
  /** Asset pair key, e.g. "XLM_USDC" */
  pairKey: string;
  /** Price as a decimal number, e.g. 0.1234567 */
  price: number;
  /** When the price was fetched (UTC) */
  fetchedAt: Date;
  /** Provider that returned this price */
  provider: PriceProvider;
}

/**
 * Outcome of a single push attempt for one asset pair.
 */
export interface PushResult {
  pairKey: string;
  /** Scaled integer price submitted to the contract (7 decimal places) */
  scaledPrice: bigint;
  /** Whether the transaction was accepted by the network */
  success: boolean;
  /** Transaction hash on success */
  txHash?: string;
  /** Error message on failure */
  error?: string;
  /** Number of attempts made */
  attempts: number;
  /** Timestamp of the push */
  pushedAt: Date;
}

/**
 * Summary of one full push cycle across all configured pairs.
 */
export interface PushCycleSummary {
  results: PushResult[];
  successCount: number;
  failureCount: number;
  cycleAt: Date;
}
