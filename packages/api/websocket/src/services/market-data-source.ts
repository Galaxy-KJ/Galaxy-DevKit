export const ORACLE_SOURCE = 'oracle-aggregator';
export const HORIZON_SOURCE = 'horizon';

export interface AggregatedPriceLike {
  symbol: string;
  price: number;
  timestamp: Date | number | string;
  sourcesUsed?: string[];
  metadata?: Record<string, unknown>;
}

export interface PriceAggregatorPort {
  getAggregatedPrice(symbol: string): Promise<AggregatedPriceLike>;
}

export interface MarketPriceSnapshot {
  pair: string;
  price: number;
  volume: number;
  change24h: number;
  marketCap?: number;
  source: string;
  sourcesUsed?: string[];
  upstreamTimestamp: number;
}

export interface MarketOrderbookSnapshot {
  pair: string;
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  depth: number;
  source: string;
  upstreamTimestamp: number;
}

export interface MarketTradeSnapshot {
  pair: string;
  price: number;
  volume: number;
  side: 'buy' | 'sell';
  tradeTimestamp: number;
  source: string;
  upstreamTimestamp: number;
}

export interface MarketDataSource {
  getPrice(pair: string): Promise<MarketPriceSnapshot>;
  getOrderbook(pair: string): Promise<MarketOrderbookSnapshot>;
  getLatestTrade(pair: string): Promise<MarketTradeSnapshot>;
}

export type StellarNetwork = 'testnet' | 'mainnet';

export interface HorizonAssetParams {
  asset_type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
  asset_code?: string;
  asset_issuer?: string;
}

export interface HorizonMarketClientOptions {
  horizonUrl: string;
  network?: StellarNetwork;
  fetchImpl?: typeof fetch;
  orderbookLimit?: number;
}

interface HorizonOrderbookLevel {
  price: string;
  amount: string;
}

interface HorizonOrderbookResponse {
  bids?: HorizonOrderbookLevel[];
  asks?: HorizonOrderbookLevel[];
}

interface HorizonTradeRecord {
  id?: string;
  ledger_close_time: string;
  base_amount: string;
  counter_amount: string;
  base_is_seller?: boolean;
  price?: { n: string | number; d: string | number };
}

interface HorizonTradesResponse {
  _embedded?: {
    records?: HorizonTradeRecord[];
  };
}

const USDC_ISSUERS: Record<StellarNetwork, string> = {
  testnet: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
};

export function splitPair(pair: string): { base: string; quote: string } {
  const parts = pair.split('/').map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(`Invalid trading pair: ${pair}`);
  }
  return { base: parts[0], quote: parts[1] };
}

export function toTickerRoom(pair: string): string {
  return `market:${pair.replace('/', '_')}`;
}

export function toOrderbookRoom(pair: string): string {
  return `${toTickerRoom(pair)}:orderbook`;
}

export function pairFromMarketRoom(
  roomName: string
): { pair: string; kind: 'ticker' | 'orderbook' } | null {
  if (!roomName.startsWith('market:')) {
    return null;
  }

  let rest = roomName.slice('market:'.length);
  let kind: 'ticker' | 'orderbook' = 'ticker';
  if (rest.endsWith(':orderbook')) {
    kind = 'orderbook';
    rest = rest.slice(0, -':orderbook'.length);
  }

  const separator = rest.indexOf('_');
  const pair = separator === -1 ? rest : `${rest.slice(0, separator)}/${rest.slice(separator + 1)}`;
  if (!pair) {
    return null;
  }
  return { pair, kind };
}

export function parseHorizonAsset(
  raw: string,
  network: StellarNetwork = 'testnet'
): HorizonAssetParams {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Asset identifier is required');
  }

  const upper = trimmed.toUpperCase();
  if (upper === 'XLM' || upper === 'NATIVE') {
    return { asset_type: 'native' };
  }

  if (trimmed.includes(':')) {
    const [code, issuer] = trimmed.split(':');
    return creditAsset(code, issuer);
  }

  if (upper === 'USDC') {
    return creditAsset('USDC', USDC_ISSUERS[network]);
  }

  throw new Error(
    `Unknown Stellar asset "${raw}". Provide CODE:ISSUER for non-native assets.`
  );
}

function creditAsset(code: string, issuer: string): HorizonAssetParams {
  const assetCode = code.trim().toUpperCase();
  const assetIssuer = issuer.trim();
  if (!assetCode || !assetIssuer) {
    throw new Error(`Invalid credit asset: ${code}:${issuer}`);
  }
  return {
    asset_type: assetCode.length > 4 ? 'credit_alphanum12' : 'credit_alphanum4',
    asset_code: assetCode,
    asset_issuer: assetIssuer,
  };
}

function appendAssetParams(
  params: URLSearchParams,
  prefix: 'selling' | 'buying' | 'base' | 'counter',
  asset: HorizonAssetParams
): void {
  params.set(`${prefix}_asset_type`, asset.asset_type);
  if (asset.asset_type !== 'native') {
    params.set(`${prefix}_asset_code`, asset.asset_code!);
    params.set(`${prefix}_asset_issuer`, asset.asset_issuer!);
  }
}

