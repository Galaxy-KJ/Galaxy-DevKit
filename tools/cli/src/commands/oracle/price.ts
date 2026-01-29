/**
 * @fileoverview Oracle price command
 * @description Query current aggregated price for an asset
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-26
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  MedianStrategy,
  MeanStrategy,
  WeightedAverageStrategy,
  TWAPStrategy,
  PriceCache,
} from '@galaxy/core-oracles';
import { createOracleAggregator } from '../../utils/oracle-registry.js';
import { parseDuration } from '../../utils/parse-duration.js';
import { outputPrice } from '../../utils/oracle-formatter.js';

function parseSources(input?: string): string[] {
  if (!input) {
    return [];
  }
  return input
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function resolveWatchInterval(value: string | boolean | undefined): number {
  if (value === undefined || value === false) {
    return 0;
  }

  if (value === true) {
    return parseDuration('5s');
  }

  return parseDuration(value);
}

function selectStrategy(name?: string) {
  if (!name || name === 'median') {
    return { strategy: new MedianStrategy(), label: 'median' };
  }

  if (name === 'mean') {
    return { strategy: new MeanStrategy(), label: 'mean' };
  }

  if (name === 'weighted' || name === 'weighted_average') {
    return { strategy: new WeightedAverageStrategy(), label: 'weighted' };
  }

  if (name === 'twap') {
    return { strategy: new TWAPStrategy(new PriceCache()), label: 'twap' };
  }

  throw new Error(`Unknown strategy: ${name}`);
}

export const priceCommand = new Command('price')
  .description('Query current aggregated price for an asset')
  .argument('<symbol>', 'Asset symbol (e.g. XLM/USD)')
  .option('-s, --strategy <strategy>', 'Aggregation strategy (median, mean, twap, weighted)', 'median')
  .option('--sources <sources>', 'Comma-separated list of sources to use')
  .option('--network <network>', 'Oracle network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output machine-readable JSON')
  .option('-w, --watch [interval]', 'Watch for real-time updates (default 5s)')
  .action(async (symbol: string, options: any) => {
    const sourcesFilter = parseSources(options.sources);
    const watchInterval = resolveWatchInterval(options.watch);

    try {
      const { strategy, label } = selectStrategy(options.strategy);
      const totalSources = sourcesFilter.length > 0 ? sourcesFilter.length : undefined;
      const aggregator = await createOracleAggregator({
        includeSources: sourcesFilter,
        network: options.network,
      });
      aggregator.setStrategy(strategy);

      let previousPrice: number | null = null;

      const runOnce = async (): Promise<void> => {
        const spinner = options.json ? null : ora('Fetching price...').start();
        try {
          const aggregated = await aggregator.getAggregatedPrice(symbol);
          spinner?.stop();

          let priceChange: 'up' | 'down' | 'unchanged' | null = null;
          if (previousPrice !== null) {
            if (aggregated.price > previousPrice) {
              priceChange = 'up';
            } else if (aggregated.price < previousPrice) {
              priceChange = 'down';
            } else {
              priceChange = 'unchanged';
            }
          }
          previousPrice = aggregated.price;

          outputPrice(aggregated, {
            json: Boolean(options.json),
            strategy: label,
            sourcesFilter,
            totalSources,
            priceChange,
          });
        } catch (error) {
          spinner?.fail('Failed to fetch price');
          throw error;
        }
      };

      if (watchInterval > 0) {
        if (!options.json) {
          console.log(chalk.blue(`Watching ${symbol} every ${watchInterval}ms...`));
        }
        await runOnce();
        const interval = setInterval(() => {
          runOnce().catch((error) => {
            console.error(chalk.red('Error fetching price:'), (error as Error).message);
          });
        }, watchInterval);

        process.on('SIGINT', () => {
          clearInterval(interval);
          process.exit(0);
        });
        return;
      }

      await runOnce();
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('rate limited')) {
        console.error(chalk.red('Error:'), 'Rate limited by oracle source. Try again later.');
      } else if (message.includes('Insufficient sources')) {
        console.error(chalk.red('Error:'), 'No valid sources returned a price for this symbol.');
      } else {
        console.error(chalk.red('Error:'), message);
      }
      process.exit(1);
    }
  });
