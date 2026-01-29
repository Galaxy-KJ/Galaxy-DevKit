import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { walletStorage } from '../../utils/wallet-storage.js';

export const listWalletsCommand = new Command('list')
    .description('Show all configured wallets')
    .option('--json', 'Output as JSON')
    .action(async (options: any) => {
        const spinner = ora('Loading wallets...').start();

        try {
            const wallets = await walletStorage.listWallets();

            if (wallets.length === 0) {
                if (options.json) {
                    console.log(JSON.stringify({ wallets: [] }));
                } else {
                    spinner.warn(chalk.yellow('No wallets found. Create one with "galaxy wallet create"'));
                }
                return;
            }

            spinner.stop();

            if (options.json) {
                console.log(JSON.stringify({ wallets }, null, 2));
            } else {
                console.log(chalk.blue(`\n📋 Found ${wallets.length} wallet${wallets.length > 1 ? 's' : ''}:\n`));

                const table = new Table({
                    head: [chalk.cyan('Name'), chalk.cyan('Public Key'), chalk.cyan('Network')],
                    colWidths: [20, 60, 12]
                });

                wallets.forEach(w => {
                    table.push([w.name, w.publicKey, w.network]);
                });

                console.log(table.toString());
            }

        } catch (error) {
            if (options.json) {
                console.log(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
            } else {
                spinner.fail(chalk.red('Failed to list wallets'));
                if (error instanceof Error) {
                    console.error(chalk.red(error.message));
                }
            }
            process.exit(1);
        }
    });
