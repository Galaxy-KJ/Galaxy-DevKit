/**
 * @fileoverview Network monitoring command
 * @description Streams network statistics (ledgers, TPS)
 * @author Galaxy DevKit Team
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { StreamManager } from '../../utils/stream-manager.js';
import { TerminalUI } from '../../utils/terminal-ui.js';

const networkWatchCommand = new Command('network');

networkWatchCommand
  .description('Monitor network activity (ledgers, TPS)')
  .option('--network <type>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output stream as JSON instead of dashboard', false)
  .action(async options => {
    const streamManager = new StreamManager({ network: options.network });

    if (options.json) {
      console.log(
        JSON.stringify({
          status: 'started',
          network: options.network,
          timestamp: new Date().toISOString(),
        })
      );

      streamManager.watchLedgers().subscribe({
        next: ledger => {
          console.log(
            JSON.stringify({
              type: 'ledger',
              sequence: ledger.sequence,
              tx_count: ledger.successful_transaction_count,
              timestamp: new Date().toISOString(),
            })
          );
        },
        error: err => {
          console.log(
            JSON.stringify({
              status: 'error',
              message: err.message,
              timestamp: new Date().toISOString(),
            })
          );
        },
      });
      return;
    }

    const ui = new TerminalUI(
      `Galaxy Watch - Network Activity [${options.network}]`
    );

    const logBox = ui.createLogBox({
      row: 6,
      col: 0,
      rowSpan: 6,
      colSpan: 12,
      label: ' Ledger Feed ',
    });

    const lineChart = ui.createLineChart({
      row: 0,
      col: 0,
      rowSpan: 6,
      colSpan: 12,
      label: ' Transactions per Ledger ',
    });

    logBox.log(
      chalk.yellow(`[*] Streaming ledgers from ${options.network}...`)
    );

    const txData = {
      title: 'TXs',
      x: [] as string[],
      y: [] as number[],
      style: { line: 'cyan' },
    };

    streamManager.watchLedgers().subscribe({
      next: ledger => {
        const time = new Date().toLocaleTimeString();
        logBox.log(
          `${chalk.cyan(`[${time}]`)} New Ledger: ${chalk.bold(ledger.sequence)} | TXs: ${ledger.successful_transaction_count}`
        );

        // Update Chart
        txData.x.push(time);
        txData.y.push(ledger.successful_transaction_count);

        if (txData.x.length > 20) {
          txData.x.shift();
          txData.y.shift();
        }

        lineChart.setData([txData]);
        ui.render();
      },
      error: err => {
        logBox.log(chalk.red(`[ERROR] ${err.message}`));
        ui.render();
      },
    });

    ui.render();
  });

export { networkWatchCommand };
