/**
 * @fileoverview Oracle history command
 * @description Poll and display historical prices with TWAP
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-26
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createOracleAggregator } from '../../utils/oracle-registry.js';
import { parseDuration } from '../../utils/parse-duration.js';
import { outputHistory } from '../../utils/oracle-formatter.js';

function parseSources(input?: string): string[] {
  if (!input) {
    return [];
  }
  return input
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function calculateTWAP(
  samples: Array<{ price: number; timestamp: Date }>,
  startTime: number,
  endTime: number
): number {
  if (samples.length === 0) {
    return 0;
  }

  if (samples.length === 1) {
    return samples[0].price;
  }

  const sorted = [...samples].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  let weightedSum = 0;
  let totalDuration = Math.max(0, endTime - startTime);

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const segmentEnd = next ? next.timestamp.getTime() : endTime;
    const segmentStart = current.timestamp.getTime();
    const duration = Math.max(0, segmentEnd - segmentStart);
    weightedSum += current.price * duration;
  }

  if (totalDuration === 0) {
    return sorted[sorted.length - 1].price;
  }

  return weightedSum / totalDuration;
}

export const historyCommand = new Command('history')
  .description('Poll historical prices and calculate TWAP')
  .argument('<symbol>', 'Asset symbol (e.g. XLM/USD)')
  .requiredOption('-p, --period <period>', 'Polling duration (e.g. 1m, 1h)')
  .option('-i, --interval <interval>', 'Polling interval (e.g. 5s)', '5s')
  .option('--sources <sources>', 'Comma-separated list of sources to use')
  .option('--network <network>', 'Oracle network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output machine-readable JSON')
  .action(async (symbol: string, options: any) => {
    const sourcesFilter = parseSources(options.sources);

    try {
      const periodMs = parseDuration(options.period);
      const intervalMs = parseDuration(options.interval);

      if (periodMs <= 0 || intervalMs <= 0) {
        throw new Error('Period and interval must be greater than 0');
      }

      const aggregator = await createOracleAggregator({
        includeSources: sourcesFilter,
        network: options.network,
      });
      const samples: Array<{ price: number; timestamp: Date }> = [];
      const startTime = Date.now();
      const endTime = startTime + periodMs;

      if (!options.json) {
        console.log(chalk.blue(`Collecting prices for ${symbol}...`));
        console.log(chalk.gray(`Period: ${periodMs}ms, Interval: ${intervalMs}ms`));
      }

      while (Date.now() < endTime) {
        const spinner = options.json ? null : ora('Fetching price...').start();
        try {
          const aggregated = await aggregator.getAggregatedPrice(symbol);
          samples.push({ price: aggregated.price, timestamp: aggregated.timestamp });
          spinner?.stop();
        } catch (error) {
          spinner?.stop();
          if (!options.json) {
            console.warn(chalk.yellow('Warning: failed to fetch price sample'));
          }
        }

        const now = Date.now();
        if (now + intervalMs > endTime) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }

      if (samples.length === 0) {
        throw new Error('No price samples collected');
      }

      const twap = calculateTWAP(samples, startTime, endTime);
      outputHistory(samples, {
        json: Boolean(options.json),
        periodMs,
        intervalMs,
        twap,
        symbol,
      });
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });
