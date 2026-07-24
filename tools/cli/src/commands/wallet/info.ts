import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { walletStorage } from '../../utils/wallet-storage.js';
import { Horizon } from '@stellar/stellar-sdk';

interface WalletBalance {
    asset: string;
    balance: string;
}

export const infoWalletCommand = new Command('info')
    .description('Display detailed wallet information')
    .option('-n, --name <name>', 'Wallet name')
    .option('--json', 'Output as JSON')
    .action(async (options: any) => {
        const spinner = ora('Loading wallet info...').start();

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

            spinner.start('Loading wallet info...');

            const walletData = await walletStorage.loadWallet(walletName);
            if (!walletData) {
                spinner.fail(chalk.red(`Wallet '${walletName}' not found`));
                process.exit(1);
            }

            const network = walletData.network || 'testnet';
            const server = new Horizon.Server(
                network === 'mainnet'
                    ? 'https://horizon.stellar.org'
                    : 'https://horizon-testnet.stellar.org'
            );

            let balances: WalletBalance[] = [];
            let exists = false;
            try {
                const account = await server.loadAccount(walletData.publicKey);
                exists = true;
                balances = account.balances.map((balance: any) => ({
                    asset: balance.asset_type === 'native'
                        ? 'XLM'
                        : balance.asset_type === 'liquidity_pool_shares'
                            ? `LP:${balance.liquidity_pool_id}`
                            : `${balance.asset_code}:${balance.asset_issuer}`,
                    balance: balance.balance
                }));
            } catch (error: any) {
                const notFound =
                    error?.response?.status === 404 ||
                    error?.name === 'NotFoundError';
                if (!notFound) throw error;
            }

            spinner.stop();

            if (options.json) {
                console.log(JSON.stringify({
                    name: walletName,
                    publicKey: walletData.publicKey,
                    network: walletData.network,
                    createdAt: walletData.createdAt,
                    exists,
                    balances
                }, null, 2));
            } else {
                console.log(chalk.blue(`\n💼 Wallet: ${walletName}\n`));
                console.log(chalk.gray('  Public Key: ') + walletData.publicKey);
                console.log(chalk.gray('  Network:    ') + walletData.network);
                console.log(chalk.gray('  Created:    ') + walletData.createdAt);
                if (!exists) {
                    console.log(chalk.gray('  Balances:   ') + chalk.yellow('Account not found on network'));
                } else {
                    console.log(chalk.gray('  Balances:'));
                    for (const balance of balances) {
                        console.log(chalk.gray('    - ') + chalk.cyan(`${balance.balance} ${balance.asset}`));
                    }
                }
                console.log();
            }

        } catch (error) {
            if (options.json) {
                console.log(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
            } else {
                spinner.fail(chalk.red('Failed to get wallet info'));
                if (error instanceof Error) {
                    console.error(chalk.red(error.message));
                }
            }
            process.exit(1);
        }
    });
