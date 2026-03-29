import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { Keypair } from '@stellar/stellar-sdk';
import { walletStorage } from '../../utils/wallet-storage.js';

export const createWalletCommand = new Command('create')
    .description('Create a new wallet and display public key')
    .option('-n, --name <name>', 'Wallet name')
    .option('--testnet', 'Use testnet (default)')
    .option('--mainnet', 'Use mainnet')
    .option('--json', 'Output as JSON')
    .action(async (options: any) => {
        const spinner = ora('Creating new wallet...').start();

        try {
            // 1. Generate Keypair
            const pair = Keypair.random();
            const secret = pair.secret();
            const publicKey = pair.publicKey();

            // 2. Determine wallet name
            let walletName = options.name;
            if (!walletName) {
                if (options.json) {
                    console.error(JSON.stringify({ error: 'Wallet name is required in JSON mode' }));
                    process.exit(1);
                }
                spinner.stop();
                const answers = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'name',
                        message: 'Enter wallet name:',
                        default: 'default',
                        validate: (input) => input.trim() !== '' ? true : 'Name is required'
                    }
                ]);
                walletName = answers.name;
                spinner.start('Creating new wallet...');
            }

            // 3. Check if wallet already exists
            if (await walletStorage.walletExists(walletName)) {
                if (options.json) {
                    console.log(JSON.stringify({ error: `Wallet '${walletName}' already exists` }));
                } else {
                    spinner.fail(chalk.red(`Wallet '${walletName}' already exists!`));
                }
                process.exit(1);
            }

            // 4. Save wallet
            const walletData = {
                publicKey,
                secretKey: secret,
                network: (options.mainnet ? 'mainnet' : 'testnet') as 'mainnet' | 'testnet',
                createdAt: new Date().toISOString()
            };

            await walletStorage.saveWallet(walletName, walletData);

            if (options.json) {
                console.log(JSON.stringify({
                    success: true,
                    name: walletName,
                    publicKey,
                    secretKey: secret,
                    network: walletData.network,
                    createdAt: walletData.createdAt,
                    path: walletStorage.getWalletPath(walletName)
                }, null, 2));
            } else {
                spinner.succeed(chalk.green(`Wallet '${walletName}' created successfully!`));
                console.log(chalk.blue('\n🔑 Wallet Details:'));
                console.log(chalk.gray(`  Name: ${walletName}`));
                console.log(chalk.gray(`  Public Key: ${publicKey}`));
                console.log(chalk.gray(`  Secret Key: ${secret}`));
                console.log(chalk.gray(`  Network: ${walletData.network}`));
                console.log(chalk.yellow('\n⚠️  WARNING: Keep your secret key safe! Do not share it with anyone.'));
                console.log(chalk.gray(`  Saved to: ${walletStorage.getWalletPath(walletName)}`));
            }

        } catch (error) {
            if (options.json) {
                console.log(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
            } else {
                spinner.fail(chalk.red('Failed to create wallet'));
                if (error instanceof Error) {
                    console.error(chalk.red(error.message));
                }
            }
            process.exit(1);
        }
    });
