/**
 * @fileoverview Protocol-specific constants
 * @description Contains constants for supported DeFi protocols
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

/**
 * Supported protocol identifiers
 */
export const PROTOCOL_IDS = {
  BLEND: 'blend',
  SOROSWAP: 'soroswap',
  AQUARIUS: 'aquarius'
} as const;

/**
 * Protocol display names
 */
export const PROTOCOL_NAMES = {
  [PROTOCOL_IDS.BLEND]: 'Blend Protocol',
  [PROTOCOL_IDS.SOROSWAP]: 'Soroswap',
  [PROTOCOL_IDS.AQUARIUS]: 'Aquarius'
} as const;

/**
 * Default slippage tolerance (1%)
 */
export const DEFAULT_SLIPPAGE = '0.01';

/**
 * Default deadline for transactions (5 minutes in seconds)
 */
export const DEFAULT_DEADLINE = 300;

/**
 * Minimum health factor for safe positions
 */
export const MIN_SAFE_HEALTH_FACTOR = '1.2';

/**
 * Maximum gas limit for transactions
 */
export const MAX_GAS_LIMIT = 1000000;

/**
 * Default transaction timeout (30 seconds)
 */
export const DEFAULT_TIMEOUT = 30000;
