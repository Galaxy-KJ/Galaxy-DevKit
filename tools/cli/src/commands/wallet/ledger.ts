import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { LedgerWallet } from '../../../../../packages/core/wallet/auth/src/hardware/LedgerWallet.js';

export const ledgerCommand = new Command('ledger')
    .description('Ledger hardware wallet commands');

ledgerCommand.command('connect')
    .description('Detect and connect to Ledger device')
    .action(async () => {
        const spinner = ora('Connecting to Ledger...').start();

        try {
            const ledger = new LedgerWallet();

            ledger.on('connecting', () => spinner.text = 'Waiting for device connection...');
            ledger.on('connected', (info: any) => {
                spinner.succeed(chalk.green('Ledger connected!'));
                console.log(chalk.blue('\nDevice Info:'));
                console.log(`  Model: ${info.model}`);
                console.log(`  Firmware: ${info.firmwareVersion}`);
                console.log(`  App Version: ${info.appVersion}`);
                console.log(`  Stellar App Open: ${info.isStellarAppOpen ? 'Yes' : 'No'}`);
            });

            await ledger.connect();

            // Keep process alive if needed, or just disconnect
            await ledger.disconnect();

        } catch (error) {
            spinner.fail(chalk.red('Failed to connect to Ledger'));
            if (error instanceof Error) {
                console.error(chalk.red(error.message));
                console.log(chalk.yellow('Tip: Make sure your Ledger is plugged in, unlocked, and the Stellar app is open.'));
            }
        }
    });

ledgerCommand.command('accounts')
    .description('List accounts from Ledger')
    .option('-s, --start <index>', 'Start index', parseInt, 0)
    .option('-c, --count <number>', 'Number of accounts', parseInt, 5)
    .action(async (options: any) => {
        const spinner = ora('Fetching accounts from Ledger...').start();

        try {
            const ledger = new LedgerWallet();
            await ledger.connect();

            const accounts = await ledger.getAccounts(options.start, options.count);

            spinner.succeed(chalk.green(`Found ${accounts.length} accounts:`));

            accounts.forEach((acc: any) => {
                console.log(chalk.gray('----------------------------------------'));
                console.log(`Index: ${acc.index}`);
                console.log(`Path: ${acc.derivationPath}`);
                console.log(`Public Key: ${acc.publicKey}`);
            });
            console.log(chalk.gray('----------------------------------------'));

            await ledger.disconnect();

        } catch (error) {
            spinner.fail(chalk.red('Failed to list accounts'));
            if (error instanceof Error) {
                console.error(chalk.red(error.message));
            }
        }
    });
