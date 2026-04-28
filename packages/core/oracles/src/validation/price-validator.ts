import {
  PriceData,
  AggregationConfig,
  AggregationConfigOverrides,
  AnomalyDetectionConfig,
  OracleValidationErrorPayload,
} from '../types/oracle-types.js';
import {
  PriceAnomalyReport,
  detectPriceAnomalies,
} from './anomaly-detector.js';

export const DEFAULT_ANOMALY_CONFIG: AnomalyDetectionConfig = {
  stalePriceMs: 60000,
  outlierStdDevMultiplier: 2.0,
  flashCrashPercent: 25,
  sourceDisagreementPercent: 15,
  enforceFlashCrashProtection: true,
  enforceSourceDisagreement: false,
};

const DEFAULT_CONFIG: AggregationConfig = {
  minSources: 2,
  maxDeviationPercent: 10,
  maxStalenessMs: 60000,
  enableOutlierDetection: true,
  outlierThreshold: 2.0,
  anomalyDetection: DEFAULT_ANOMALY_CONFIG,
};

export class OracleValidationError extends Error {
  readonly payload: OracleValidationErrorPayload;

  constructor(payload: OracleValidationErrorPayload) {
    super(payload.message);
    this.name = 'OracleValidationError';
    this.payload = payload;
  }

  toJSON(): OracleValidationErrorPayload {
    return this.payload;
  }
}

function mergeConfig(config: AggregationConfigOverrides): AggregationConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    anomalyDetection: {
      ...DEFAULT_ANOMALY_CONFIG,
      ...(config.anomalyDetection ?? {}),
    },
  };
}

function assertPositiveFinite(
  value: number,
  key: string,
  details: Record<string, unknown>
): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new OracleValidationError({
      code: 'INVALID_VALIDATION_CONFIG',
      message: `Validation config "${key}" must be a positive finite number`,
      details,
    });
  }
}

function assertNonNegativeFinite(
  value: number,
  key: string,
  details: Record<string, unknown>
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new OracleValidationError({
      code: 'INVALID_VALIDATION_CONFIG',
      message: `Validation config "${key}" must be a non-negative finite number`,
      details,
    });
  }
}

export function validateValidationConfig(
  config: AggregationConfigOverrides = {}
): AggregationConfig {
  const merged = mergeConfig(config);
  const anomaly = merged.anomalyDetection;

  assertPositiveFinite(merged.minSources, 'minSources', { minSources: merged.minSources });
  assertNonNegativeFinite(merged.maxDeviationPercent, 'maxDeviationPercent', {
    maxDeviationPercent: merged.maxDeviationPercent,
  });
  assertPositiveFinite(merged.maxStalenessMs, 'maxStalenessMs', {
    maxStalenessMs: merged.maxStalenessMs,
  });
  assertPositiveFinite(merged.outlierThreshold, 'outlierThreshold', {
    outlierThreshold: merged.outlierThreshold,
  });
  assertPositiveFinite(anomaly.stalePriceMs, 'anomalyDetection.stalePriceMs', {
    stalePriceMs: anomaly.stalePriceMs,
  });
  assertPositiveFinite(
    anomaly.outlierStdDevMultiplier,
    'anomalyDetection.outlierStdDevMultiplier',
    { outlierStdDevMultiplier: anomaly.outlierStdDevMultiplier }
  );
  assertNonNegativeFinite(anomaly.flashCrashPercent, 'anomalyDetection.flashCrashPercent', {
    flashCrashPercent: anomaly.flashCrashPercent,
  });
  assertNonNegativeFinite(
    anomaly.sourceDisagreementPercent,
    'anomalyDetection.sourceDisagreementPercent',
    { sourceDisagreementPercent: anomaly.sourceDisagreementPercent }
  );

  return merged;
}

/**
 * Check if price data is stale
 * @param {PriceData} price - Price data to check
 * @param {number} maxAgeMs - Maximum age in milliseconds
 * @returns {boolean} True if stale
 */
export function checkStaleness(price: PriceData, maxAgeMs: number): boolean {
  const age = Date.now() - price.timestamp.getTime();
  return age > maxAgeMs;
}

/**
 * Validate a single price data
 * @param {PriceData} price - Price data to validate
 * @param {Partial<AggregationConfig>} config - Aggregation configuration
 * @returns {boolean} True if valid
 */
export function validatePrice(
  price: PriceData,
  config: AggregationConfigOverrides = {}
): boolean {
  const cfg = mergeConfig(config);

  // Check if price is valid number
  if (typeof price.price !== 'number' || !isFinite(price.price) || price.price <= 0) {
    return false;
  }

  // Check if symbol is valid
  if (!price.symbol || typeof price.symbol !== 'string') {
    return false;
  }

  // Check if timestamp is valid
  if (!(price.timestamp instanceof Date) || isNaN(price.timestamp.getTime())) {
    return false;
  }

  // Check staleness
  if (checkStaleness(price, cfg.maxStalenessMs)) {
    return false;
  }

  return true;
}

