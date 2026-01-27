import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Keypair } from '@stellar/stellar-sdk';

export const importWalletCommand = new Command('import')
    .description('Import wallet from secret key')
    .argument('<secret-key>', 'Secret key to import')
    .option('-n, --name <name>', 'Wallet name')
    .option('--testnet', 'Use testnet (default)')
    .option('--mainnet', 'Use mainnet')
    .action(async (secretKey: string, options: any) => {
        const spinner = ora('Importing wallet...').start();

        try {
            // 1. Validate Secret Key
            let pair;
            try {
                pair = Keypair.fromSecret(secretKey);
            } catch (e) {
                spinner.fail(chalk.red('Invalid secret key format'));
                return;
            }

            const publicKey = pair.publicKey();

            // 2. Determine wallet name
            let walletName = options.name;
            if (!walletName) {
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

            // 3. Ensure wallets directory exists
            const homeDir = os.homedir();
            const walletsDir = path.join(homeDir, '.galaxy', 'wallets');
            await fs.ensureDir(walletsDir);

            // 4. Check if wallet already exists
            const walletPath = path.join(walletsDir, `${walletName}.json`);
            if (await fs.pathExists(walletPath)) {
                spinner.fail(chalk.red(`Wallet '${walletName}' already exists!`));
                return;
            }

            // 5. Save wallet
            const walletData = {
                publicKey,
                secretKey: secretKey,
                network: options.mainnet ? 'mainnet' : 'testnet',
                createdAt: new Date().toISOString(),
                importedAt: new Date().toISOString()
            };

            await fs.writeJson(walletPath, walletData, { spaces: 2 });

            spinner.succeed(chalk.green(`Wallet '${walletName}' imported successfully!`));
            console.log(chalk.blue('\n🔑 Wallet Details:'));
            console.log(chalk.gray(`  Public Key: ${publicKey}`));
            console.log(chalk.gray(`  Saved to: ${walletPath}`));

        } catch (error) {
            spinner.fail(chalk.red('Failed to import wallet'));
            if (error instanceof Error) {
                console.error(chalk.red(error.message));
            }
        }
    });
