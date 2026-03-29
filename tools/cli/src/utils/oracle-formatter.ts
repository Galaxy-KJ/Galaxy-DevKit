// @ts-nocheck
/**
 * @fileoverview Oracle output formatter
 * @description Formats oracle command output as tables or JSON
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-26
 */

import chalk from 'chalk';
import Table from 'cli-table3';
// @ts-ignore
import type {
  AggregatedPrice,
  PriceData,
  PriceSource,
  SourceInfo,
} from '@galaxy-kj/core-oracles';

export interface PriceOutputOptions {
  json?: boolean;
  strategy?: string;
  sourcesFilter?: string[];
  totalSources?: number;
  priceChange?: 'up' | 'down' | 'unchanged' | null;
}

export interface HistoryOutputOptions {
  json?: boolean;
  periodMs: number;
  intervalMs: number;
  twap: number;
  symbol: string;
}

export interface SourcesOutputOptions {
  json?: boolean;
}

export interface ValidationOutputOptions {
  json?: boolean;
  deviationPercent: number;
  threshold: number;
  maxAgeMs: number;
  symbol: string;
}

export interface StrategyInfo {
  name: string;
  description: string;
}

export interface SourceDetails {
  source: PriceSource;
  info: SourceInfo;
  type: 'default' | 'custom';
}

export interface ValidationResult {
  source: string;
  price?: number;
  timestamp?: string;
  valid: boolean;
  issues: string[];
}

function formatNumber(value: number, decimals: number = 6): string {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return value.toFixed(decimals);
}

function resolveDecimals(symbol: string): number {
  const upper = symbol.toUpperCase();
  if (upper.includes('USD')) {
    return 2;
  }
  return 8;
}

function formatTimestamp(date?: Date | string): string {
  if (!date) {
    return 'n/a';
  }
  const parsed = typeof date === 'string' ? new Date(date) : date;
  if (!Number.isFinite(parsed.getTime())) {
    return 'n/a';
  }
  return parsed.toISOString();
}

function renderTable(headers: string[], rows: Array<Array<string | number>>): string {
  const table = new Table({
    head: headers.map((header) => chalk.cyan(header)),
  });

  rows.forEach((row) => table.push(row));
  return table.toString();
}

function outputJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function formatAgeMs(timestamp?: Date | string): string {
  if (!timestamp) {
    return 'n/a';
  }
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return 'n/a';
  }
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function outputPrice(
  aggregated: AggregatedPrice,
  options: PriceOutputOptions = {}
): void {
  const payload = {
    ...aggregated,
    timestamp: formatTimestamp(aggregated.timestamp),
    updated: formatAgeMs(aggregated.timestamp),
    strategy: options.strategy,
    sourcesFilter: options.sourcesFilter ?? [],
    totalSources: options.totalSources ?? aggregated.sourceCount,
  };

  if (options.json) {
    outputJson(payload);
    return;
  }

  const decimals = resolveDecimals(aggregated.symbol);
  const formattedPrice = formatNumber(aggregated.price, decimals);
  let priceDisplay: string = formattedPrice;
  if (options.priceChange === 'up') {
    priceDisplay = chalk.green(`▲ ${formattedPrice}`);
  } else if (options.priceChange === 'down') {
    priceDisplay = chalk.red(`▼ ${formattedPrice}`);
  }
  const rows: Array<Array<string | number>> = [
    ['Symbol', aggregated.symbol],
    ['Price', priceDisplay],
    ['Confidence', `${formatNumber(aggregated.confidence * 100, 2)}%`],
    [
      'Sources Used',
      `${aggregated.sourcesUsed.length}/${options.totalSources ?? aggregated.sourceCount}`,
    ],
    ['Sources', aggregated.sourcesUsed.join(', ') || 'n/a'],
    ['Outliers', aggregated.outliersFiltered.join(', ') || 'none'],
    ['Updated', formatAgeMs(aggregated.timestamp)],
    ['Timestamp', formatTimestamp(aggregated.timestamp)],
  ];

  if (options.strategy) {
    rows.push(['Strategy', options.strategy]);
  }

  if (options.sourcesFilter && options.sourcesFilter.length > 0) {
    rows.push(['Sources Filter', options.sourcesFilter.join(', ')]);
  }

  console.log(renderTable(['Field', 'Value'], rows));
}