function toEpochMs(timestamp: Date | number | string): number {
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }
  if (typeof timestamp === 'number') {
    return timestamp;
  }
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid upstream timestamp: ${timestamp}`);
  }
  return parsed;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export class OracleHorizonMarketDataSource implements MarketDataSource {
  private readonly oracle: PriceAggregatorPort;
  private readonly horizonUrl: string;
  private readonly network: StellarNetwork;
  private readonly fetchImpl: typeof fetch;
  private readonly orderbookLimit: number;

  constructor(oracle: PriceAggregatorPort, options: HorizonMarketClientOptions) {
    this.oracle = oracle;
    this.horizonUrl = options.horizonUrl.replace(/\/$/, '');
    this.network = options.network ?? 'testnet';
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.orderbookLimit = options.orderbookLimit ?? 20;
  }

  async getPrice(pair: string): Promise<MarketPriceSnapshot> {
    splitPair(pair);
    const aggregated = await this.oracle.getAggregatedPrice(pair);
    if (!Number.isFinite(aggregated.price)) {
      throw new Error(`Oracle aggregator returned a non-numeric price for ${pair}`);
    }

    const metadata = aggregated.metadata ?? {};
    return {
      pair,
      price: aggregated.price,
      volume: optionalNumber(metadata.volume) ?? 0,
      change24h: optionalNumber(metadata.change24h) ?? 0,
      marketCap: optionalNumber(metadata.marketCap),
      source: ORACLE_SOURCE,
      sourcesUsed: aggregated.sourcesUsed,
      upstreamTimestamp: toEpochMs(aggregated.timestamp),
    };
  }

  async getOrderbook(pair: string): Promise<MarketOrderbookSnapshot> {
    const { base, quote } = splitPair(pair);
    const params = new URLSearchParams();
    appendAssetParams(params, 'selling', parseHorizonAsset(base, this.network));
    appendAssetParams(params, 'buying', parseHorizonAsset(quote, this.network));
    params.set('limit', String(this.orderbookLimit));

    const payload = await this.horizonGet<HorizonOrderbookResponse>(`/order_book?${params.toString()}`);
    const bids = (payload.bids ?? []).map(levelToTuple);
    const asks = (payload.asks ?? []).map(levelToTuple);

    return {
      pair,
      bids,
      asks,
      depth: Math.max(bids.length, asks.length),
      source: HORIZON_SOURCE,
      upstreamTimestamp: Date.now(),
    };
  }

  async getLatestTrade(pair: string): Promise<MarketTradeSnapshot> {
    const { base, quote } = splitPair(pair);
    const params = new URLSearchParams();
    appendAssetParams(params, 'base', parseHorizonAsset(base, this.network));
    appendAssetParams(params, 'counter', parseHorizonAsset(quote, this.network));
    params.set('order', 'desc');
    params.set('limit', '1');

    const payload = await this.horizonGet<HorizonTradesResponse>(`/trades?${params.toString()}`);
    const trade = payload._embedded?.records?.[0];
    if (!trade) {
      throw new Error(`No Horizon trades found for ${pair}`);
    }

    const tradeTimestamp = Date.parse(trade.ledger_close_time);
    if (Number.isNaN(tradeTimestamp)) {
      throw new Error(`Horizon trade for ${pair} has an invalid ledger_close_time`);
    }

    const price = tradePrice(trade);
    const volume = Number.parseFloat(trade.base_amount);
    if (!Number.isFinite(price) || !Number.isFinite(volume)) {
      throw new Error(`Horizon trade for ${pair} has non-numeric price or volume`);
    }

    return {
      pair,
      price,
      volume,
      side: trade.base_is_seller ? 'sell' : 'buy',
      tradeTimestamp,
      source: HORIZON_SOURCE,
      upstreamTimestamp: tradeTimestamp,
    };
  }

  private async horizonGet<T>(path: string): Promise<T> {
    const url = `${this.horizonUrl}${path}`;
    const response = await this.fetchImpl(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Horizon request failed (${response.status}) for ${url}`);
    }

    return (await response.json()) as T;
  }
}

function levelToTuple(level: HorizonOrderbookLevel): [number, number] {
  const price = Number.parseFloat(level.price);
  const amount = Number.parseFloat(level.amount);
  if (!Number.isFinite(price) || !Number.isFinite(amount)) {
    throw new Error('Horizon orderbook level is non-numeric');
  }
  return [price, amount];
}

function tradePrice(trade: HorizonTradeRecord): number {
  if (trade.price) {
    const n = Number(trade.price.n);
    const d = Number(trade.price.d);
    if (Number.isFinite(n) && Number.isFinite(d) && d !== 0) {
      return n / d;
    }
  }
  const base = Number.parseFloat(trade.base_amount);
  const counter = Number.parseFloat(trade.counter_amount);
  if (Number.isFinite(base) && Number.isFinite(counter) && base !== 0) {
    return counter / base;
  }
  throw new Error('Unable to derive trade price from Horizon record');
}

export async function createDefaultPriceAggregator(): Promise<PriceAggregatorPort> {
  const moduleName: string = '@galaxy-kj/core-oracles';
  const oracles = (await import(moduleName)) as {
    PriceAggregatorService: new (config: {
      sources: Array<{ kind: 'coingecko'; apiKey?: string }>;
      symbols: string[];
      updateIntervalMs: number;
      deviationThresholdPercent: number;
      onChainOracleId: string;
    }) => PriceAggregatorPort;
  };

  return new oracles.PriceAggregatorService({
    sources: [{ kind: 'coingecko', apiKey: process.env.COINGECKO_API_KEY }],
    symbols: [],
    updateIntervalMs: 30_000,
    deviationThresholdPercent: 1,
    onChainOracleId: 'websocket-market-feed',
  });
}
