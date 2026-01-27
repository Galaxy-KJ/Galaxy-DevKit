import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export const listWalletsCommand = new Command('list')
    .description('Show all configured wallets')
    .action(async () => {
        const spinner = ora('Loading wallets...').start();

        try {
            const homeDir = os.homedir();
            const walletsDir = path.join(homeDir, '.galaxy', 'wallets');

            if (!await fs.pathExists(walletsDir)) {
                spinner.warn(chalk.yellow('No wallets found. Create one with "galaxy wallet create"'));
                return;
            }

            const files = await fs.readdir(walletsDir);
            const walletFiles = files.filter(f => f.endsWith('.json'));

            if (walletFiles.length === 0) {
                spinner.warn(chalk.yellow('No wallets found. Create one with "galaxy wallet create"'));
                return;
            }

            const wallets = [];
            for (const file of walletFiles) {
                try {
                    const content = await fs.readJson(path.join(walletsDir, file));
                    wallets.push({
                        name: path.basename(file, '.json'),
                        publicKey: content.publicKey,
                        network: content.network || 'unknown'
                    });
                } catch (e) {
                    // Ignore invalid files
                }
            }

            spinner.stop();
            console.log(chalk.blue(`\nFound ${wallets.length} wallets:`));

            wallets.forEach(w => {
                console.log(chalk.gray('----------------------------------------'));
                console.log(chalk.bold(`Name: ${w.name}`));
                console.log(`Public Key: ${w.publicKey}`);
                console.log(`Network: ${w.network}`);
            });
            console.log(chalk.gray('----------------------------------------'));

        } catch (error) {
            spinner.fail(chalk.red('Failed to list wallets'));
            if (error instanceof Error) {
                console.error(chalk.red(error.message));
            }
        }
    });
