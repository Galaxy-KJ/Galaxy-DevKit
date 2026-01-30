import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { BlendProtocol } from '../../../../../packages/core/defi-protocols/src/protocols/blend/blend-protocol.js';
import { walletStorage } from '../../utils/wallet-storage.js';
import { getCliBlendConfig } from './config.js';

export const healthCommand = new Command('health')
    .description('Check health factor of your position')
    .option('-w, --wallet <name>', 'Wallet name to use')
    .option('-a, --address <address>', 'Address to check (optional)')
    .option('--testnet', 'Use testnet (default)', true)
    .option('--mainnet', 'Use mainnet')
    .option('--json', 'Output as JSON')
    .action(async (options: any) => {
        const spinner = ora('Calculating health factor...').start();

        try {
            // Get address
            let address = options.address;
            if (!address) {
                if (!options.wallet) {
                    throw new Error('Either --wallet or --address must be provided');
                }
                const wallet = await walletStorage.loadWallet(options.wallet);
                if (!wallet) {
                    throw new Error(`Wallet '${options.wallet}' not found`);
                }
                address = wallet.publicKey;
            }

            // Initialize Blend with correct network config
            const config = getCliBlendConfig(options.mainnet);
            const blend = new BlendProtocol(config);
            await blend.initialize();

            // Get health factor
            const health = await blend.getHealthFactor(address);

            spinner.succeed(chalk.green('Health factor calculated'));

            if (options.json) {
                console.log(JSON.stringify(health, null, 2));
            } else {
                console.log('\n' + chalk.bold.cyan('🏥 Health Factor'));
                console.log(chalk.gray('═'.repeat(60)));
                console.log(chalk.cyan('  Address: ') + chalk.white(address.substring(0, 10) + '...'));
                console.log(chalk.gray('─'.repeat(60)));

                const healthValue = parseFloat(health.value);
                const healthColor = healthValue === Infinity ? chalk.green
                    : healthValue > 1.5 ? chalk.green
                    : healthValue > 1.2 ? chalk.yellow
                    : chalk.red;

                console.log(chalk.cyan('  Health Factor:        ') + healthColor(health.value));
                console.log(chalk.cyan('  Liquidation Threshold: ') + chalk.white(health.liquidationThreshold));
                console.log(chalk.cyan('  Max LTV:              ') + chalk.white(health.maxLTV || 'N/A'));
                console.log(chalk.cyan('  Status:               ') +
                    (health.isHealthy ? chalk.green('✅ Healthy') : chalk.red('⚠️  At Risk')));

                console.log(chalk.gray('═'.repeat(60)));

                if (!health.isHealthy) {
                    console.log(chalk.red('\n  ⚠️  WARNING: Your position is at risk of liquidation!'));
                    console.log(chalk.yellow('  Consider repaying debt or adding more collateral.\n'));
                } else {
                    console.log(chalk.green('\n  ✅ Your position is healthy!\n'));
                }
            }

        } catch (error: any) {
            spinner.fail(chalk.red('Failed to calculate health factor'));
            if (options.json) {
                console.error(JSON.stringify({ error: error.message }));
            } else {
                console.error(chalk.red('\n❌ Error: ') + error.message);
            }
            process.exit(1);
        }
    });
