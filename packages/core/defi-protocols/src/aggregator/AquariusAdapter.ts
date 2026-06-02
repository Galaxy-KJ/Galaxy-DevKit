/**
 * Aquarius DEX adapter for the aggregator (#273).
 *
 * Aquarius is one of Stellar's principal AMMs. The DexAggregatorService
 * queries it alongside Soroswap and SDEX so users get best execution
 * across all three venues. The adapter is intentionally minimal:
 * a single `fetchRoute` call returns the same `AggregatorRoute` shape
 * the rest of the aggregator already speaks.
 *
 * The HTTP client is injectable so tests can pass canned responses
 * without touching the real Aquarius API. Production wiring uses
 * global `fetch`.
 */

import BigNumber from 'bignumber.js';
import type { Asset } from '../types/defi-types.js';
import type { AggregatorRoute } from './types.js';

const DEFAULT_AQUARIUS_BASE_URL = 'https://amm-api.aquarius.network';
const DEFAULT_TIMEOUT_MS = 6_000;
const DISPLAY_DECIMALS = 7;

export interface AquariusQuoteRequest {
  assetIn: Asset;
  assetOut: Asset;
  amountIn: string;
}

export interface AquariusAdapterOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Raw shape returned by the Aquarius quote endpoint. */
interface AquariusQuoteResponse {
  amount_out?: string;
  price_impact?: string | number;
  path?: string[];
}

export class AquariusAdapter {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: AquariusAdapterOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_AQUARIUS_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async fetchRoute(req: AquariusQuoteRequest): Promise<AggregatorRoute> {
    const { assetIn, assetOut, amountIn } = req;
    const params = new URLSearchParams({
      asset_in: this.assetKey(assetIn),
      asset_out: this.assetKey(assetOut),
      amount_in: amountIn,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/quote?${params.toString()}`, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw new Error(
        `Aquarius quote endpoint returned ${res.status} ${res.statusText}`,
      );
    }
    const body = (await res.json()) as AquariusQuoteResponse;
    if (!body.amount_out) {
      throw new Error('Aquarius quote response missing amount_out');
    }
    const amountOut = new BigNumber(body.amount_out);
    if (!amountOut.isFinite() || amountOut.lte(0)) {
      throw new Error('Aquarius quote response returned an invalid amount_out');
    }
    return {
      venue: 'aquarius',
      amountIn,
      amountOut: amountOut
        .decimalPlaces(DISPLAY_DECIMALS)
        .toFixed(DISPLAY_DECIMALS),
      priceImpact: this.toNumber(body.price_impact),
      path: body.path ?? [],
    };
  }

  private assetKey(asset: Asset): string {
    if (asset.type === 'native') return 'XLM';
    return `${asset.code}:${asset.issuer ?? ''}`;
  }

  private toNumber(value: string | number | undefined): number {
    if (typeof value === 'number') return value;
    if (value === undefined) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
