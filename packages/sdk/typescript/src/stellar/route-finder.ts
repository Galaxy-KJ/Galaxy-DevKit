/**
 * @fileoverview Route discovery utility for path payments (#267)
 * @description Queries Stellar Horizon's /paths endpoint to find the optimal
 *   multi-hop route between two assets.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import { Asset } from '@stellar/stellar-sdk';
import { PathPaymentError } from './path-payment-error';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RouteFinderOptions {
  sourceAsset: Asset;
  destinationAsset: Asset;
  amount: string;
  mode: 'strict-send' | 'strict-receive';
  horizonUrl: string;
  sourceAccount?: string;
  destinationAccount?: string;
}

export interface QuotedRoute {
  path: Asset[];
  sourceAmount: string;
  destinationAmount: string;
}

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

export interface RouteResult {
  path: Asset[];
  sourceAmount: string;
  destinationAmount: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assetToParams(asset: Asset, prefix: string): Record<string, string> {
  if (asset.isNative()) {
    return { [`${prefix}_asset_type`]: 'native' };
  }
  return {
    [`${prefix}_asset_type`]:   asset.getAssetType(),
    [`${prefix}_asset_code`]:   asset.getCode(),
    [`${prefix}_asset_issuer`]: asset.getIssuer(),
  };
}

function assetToListValue(asset: Asset): string {
  if (asset.isNative()) return 'native';
  return `${asset.getCode()}:${asset.getIssuer()}`;
}

function recordToAsset(record: {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
}): Asset {
  if (record.asset_type === 'native') return Asset.native();
  if (!record.asset_code || !record.asset_issuer) {
    throw new Error(
      `Invalid path asset record: missing code or issuer (type=${record.asset_type})`,
    );
  }
  return new Asset(record.asset_code, record.asset_issuer);
}

function selectBestPath(
  records: HorizonPathRecord[],
  mode: 'strict-send' | 'strict-receive',
): HorizonPathRecord | null {
  if (records.length === 0) return null;
  return records.reduce((best, current) => {
    if (mode === 'strict-send') {
      return parseFloat(current.destination_amount) > parseFloat(best.destination_amount)
        ? current : best;
    } else {
      return parseFloat(current.source_amount) < parseFloat(best.source_amount)
        ? current : best;
    }
  });
}

// ─── Route finder ─────────────────────────────────────────────────────────────

function buildQuery(options: RouteFinderOptions): URLSearchParams {
  const params = new URLSearchParams();
  if (options.mode === 'strict-send') {
    for (const [key, value] of Object.entries(assetToParams(options.sourceAsset, 'source'))) {
      params.set(key, value);
    }
    params.set('source_amount', options.amount);
    if (options.destinationAccount) {
      params.set('destination_account', options.destinationAccount);
    } else {
      params.set('destination_assets', assetToListValue(options.destinationAsset));
    }
  } else {
    for (const [key, value] of Object.entries(assetToParams(options.destinationAsset, 'destination'))) {
      params.set(key, value);
    }
    params.set('destination_amount', options.amount);
    if (options.sourceAccount) {
      params.set('source_account', options.sourceAccount);
    } else {
      params.set('source_assets', assetToListValue(options.sourceAsset));
    }
  }
  return params;
}

async function fetchPathRecords(options: RouteFinderOptions): Promise<HorizonPathRecord[]> {
  const endpoint = options.mode === 'strict-send'
    ? `${options.horizonUrl}/paths/strict-send`
    : `${options.horizonUrl}/paths/strict-receive`;
  let response: Response;
  try {
    response = await fetch(`${endpoint}?${buildQuery(options).toString()}`, {
      headers: { Accept: 'application/json' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PathPaymentError(`Horizon request failed: ${msg}`, 'NETWORK_ERROR');
  }
  if (response.status === 404) {
    throw new PathPaymentError('No swap path found', 'NO_PATH_FOUND');
  }
  if (!response.ok) {
    throw new PathPaymentError(
      `Horizon /paths returned HTTP ${response.status}: ${response.statusText}`,
      'NETWORK_ERROR',
    );
  }
  const data = (await response.json()) as { _embedded?: { records?: HorizonPathRecord[] } };
  return data?._embedded?.records ?? [];
}

/**
 * Query Horizon's strict path endpoints and return the best quoted route.
 */
export async function findOptimalPath(options: RouteFinderOptions): Promise<QuotedRoute> {
  const records = await fetchPathRecords(options);
  const best = selectBestPath(records, options.mode);
  if (!best) {
    throw new PathPaymentError('No swap path found', 'NO_PATH_FOUND');
  }
  return {
    path: best.path.map(recordToAsset),
    sourceAmount: best.source_amount,
    destinationAmount: best.destination_amount,
  };
}

/**
 * Fetch all available paths. Useful for showing users multiple route options.
 */
export async function findAllPaths(options: RouteFinderOptions): Promise<RouteResult[]> {
  const records = await fetchPathRecords(options);
  return records.map((record) => ({
    path: record.path.map(recordToAsset),
    sourceAmount: record.source_amount,
    destinationAmount: record.destination_amount,
  }));
}