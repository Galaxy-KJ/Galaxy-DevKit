/**
 * @fileoverview Protocol connect command
 * @description Test connection to a DeFi protocol
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-30
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getProtocolInfo, getProtocolInstance } from '../../utils/protocol-registry.js';
import { outputError } from '../../utils/protocol-formatter.js';

export const connectCommand = new Command('connect')
  .description('Test connection to a DeFi protocol')
  .argument('<protocol-name>', 'Protocol name (e.g., blend, soroswap)')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .action(
    async (
      protocolName: string,
      options: { network: string; json?: boolean }
    ) => {
      const spinner = options.json ? null : ora(`Connecting to ${protocolName}...`).start();

      try {
        // Validate network
        if (!['testnet', 'mainnet'].includes(options.network)) {
          throw new Error('Network must be either "testnet" or "mainnet"');
        }

        const network = options.network as 'testnet' | 'mainnet';

        // Verify protocol exists
        const protocolInfo = getProtocolInfo(protocolName);
        if (!protocolInfo) {
          throw new Error(
            `Protocol '${protocolName}' not found. Run 'galaxy protocol list' to see available protocols.`
          );
        }

        // Get and initialize protocol
        if (spinner) spinner.text = `Initializing ${protocolInfo.name}...`;
        const protocol = await getProtocolInstance(protocolName, network);
        await protocol.initialize();

        // Verify connection by checking initialization status
        if (!protocol.isInitialized()) {
          throw new Error('Protocol initialization failed');
        }

        // Try to fetch basic stats to confirm connection
        if (spinner) spinner.text = `Verifying connection to ${protocolInfo.name}...`;
        const stats = await protocol.getStats();

        spinner?.stop();

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                connected: true,
                protocol: protocolInfo.id,
                name: protocolInfo.name,
                network: network,
                tvl: stats.tvl,
              },
              null,
              2
            )
          );
        } else {
          console.log(chalk.green(`\n✅ Successfully connected to ${protocolInfo.name}`));
          console.log(chalk.gray('─'.repeat(40)));
          console.log(chalk.white('Protocol: ') + protocolInfo.name);
          console.log(chalk.white('Network:  ') + network);
          console.log(chalk.white('Status:   ') + chalk.green('Connected'));
          console.log(chalk.white('TVL:      ') + `$${parseFloat(stats.tvl).toLocaleString()}`);
        }
      } catch (error) {
        spinner?.fail(`Failed to connect to ${protocolName}`);

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                connected: false,
                protocol: protocolName,
                error: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            )
          );
        } else {
          outputError(error, { json: false });
        }

        process.exit(1);
      }
    }
  );