export function outputHistory(
  samples: Array<{ price: number; timestamp: Date }>,
  options: HistoryOutputOptions
): void {
  const payload = {
    periodMs: options.periodMs,
    intervalMs: options.intervalMs,
    twap: options.twap,
    symbol: options.symbol,
    samples: samples.map((sample) => ({
      price: sample.price,
      timestamp: formatTimestamp(sample.timestamp),
    })),
  };

  if (options.json) {
    outputJson(payload);
    return;
  }

  const decimals = resolveDecimals(options.symbol);
  const rows = samples.map((sample, index) => [
    index + 1,
    formatNumber(sample.price, decimals),
    formatTimestamp(sample.timestamp),
  ]);

  console.log(renderTable(['#', 'Price', 'Timestamp'], rows));
  console.log(
    renderTable(
      ['Metric', 'Value'],
      [
        ['TWAP', formatNumber(options.twap, decimals)],
        ['Period (ms)', options.periodMs],
        ['Interval (ms)', options.intervalMs],
        ['Samples', samples.length],
      ]
    )
  );
}

export function outputSources(
  sources: SourceDetails[],
  options: SourcesOutputOptions = {}
): void {
  const payload = sources.map((entry) => ({
    name: entry.source.name,
    weight: entry.source.weight,
    isHealthy: entry.source.isHealthy,
    lastChecked: formatTimestamp(entry.source.lastChecked),
    failureCount: entry.source.failureCount,
    type: entry.type,
    description: entry.info.description,
    supportedSymbols: entry.info.supportedSymbols,
  }));

  if (options.json) {
    outputJson(payload);
    return;
  }

  const rows = payload.map((entry) => [
    entry.name,
    entry.type,
    entry.weight,
    entry.isHealthy ? chalk.green('healthy') : chalk.red('unhealthy'),
    entry.failureCount,
    entry.lastChecked,
    entry.description,
  ]);

  console.log(
    renderTable(
      ['Name', 'Type', 'Weight', 'Health', 'Failures', 'Last Checked', 'Description'],
      rows
    )
  );
}

export function outputStrategies(strategies: StrategyInfo[], json?: boolean): void {
  if (json) {
    outputJson(strategies);
    return;
  }

  const rows = strategies.map((strategy) => [strategy.name, strategy.description]);
  console.log(renderTable(['Strategy', 'Description'], rows));
}

export function outputValidation(
  results: ValidationResult[],
  options: ValidationOutputOptions
): void {
  const payload = {
    deviationPercent: options.deviationPercent,
    threshold: options.threshold,
    maxAgeMs: options.maxAgeMs,
    symbol: options.symbol,
    results,
  };

  if (options.json) {
    outputJson(payload);
    return;
  }

  const decimals = resolveDecimals(options.symbol);
  const rows = results.map((result) => [
    result.source,
    result.price !== undefined ? formatNumber(result.price, decimals) : 'n/a',
    result.timestamp ?? 'n/a',
    result.valid ? chalk.green('valid') : chalk.red('invalid'),
    result.issues.join(', ') || 'none',
  ]);

  console.log(renderTable(['Source', 'Price', 'Timestamp', 'Status', 'Issues'], rows));
  console.log(
    renderTable(
      ['Metric', 'Value'],
      [
        ['Deviation (%)', formatNumber(options.deviationPercent, 2)],
        ['Threshold (%)', formatNumber(options.threshold, 2)],
        ['Max Age (ms)', options.maxAgeMs],
      ]
    )
  );
}
