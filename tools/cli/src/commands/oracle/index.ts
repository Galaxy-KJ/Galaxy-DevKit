/**
 * @fileoverview Oracle command group
 * @description Groups oracle-related CLI commands
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-26
 */

import { Command } from 'commander';
import { priceCommand } from './price.js';
import { historyCommand } from './history.js';
import { sourcesCommand } from './sources.js';
import { strategiesCommand } from './strategies.js';
import { validateCommand } from './validate.js';

export const oracleCommand = new Command('oracle')
  .description('Query oracle price data');

oracleCommand.addCommand(priceCommand);
oracleCommand.addCommand(historyCommand);
oracleCommand.addCommand(sourcesCommand);
oracleCommand.addCommand(strategiesCommand);
oracleCommand.addCommand(validateCommand);
