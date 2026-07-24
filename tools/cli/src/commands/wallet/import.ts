import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { Keypair } from '@stellar/stellar-sdk';
import { walletStorage } from '../../utils/wallet-storage.js';

export const importWalletCommand = new Command('import')
    .description('Import wallet from secret key')
    .argument('[secret-key]', 'Secret key to import (prompted if not provided)')
    .option('-n, --name <name>', 'Wallet name')
    .option('--testnet', 'Use testnet (default)')
    .option('--mainnet', 'Use mainnet')
    .option('--no-encrypt', 'Store the secret key as plaintext (not recommended)')
    .option('--password <password>', 'Encryption password (or set GALAXY_WALLET_PASSWORD)')
    .option('--json', 'Output as JSON')
    .action(async (secretKey: string | undefined, options: any) => {
        const spinner = ora('Importing wallet...').start();

        try {
            if (options.mainnet && options.testnet) {
                throw new Error('Choose either --mainnet or --testnet, not both');
            }

            // 1. Get secret key if not provided
            let actualSecretKey = secretKey;
            if (!actualSecretKey) {
                if (options.json) {
                    console.error(JSON.stringify({ error: 'Secret key is required in JSON mode' }));
                    process.exit(1);
                }
                spinner.stop();
                const answers = await inquirer.prompt([
                    {
                        type: 'password',
                        name: 'secretKey',
                        message: 'Enter secret key:',
                        mask: '*',
                        validate: (input) => input.trim() !== '' ? true : 'Secret key is required'
                    }
                ]);
                actualSecretKey = answers.secretKey;
                spinner.start('Importing wallet...');
            }

            // 2. Validate Secret Key
            let pair;
            try {
                pair = Keypair.fromSecret(actualSecretKey);
            } catch (e) {
                if (options.json) {
                    console.log(JSON.stringify({ error: 'Invalid secret key format' }));
                } else {
                    spinner.fail(chalk.red('Invalid secret key format'));
                }
                process.exit(1);
            }

            const publicKey = pair.publicKey();

            // 3. Determine wallet name
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
                        default: 'imported-wallet',
                        validate: (input) => input.trim() !== '' ? true : 'Name is required'
                    }
                ]);
                walletName = answers.name;
                spinner.start('Importing wallet...');
            }

            // 4. Check if wallet already exists
            if (await walletStorage.walletExists(walletName)) {
                if (options.json) {
                    console.log(JSON.stringify({ error: `Wallet '${walletName}' already exists` }));
                } else {
                    spinner.fail(chalk.red(`Wallet '${walletName}' already exists!`));
                }
                process.exit(1);
            }

            // 5. Save wallet
            const walletData = {
                publicKey,
                secretKey: actualSecretKey as string,
                network: (options.mainnet ? 'mainnet' : 'testnet') as 'mainnet' | 'testnet',
                createdAt: new Date().toISOString(),
                importedAt: new Date().toISOString()
            };

            // 6. Optional encryption
            let encryptionPassword: string | undefined;
            if (options.encrypt) {
                encryptionPassword = options.password || process.env.GALAXY_WALLET_PASSWORD;
                if (!encryptionPassword) {
                    if (options.json) {
                        console.error(JSON.stringify({
                            error: '--password or GALAXY_WALLET_PASSWORD is required in --json mode'
                        }));
                        process.exit(1);
                    }
                    spinner.stop();
                    const answers = await inquirer.prompt([
                        {
                            type: 'password',
                            name: 'password',
                            message: 'Enter a password to encrypt the wallet:',
                            mask: '*',
                            validate: (input: string) => input.length >= 8 ? true : 'Password must be at least 8 characters'
                        },
                        {
                            type: 'password',
                            name: 'confirm',
                            message: 'Confirm password:',
                            mask: '*'
                        }
                    ]);
                    if (answers.password !== answers.confirm) {
                        spinner.fail(chalk.red('Passwords do not match'));
                        process.exit(1);
                    }
                    encryptionPassword = answers.password;
                    spinner.start('Importing wallet...');
                }
                await walletStorage.saveWalletEncrypted(walletName, walletData, encryptionPassword!);
            } else {
                await walletStorage.saveWallet(walletName, walletData);
            }

            if (options.json) {
                console.log(JSON.stringify({
                    success: true,
                    name: walletName,
                    publicKey,
                    network: walletData.network,
                    importedAt: walletData.importedAt,
                    encrypted: !!options.encrypt,
                    path: walletStorage.getWalletPath(walletName)
                }, null, 2));
            } else {
                spinner.succeed(chalk.green(`Wallet '${walletName}' imported successfully!`));
                console.log(chalk.blue('\n🔑 Wallet Details:'));
                console.log(chalk.gray(`  Name: ${walletName}`));
                console.log(chalk.gray(`  Public Key: ${publicKey}`));
                console.log(chalk.gray(`  Network: ${walletData.network}`));
                console.log(chalk.gray(`  Encrypted: ${options.encrypt ? 'yes' : 'no'}`));
                console.log(chalk.gray(`  Saved to: ${walletStorage.getWalletPath(walletName)}`));
            }

        } catch (error) {
            if (options.json) {
                console.log(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
            } else {
                spinner.fail(chalk.red('Failed to import wallet'));
                if (error instanceof Error) {
                    console.error(chalk.red(error.message));
                }
            }
            process.exit(1);
        }
    });
