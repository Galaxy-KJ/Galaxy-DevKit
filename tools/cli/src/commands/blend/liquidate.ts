import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { BlendProtocol } from '../../../../../packages/core/defi-protocols/src/protocols/blend/blend-protocol.js';
import { walletStorage } from '../../utils/wallet-storage.js';
import { getCliBlendConfig, amountToStroops } from './config.js';

export const liquidateCommand = new Command('liquidate')
    .description('Liquidate an unhealthy position')
    .option('-w, --wallet <name>', 'Your wallet name (liquidator)')
    .option('-t, --target <address>', 'Address to liquidate')
    .option('--debt-asset <code>', 'Debt asset to repay (e.g., XLM)', 'XLM')
    .option('--debt-amount <amount>', 'Amount of debt to repay')
    .option('--collateral-asset <code>', 'Collateral asset to receive (e.g., XLM)', 'XLM')
    .option('--testnet', 'Use testnet (default)', true)
    .option('--mainnet', 'Use mainnet')
    .option('--json', 'Output as JSON')
    .option('--yes', 'Skip confirmation')
    .action(async (options: any) => {
        const spinner = ora('Initializing liquidation...').start();

        try {
            if (!options.wallet) {
                throw new Error('Wallet name is required. Use --wallet flag.');
            }
            if (!options.target) {
                throw new Error('Target address is required. Use --target flag.');
            }
            if (!options.debtAmount) {
                throw new Error('Debt amount is required. Use --debt-amount flag.');
            }

            const wallet = await walletStorage.loadWallet(options.wallet);
            if (!wallet) {
                throw new Error(`Wallet '${options.wallet}' not found`);
            }

            const config = getCliBlendConfig(options.mainnet);
            const blend = new BlendProtocol(config);
            await blend.initialize();

            // Check health factor first
            spinner.text = 'Checking target health factor...';
            const health = await blend.getHealthFactor(options.target);

            if (health.isHealthy) {
                spinner.warn(chalk.yellow('Target position is healthy and cannot be liquidated'));
                console.log(chalk.yellow(`\n  Health Factor: ${health.value}`));
                console.log(chalk.yellow('  Only positions with health factor < 1.0 can be liquidated\n'));
                process.exit(1);
            }

            // Confirm liquidation
            if (!options.yes && !options.json) {
                spinner.stop();
                const answers = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'confirm',
                        message: `Liquidate position (Health: ${health.value})?`,
                        default: false
                    }
                ]);
                if (!answers.confirm) {
                    console.log(chalk.yellow('Liquidation cancelled'));
                    process.exit(0);
                }
                spinner.start('Processing liquidation...');
            }

            const debtAssetCode = options.debtAsset.toUpperCase();
            const collateralAssetCode = options.collateralAsset.toUpperCase();

            const debtAsset = debtAssetCode === 'XLM'
                ? { code: 'XLM', type: 'native' as const }
                : { code: debtAssetCode, issuer: '', type: 'credit_alphanum4' as const };

            const collateralAsset = collateralAssetCode === 'XLM'
                ? { code: 'XLM', type: 'native' as const }
                : { code: collateralAssetCode, issuer: '', type: 'credit_alphanum4' as const };

            // Convert debt amount with correct decimals
            const debtAmount = amountToStroops(options.debtAmount, debtAssetCode);

            spinner.text = 'Executing liquidation...';
            const result = await blend.liquidate(
                wallet.publicKey,
                wallet.secretKey,
                options.target,
                debtAsset,
                debtAmount,
                collateralAsset
            );

            spinner.succeed(chalk.green('✅ Liquidation successful!'));

            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
            } else {
                console.log('\n' + chalk.bold('Liquidation Complete!'));
                console.log(chalk.gray('═'.repeat(60)));
                console.log(chalk.cyan('  Transaction:   ') + chalk.white(result.txHash));
                console.log(chalk.cyan('  Debt Repaid:   ') + chalk.white(`${options.debtAmount} ${debtAsset.code}`));
                console.log(chalk.cyan('  Collateral:    ') + chalk.white(`${result.collateralAmount} ${collateralAsset.code}`));
                console.log(chalk.cyan('  Profit:        ') + chalk.green(`$${result.profitUSD}`));
                console.log(chalk.gray('═'.repeat(60)) + '\n');
            }

        } catch (error: any) {
            spinner.fail(chalk.red('Liquidation failed'));
            if (options.json) {
                console.error(JSON.stringify({ error: error.message }));
            } else {
                console.error(chalk.red('\n❌ Error: ') + error.message);
            }
            process.exit(1);
        }
    });
