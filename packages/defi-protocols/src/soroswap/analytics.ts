import type {
  PoolAnalytics, PoolReserve, VolumeSnapshot, CacheConfig, CacheEntry,
  SoroswapPoolResponse, SoroswapDayDataResponse,
} from './types';

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_FEE_BPS = 30;
const DAYS_FOR_APY = 7;
const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;
const DEFAULT_SOROSWAP_API = 'https://info.soroswap.finance/api/v1';

export class AnalyticsError extends Error {
  constructor(message: string, public readonly code: 'POOL_NOT_FOUND'|'PRICE_UNAVAILABLE'|'FETCH_FAILED'|'INVALID_INPUT') {
    super(message); this.name = 'AnalyticsError';
  }
}

export function calculateImpermanentLoss(initialPriceRatio: number, currentPriceRatio: number): number {
  if (initialPriceRatio <= 0 || currentPriceRatio <= 0) return 0;
  const k = currentPriceRatio / initialPriceRatio;
  return Math.abs((2 * Math.sqrt(k)) / (1 + k) - 1) * 100;
}

export function calculateApy7d(snapshots: VolumeSnapshot[], tvlUSD: number): number {
  if (tvlUSD <= 0 || snapshots.length === 0) return 0;
  const cutoff = Date.now() - DAYS_FOR_APY * MS_PER_DAY;
  const totalFees = snapshots.filter(s => new Date(s.date).getTime() >= cutoff).reduce((sum, s) => sum + s.feesUSD, 0);
  return (totalFees / tvlUSD) * (DAYS_PER_YEAR / DAYS_FOR_APY) * 100;
}

export function calculateTvl(reserve: Pick<PoolReserve, 'reserveA'|'reserveB'>, priceA: number, priceB: number, decimalsA = 7, decimalsB = 7): number {
  return (Number(reserve.reserveA) / 10 ** decimalsA) * priceA + (Number(reserve.reserveB) / 10 ** decimalsB) * priceB;
}

export class AnalyticsCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  constructor(config: Partial<CacheConfig> = {}) { this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS; }
  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this.store.delete(key); return null; }
    return entry.data;
  }
  set(key: string, data: T): void { this.store.set(key, { data, expiresAt: Date.now() + this.ttlMs }); }
  invalidate(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  get size(): number { return this.store.size; }
}

export interface AnalyticsEngineConfig {
  apiUrl?: string;
  cacheTtlMs?: number;
  priceResolver?: (asset: string) => Promise<number>;
}

export class SoroswapAnalyticsEngine {
  private readonly apiUrl: string;
  private readonly poolCache: AnalyticsCache<PoolAnalytics>;
  private readonly allPoolsCache: AnalyticsCache<PoolAnalytics[]>;
  private readonly priceResolver: (asset: string) => Promise<number>;

  constructor(config: AnalyticsEngineConfig = {}) {
    this.apiUrl = config.apiUrl ?? DEFAULT_SOROSWAP_API;
    this.poolCache = new AnalyticsCache({ ttlMs: config.cacheTtlMs ?? DEFAULT_TTL_MS });
    this.allPoolsCache = new AnalyticsCache({ ttlMs: config.cacheTtlMs ?? DEFAULT_TTL_MS });
    this.priceResolver = config.priceResolver ?? (() => Promise.resolve(0));
  }

  private async fetchPool(poolId: string): Promise<SoroswapPoolResponse> {
    let response: Response;
    try { response = await fetch(`${this.apiUrl}/pools/${poolId}`, { headers: { Accept: 'application/json' } }); }
    catch (err) { throw new AnalyticsError(`Network error fetching pool ${poolId}: ${err instanceof Error ? err.message : String(err)}`, 'FETCH_FAILED'); }
    if (response.status === 404) throw new AnalyticsError(`Pool not found: ${poolId}`, 'POOL_NOT_FOUND');
    if (!response.ok) throw new AnalyticsError(`Soroswap API returned HTTP ${response.status} for pool ${poolId}`, 'FETCH_FAILED');
    return response.json() as Promise<SoroswapPoolResponse>;
  }

