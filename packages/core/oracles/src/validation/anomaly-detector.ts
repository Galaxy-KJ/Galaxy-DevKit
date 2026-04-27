import {
  PriceData,
  AnomalyDetectionConfig,
} from '../types/oracle-types.js';

export type AnomalyType =
  | 'stale'
  | 'outlier'
  | 'flash_crash'
  | 'source_disagreement';

export interface PriceAnomaly {
  type: AnomalyType;
  source?: string;
  message: string;
  value?: number;
  threshold?: number;
}

export interface PriceAnomalyReport {
  stale: PriceAnomaly[];
  outliers: PriceAnomaly[];
  flashCrash?: PriceAnomaly;
  sourceDisagreement?: PriceAnomaly;
  hasCriticalAnomaly: boolean;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, current) => sum + current, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((sum, current) => sum + Math.pow(current - avg, 2), 0) /
    values.length;
  return Math.sqrt(variance);
}

export function detectStalePrices(
  prices: PriceData[],
  stalePriceMs: number,
  nowMs: number = Date.now()
): PriceAnomaly[] {
  return prices
    .filter((price) => nowMs - price.timestamp.getTime() > stalePriceMs)
    .map((price) => ({
      type: 'stale',
      source: price.source,
      message: `Price from ${price.source} is stale`,
      value: nowMs - price.timestamp.getTime(),
      threshold: stalePriceMs,
    }));
}

export function detectStdDevOutliers(
  prices: PriceData[],
  stdDevMultiplier: number
): PriceAnomaly[] {
  if (prices.length < 3) {
    return [];
  }

  const values = prices.map((price) => price.price);
  const avg = mean(values);
  const deviation = stdDev(values);
  if (deviation === 0) {
    return [];
  }

  return prices
    .filter((price) => Math.abs((price.price - avg) / deviation) > stdDevMultiplier)
    .map((price) => ({
      type: 'outlier',
      source: price.source,
      message: `Outlier detected from ${price.source}`,
      value: price.price,
      threshold: stdDevMultiplier,
    }));
}

export function detectFlashCrash(
  prices: PriceData[],
  previousAggregatedPrice: number | null,
  flashCrashPercent: number
): PriceAnomaly | undefined {
  if (previousAggregatedPrice === null || prices.length === 0) {
    return undefined;
  }

  const currentAverage = mean(prices.map((price) => price.price));
  if (previousAggregatedPrice <= 0) {
    return undefined;
  }

  const dropPercent =
    ((previousAggregatedPrice - currentAverage) / previousAggregatedPrice) * 100;
  if (dropPercent <= flashCrashPercent) {
    return undefined;
  }

  return {
    type: 'flash_crash',
    message: 'Flash crash protection triggered',
    value: dropPercent,
    threshold: flashCrashPercent,
  };
}

export function detectSourceDisagreement(
  prices: PriceData[],
  sourceDisagreementPercent: number
): PriceAnomaly | undefined {
  if (prices.length < 2) {
    return undefined;
  }

  const values = prices.map((price) => price.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = mean(values);
  if (avg <= 0) {
    return undefined;
  }

  const spreadPercent = ((max - min) / avg) * 100;
  if (spreadPercent <= sourceDisagreementPercent) {
    return undefined;
  }

  return {
    type: 'source_disagreement',
    message: 'Source disagreement threshold exceeded',
    value: spreadPercent,
    threshold: sourceDisagreementPercent,
  };
}

export function detectPriceAnomalies(
  prices: PriceData[],
  config: AnomalyDetectionConfig,
  previousAggregatedPrice: number | null = null
): PriceAnomalyReport {
  const stale = detectStalePrices(prices, config.stalePriceMs);
  const outliers = detectStdDevOutliers(prices, config.outlierStdDevMultiplier);
  const flashCrash = detectFlashCrash(
    prices,
    previousAggregatedPrice,
    config.flashCrashPercent
  );
  const sourceDisagreement = detectSourceDisagreement(
    prices,
    config.sourceDisagreementPercent
  );

  const hasCriticalAnomaly =
    stale.length > 0 ||
    (config.enforceFlashCrashProtection && !!flashCrash) ||
    (config.enforceSourceDisagreement && !!sourceDisagreement);

  return {
    stale,
    outliers,
    flashCrash,
    sourceDisagreement,
    hasCriticalAnomaly,
  };
}
