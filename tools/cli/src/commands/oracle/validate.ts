/**
 * @fileoverview Oracle validate command
 * @description Validate price data for an asset
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-26
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  validatePrice,
  checkStaleness,
  PriceData,
} from '@galaxy/core-oracles';
import { createOracleSources } from '../../utils/oracle-registry.js';
import { parseDuration } from '../../utils/parse-duration.js';
import { outputValidation, ValidationResult } from '../../utils/oracle-formatter.js';

function parseSources(input?: string): string[] {
  if (!input) {
    return [];
  }
  return input
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function calculateDeviationPercent(prices: PriceData[]): number {
  if (prices.length <= 1) {
    return 0;
  }

  const values = prices.map((price) => price.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (avg === 0) {
    return 0;
  }
  return ((max - min) / avg) * 100;
}

export const validateCommand = new Command('validate')
  .description('Validate oracle price data for an asset')
  .argument('<symbol>', 'Asset symbol (e.g. XLM/USD)')
  .option('-t, --threshold <percent>', 'Deviation threshold percent', '5')
  .option('--max-age <duration>', 'Maximum price age (e.g. 60s)', '60s')
  .option('--sources <sources>', 'Comma-separated list of sources to use')
  .option('--json', 'Output machine-readable JSON')
  .action(async (symbol: string, options: any) => {
    const sourcesFilter = parseSources(options.sources);

    try {
      const threshold = Number(options.threshold);
      if (!Number.isFinite(threshold) || threshold < 0) {
        throw new Error('Threshold must be a non-negative number');
      }

      const maxAgeMs = parseDuration(options.maxAge);
      if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
        throw new Error('Max age must be greater than 0');
      }

      const sources = await createOracleSources({ includeSources: sourcesFilter });
      const results: ValidationResult[] = [];
      const validPrices: PriceData[] = [];

      await Promise.all(
        sources.map(async (entry) => {
          const issues: string[] = [];
          try {
            const price = await entry.source.getPrice(symbol);
            const isStale = checkStaleness(price, maxAgeMs);
            if (isStale) {
              issues.push('stale');
            }

            const isValid = validatePrice(price, { maxStalenessMs: maxAgeMs });
            if (!isValid) {
              issues.push('invalid');
            }

            if (issues.length === 0) {
              validPrices.push(price);
            }

            results.push({
              source: entry.source.name,
              price: price.price,
              timestamp: price.timestamp.toISOString(),
              valid: issues.length === 0,
              issues,
            });
          } catch (error) {
            results.push({
              source: entry.source.name,
              valid: false,
              issues: ['fetch_failed'],
            });
          }
        })
      );

      const deviationPercent = calculateDeviationPercent(validPrices);
      if (deviationPercent > threshold) {
        results.forEach((result) => {
          if (result.valid) {
            result.issues.push('deviation');
            result.valid = false;
          }
        });
      }

      outputValidation(results, {
        json: Boolean(options.json),
        deviationPercent,
        threshold,
        maxAgeMs,
      });
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });
