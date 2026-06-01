/**
 * @fileoverview Route discovery utility for path payments (#267)
 * @description Queries Stellar Horizon's /paths endpoint to find the optimal
 *   multi-hop route between two assets.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import { Asset } from '@stellar/stellar-sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RouteFinderOptions {
  sourceAsset: Asset;
  destinationAsset: Asset;
  amount: string;
  mode: 'strict-send' | 'strict-receive';
  horizonUrl: string;
  sourceAccount?: string;
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

/**
 * Query Horizon's /paths endpoint and return the optimal intermediate asset path.
 * Returns empty array for a direct swap. Returns empty array when no path found.
 */
export async function findOptimalPath(options: RouteFinderOptions): Promise<Asset[]> {
  const { sourceAsset, destinationAsset, amount, mode, horizonUrl, sourceAccount } = options;

  const params = new URLSearchParams({
    ...assetToParams(sourceAsset, 'source'),
    ...assetToParams(destinationAsset, 'destination'),
    amount,
  });

  if (mode === 'strict-receive' && sourceAccount) {
    params.set('source_account', sourceAccount);
  }

  const endpoint = mode === 'strict-send'
    ? `${horizonUrl}/paths/strict-send`
    : `${horizonUrl}/paths/strict-receive`;

  let response: Response;
  try {
    response = await fetch(`${endpoint}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Horizon request failed: ${msg}`);
  }

  if (response.status === 404) return [];

  if (!response.ok) {
    throw new Error(`Horizon /paths returned HTTP ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    _embedded?: { records?: HorizonPathRecord[] };
  };

  const records = data?._embedded?.records ?? [];
  const best = selectBestPath(records, mode);
  if (!best) return [];

  return best.path.map(recordToAsset);
}

/**
 * Fetch all available paths. Useful for showing users multiple route options.
 */
export async function findAllPaths(options: RouteFinderOptions): Promise<RouteResult[]> {
  const { sourceAsset, destinationAsset, amount, mode, horizonUrl, sourceAccount } = options;

  const params = new URLSearchParams({
    ...assetToParams(sourceAsset, 'source'),
    ...assetToParams(destinationAsset, 'destination'),
    amount,
  });

  if (mode === 'strict-receive' && sourceAccount) {
    params.set('source_account', sourceAccount);
  }

  const endpoint = mode === 'strict-send'
    ? `${horizonUrl}/paths/strict-send`
    : `${horizonUrl}/paths/strict-receive`;

  const response = await fetch(`${endpoint}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) return [];

  const data = (await response.json()) as {
    _embedded?: { records?: HorizonPathRecord[] };
  };

  return (data?._embedded?.records ?? []).map((record) => ({
    path:              record.path.map(recordToAsset),
    sourceAmount:      record.source_amount,
    destinationAmount: record.destination_amount,
  }));
}