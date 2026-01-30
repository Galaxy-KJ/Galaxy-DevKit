/**
 * @fileoverview Shared Blend CLI Configuration
 * @description Centralized configuration for all Blend CLI commands
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-29
 */

import {
  getBlendConfig,
  convertToStroops,
  convertFromStroops,
  BLEND_TESTNET_ASSETS
} from '../../../../../packages/core/defi-protocols/src/protocols/blend/index.js';
import { ProtocolConfig } from '../../../../../packages/core/defi-protocols/src/types/defi-types.js';

/**
 * Get Blend configuration for CLI based on network flag
 * @param useMainnet - Whether to use mainnet (default: false for testnet)
 * @returns Protocol configuration for the specified network
 */
export function getCliBlendConfig(useMainnet: boolean = false): ProtocolConfig {
  return getBlendConfig(useMainnet ? 'mainnet' : 'testnet');
}

/**
 * Convert amount to stroops with proper decimal handling
 * @param amount - Amount in human-readable format
 * @param assetCode - Asset code (XLM, USDC, etc.)
 * @returns Amount in stroops as string
 */
export function amountToStroops(amount: string | number, assetCode: string): string {
  return convertToStroops(amount, assetCode);
}

/**
 * Convert stroops to human-readable amount
 * @param stroops - Amount in stroops
 * @param assetCode - Asset code (XLM, USDC, etc.)
 * @returns Human-readable amount as string
 */
export function stroopsToAmount(stroops: string | number, assetCode: string): string {
  return convertFromStroops(stroops, assetCode);
}

/**
 * Get testnet asset addresses
 */
export const TESTNET_ASSETS = BLEND_TESTNET_ASSETS;

/**
 * Get asset contract address for a given asset code
 * @param assetCode - Asset code (XLM, USDC, etc.)
 * @returns Asset contract address or undefined
 */
export function getAssetAddress(assetCode: string): string | undefined {
  return BLEND_TESTNET_ASSETS[assetCode as keyof typeof BLEND_TESTNET_ASSETS];
}
