/**
 * @fileoverview Protocol info command
 * @description Show detailed information about a DeFi protocol
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-30
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getProtocolInfo, getProtocolInstance } from '../../utils/protocol-registry.js';
import { outputProtocolInfo, outputError } from '../../utils/protocol-formatter.js';
import { ProtocolStats } from '@galaxy-kj/core-defi-protocols';

export const infoCommand = new Command('info')
  .description('Show detailed information about a protocol')
  .argument('<protocol-name>', 'Protocol name (e.g., blend, soroswap)')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .action(
    async (
      protocolName: string,
      options: { network: string; json?: boolean }
    ) => {
      const spinner = options.json ? null : ora(`Loading ${protocolName} info...`).start();

      try {
        // Validate network
        if (!['testnet', 'mainnet'].includes(options.network)) {
          throw new Error('Network must be either "testnet" or "mainnet"');
        }

        const network = options.network as 'testnet' | 'mainnet';

        // Get protocol info
        const protocolInfo = getProtocolInfo(protocolName);
        if (!protocolInfo) {
          throw new Error(
            `Protocol '${protocolName}' not found. Run 'galaxy protocol list' to see available protocols.`
          );
        }

        // Try to get protocol stats
        let stats: ProtocolStats | null = null;
        try {
          if (spinner) spinner.text = `Fetching ${protocolInfo.name} statistics...`;
          const protocol = await getProtocolInstance(protocolName, network);
          await protocol.initialize();
          stats = await protocol.getStats();
        } catch (statsError) {
          // Stats are optional, continue without them
          if (spinner) {
            spinner.text = `Loading ${protocolName} info (stats unavailable)...`;
          }
        }

        spinner?.stop();

        outputProtocolInfo(protocolInfo, stats, { json: options.json });
      } catch (error) {
        spinner?.fail(`Failed to get ${protocolName} info`);
        outputError(error, { json: options.json });
        process.exit(1);
      }
    }
  );
