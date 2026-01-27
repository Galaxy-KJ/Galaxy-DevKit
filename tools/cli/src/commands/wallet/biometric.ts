import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Keypair, TransactionBuilder, Networks } from '@stellar/stellar-sdk';

import { BiometricAuth } from '../../../../../packages/core/wallet/auth/src/BiometricAuth.js';
import { MockBiometricProvider } from '../../../../../packages/core/wallet/auth/src/providers/MockProvider.js';

const BIOMETRIC_CONFIG_FILE = 'biometric-config.json';

async function getBiometricConfigPath() {
    const homeDir = os.homedir();
    const dir = path.join(homeDir, '.galaxy');
    await fs.ensureDir(dir);
    return path.join(dir, BIOMETRIC_CONFIG_FILE);
}

export const biometricCommand = new Command('biometric')
    .description('Biometric authentication commands');

biometricCommand.command('setup')
    .description('Configure biometric authentication')
    .action(async () => {
        const spinner = ora('Initializing biometric setup...').start();

        try {
            // 1. Initialize Biometric Auth
            // In a real CLI, we might use a native module. Here we use Mock for demonstration.
            const provider = new MockBiometricProvider({ available: true, enrolled: true });
            const bioAuth = new BiometricAuth(provider);

            try {
                await bioAuth.initialize();
            } catch (e) {
                spinner.fail('Biometric hardware not available or not enrolled');
                return;
            }

            spinner.stop();

            // 2. Ask user consent
            const { confirm } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'confirm',
                    message: 'Do you want to enable biometric authentication for this device?',
                    default: true
                }
            ]);

            if (!confirm) {
                console.log(chalk.yellow('Setup cancelled'));
                return;
            }

            spinner.start('enrolling...');

            // 3. Enroll
            await bioAuth.enroll();

            // 4. Save configuration
            const configPath = await getBiometricConfigPath();
            await fs.writeJson(configPath, {
                enabled: true,
                provider: 'mock',
                setupAt: new Date()
            });

            spinner.succeed(chalk.green('Biometric authentication enabled successfully!'));
            console.log(chalk.gray('Note: Using simulated biometric provider for CLI environment.'));

        } catch (error) {
            spinner.fail(chalk.red('Failed to setup biometric auth'));
            if (error instanceof Error) {
                console.error(chalk.red(error.message));
            }
        }
    });

biometricCommand.command('sign')
    .description('Sign with biometric verification')
    .argument('<transaction-xdr>', 'Transaction XDR to sign')
    .option('--wallet <name>', 'Wallet name to sign with')
    .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
    .action(async (xdr: string, options: any) => {
        const spinner = ora('Checking biometric configuration...').start();

        try {
            // 1. Check configuration
            const configPath = await getBiometricConfigPath();
            if (!await fs.pathExists(configPath)) {
                spinner.fail('Biometric auth not configured. Run "galaxy wallet biometric setup" first.');
                return;
            }

            // 2. Select wallet
            spinner.stop();
            let walletName = options.wallet;
            if (!walletName) {
                const accounts = await getAvailableWallets();
                if (accounts.length === 0) {
                    console.error(chalk.red('No wallets found.'));
                    return;
                }
                const answer = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'walletName',
                        message: 'Select wallet to sign with:',
                        choices: accounts.map((a: any) => a.name)
                    }
                ]);
                walletName = answer.walletName;
            }

            const accounts = await getAvailableWallets();
            const wallet = accounts.find((a: any) => a.name === walletName);
            if (!wallet) throw new Error('Wallet not found');

            spinner.start('Waiting for biometric authentication...');

            // 3. Authenticate
            const provider = new MockBiometricProvider({ available: true, enrolled: true, authSuccess: true });
            const bioAuth = new BiometricAuth(provider);

            // Simulate delay/interaction
            const authResult = await bioAuth.authenticate({
                prompt: 'Scan fingerprint to sign transaction'
            });

            if (!authResult.success) {
                spinner.fail(chalk.red(`Authentication failed: ${authResult.error}`));
                return;
            }

            spinner.succeed(chalk.green('Authentication successful!'));
            spinner.start('Signing transaction...');

            // 4. Sign Transaction
            const kp = Keypair.fromSecret(wallet.secretKey);
            const networkPassphrase = options.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
            const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);

            tx.sign(kp);

            const signedXdr = tx.toXDR();
            spinner.succeed(chalk.green('Transaction signed successfully!'));
            console.log(chalk.gray('Signed XDR:'));
            console.log(chalk.white(signedXdr));

        } catch (error) {
            spinner.fail(chalk.red('Failed to sign with biometric auth'));
            if (error instanceof Error) {
                console.error(chalk.red(error.message));
            }
        }
    });

async function getAvailableWallets() {
    const homeDir = os.homedir();
    const walletsDir = path.join(homeDir, '.galaxy', 'wallets');
    if (!await fs.pathExists(walletsDir)) return [];

    const files = await fs.readdir(walletsDir);
    const wallets = [];
    for (const file of files) {
        if (file.endsWith('.json')) {
            try {
                const content = await fs.readJson(path.join(walletsDir, file));
                wallets.push({ ...content, name: path.basename(file, '.json') });
            } catch (e) { }
        }
    }
    return wallets;
}
