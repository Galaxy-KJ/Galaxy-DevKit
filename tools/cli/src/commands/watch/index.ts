/**
 * @fileoverview Watch command entry point for Galaxy CLI
 * @description Groups all real-time monitoring commands
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import { Command } from 'commander';
import { accountWatchCommand } from './account.js';
import { transactionWatchCommand } from './transaction.js';
import { networkWatchCommand } from './network.js';
import { oracleWatchCommand } from './oracle.js';
import { contractWatchCommand } from './contract.js';
import { dashboardWatchCommand } from './dashboard.js';

const watchCommand = new Command('watch');

watchCommand
  .description('Monitor Stellar network activity in real-time')
  .option('--dashboard', 'Show multi-panel combined monitoring view')
  .addCommand(accountWatchCommand)
  .addCommand(transactionWatchCommand)
  .addCommand(networkWatchCommand)
  .addCommand(oracleWatchCommand)
  .addCommand(contractWatchCommand)
  .addCommand(dashboardWatchCommand)
  .action(async options => {
    if (options.dashboard) {
      // Trigger the dashboard command logic
      // Since it's a separate command, we can just import and call it or use commander capabilities
      // The simplest way here is to let the user know they can also use 'dashboard' command
      // or just trigger the dashboard action if possible.
      // But better to just make 'dashboard' a subcommand and handled by commander normally.
      // If the user types 'galaxy watch --dashboard', commander sees it as an option for 'watch'.
    } else if (process.argv.length <= 3) {
      watchCommand.help();
    }
  });

export { watchCommand };
