import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { BlendProtocol } from '../../../../../packages/core/defi-protocols/src/protocols/blend/blend-protocol.js';
import { getCliBlendConfig } from './config.js';

export const statsCommand = new Command('stats')
    .description('View Blend Protocol statistics')
    .option('--testnet', 'Use testnet (default)', true)
    .option('--mainnet', 'Use mainnet')
    .option('--json', 'Output as JSON')
    .action(async (options: any) => {
        const spinner = ora('Fetching protocol statistics...').start();

        try {
            const config = getCliBlendConfig(options.mainnet);
            const blend = new BlendProtocol(config);
            await blend.initialize();

            const stats = await blend.getStats();

            spinner.succeed(chalk.green('Statistics retrieved'));

            if (options.json) {
                console.log(JSON.stringify(stats, null, 2));
            } else {
                console.log('\n' + chalk.bold.cyan('📊 Blend Protocol Statistics'));
                console.log(chalk.gray('═'.repeat(60)));
                console.log(chalk.cyan('  Total Supply:      ') + chalk.white(`$${stats.totalSupply || '0'}`));
                console.log(chalk.cyan('  Total Borrow:      ') + chalk.white(`$${stats.totalBorrow || '0'}`));
                console.log(chalk.cyan('  TVL:               ') + chalk.white(`$${stats.tvl || '0'}`));
                console.log(chalk.cyan('  Utilization Rate:  ') + chalk.white(`${stats.utilizationRate || '0'}%`));
                console.log(chalk.cyan('  Last Updated:      ') + chalk.white(stats.timestamp ? new Date(stats.timestamp).toLocaleString() : 'N/A'));
                console.log(chalk.gray('═'.repeat(60)) + '\n');
            }

        } catch (error: any) {
            spinner.fail(chalk.red('Failed to fetch statistics'));
            if (options.json) {
                console.error(JSON.stringify({ error: error.message }));
            } else {
                console.error(chalk.red('\n❌ Error: ') + error.message);
            }
            process.exit(1);
        }
    });
