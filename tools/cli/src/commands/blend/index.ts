import { Command } from 'commander';
import { supplyCommand } from './supply.js';
import { withdrawCommand } from './withdraw.js';
import { borrowCommand } from './borrow.js';
import { repayCommand } from './repay.js';
import { positionCommand } from './position.js';
import { healthCommand } from './health.js';
import { liquidateCommand } from './liquidate.js';
import { statsCommand } from './stats.js';

export const blendCommand = new Command('blend')
    .description('Blend Protocol DeFi commands (lending and borrowing)');

blendCommand.addCommand(supplyCommand);
blendCommand.addCommand(withdrawCommand);
blendCommand.addCommand(borrowCommand);
blendCommand.addCommand(repayCommand);
blendCommand.addCommand(positionCommand);
blendCommand.addCommand(healthCommand);
blendCommand.addCommand(liquidateCommand);
blendCommand.addCommand(statsCommand);
