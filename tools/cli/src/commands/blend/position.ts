import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { BlendProtocol } from '../../../../../packages/core/defi-protocols/src/protocols/blend/blend-protocol.js';
import { walletStorage } from '../../utils/wallet-storage.js';
import { getCliBlendConfig } from './config.js';

export const positionCommand = new Command('position')
    .description('View your position in Blend Protocol')
    .option('-w, --wallet <name>', 'Wallet name to use')
    .option('-a, --address <address>', 'Address to check (optional, defaults to wallet address)')
    .option('--testnet', 'Use testnet (default)', true)
    .option('--mainnet', 'Use mainnet')
    .option('--json', 'Output as JSON')
    .action(async (options: any) => {
        const spinner = ora('Fetching position...').start();

        try {
            // 1. Get address
            let address = options.address;
            if (!address) {
                if (!options.wallet) {
                    spinner.fail(chalk.red('Either --wallet or --address must be provided'));
                    process.exit(1);
                }
                const wallet = await walletStorage.loadWallet(options.wallet);
                if (!wallet) {
                    throw new Error(`Wallet '${options.wallet}' not found`);
                }
                address = wallet.publicKey;
            }

            // 2. Determine network config and initialize Blend
            const config = getCliBlendConfig(options.mainnet);
            const blend = new BlendProtocol(config);
            await blend.initialize();

            // 3. Get position
            spinner.text = 'Fetching position data...';
            const position = await blend.getPosition(address);

            spinner.succeed(chalk.green('Position retrieved'));

            if (options.json) {
                console.log(JSON.stringify(position, null, 2));
            } else {
                console.log('\n' + chalk.bold.cyan('📊 Blend Protocol Position'));
                console.log(chalk.gray('═'.repeat(80)));
                console.log(chalk.cyan('Address: ') + chalk.white(address));
                console.log(chalk.gray('─'.repeat(80)));

                // Supplied Assets
                console.log('\n' + chalk.bold('💰 Supplied Assets:'));
                if (position.supplied.length === 0) {
                    console.log(chalk.gray('  No supplied assets'));
                } else {
                    const suppliedTable = new Table({
                        head: [chalk.cyan('Asset'), chalk.cyan('Amount'), chalk.cyan('Value (USD)')],
                        style: { head: [], border: [] }
                    });
                    position.supplied.forEach((supply: any) => {
                        suppliedTable.push([
                            supply.asset?.code || 'Unknown',
                            supply.amount || '0',
                            supply.valueUSD ? `$${supply.valueUSD}` : '-'
                        ]);
                    });
                    console.log(suppliedTable.toString());
                }

                // Borrowed Assets
                console.log('\n' + chalk.bold('🏦 Borrowed Assets:'));
                if (position.borrowed.length === 0) {
                    console.log(chalk.gray('  No borrowed assets'));
                } else {
                    const borrowedTable = new Table({
                        head: [chalk.cyan('Asset'), chalk.cyan('Amount'), chalk.cyan('Value (USD)')],
                        style: { head: [], border: [] }
                    });
                    position.borrowed.forEach((borrow: any) => {
                        borrowedTable.push([
                            borrow.asset?.code || 'Unknown',
                            borrow.amount || '0',
                            borrow.valueUSD ? `$${borrow.valueUSD}` : '-'
                        ]);
                    });
                    console.log(borrowedTable.toString());
                }

                // Summary
                console.log('\n' + chalk.bold('📈 Summary:'));
                console.log(chalk.gray('─'.repeat(80)));
                console.log(chalk.cyan('  Total Collateral: ') + chalk.white(`$${position.collateralValue || '0'}`));
                console.log(chalk.cyan('  Total Debt:       ') + chalk.white(`$${position.debtValue || '0'}`));
                console.log(chalk.cyan('  Health Factor:    ') + chalk.white(position.healthFactor || '∞'));
                console.log(chalk.gray('═'.repeat(80)) + '\n');
            }

        } catch (error: any) {
            spinner.fail(chalk.red('Failed to fetch position'));
            if (options.json) {
                console.error(JSON.stringify({ error: error.message }));
            } else {
                console.error(chalk.red('\n❌ Error: ') + error.message);
            }
            process.exit(1);
        }
    });
