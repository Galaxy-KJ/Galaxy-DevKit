import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { walletStorage } from '../../utils/wallet-storage.js';

export const fundWalletCommand = new Command('fund')
    .description('Fund a testnet wallet using friendbot')
    .option('-n, --name <name>', 'Wallet name')
    .option('-a, --amount <amount>', 'Amount to fund in XLM', '10000')
    .option('--json', 'Output as JSON')
    .action(async (options: any) => {
        const spinner = ora('Funding wallet...').start();

        try {
            let walletName = options.name;
            if (!walletName) {
                spinner.stop();
                const wallets = await walletStorage.listWallets();
                if (wallets.length === 0) {
                    spinner.fail(chalk.red('No wallets found'));
                    console.log(chalk.yellow('Create a wallet with: galaxy wallet create'));
                    process.exit(1);
                }
                if (wallets.length === 1) {
                    walletName = wallets[0].name;
                } else {
                    console.log(chalk.yellow('Please specify wallet name:'));
                    wallets.forEach(w => console.log(chalk.gray(`  - ${w.name}`)));
                    process.exit(1);
                }
            }

            spinner.start('Loading wallet...');

            const walletData = await walletStorage.loadWallet(walletName);
            if (!walletData) {
                spinner.fail(chalk.red(`Wallet '${walletName}' not found`));
                process.exit(1);
            }

            if (walletData.network === 'mainnet') {
                spinner.fail(chalk.red('Cannot fund mainnet wallets. Use testnet.'));
                process.exit(1);
            }

            const publicKey = walletData.publicKey;
            const amount = parseFloat(options.amount);

            spinner.text = `Requesting ${amount} XLM from friendbot...`;

            const friendbotUrl = `https://friendbot.stellar.org?addr=${publicKey}&amount=${amount}`;

            const response = await fetch(friendbotUrl, { method: 'GET' });

            if (!response.ok) {
                throw new Error(`Friendbot request failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();

            spinner.succeed(chalk.green(`Wallet funded with ${amount} XLM!`));

            if (options.json) {
                console.log(JSON.stringify({
                    success: true,
                    name: walletName,
                    publicKey: publicKey,
                    amount: amount,
                    hash: result.hash || result.txId || 'N/A',
                    message: result.message || 'Funded successfully'
                }, null, 2));
            } else {
                console.log(chalk.blue('\n📋 Transaction Details:'));
                console.log(chalk.gray('  Wallet:   ') + walletName);
                console.log(chalk.gray('  Public:  ') + publicKey);
                console.log(chalk.gray('  Amount:  ') + chalk.cyan(`${amount} XLM`));
                if (result.hash || result.txId) {
                    console.log(chalk.gray('  Hash:    ') + (result.hash || result.txId));
                }
                console.log();
            }

        } catch (error) {
            if (options.json) {
                console.log(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
            } else {
                spinner.fail(chalk.red('Failed to fund wallet'));
                if (error instanceof Error) {
                    console.error(chalk.red(error.message));
                }
            }
            process.exit(1);
        }
    });