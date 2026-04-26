/**
 * @fileoverview SDEX specific types and interfaces
 */

import { Asset as StellarAsset } from '@stellar/stellar-sdk';

/**
 * SDEX Protocol Configuration
 */
export interface SdexConfig {
  horizonUrl: string;
  networkPassphrase: string;
}

/**
 * Horizon Path Finding Result
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

/**
 * Helper to convert SDEX asset to StellarAsset
 */
export function toStellarAsset(asset: { code?: string; issuer?: string; type: string }): StellarAsset {
  if (asset.type === 'native') {
    return StellarAsset.native();
  }
  return new StellarAsset(asset.code!, asset.issuer!);
}
