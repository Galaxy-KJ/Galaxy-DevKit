import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { BlendProtocol } from '../../../../../packages/core/defi-protocols/src/protocols/blend/blend-protocol.js';
import { walletStorage } from '../../utils/wallet-storage.js';
import { getCliBlendConfig, amountToStroops } from './config.js';

export const borrowCommand = new Command('borrow')
    .description('Borrow assets from Blend Protocol')
    .option('-w, --wallet <name>', 'Wallet name to use')
    .option('-a, --asset <code>', 'Asset code to borrow (e.g., XLM, USDC)', 'XLM')
    .option('-i, --issuer <address>', 'Asset issuer address (not needed for XLM)')
    .option('--amount <amount>', 'Amount to borrow')
    .option('--testnet', 'Use testnet (default)', true)
    .option('--mainnet', 'Use mainnet')
    .option('--json', 'Output as JSON')
    .action(async (options: any) => {
        const spinner = ora('Initializing Blend Protocol...').start();

        try {
            // 1. Get wallet
            let walletName = options.wallet;
            if (!walletName) {
                if (options.json) {
                    console.error(JSON.stringify({ error: 'Wallet name is required. Use --wallet flag.' }));
                    process.exit(1);
                }
                spinner.stop();
                const wallets = await walletStorage.listWallets();
                if (wallets.length === 0) {
                    console.log(chalk.red('No wallets found. Create one with: galaxy wallet create'));
                    process.exit(1);
                }
                const answers = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'wallet',
                        message: 'Select wallet:',
                        choices: wallets.map((w: any) => w.name)
                    }
                ]);
                walletName = answers.wallet;
                spinner.start('Initializing Blend Protocol...');
            }

            const wallet = await walletStorage.loadWallet(walletName);
            if (!wallet) {
                throw new Error(`Wallet '${walletName}' not found`);
            }

            // 2. Get amount
            let amount = options.amount;
            if (!amount) {
                if (options.json) {
                    console.error(JSON.stringify({ error: 'Amount is required. Use --amount flag.' }));
                    process.exit(1);
                }
                spinner.stop();
                const answers = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'amount',
                        message: 'Enter amount to borrow:',
                        validate: (input) => {
                            const num = parseFloat(input);
                            return !isNaN(num) && num > 0 ? true : 'Please enter a valid amount';
                        }
                    }
                ]);
                amount = answers.amount;
                spinner.start('Borrowing from Blend...');
            }

            // 3. Determine network config
            const config = getCliBlendConfig(options.mainnet);

            // 4. Convert amount to stroops with correct decimals
            const assetCode = options.asset.toUpperCase();
            const amountInStroops = amountToStroops(amount, assetCode);

            // 5. Initialize Blend
            spinner.text = 'Initializing Blend Protocol...';
            const blend = new BlendProtocol(config);
            await blend.initialize();

            // 6. Build asset object
            const asset = assetCode === 'XLM'
                ? { code: 'XLM', type: 'native' as const }
                : {
                    code: assetCode,
                    issuer: options.issuer || '',
                    type: 'credit_alphanum4' as const
                };

            // 7. Execute borrow
            spinner.text = `Borrowing ${amount} ${asset.code} from Blend...`;
            const result = await blend.borrow(
                wallet.publicKey,
                wallet.secretKey,
                asset,
                amountInStroops
            );

            spinner.succeed(chalk.green('✅ Borrow successful!'));

            if (options.json) {
                console.log(JSON.stringify({
                    success: true,
                    txHash: result.hash,
                    status: result.status,
                    ledger: result.ledger,
                    amount,
                    asset: asset.code,
                    network: config.network.network
                }, null, 2));
            } else {
                console.log('\n' + chalk.bold('Transaction Details:'));
                console.log(chalk.gray('═'.repeat(60)));
                console.log(chalk.cyan('  Hash:    ') + chalk.white(result.hash));
                console.log(chalk.cyan('  Status:  ') + chalk.green(result.status));
                console.log(chalk.cyan('  Ledger:  ') + chalk.white(result.ledger));
                console.log(chalk.cyan('  Amount:  ') + chalk.white(`${amount} ${asset.code}`));
                console.log(chalk.yellow('\n  ⚠️  Remember to manage your health factor!'));
                console.log(chalk.gray('═'.repeat(60)));
                console.log('\n' + chalk.blue('🔗 View on Stellar Expert:'));
                console.log(chalk.underline(`https://stellar.expert/explorer/${config.network.network}/tx/${result.hash}`));
                console.log('\n' + chalk.blue('🔗 View on Blend UI:'));
                console.log(chalk.underline(`https://${config.network.network === 'testnet' ? 'testnet.' : ''}blend.capital/`));
            }

        } catch (error: any) {
            spinner.fail(chalk.red('Borrow failed'));
            if (options.json) {
                console.error(JSON.stringify({ error: error.message }));
            } else {
                console.error(chalk.red('\n❌ Error: ') + error.message);
            }
            process.exit(1);
        }
    });
