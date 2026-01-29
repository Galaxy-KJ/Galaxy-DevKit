/**
 * @fileoverview Transaction tracking command
 * @description Tracks a transaction until confirmation
 * @author Galaxy DevKit Team
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { StreamManager } from '../../utils/stream-manager.js';

const transactionWatchCommand = new Command('transaction');

transactionWatchCommand
  .description('Track a transaction until it is confirmed on the network')
  .argument('<hash>', 'Transaction hash')
  .option('--network <type>', 'Network (testnet/mainnet)', 'testnet')
  .action(async (hash, options) => {
    const streamManager = new StreamManager({ network: options.network });
    const spinner = ora(
      `Watching transaction ${hash.substring(0, 8)}...`
    ).start();

    streamManager.watchTransaction(hash).subscribe({
      next: tx => {
        spinner.succeed(chalk.green(`Transaction Confirmed!`));
        console.log(chalk.blue('\n📊 Transaction Details:'));
        console.log(chalk.gray(`  ├── Hash: ${tx.hash}`));
        console.log(chalk.gray(`  ├── Ledger: ${tx.ledger_attr}`));
        console.log(chalk.gray(`  ├── Success: ${tx.successful}`));
        console.log(chalk.gray(`  ├── Created: ${tx.created_at}`));
        process.exit(0);
      },
      error: err => {
        spinner.fail(chalk.red(`Error tracking transaction: ${err.message}`));
        process.exit(1);
      },
    });

    // Handle manual exit
    process.on('SIGINT', () => {
      spinner.stop();
      process.exit(0);
    });
  });

export { transactionWatchCommand };
