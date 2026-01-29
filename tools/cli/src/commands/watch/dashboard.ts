/**
 * @fileoverview Dashboard view command
 * @description Combined multi-panel view for network and node monitoring
 * @author Galaxy DevKit Team
 */

import { Command } from 'commander';
import { TerminalUI } from '../../utils/terminal-ui.js';
import chalk from 'chalk';

const dashboardWatchCommand = new Command('dashboard');

dashboardWatchCommand
  .alias('--dashboard')
  .description('Show multi-panel combined monitoring view')
  .option('--network <type>', 'Network (testnet/mainnet)', 'testnet')
  .action(async options => {
    const ui = new TerminalUI(`Galaxy DevKit Dashboard [${options.network}]`);

    // Panel 1: Network Stats
    const netLog = ui.createLogBox({
      row: 0,
      col: 0,
      rowSpan: 6,
      colSpan: 6,
      label: ' Network Activity ',
    });

    // Panel 2: Oracle / Price list
    const priceLog = ui.createLogBox({
      row: 0,
      col: 6,
      rowSpan: 6,
      colSpan: 6,
      label: ' Market Prices ',
    });

    // Panel 3: Transactions
    const txLog = ui.createLogBox({
      row: 6,
      col: 0,
      rowSpan: 6,
      colSpan: 12,
      label: ' Global Transaction Stream ',
    });

    netLog.log(chalk.cyan('Status: ') + chalk.green('Connected'));
    netLog.log(chalk.cyan('Network: ') + options.network);
    netLog.log(chalk.cyan('TPS: ') + '12.5');

    priceLog.log(chalk.yellow('XLM: ') + '$0.1234 ' + chalk.green('↑'));
    priceLog.log(chalk.yellow('USDC: ') + '$1.0000');
    priceLog.log(chalk.yellow('BTC: ') + '$50,230 ' + chalk.red('↓'));

    txLog.log(chalk.gray('Waiting for transactions...'));

    ui.render();
  });

export { dashboardWatchCommand };
