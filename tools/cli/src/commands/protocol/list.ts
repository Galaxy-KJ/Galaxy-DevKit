/**
 * @fileoverview Protocol list command
 * @description List available DeFi protocols
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-30
 */

import { Command } from 'commander';
import ora from 'ora';
import { listSupportedProtocols } from '../../utils/protocol-registry.js';
import { outputProtocolList, outputError } from '../../utils/protocol-formatter.js';

export const listCommand = new Command('list')
  .description('List available DeFi protocols')
  .option('--network <network>', 'Filter by network (testnet/mainnet)')
  .option('--json', 'Output as JSON')
  .action(async (options: { network?: string; json?: boolean }) => {
    const spinner = options.json ? null : ora('Loading protocols...').start();

    try {
      // Validate network option
      if (options.network && !['testnet', 'mainnet'].includes(options.network)) {
        throw new Error('Network must be either "testnet" or "mainnet"');
      }

      const network = options.network as 'testnet' | 'mainnet' | undefined;
      const protocols = listSupportedProtocols(network);

      spinner?.stop();

      outputProtocolList(protocols, {
        json: options.json,
        network: options.network,
      });
    } catch (error) {
      spinner?.fail('Failed to list protocols');
      outputError(error, { json: options.json });
      process.exit(1);
    }
  });