  private async fetchAllPools(): Promise<SoroswapPoolResponse[]> {
    let response: Response;
    try { response = await fetch(`${this.apiUrl}/pools`, { headers: { Accept: 'application/json' } }); }
    catch (err) { throw new AnalyticsError(`Network error fetching all pools: ${err instanceof Error ? err.message : String(err)}`, 'FETCH_FAILED'); }
    if (!response.ok) throw new AnalyticsError(`Soroswap API returned HTTP ${response.status} for /pools`, 'FETCH_FAILED');
    const data = await response.json() as { pools?: SoroswapPoolResponse[] } | SoroswapPoolResponse[];
    return Array.isArray(data) ? data : (data.pools ?? []);
  }

  private async fetchDayData(poolId: string, days = DAYS_FOR_APY): Promise<VolumeSnapshot[]> {
    try {
      const response = await fetch(`${this.apiUrl}/pools/${poolId}/day-data?days=${days}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) return [];
      const raw = await response.json() as SoroswapDayDataResponse[];
      return raw.map(d => ({
        poolId, date: new Date(d.date * 1000).toISOString().split('T')[0],
        volumeUSD: parseFloat(d.dailyVolumeUSD),
        feesUSD: d.dailyFeesUSD ? parseFloat(d.dailyFeesUSD) : parseFloat(d.dailyVolumeUSD) * (DEFAULT_FEE_BPS / 10_000),
      }));
    } catch { return []; }
  }

  private async computeAnalytics(pool: SoroswapPoolResponse): Promise<PoolAnalytics> {
    const [priceA, priceB] = await Promise.all([this.priceResolver(pool.token0.id), this.priceResolver(pool.token1.id)]);
    const tvlUSD = calculateTvl({ reserveA: BigInt(pool.reserve0), reserveB: BigInt(pool.reserve1) }, priceA, priceB);
    const volume24hUSD = pool.volumeUSD ? parseFloat(pool.volumeUSD) : 0;
    const feeBps = pool.feeTier ?? DEFAULT_FEE_BPS;
    const feesEarned24hUSD = volume24hUSD * (feeBps / 10_000);
    const snapshots = await this.fetchDayData(pool.id);
    const apy7d = calculateApy7d(snapshots, tvlUSD);
    const ratio = priceA > 0 && priceB > 0 ? priceA / priceB : 1;
    return { poolId: pool.id, tvlUSD, volume24hUSD, feesEarned24hUSD, apy7d, impermanentLossPercent: calculateImpermanentLoss(ratio, ratio), fetchedAt: Date.now() };
  }

  async getPoolAnalytics(poolId: string): Promise<PoolAnalytics> {
    if (!poolId || typeof poolId !== 'string') throw new AnalyticsError('poolId must be a non-empty string', 'INVALID_INPUT');
    const cached = this.poolCache.get(poolId);
    if (cached) return cached;
    const pool = await this.fetchPool(poolId);
    const result = await this.computeAnalytics(pool);
    this.poolCache.set(poolId, result);
    return result;
  }

  async getAllPoolsAnalytics(): Promise<PoolAnalytics[]> {
    const cached = this.allPoolsCache.get('all');
    if (cached) return cached;
    const pools = await this.fetchAllPools();
    const result = await Promise.all(pools.map(p => this.computeAnalytics(p)));
    this.allPoolsCache.set('all', result);
    return result;
  }

  clearCache(): void { this.poolCache.clear(); this.allPoolsCache.clear(); }
}

let _defaultEngine: SoroswapAnalyticsEngine | null = null;
function getDefaultEngine(): SoroswapAnalyticsEngine {
  if (!_defaultEngine) _defaultEngine = new SoroswapAnalyticsEngine();
  return _defaultEngine;
}

export async function getPoolAnalytics(poolId: string): Promise<PoolAnalytics> { return getDefaultEngine().getPoolAnalytics(poolId); }
export async function getAllPoolsAnalytics(): Promise<PoolAnalytics[]> { return getDefaultEngine().getAllPoolsAnalytics(); }
export function configureAnalytics(config: AnalyticsEngineConfig): void { _defaultEngine = new SoroswapAnalyticsEngine(config); }