/**
 * Check if prices meet minimum sources requirement
 * @param {PriceData[]} prices - Array of price data
 * @param {number} minSources - Minimum number of sources required
 * @returns {boolean} True if requirement met
 */
export function requireMinimumSources(
  prices: PriceData[],
  minSources: number
): boolean {
  if (prices.length < minSources) {
    return false;
  }

  // Check unique sources
  const uniqueSources = new Set(prices.map((p) => p.source));
  return uniqueSources.size >= minSources;
}

/**
 * Calculate maximum deviation percentage
 * @param {PriceData[]} prices - Array of price data
 * @returns {number} Maximum deviation percentage
 */
function calculateMaxDeviation(prices: PriceData[]): number {
  if (prices.length === 0) return 0;
  if (prices.length === 1) return 0;

  const values = prices.map((p) => p.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  if (avg === 0) return 0;

  const deviation = ((max - min) / avg) * 100;
  return deviation;
}

/**
 * Check if prices exceed maximum deviation
 * @param {PriceData[]} prices - Array of price data
 * @param {number} maxDeviationPercent - Maximum deviation percentage
 * @returns {boolean} True if deviation exceeds limit
 */
export function checkDeviation(
  prices: PriceData[],
  maxDeviationPercent: number
): boolean {
  const deviation = calculateMaxDeviation(prices);
  return deviation > maxDeviationPercent;
}

/**
 * Filter prices that exceed maximum deviation
 * @param {PriceData[]} prices - Array of price data
 * @param {number} maxDeviationPercent - Maximum deviation percentage
 * @returns {PriceData[]} Filtered prices
 */
export function filterByDeviation(
  prices: PriceData[],
  maxDeviationPercent: number
): PriceData[] {
  if (prices.length === 0) return prices;

  // Calculate median price
  const values = prices.map((p) => p.price).sort((a, b) => a - b);
  const medianPrice =
    values.length % 2 === 0
      ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
      : values[Math.floor(values.length / 2)];

  // Filter prices within deviation
  return prices.filter((p) => {
    const deviation = Math.abs((p.price - medianPrice) / medianPrice) * 100;
    return deviation <= maxDeviationPercent;
  });
}

/**
 * Validate all prices and filter invalid ones
 * @param {PriceData[]} prices - Array of price data
 * @param {Partial<AggregationConfig>} config - Aggregation configuration
 * @returns {{ valid: PriceData[]; invalid: PriceData[] }} Valid and invalid prices
 */
export function validatePrices(
  prices: PriceData[],
  config: AggregationConfigOverrides = {}
): { valid: PriceData[]; invalid: PriceData[] } {
  const validatedConfig = mergeConfig(config);
  const valid: PriceData[] = [];
  const invalid: PriceData[] = [];

  for (const price of prices) {
    if (validatePrice(price, validatedConfig)) {
      valid.push(price);
    } else {
      invalid.push(price);
    }
  }

  return { valid, invalid };
}

export function validatePriceFrame(
  symbol: string,
  prices: PriceData[],
  config: AggregationConfigOverrides = {},
  previousAggregatedPrice: number | null = null
): PriceAnomalyReport {
  const validatedConfig = validateValidationConfig(config);
  const anomalyReport = detectPriceAnomalies(
    prices,
    validatedConfig.anomalyDetection,
    previousAggregatedPrice
  );

  if (anomalyReport.stale.length > 0) {
    throw new OracleValidationError({
      code: 'STALE_PRICE_DETECTED',
      symbol,
      message: `Detected ${anomalyReport.stale.length} stale prices`,
      details: { anomalies: anomalyReport.stale },
    });
  }

  if (
    validatedConfig.anomalyDetection.enforceFlashCrashProtection &&
    anomalyReport.flashCrash
  ) {
    throw new OracleValidationError({
      code: 'FLASH_CRASH_DETECTED',
      symbol,
      message: anomalyReport.flashCrash.message,
      details: { anomaly: anomalyReport.flashCrash },
    });
  }

  if (
    validatedConfig.anomalyDetection.enforceSourceDisagreement &&
    anomalyReport.sourceDisagreement
  ) {
    throw new OracleValidationError({
      code: 'SOURCE_DISAGREEMENT',
      symbol,
      message: anomalyReport.sourceDisagreement.message,
      details: { anomaly: anomalyReport.sourceDisagreement },
    });
  }

  return anomalyReport;
}
