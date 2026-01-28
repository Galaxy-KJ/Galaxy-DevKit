/**
 * @fileoverview Oracle sources command
 * @description List and add oracle sources
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-26
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  createOracleSources,
  loadOracleConfig,
  saveOracleConfig,
  CustomOracleSourceConfig,
} from '../../utils/oracle-registry.js';
import { outputSources } from '../../utils/oracle-formatter.js';

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function validateName(name: string): void {
  if (!/^[a-z0-9-_]+$/.test(name)) {
    throw new Error('Source name may only contain lowercase letters, numbers, hyphens, and underscores');
  }
}

function validateUrl(url: string): void {
  try {
    // eslint-disable-next-line no-new
    new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (!url.includes('{symbol}')) {
    throw new Error('URL must include {symbol} placeholder');
  }
}

export const sourcesCommand = new Command('sources')
  .description('Manage oracle sources');

const listCommand = new Command('list')
  .description('List available oracle sources')
  .option('--json', 'Output machine-readable JSON')
  .option('--sources <sources>', 'Comma-separated list of sources to include')
  .option('--network <network>', 'Oracle network (testnet/mainnet)', 'testnet')
  .action(async (options: any) => {
    try {
      const includeSources = options.sources
        ? options.sources.split(',').map((value: string) => value.trim()).filter(Boolean)
        : undefined;

      const entries = await createOracleSources({
        includeSources,
        network: options.network,
      });
      const sourcesWithInfo = await Promise.all(
        entries.map(async (entry) => {
          const isHealthy = await entry.source.isHealthy().catch(() => false);
          const info = entry.source.getSourceInfo();
          return {
            source: {
              name: entry.source.name,
              weight: entry.weight,
              isHealthy,
              lastChecked: new Date(),
              failureCount: 0,
            },
            info,
            type: entry.type,
          };
        })
      );

      outputSources(sourcesWithInfo, { json: Boolean(options.json) });
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

const addCommand = new Command('add')
  .description('Add a custom oracle source')
  .argument('<name>', 'Source name')
  .argument('<url>', 'Source URL (use {symbol} placeholder)')
  .option('-w, --weight <weight>', 'Optional weight for the source', '1.0')
  .option('-d, --description <description>', 'Optional description')
  .action(async (name: string, url: string, options: any) => {
    try {
      const normalized = normalizeName(name);
      validateName(normalized);
      validateUrl(url);

      const weight = Number(options.weight);
      if (!Number.isFinite(weight) || weight <= 0) {
        throw new Error('Weight must be a positive number');
      }

      const config = await loadOracleConfig();
      if (config.sources.some((source) => normalizeName(source.name) === normalized)) {
        throw new Error(`Source ${normalized} already exists`);
      }

      const newSource: CustomOracleSourceConfig = {
        name: normalized,
        url,
        weight,
        description: options.description,
      };

      config.sources.push(newSource);
      await saveOracleConfig(config);

      console.log(chalk.green(`Added oracle source: ${normalized}`));
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

sourcesCommand.addCommand(listCommand);
sourcesCommand.addCommand(addCommand);
