/**
 * @fileoverview Transaction tracking command
 * @description Tracks a transaction until confirmation with configurable timeout
 * @author Galaxy DevKit Team
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { StreamManager } from '../../utils/stream-manager.js';

const DEFAULT_TIMEOUT_SECONDS = 60;

const transactionWatchCommand = new Command('transaction');

transactionWatchCommand
  .description('Track a transaction until it is confirmed on the network')
  .argument('<hash>', 'Transaction hash')
  .option('--network <type>', 'Network (testnet/mainnet)', 'testnet')
  .option(
    '--timeout <seconds>',
    `Timeout in seconds (default: ${DEFAULT_TIMEOUT_SECONDS})`,
    String(DEFAULT_TIMEOUT_SECONDS)
  )
  .option('--json', 'Output result as JSON', false)
  .action(async (hash, options) => {
    const streamManager = new StreamManager({ network: options.network });
    const timeoutMs = parseInt(options.timeout) * 1000;
    const cleanHash = hash.trim();

    if (options.json) {
      // JSON mode - output only JSON
      streamManager.watchTransaction(cleanHash, timeoutMs).subscribe({
        next: tx => {
          console.log(
            JSON.stringify({
              status: 'confirmed',
              hash: tx.hash,
              ledger: tx.ledger_attr,
              successful: tx.successful,
              created_at: tx.created_at,
              fee_charged: tx.fee_charged,
              operation_count: tx.operation_count,
            })
          );
        },
        error: err => {
          console.log(
            JSON.stringify({
              status: 'error',
              message: err.message,
            })
          );
          process.exit(1);
        },
      });
      return;
    }

    // Interactive mode with spinner
    const spinner = ora(
      `Watching transaction ${cleanHash.substring(0, 8)}... (timeout: ${options.timeout}s)`
    ).start();

    const startTime = Date.now();

    // Update spinner with elapsed time
    const timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      spinner.text = `Watching transaction ${cleanHash.substring(0, 8)}... (${elapsed}s / ${options.timeout}s)`;
    }, 1000);

    streamManager.watchTransaction(cleanHash, timeoutMs).subscribe({
      next: tx => {
        clearInterval(timerInterval);
        spinner.succeed(chalk.green(`Transaction Confirmed!`));
        console.log(chalk.blue('\n📊 Transaction Details:'));
        console.log(chalk.gray(`  ├── Hash: ${tx.hash}`));
        console.log(chalk.gray(`  ├── Ledger: ${tx.ledger_attr}`));
        console.log(chalk.gray(`  ├── Success: ${tx.successful}`));
        console.log(chalk.gray(`  ├── Fee Charged: ${tx.fee_charged} stroops`));
        console.log(chalk.gray(`  ├── Operations: ${tx.operation_count}`));
        console.log(chalk.gray(`  └── Created: ${tx.created_at}`));
        process.exit(0);
      },
      error: err => {
        clearInterval(timerInterval);
        if (err.message.includes('timeout')) {
          spinner.fail(
            chalk.yellow(
              `Transaction not confirmed within ${options.timeout}s timeout`
            )
          );
          console.log(chalk.gray('\nThe transaction may still be pending.'));
          console.log(
            chalk.gray('You can check its status on the Stellar explorer:')
          );
          console.log(
            chalk.blue(
              `  https://${options.network === 'mainnet' ? '' : 'testnet.'}stellar.expert/explorer/tx/${cleanHash}`
            )
          );
        } else {
          spinner.fail(chalk.red(`Error tracking transaction: ${err.message}`));
        }
        process.exit(1);
      },
    });

    // Handle manual exit
    process.on('SIGINT', () => {
      clearInterval(timerInterval);
      spinner.stop();
      console.log(chalk.gray('\n\nTracking cancelled by user.'));
      process.exit(0);
    });
  });

export { transactionWatchCommand };
