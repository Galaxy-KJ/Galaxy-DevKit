/**
 * @fileoverview Contract event monitoring command
 * @description Streams Soroban smart contract events using Soroban RPC
 * @author Galaxy DevKit Team
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TerminalUI } from '../../utils/terminal-ui.js';
import { StreamManager } from '../../utils/stream-manager.js';

const contractWatchCommand = new Command('contract');

/**
 * Format a Soroban contract event for display
 */
function formatEvent(event: any): {
  type: string;
  topic: string;
  ledger: number;
  timestamp: string;
  data: string;
} {
  return {
    type: event.type || 'contract',
    topic: event.topic?.[0] || 'unknown',
    ledger: event.ledger || 0,
    timestamp: new Date().toISOString(),
    data: JSON.stringify(event.value || event.data || {}).substring(0, 50),
  };
}

contractWatchCommand
  .description('Monitor smart contract events')
  .argument('<id>', 'Contract ID')
  .option('--event <name>', 'Specific event name to filter')
  .option('--network <type>', 'Network (testnet/mainnet)', 'testnet')
  .option('--interval <seconds>', 'Polling interval in seconds', '5')
  .option('--json', 'Output stream as JSON instead of dashboard', false)
  .action(async (contractId, options) => {
    const cleanContractId = contractId.trim();
    const intervalMs = parseInt(options.interval) * 1000;
    const streamManager = new StreamManager({ network: options.network });

    if (options.json) {
      console.log(
        JSON.stringify({
          status: 'started',
          contractId: cleanContractId,
          network: options.network,
          eventFilter: options.event || null,
          interval: parseInt(options.interval),
        })
      );

      streamManager
        .watchContractEvents(cleanContractId, {
          eventType: options.event,
          intervalMs,
        })
        .subscribe({
          next: event => {
            console.log(
              JSON.stringify({
                ...formatEvent(event),
                raw: event,
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

    // Dashboard mode
    const ui = new TerminalUI(
      `Galaxy Watch - Contract ${cleanContractId.substring(0, 12)}...`
    );

    const infoBox = ui.createBox({
      row: 0,
      col: 0,
      rowSpan: 3,
      colSpan: 12,
      label: ' Contract Info ',
      content: [
        `${chalk.cyan('Contract ID:')} ${cleanContractId}`,
        `${chalk.cyan('Network:')} ${options.network}`,
        `${chalk.cyan('Event Filter:')} ${options.event || 'All events'}`,
        `${chalk.cyan('Poll Interval:')} ${options.interval}s`,
      ].join('\n'),
    });

    const logBox = ui.createLogBox({
      row: 3,
      col: 0,
      rowSpan: 9,
      colSpan: 12,
      label: ' Contract Events ',
    });

    logBox.log(
      chalk.yellow(`[*] Watching events for contract ${cleanContractId}...`)
    );
    if (options.event) {
      logBox.log(chalk.gray(`[*] Filter: event_name == "${options.event}"`));
    }
    logBox.log(chalk.gray(`[*] Polling every ${options.interval}s...`));
    logBox.log(chalk.gray(`[*] Press 'q' or 'Ctrl+C' to stop`));
    logBox.log('');

    let eventCount = 0;

    streamManager
      .watchContractEvents(cleanContractId, {
        eventType: options.event,
        intervalMs,
      })
      .subscribe({
        next: event => {
          eventCount++;
          const formatted = formatEvent(event);
          const time = new Date().toLocaleTimeString();

          logBox.log(
            `${chalk.cyan(`[${time}]`)} ${chalk.green(`Event #${eventCount}`)} | ` +
            `Ledger: ${chalk.yellow(formatted.ledger)} | ` +
            `Topic: ${chalk.magenta(formatted.topic)}`
          );

          if (formatted.data && formatted.data !== '{}') {
            logBox.log(chalk.gray(`    └── Data: ${formatted.data}`));
          }

          ui.render();
        },
        error: err => {
          logBox.log(chalk.red(`[ERROR] ${err.message}`));
          ui.render();
        },
      });

    ui.render();
  });

export { contractWatchCommand };
