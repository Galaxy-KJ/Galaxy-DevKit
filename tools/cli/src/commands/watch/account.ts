/**
 * @fileoverview Account monitoring command
 * @description Streams account balance and transaction updates
 * @author Galaxy DevKit Team
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as StellarSDK from '@stellar/stellar-sdk';
import { StreamManager } from '../../utils/stream-manager.js';
import { TerminalUI } from '../../utils/terminal-ui.js';

const accountWatchCommand = new Command('account');

accountWatchCommand
  .description('Monitor an account in real-time')
  .argument('<address>', 'Stellar account address')
  .option('--network <type>', 'Network to monitor (testnet/mainnet)', 'testnet')
  .option('--json', 'Output stream as JSON instead of dashboard', false)
  .option('--interval <seconds>', 'Interval for balance updates (seconds)', '5')
  .action(async (address, options) => {
    const cleanAddress = address.trim();

    // Validate Address
    if (!StellarSDK.StrKey.isValidEd25519PublicKey(cleanAddress)) {
      console.error(chalk.red(`\n❌ Error: Invalid Stellar Public Key`));
      console.error(chalk.yellow(`   Address: [${cleanAddress}]`));
      console.error(
        chalk.gray(
          `   A valid address must start with 'G', be 56 characters long, and use Base32 alphabet.`
        )
      );
      process.exit(1);
    }

    const streamManager = new StreamManager({ network: options.network });

    if (options.json) {
      console.log(chalk.blue(`Watching account: ${cleanAddress} (JSON mode)`));
      streamManager.watchAccountPayments(cleanAddress).subscribe({
        next: payment => console.log(JSON.stringify(payment)),
        error: err => console.error(chalk.red('Stream Error:'), err),
      });
      return;
    }

    // Dashboard mode
    const ui = new TerminalUI(
      `Galaxy Watch - Account ${cleanAddress.substring(0, 8)}...`
    );

    const balanceBox = ui.createBox({
      row: 0,
      col: 0,
      rowSpan: 3,
      colSpan: 12,
      label: ' Account Balance ',
      content: 'Fetching balance...',
    });

    const logBox = ui.createLogBox({
      row: 3,
      col: 0,
      rowSpan: 9,
      colSpan: 12,
      label: ` Activity Stream [${options.network}] `,
    });

    logBox.log(chalk.yellow(`[*] Starting monitor for ${cleanAddress}`));
    logBox.log(chalk.gray(`[*] Press 'q' or 'Ctrl+C' to stop`));

    // Poll for balance
    const pollInterval = parseInt(options.interval) * 1000;
    let lastBalances: Record<string, string> = {};

    const fetchBalance = async () => {
      try {
        const account = await streamManager.loadAccount(cleanAddress);
        let balanceLines: string[] = [];

        account.balances.forEach((bal: any) => {
          const assetName =
            bal.asset_type === 'native' ? 'XLM' : bal.asset_code;
          const currentBalance = bal.balance;
          const previousBalance = lastBalances[assetName];

          let indicator = '';
          if (previousBalance) {
            if (parseFloat(currentBalance) > parseFloat(previousBalance))
              indicator = chalk.green(' ↑');
            if (parseFloat(currentBalance) < parseFloat(previousBalance))
              indicator = chalk.red(' ↓');
          }

          balanceLines.push(
            `${chalk.yellow(assetName)}: ${chalk.bold(currentBalance)}${indicator}`
          );
          lastBalances[assetName] = currentBalance;
        });

        balanceBox.setContent(balanceLines.join('  |  '));
        ui.render();
      } catch (err) {
        const errorMsg = (err as any).message || 'Unknown error';
        balanceBox.setContent(chalk.red('Error: ' + errorMsg));
        ui.render();
      }
    };

    fetchBalance();
    setInterval(fetchBalance, pollInterval);

    // Subscribe to payments
    streamManager.watchAccountPayments(cleanAddress).subscribe({
      next: payment => {
        const amount =
          payment.type === 'payment' ? (payment as any).amount : 'N/A';
        const asset = (payment as any).asset_code || 'XLM';
        const from = (payment as any).from;
        const typeStr = payment.type.toUpperCase();

        logBox.log(
          `${chalk.cyan(`[${new Date().toLocaleTimeString()}]`)} ${chalk.green(typeStr)}: ${chalk.bold(amount)} ${asset} from ${from.substring(0, 8)}...`
        );
        ui.render();
      },
      error: err => {
        logBox.log(chalk.red(`[STREAM ERROR] ${err.message}`));
        ui.render();
      },
    });

    ui.render();
  });

export { accountWatchCommand };
