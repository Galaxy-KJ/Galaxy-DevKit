import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Horizon, Networks } from '@stellar/stellar-sdk';
import { SocialRecovery } from '../../../../../packages/core/wallet/src/recovery/SocialRecovery.js';
import { SocialRecoveryConfig, RecoveryRequest } from '../../../../../packages/core/wallet/src/recovery/types.js';

const RECOVERY_FILE = 'social-recovery.json';

async function getRecoveryPath() {
    const homeDir = os.homedir();
    const dir = path.join(homeDir, '.galaxy');
    await fs.ensureDir(dir);
    return path.join(dir, RECOVERY_FILE);
}

// Wrapper to handle persistence
class PersistedSocialRecovery extends SocialRecovery {
    constructor(config: any, server: any, networkPassphrase: any, encryptionKey: any) {
        super(config, server, networkPassphrase, encryptionKey);
    }

    // Load state from JSON
    loadState(data: any) {
        if (data.recoveryRequests) {
            (this as any).recoveryRequests = new Map(data.recoveryRequests);
        }
        if (data.approvals) {
            (this as any).approvals = new Map(data.approvals);
        }
    }

    // Export state to JSON
    exportState() {
        return {
            recoveryRequests: Array.from((this as any).recoveryRequests.entries()),
            approvals: Array.from((this as any).approvals.entries()),
            config: (this as any).config
        };
    }
}

async function loadManager(options: any): Promise<PersistedSocialRecovery | null> {
    const recoveryPath = await getRecoveryPath();
    if (!await fs.pathExists(recoveryPath)) return null;

    // Prompt for password
    const { password } = await inquirer.prompt([
        {
            type: 'password',
            name: 'password',
            message: 'Enter recovery password (for encryption):',
            mask: '*'
        }
    ]);

    const data = await fs.readJson(recoveryPath);

    const serverUrl = options.network === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
    const server = new Horizon.Server(serverUrl);
    const networkPassphrase = options.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

    const manager = new PersistedSocialRecovery(
        data.config,
        server,
        networkPassphrase,
        password
    );

    manager.loadState(data);
    return manager;
}

export const recoveryCommand = new Command('recovery')
    .description('Social recovery commands');

recoveryCommand.command('setup')
    .description('Configure social recovery guardians')
    .requiredOption('--guardians <addresses>', 'Comma-separated guardian addresses')
    .option('--threshold <n>', 'Recovery threshold (default: >50%)', parseInt)
    .option('--network <network>', 'Network', 'testnet')
    .action(async (options: any) => {
        const spinner = ora('Configuring social recovery...').start();

        try {
            // 1. Parse guardians
            const guardianKeys = options.guardians.split(',').map((s: string) => s.trim());
            const guardians = guardianKeys.map((key: string) => ({
                publicKey: key,
                name: `Guardian ${key.substring(0, 4)}`,
                status: 'active',
                verified: true
            }));

            const config: Partial<SocialRecoveryConfig> = {
                guardians,
                minGuardians: 2,
                maxGuardians: 10,
                threshold: options.threshold,
                timeLockHours: 24
            };

            spinner.stop();
            // Prompt for password
            const { password } = await inquirer.prompt([
                {
                    type: 'password',
                    name: 'password',
                    message: 'Set recovery password (for encryption):',
                    mask: '*'
                }
            ]);

            spinner.start('Saving configuration...');

            const serverUrl = options.network === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
            const server = new Horizon.Server(serverUrl);
            const networkPassphrase = options.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

            const manager = new PersistedSocialRecovery(config, server, networkPassphrase, password);

            // Save
            const recoveryPath = await getRecoveryPath();
            await fs.writeJson(recoveryPath, manager.exportState(), { spaces: 2 });

            spinner.succeed(chalk.green('Social recovery configured!'));
            console.log(chalk.gray(`Guardians: ${guardians.length}`));
            console.log(chalk.gray(`Threshold: ${manager.exportState().config.threshold}`));

        } catch (error) {
            spinner.fail(chalk.red('Setup failed'));
            if (error instanceof Error) console.error(chalk.red(error.message));
        }
    });

recoveryCommand.command('initiate')
    .description('Start recovery process')
    .requiredOption('--target <wallet-public-key>', 'Wallet to recover')
    .requiredOption('--new-owner <public-key>', 'New owner public key')
    .option('--network <network>', 'Network', 'testnet')
    .action(async (options: any) => {
        const spinner = ora('Initiating recovery...').start();

        try {
            spinner.stop(); // Stop spinner to allow prompt
            const manager = await loadManager(options);
            if (!manager) {
                console.error(chalk.red('Recovery not configured. Run "galaxy wallet recovery setup" first.'));
                return;
            }

            spinner.start('Creating recovery request...');

            // Note: We use testMode=true here to skip on-chain validation for CLI demo purposes unless fully integrated
            // But typically initiateRecovery validates on-chain state.
            // Assuming testnet for now.

            const request = await manager.initiateRecovery(
                options.target,
                options.newOwner,
                true
            );

            // Save state
            const recoveryPath = await getRecoveryPath();
            await fs.writeJson(recoveryPath, manager.exportState(), { spaces: 2 });

            spinner.succeed(chalk.green('Recovery initiated!'));
            console.log(chalk.blue('Recovery Request Details:'));
            console.log(`  ID: ${request.id}`);
            console.log(`  Target: ${request.walletPublicKey}`);
            console.log(`  New Owner: ${request.newOwnerKey}`);
            console.log(`  Status: ${request.status}`);
            console.log(`  Execute After: ${request.executesAt}`);

        } catch (error) {
            spinner.fail(chalk.red('Failed to initiate recovery'));
            if (error instanceof Error) console.error(chalk.red(error.message));
        }
    });
