/**
 * @fileoverview Oracle registry utilities for CLI
 * @description Loads oracle sources, registers defaults, and builds aggregators
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-26
 */

import fs from 'fs-extra';
import path from 'path';
import {
  OracleAggregator,
  MockOracleSource,
  IOracleSource,
  PriceData,
  SourceInfo,
} from '@galaxy/core-oracles';

export interface CustomOracleSourceConfig {
  name: string;
  url: string;
  weight?: number;
  description?: string;
  version?: string;
  supportedSymbols?: string[];
}

export interface OracleRegistryConfig {
  sources: CustomOracleSourceConfig[];
}

export interface OracleAggregatorOptions {
  includeSources?: string[];
  customSources?: CustomOracleSourceConfig[];
  cwd?: string;
}

export interface OracleSourceEntry {
  source: IOracleSource;
  weight: number;
  type: 'default' | 'custom';
}

const ORACLE_CONFIG_DIR = '.galaxy';
const ORACLE_CONFIG_FILE = 'oracles.json';

const DEFAULT_REGISTRY_CONFIG: OracleRegistryConfig = {
  sources: [],
};

const BASE_PRICES = new Map<string, number>([
  ['XLM', 0.12],
  ['XLM/USD', 0.12],
  ['USDC', 1.0],
  ['USDC/USD', 1.0],
  ['BTC', 67000],
  ['ETH', 3500],
]);

function normalizeSourceName(name: string): string {
  return name.trim().toLowerCase();
}

function buildPriceMap(multiplier: number): Map<string, number> {
  const result = new Map<string, number>();
  for (const [symbol, price] of BASE_PRICES.entries()) {
    result.set(symbol, price * (1 + multiplier));
  }
  return result;
}

function createDefaultMockSources(): OracleSourceEntry[] {
  return [
    { source: new MockOracleSource('coingecko', buildPriceMap(0)), weight: 1.0, type: 'default' },
    { source: new MockOracleSource('coinmarketcap', buildPriceMap(0.003)), weight: 1.0, type: 'default' },
    { source: new MockOracleSource('binance', buildPriceMap(-0.002)), weight: 1.0, type: 'default' },
  ];
}

function getFetch(): (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<any> }> {
  const fetchFn = (globalThis as unknown as { fetch?: (url: string) => Promise<any> }).fetch;
  if (!fetchFn) {
    throw new Error('Fetch API is not available in this runtime');
  }
  return fetchFn;
}

class HttpOracleSource implements IOracleSource {
  public readonly name: string;
  private url: string;
  private description?: string;
  private version?: string;
  private supportedSymbols: string[];

  constructor(config: CustomOracleSourceConfig) {
    this.name = normalizeSourceName(config.name);
    this.url = config.url;
    this.description = config.description;
    this.version = config.version;
    this.supportedSymbols = config.supportedSymbols ?? [];
  }

  private buildUrl(symbol: string): string {
    return this.url.replace('{symbol}', encodeURIComponent(symbol));
  }

  async getPrice(symbol: string): Promise<PriceData> {
    const fetchFn = getFetch();
    const url = this.buildUrl(symbol);
    const response = await fetchFn(url);

    if (!response.ok) {
      throw new Error(`Oracle source ${this.name} responded with status ${response.status}`);
    }

    const data = await response.json();
    const price = Number(data?.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Oracle source ${this.name} returned invalid price`);
    }

    const resolvedSymbol = typeof data?.symbol === 'string' ? data.symbol : symbol;

    return {
      symbol: resolvedSymbol,
      price,
      timestamp: new Date(),
      source: this.name,
      metadata: {
        url,
      },
    };
  }

  async getPrices(symbols: string[]): Promise<PriceData[]> {
    return Promise.all(symbols.map((symbol) => this.getPrice(symbol)));
  }

  getSourceInfo(): SourceInfo {
    return {
      name: this.name,
      description: this.description || `Custom oracle source ${this.name}`,
      version: this.version || '1.0.0',
      supportedSymbols: this.supportedSymbols,
    };
  }

  async isHealthy(): Promise<boolean> {
    const symbol = this.supportedSymbols[0] || 'XLM';
    try {
      await this.getPrice(symbol);
      return true;
    } catch {
      return false;
    }
  }
}

export function getOracleConfigPath(cwd: string = process.cwd()): string {
  return path.join(cwd, ORACLE_CONFIG_DIR, ORACLE_CONFIG_FILE);
}

export async function loadOracleConfig(
  cwd: string = process.cwd()
): Promise<OracleRegistryConfig> {
  const configPath = getOracleConfigPath(cwd);
  if (!await fs.pathExists(configPath)) {
    return { ...DEFAULT_REGISTRY_CONFIG };
  }

  const data = await fs.readJson(configPath);
  const sources = Array.isArray(data?.sources) ? data.sources : [];

  const normalizedSources: CustomOracleSourceConfig[] = sources
    .filter((source: any) => source && typeof source.name === 'string' && typeof source.url === 'string')
    .map((source: CustomOracleSourceConfig) => ({
      ...source,
      name: normalizeSourceName(source.name),
    }));

  return {
    sources: normalizedSources,
  };
}

export async function saveOracleConfig(
  config: OracleRegistryConfig,
  cwd: string = process.cwd()
): Promise<void> {
  const configPath = getOracleConfigPath(cwd);
  await fs.ensureDir(path.dirname(configPath));
  await fs.writeJson(configPath, config, { spaces: 2 });
}

export function getDefaultSourceNames(): string[] {
  return createDefaultMockSources().map(({ source }) => source.name);
}

export async function createOracleAggregator(
  options: OracleAggregatorOptions = {}
): Promise<OracleAggregator> {
  const aggregator = new OracleAggregator();
  const sources = await createOracleSources(options);
  for (const entry of sources) {
    aggregator.addSource(entry.source, entry.weight);
  }

  return aggregator;
}

export async function loadCustomSources(
  cwd: string = process.cwd()
): Promise<CustomOracleSourceConfig[]> {
  const config = await loadOracleConfig(cwd);
  return config.sources;
}

export async function createOracleSources(
  options: OracleAggregatorOptions = {}
): Promise<OracleSourceEntry[]> {
  const includeSet = options.includeSources
    ? new Set(options.includeSources.map(normalizeSourceName))
    : null;

  const shouldInclude = (name: string): boolean =>
    !includeSet || includeSet.has(normalizeSourceName(name));

  const entries: OracleSourceEntry[] = [];

  for (const entry of createDefaultMockSources()) {
    if (shouldInclude(entry.source.name)) {
      entries.push(entry);
    }
  }

  const customSources = options.customSources ?? (await loadOracleConfig(options.cwd)).sources;
  for (const custom of customSources) {
    if (!shouldInclude(custom.name)) {
      continue;
    }

    entries.push({
      source: new HttpOracleSource(custom),
      weight: custom.weight ?? 1.0,
      type: 'custom',
    });
  }

  return entries;
}
