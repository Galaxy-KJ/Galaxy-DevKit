import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { walletStorage } from '../../utils/wallet-storage.js';

export const encryptWalletCommand = new Command('encrypt')
    .description('Encrypt an existing plaintext wallet with a password')
    .argument('<name>', 'Wallet name to encrypt')
    .option('--password <password>', 'Password (required in --json mode; prompted otherwise)')
    .option('--json', 'Output as JSON')
    .action(async (name: string, options: any) => {
        const spinner = ora(`Encrypting wallet '${name}'...`).start();

        try {
            if (!await walletStorage.walletExists(name)) {
                if (options.json) {
                    console.log(JSON.stringify({ error: `Wallet '${name}' not found` }));
                } else {
                    spinner.fail(chalk.red(`Wallet '${name}' not found`));
                }
                process.exit(1);
                return;
            }

            if (await walletStorage.isWalletEncrypted(name)) {
                if (options.json) {
                    console.log(JSON.stringify({ error: `Wallet '${name}' is already encrypted` }));
                } else {
                    spinner.fail(chalk.red(`Wallet '${name}' is already encrypted`));
                }
                process.exit(1);
                return;
            }

            // Plaintext wallet — load directly (no password needed).
            const wallet = await walletStorage.loadWalletDecrypted(name);
            if (!wallet) {
                if (options.json) {
                    console.log(JSON.stringify({ error: `Wallet '${name}' could not be loaded` }));
                } else {
                    spinner.fail(chalk.red(`Wallet '${name}' could not be loaded`));
                }
                process.exit(1);
                return;
            }

            let password = options.password as string | undefined;
            if (!password) {
                if (options.json) {
                    console.error(JSON.stringify({ error: '--password is required in --json mode' }));
                    process.exit(1);
                    return;
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
                    return;
                }
                password = answers.password;
                spinner.start(`Encrypting wallet '${name}'...`);
            }

            await walletStorage.saveWalletEncrypted(name, wallet, password!);

            if (options.json) {
                console.log(JSON.stringify({
                    success: true,
                    name,
                    encrypted: true,
                    path: walletStorage.getWalletPath(name)
                }, null, 2));
            } else {
                spinner.succeed(chalk.green(`Wallet '${name}' is now encrypted at rest.`));
                console.log(chalk.yellow('⚠️  Lose the password and the secret cannot be recovered from the file.'));
                console.log(chalk.gray(`  Path: ${walletStorage.getWalletPath(name)}`));
            }
        } catch (error) {
            if (options.json) {
                console.log(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
            } else {
                spinner.fail(chalk.red('Failed to encrypt wallet'));
                if (error instanceof Error) console.error(chalk.red(error.message));
            }
            process.exit(1);
            return;
        }
    });
