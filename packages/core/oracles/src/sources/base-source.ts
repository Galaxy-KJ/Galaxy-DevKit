import { IOracleSource } from '../types/IOracleSource.js';
import { PriceData, SourceInfo } from '../types/oracle-types.js';

export interface BaseSourceConfig {
  apiKey?: string;
  baseUrl: string;
  rateLimitPerSec: number;
  timeoutMs: number;
  cacheTtlMs: number;
}

export abstract class BaseSource implements IOracleSource {
  abstract readonly name: string;

  protected readonly config: BaseSourceConfig;
  private lastRequestTime = 0;
  private _rateLimitPromise: Promise<void> | null = null;
  private cache = new Map<string, { data: PriceData; expiresAt: number }>();
  private batchCache = new Map<string, { data: PriceData[]; expiresAt: number }>();

  constructor(config: BaseSourceConfig) {
    this.config = config;
  }

  abstract getPrice(symbol: string): Promise<PriceData>;
  abstract getPrices(symbols: string[]): Promise<PriceData[]>;
  abstract getSourceInfo(): SourceInfo;

  async isHealthy(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
      const response = await fetch(this.config.baseUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  protected async rateLimit(): Promise<void> {
    while (this._rateLimitPromise) {
      await this._rateLimitPromise;
    }
    this._rateLimitPromise = (async () => {
      const minInterval = 1000 / this.config.rateLimitPerSec;
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      if (elapsed < minInterval) {
        await sleep(minInterval - elapsed);
      }
      this.lastRequestTime = Date.now();
    })();
    try {
      await this._rateLimitPromise;
    } finally {
      this._rateLimitPromise = null;
    }
  }

  protected async fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retries = 3
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await this.rateLimit();

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const headers = new Headers(options.headers);
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers,
        });

        clearTimeout(timeout);

        if (response.status === 429) {
          const retryAfter = parseInt(
            response.headers.get('Retry-After') || '1',
            10
          );
          await sleep(retryAfter * 1000);
          continue;
        }

        if (!response.ok && attempt < retries) {
          await sleep(Math.pow(2, attempt) * 1000);
          continue;
        }

        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < retries) {
          await sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError || new Error(`Request failed after ${retries + 1} attempts`);
  }

  protected getCached(symbol: string): PriceData | undefined {
    const entry = this.cache.get(symbol);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.data;
    }
    this.cache.delete(symbol);
    return undefined;
  }

  protected setCache(symbol: string, data: PriceData): void {
    this.cache.set(symbol, {
      data,
      expiresAt: Date.now() + this.config.cacheTtlMs,
    });
  }

  protected getBatchCache(symbols: string[]): PriceData[] | undefined {
    const key = symbols.slice().sort().join(',');
    const entry = this.batchCache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.data;
    }
    this.batchCache.delete(key);
    return undefined;
  }

  protected setBatchCache(symbols: string[], data: PriceData[]): void {
    const key = symbols.slice().sort().join(',');
    this.batchCache.set(key, {
      data,
      expiresAt: Date.now() + this.config.cacheTtlMs,
    });
  }

  protected clearCache(): void {
    this.cache.clear();
    this.batchCache.clear();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
